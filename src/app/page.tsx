"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  CloudUpload,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Link2,
  Loader2,
  Menu,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Unlink,
  Upload,
  X,
} from "lucide-react";
import { ScannerModal } from "@/components/ScannerModal";
import { analyzeImageDocument } from "@/lib/client-ocr";
import {
  getEffectiveStatus,
  getLocalDateString,
  type NoteDraft,
  type NoteRecord,
  type NoteSource,
  type NoteStatus,
  type NoteType,
} from "@/lib/notes";
import { extractDocumentFields, parseAccessKey, parseBoletoCode } from "@/lib/scanner";
import {
  buildCsvContent,
  buildExportWorkbook,
  buildRecordDuplicateKey,
  buildTemplateWorkbook,
} from "@/lib/spreadsheet";
import type { SpreadsheetConnectionConfig } from "@/lib/spreadsheet-sync";

declare global {
  interface Window {
    desktopApp?: {
      platform: string;
      isDesktop: boolean;
      openDataDir?: () => Promise<string>;
      pickSpreadsheetSave?: () => Promise<string | null>;
      openFilePath?: (filePath: string) => Promise<string>;
    };
  }
}

type SortOption = "recentes" | "vencimento" | "valor";
type ExportScope = "filtered" | "all";

const emptySheetConfig: SpreadsheetConnectionConfig = {
  localFilePath: "",
  autoSync: true,
  googleSheetUrl: "",
  lastLocalSyncAt: null,
  lastGoogleSyncAt: null,
  lastError: null,
};

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];

type FormState = {
  type: NoteType;
  company: string;
  document: string;
  amount: string;
  dueDate: string;
  issueDate: string;
  category: string;
  status: NoteStatus;
  taxes: string;
  source: NoteSource;
  storedFileName: string;
  originalFileName: string;
  notes: string;
};

const emptyForm: FormState = {
  type: "Nota fiscal",
  company: "",
  document: "",
  amount: "",
  dueDate: "",
  issueDate: "",
  category: "Operacional",
  status: "Pendente",
  taxes: "",
  source: "Manual",
  storedFileName: "",
  originalFileName: "",
  notes: "",
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (value: string) => (value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—");

function isImageFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function Home() {
  const [records, setRecords] = useState<NoteRecord[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState("Visão geral");
  const [showForm, setShowForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<NoteRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NoteRecord | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"Todos" | NoteType>("Todos");
  const [statusFilter, setStatusFilter] = useState<"Todos" | NoteStatus>("Todos");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [sortBy, setSortBy] = useState<SortOption>("recentes");
  const [month, setMonth] = useState(() => getLocalDateString().slice(0, 7));
  const [uploadMessage, setUploadMessage] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [toast, setToast] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ storage: string; dataDir: string | null }>({ storage: "local", dataDir: null });
  const [exportScope, setExportScope] = useState<ExportScope>("filtered");
  const [sheetConfig, setSheetConfig] = useState<SpreadsheetConnectionConfig>(emptySheetConfig);
  const [localSheetInput, setLocalSheetInput] = useState("");
  const [googleSheetInput, setGoogleSheetInput] = useState("");
  const [sheetBusy, setSheetBusy] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [quickCompany, setQuickCompany] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickType, setQuickType] = useState<NoteType>("Nota fiscal");
  const [quickDueDate, setQuickDueDate] = useState(() => getLocalDateString());
  const [quickSaving, setQuickSaving] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const dragDepthRef = useRef(0);
  const pasteHandlerRef = useRef<(event: ClipboardEvent) => void>(() => undefined);

  useEffect(() => {
    fetch("/api/notes", { headers: { "x-demo-user": "local-demo" } })
      .then((response) => response.json())
      .then((payload: { records?: NoteRecord[]; storage?: string; dataDir?: string | null }) => {
        setIsDesktop(Boolean(window.desktopApp?.isDesktop));
        setRecords(payload.records ?? []);
        setStorageInfo({ storage: payload.storage ?? "local", dataDir: payload.dataDir ?? null });
      })
      .catch(() => announce("Não foi possível carregar os documentos."))
      .finally(() => setLoadingRecords(false));

    fetch("/api/sheets/connection")
      .then((response) => response.json())
      .then((payload: { config?: SpreadsheetConnectionConfig }) => {
        if (payload.config) {
          setSheetConfig(payload.config);
          setLocalSheetInput(payload.config.localFilePath);
          setGoogleSheetInput(payload.config.googleSheetUrl);
        }
      })
      .catch(() => undefined);
  }, []);

  const today = getLocalDateString();

  const filteredRecords = useMemo(() => {
    const filtered = records.filter((record) => {
      const effectiveStatus = getEffectiveStatus(record, today);
      const matchesSearch = `${record.company} ${record.document} ${record.notes || ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesType = typeFilter === "Todos" || record.type === typeFilter;
      const matchesStatus = statusFilter === "Todos" || effectiveStatus === statusFilter;
      const matchesCategory = categoryFilter === "Todas" || record.category === categoryFilter;
      const matchesMonth = !month || record.issueDate.startsWith(month) || record.dueDate.startsWith(month);
      const matchesView = activeView !== "Vencimentos" || (record.type === "Boleto" && effectiveStatus !== "Pago");
      return matchesSearch && matchesType && matchesStatus && matchesCategory && matchesMonth && matchesView;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "vencimento") return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31");
      if (sortBy === "valor") return b.amount - a.amount;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [records, search, typeFilter, statusFilter, categoryFilter, month, activeView, sortBy, today]);

  const duplicateWarning = useMemo(() => {
    if (!showForm || editingId) return "";
    const doc = form.document.trim().toLowerCase();
    const notes = form.notes.trim().toLowerCase();
    const company = form.company.trim().toLowerCase();
    const amount = Number(form.amount);
    const match = records.find((item) => {
      if (doc && doc !== "sem número informado" && item.document.trim().toLowerCase() === doc) return true;
      if (notes && item.notes && item.notes.trim().toLowerCase() === notes) return true;
      if (company && Number.isFinite(amount) && amount > 0 && form.dueDate) {
        return (
          item.company.trim().toLowerCase() === company &&
          Math.abs(item.amount - amount) < 0.01 &&
          item.dueDate === form.dueDate
        );
      }
      return false;
    });
    return match ? `Atenção: já existe um registro parecido (${match.company} · ${match.document}).` : "";
  }, [showForm, editingId, form.document, form.notes, form.company, form.amount, form.dueDate, records]);

  const monthRecords = records.filter((record) => !month || record.issueDate.startsWith(month) || record.dueDate.startsWith(month));
  const notesTotal = monthRecords.filter((record) => record.type === "Nota fiscal").reduce((sum, record) => sum + record.amount, 0);
  const billsTotal = monthRecords.filter((record) => record.type === "Boleto").reduce((sum, record) => sum + record.amount, 0);
  const dueToday = records.filter((record) => record.type === "Boleto" && record.dueDate === today && record.status !== "Pago");
  const overdueCount = records.filter((record) => getEffectiveStatus(record, today) === "Vencido").length;
  const pendingReview = records.filter((record) => record.status === "Revisar").length;

  const companySummaries = useMemo(() => {
    const grouped = new Map<
      string,
      { company: string; count: number; total: number; lastType: NoteType; lastCategory: string }
    >();
    for (const record of records) {
      if (!record.company) continue;
      const existing = grouped.get(record.company);
      if (!existing) {
        grouped.set(record.company, {
          company: record.company,
          count: 1,
          total: record.amount,
          lastType: record.type,
          lastCategory: record.category || "Operacional",
        });
      } else {
        existing.count += 1;
        existing.total += record.amount;
      }
    }
    return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
  }, [records]);

  function findCompanyDefaults(name: string) {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;
    return companySummaries.find((item) => item.company.trim().toLowerCase() === normalized) ?? null;
  }

  function announce(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 3200);
  }

  function draftToForm(draft: Partial<NoteDraft>, fallbackSource: NoteSource = "Manual"): FormState {
    return {
      ...emptyForm,
      type: draft.type ?? "Nota fiscal",
      company: draft.company || "",
      document: draft.document || "",
      amount: draft.amount ? String(draft.amount) : "",
      issueDate: draft.issueDate || "",
      dueDate: draft.dueDate || draft.issueDate || "",
      category: draft.category || "Operacional",
      status: draft.status || "Pendente",
      taxes: draft.taxes ? String(draft.taxes) : "",
      source: draft.source ?? fallbackSource,
      storedFileName: draft.storedFileName || "",
      originalFileName: draft.originalFileName || "",
      notes: draft.notes || "",
    };
  }

  function openNewForm() {
    setEditingId(null);
    setForm({ ...emptyForm, issueDate: today, dueDate: today });
    setShowForm(true);
  }

  function openRepeatForm(record: NoteRecord) {
    const daySuffix = record.dueDate?.slice(7, 10) || today.slice(7, 10);
    const nextDue = `${today.slice(0, 7)}${daySuffix}`;
    const validDue = !Number.isNaN(new Date(`${nextDue}T12:00:00`).getTime()) ? nextDue : today;
    setEditingId(null);
    setForm(
      draftToForm(
        {
          type: record.type,
          company: record.company,
          document: "",
          amount: record.amount,
          taxes: record.taxes,
          issueDate: today,
          dueDate: validDue,
          category: record.category,
          status: "Pendente",
          source: "Manual",
        },
        "Manual",
      ),
    );
    setShowForm(true);
  }

  function applyCompanyPreset(companyName: string) {
    const preset = findCompanyDefaults(companyName);
    setForm((current) => ({
      ...current,
      company: companyName,
      type: preset ? preset.lastType : current.type,
      category: preset ? preset.lastCategory : current.category,
    }));
  }

  function openEditForm(record: NoteRecord) {
    setEditingId(record.id);
    setForm({
      type: record.type,
      company: record.company,
      document: record.document,
      amount: String(record.amount),
      dueDate: record.dueDate,
      issueDate: record.issueDate,
      category: record.category,
      status: record.status,
      taxes: record.taxes ? String(record.taxes) : "",
      source: record.source,
      storedFileName: record.storedFileName || "",
      originalFileName: record.originalFileName || "",
      notes: record.notes || "",
    });
    setShowForm(true);
  }

  function resolveExportRecords(scope: ExportScope = exportScope) {
    return scope === "all" ? records : filteredRecords;
  }

  function resolveExportFileStem(scope: ExportScope = exportScope) {
    if (scope === "all") return "gerenciador-de-notas-completo";
    return `gerenciador-de-notas-${month || "exportacao"}`;
  }

  function handleExport(scope: ExportScope = exportScope) {
    const targetRecords = resolveExportRecords(scope);
    if (!targetRecords.length) {
      announce(
        scope === "all"
          ? "Não há documentos cadastrados para exportar."
          : "Não há documentos no filtro atual para exportar (tente limpar o mês ou exportar todos).",
      );
      return;
    }
    const workbook = buildExportWorkbook(targetRecords, today);
    XLSX.writeFile(workbook, `${resolveExportFileStem(scope)}.xlsx`);
    announce(`Planilha XLSX exportada (${targetRecords.length} registro(s)).`);
  }

  function handleDownloadTemplate() {
    const workbook = buildTemplateWorkbook(today);
    XLSX.writeFile(workbook, "modelo-gerenciador-de-notas.xlsx");
    announce("Planilha modelo .xlsx gerada com sucesso.");
  }

  function applySheetConfigResponse(config?: SpreadsheetConnectionConfig) {
    if (!config) return;
    setSheetConfig(config);
    setLocalSheetInput(config.localFilePath);
    setGoogleSheetInput(config.googleSheetUrl);
  }

  async function refreshConnectionConfig() {
    try {
      const response = await fetch("/api/sheets/connection");
      const payload = (await response.json()) as { config?: SpreadsheetConnectionConfig };
      applySheetConfigResponse(payload.config);
    } catch {
      // ignore background refresh failures
    }
  }

  async function handleSpreadsheetUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setSheetBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/sheets/import", {
        method: "POST",
        headers: { "x-demo-user": "local-demo" },
        body: formData,
      });
      const payload = (await response.json()) as {
        imported?: number;
        skippedDuplicates?: number;
        records?: NoteRecord[];
        config?: SpreadsheetConnectionConfig;
        error?: string;
      };
      if (!response.ok || !payload.records) {
        announce(payload.error || "Não foi possível importar a planilha.");
        return;
      }
      setRecords(payload.records);
      applySheetConfigResponse(payload.config);
      announce(
        `Planilha importada: ${payload.imported ?? 0} novo(s)` +
          (payload.skippedDuplicates ? `, ${payload.skippedDuplicates} duplicado(s) ignorado(s).` : "."),
      );
    } catch {
      announce("Falha ao ler o arquivo da planilha.");
    } finally {
      setSheetBusy(false);
      input.value = "";
    }
  }

  async function handlePickDesktopSpreadsheet() {
    if (!window.desktopApp?.pickSpreadsheetSave) return;
    const selected = await window.desktopApp.pickSpreadsheetSave();
    if (!selected) return;
    setLocalSheetInput(selected);
    await handleConnectionAction("connect-local", { localFilePath: selected });
  }

  async function handleConnectionAction(
    action: "connect-local" | "sync-local" | "pull-local" | "disconnect-local" | "toggle-auto" | "disconnect-google",
    extra: { localFilePath?: string; autoSync?: boolean } = {},
  ) {
    setSheetBusy(true);
    try {
      const response = await fetch("/api/sheets/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-demo-user": "local-demo" },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = (await response.json()) as {
        config?: SpreadsheetConnectionConfig;
        records?: NoteRecord[];
        imported?: number;
        skippedDuplicates?: number;
        total?: number;
        error?: string;
      };
      if (!response.ok) {
        announce(payload.error || "Não foi possível concluir a operação na planilha.");
        return;
      }
      if (payload.records) setRecords(payload.records);
      applySheetConfigResponse(payload.config);

      if (action === "connect-local") announce("Planilha local conectada e sincronizada.");
      else if (action === "sync-local") announce(`Planilha sincronizada (${payload.total ?? records.length} documento(s)).`);
      else if (action === "pull-local") announce(`Importação da planilha concluída: ${payload.imported ?? 0} novo(s).`);
      else if (action === "disconnect-local") announce("Planilha local desconectada.");
      else if (action === "disconnect-google") announce("Planilha Google desconectada.");
    } catch {
      announce("Erro ao comunicar com a planilha conectada.");
    } finally {
      setSheetBusy(false);
    }
  }

  async function handleImportGoogleSheet(saveConnection: boolean) {
    if (!googleSheetInput.trim()) {
      announce("Cole o link da planilha Google Sheets antes de importar.");
      return;
    }
    setSheetBusy(true);
    try {
      const response = await fetch("/api/sheets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-demo-user": "local-demo" },
        body: JSON.stringify({ url: googleSheetInput.trim(), saveConnection }),
      });
      const payload = (await response.json()) as {
        imported?: number;
        skippedDuplicates?: number;
        records?: NoteRecord[];
        config?: SpreadsheetConnectionConfig;
        error?: string;
      };
      if (!response.ok || !payload.records) {
        announce(payload.error || "Não foi possível importar do Google Sheets.");
        return;
      }
      setRecords(payload.records);
      applySheetConfigResponse(payload.config);
      announce(
        `Google Sheets sincronizado: ${payload.imported ?? 0} novo(s)` +
          (payload.skippedDuplicates ? `, ${payload.skippedDuplicates} já existente(s).` : "."),
      );
    } catch {
      announce("Falha ao buscar dados do Google Sheets.");
    } finally {
      setSheetBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.company || !form.amount || !form.dueDate) {
      announce("Preencha empresa, valor e vencimento antes de salvar.");
      return;
    }

    const bodyPayload: Partial<NoteDraft> = {
      type: form.type,
      company: form.company,
      document: form.document || "Sem número informado",
      amount: Number(form.amount),
      dueDate: form.dueDate,
      issueDate: form.issueDate || form.dueDate,
      category: form.category,
      taxes: Number(form.taxes || 0),
      status: form.status,
      source: form.source,
      reviewRequired: form.status === "Revisar",
      storedFileName: form.storedFileName || undefined,
      originalFileName: form.originalFileName || undefined,
      notes: form.notes || undefined,
    };

    if (editingId) {
      const response = await fetch(`/api/notes/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-demo-user": "local-demo" },
        body: JSON.stringify(bodyPayload),
      });
      const payload = (await response.json()) as { record?: NoteRecord; syncWarning?: string | null; error?: string };
      if (!response.ok || !payload.record) {
        announce(payload.error || "Não foi possível atualizar o documento.");
        return;
      }
      setRecords((current) => current.map((item) => (item.id === editingId ? (payload.record as NoteRecord) : item)));
      setEditingId(null);
      setForm(emptyForm);
      setShowForm(false);
      await refreshConnectionConfig();
      announce(payload.syncWarning ? `Documento atualizado (${payload.syncWarning})` : "Documento atualizado com sucesso.");
      return;
    }

    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-user": "local-demo" },
      body: JSON.stringify(bodyPayload),
    });
    const payload = (await response.json()) as { record?: NoteRecord; syncWarning?: string | null; error?: string };
    if (!response.ok || !payload.record) {
      announce(payload.error || "Não foi possível salvar o documento.");
      return;
    }
    setRecords((current) => [payload.record as NoteRecord, ...current]);
    setForm(emptyForm);
    setShowForm(false);
    await refreshConnectionConfig();
    announce(payload.syncWarning ? `Documento salvo (${payload.syncWarning})` : "Documento salvo com sucesso.");
  }

  async function handleTogglePaid(record: NoteRecord) {
    const nextStatus: NoteStatus = record.status === "Pago" ? "Pendente" : "Pago";
    const response = await fetch(`/api/notes/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-demo-user": "local-demo" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const payload = (await response.json()) as { record?: NoteRecord; syncWarning?: string | null; error?: string };
    if (!response.ok || !payload.record) {
      announce(payload.error || "Não foi possível atualizar o status.");
      return;
    }
    setRecords((current) => current.map((item) => (item.id === record.id ? (payload.record as NoteRecord) : item)));
    await refreshConnectionConfig();
    announce(payload.syncWarning ? `Status alterado (${payload.syncWarning})` : `Status alterado para ${nextStatus}.`);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const response = await fetch(`/api/notes/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { "x-demo-user": "local-demo" },
    });
    const payload = (await response.json().catch(() => ({}))) as { syncWarning?: string | null; error?: string };
    if (!response.ok) {
      announce(payload.error || "Não foi possível excluir o documento.");
      return;
    }
    setRecords((current) => current.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    await refreshConnectionConfig();
    announce(payload.syncWarning ? `Documento removido (${payload.syncWarning})` : "Documento removido.");
  }

  async function parseSingleDocumentToDraft(file: File): Promise<{
    draft: Partial<NoteDraft>;
    fallbackSource: NoteSource;
    message: string;
  } | null> {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xml")) {
      const response = await fetch("/api/import/xml", {
        method: "POST",
        headers: { "Content-Type": "application/xml", "x-file-name": file.name },
        body: await file.text(),
      });
      const payload = (await response.json()) as { draft?: Partial<NoteDraft>; message?: string; error?: string };
      if (!response.ok || !payload.draft) {
        setUploadMessage(payload.error || `Não foi possível interpretar ${file.name}.`);
        return null;
      }
      return {
        draft: { ...payload.draft, status: payload.draft.status ?? "Pendente" },
        fallbackSource: "XML",
        message: payload.message || `${file.name} lido. Revise os campos antes de salvar.`,
      };
    }

    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/import/document", { method: "POST", body: formData });
    const payload = (await response.json()) as {
      draft?: Partial<NoteDraft>;
      needsOcr?: boolean;
      ocrImageDataUrl?: string;
      file?: { name: string; storedName: string; url: string };
      message?: string;
      error?: string;
    };
    if (!response.ok || !payload.draft) {
      setUploadMessage(payload.error || `Não foi possível receber ${file.name}.`);
      return null;
    }

    const ocrTarget =
      payload.draft.source === "Imagem" && payload.needsOcr
        ? file
        : payload.ocrImageDataUrl || null;

    if (ocrTarget) {
      const docSource: NoteSource = payload.draft.source === "PDF" ? "PDF" : "Imagem";
      setOcrStatus(`Lendo ${file.name}...`);
      try {
        const extraction = await analyzeImageDocument(ocrTarget, file.name, docSource, (msg) => setOcrStatus(msg));
        return {
          draft: {
            ...extraction.draft,
            status: extraction.detectedFields.length >= 2 ? "Pendente" : "Revisar",
            storedFileName: payload.file?.storedName,
            originalFileName: file.name,
          },
          fallbackSource: docSource,
          message: extraction.detectedFields.length
            ? `${file.name} salvo e lido (${extraction.detectedFields.join(", ")}). Confira antes de salvar.`
            : `${file.name} salvo localmente. Preencha ou confira os campos manualmente.`,
        };
      } finally {
        setOcrStatus("");
      }
    }

    return {
      draft: { ...payload.draft, status: "Pendente" },
      fallbackSource: payload.draft.source ?? "PDF",
      message: payload.message || `${file.name} recebido para revisão manual.`,
    };
  }

  async function importSpreadsheetFile(file: File) {
    setSheetBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/sheets/import", {
        method: "POST",
        headers: { "x-demo-user": "local-demo" },
        body: formData,
      });
      const payload = (await response.json()) as {
        imported?: number;
        skippedDuplicates?: number;
        records?: NoteRecord[];
        config?: SpreadsheetConnectionConfig;
        error?: string;
      };
      if (!response.ok || !payload.records) {
        announce(payload.error || "Não foi possível importar a planilha.");
        return;
      }
      setRecords(payload.records);
      applySheetConfigResponse(payload.config);
      announce(
        `Planilha importada: ${payload.imported ?? 0} novo(s)` +
          (payload.skippedDuplicates ? `, ${payload.skippedDuplicates} duplicado(s) ignorado(s).` : "."),
      );
    } catch {
      announce("Falha ao ler o arquivo da planilha.");
    } finally {
      setSheetBusy(false);
    }
  }

  async function processImportedFiles(files: File[]) {
    if (!files.length) return;
    const maxBytes = 10 * 1024 * 1024;
    const invalidFile = files.find((file) => file.size > maxBytes);
    if (invalidFile) {
      setUploadMessage(`${invalidFile.name} excede o limite de 10 MB. Escolha um arquivo menor.`);
      return;
    }

    const isSheetFile = (file: File) => /\.(xlsx|xls|xlsm|csv)$/i.test(file.name);
    const isAllowedFile = (file: File) => {
      const lower = file.name.toLowerCase();
      return (
        lower.endsWith(".xml") ||
        file.type === "application/pdf" ||
        lower.endsWith(".pdf") ||
        file.type.startsWith("image/") ||
        isImageFileName(lower) ||
        isSheetFile(file)
      );
    };

    if (!files.every(isAllowedFile)) {
      setUploadMessage("Formato não suportado. Use XML, PDF, imagem ou planilha (.xlsx/.csv).");
      return;
    }

    const sheetFiles = files.filter(isSheetFile);
    const docFiles = files.filter((file) => !isSheetFile(file));

    if (sheetFiles.length && !docFiles.length) {
      for (const sheetFile of sheetFiles) {
        await importSpreadsheetFile(sheetFile);
      }
      return;
    }

    if (docFiles.length === 1 && !sheetFiles.length) {
      const result = await parseSingleDocumentToDraft(docFiles[0]);
      if (!result) return;
      setEditingId(null);
      setForm(draftToForm(result.draft, result.fallbackSource));
      setShowForm(true);
      setUploadMessage(result.message);
      return;
    }

    const existingKeys = new Set(records.map((item) => buildRecordDuplicateKey(item)));
    let savedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    const createdRecords: NoteRecord[] = [];

    for (let index = 0; index < docFiles.length; index += 1) {
      const file = docFiles[index];
      setOcrStatus(`Importando lote (${index + 1}/${docFiles.length}): ${file.name}...`);
      try {
        const result = await parseSingleDocumentToDraft(file);
        if (!result) {
          failedCount += 1;
          continue;
        }
        const draftPayload: NoteDraft = {
          type: result.draft.type ?? "Nota fiscal",
          company: result.draft.company || "Empresa não identificada",
          document: result.draft.document || file.name,
          amount: Number(result.draft.amount || 0),
          taxes: Number(result.draft.taxes || 0),
          issueDate: result.draft.issueDate || result.draft.dueDate || today,
          dueDate: result.draft.dueDate || result.draft.issueDate || today,
          category: result.draft.category || "Operacional",
          status: result.draft.status === "Revisar" ? "Revisar" : "Pendente",
          source: result.fallbackSource,
          reviewRequired: true,
          storedFileName: result.draft.storedFileName,
          originalFileName: result.draft.originalFileName || file.name,
          notes: result.draft.notes,
        };
        const dupKey = buildRecordDuplicateKey(draftPayload);
        if (existingKeys.has(dupKey)) {
          duplicateCount += 1;
          continue;
        }
        const response = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-demo-user": "local-demo" },
          body: JSON.stringify(draftPayload),
        });
        if (!response.ok) {
          failedCount += 1;
          continue;
        }
        const payload = (await response.json()) as { record?: NoteRecord };
        if (payload.record) {
          createdRecords.push(payload.record);
          existingKeys.add(dupKey);
          savedCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }
    setOcrStatus("");

    if (createdRecords.length) {
      setRecords((current) => [...createdRecords.reverse(), ...current]);
      await refreshConnectionConfig();
    }
    for (const sheetFile of sheetFiles) {
      await importSpreadsheetFile(sheetFile);
    }

    const summary = [
      `Lote concluído: ${savedCount} documento(s) salvo(s)`,
      duplicateCount ? `${duplicateCount} duplicado(s)` : "",
      failedCount ? `${failedCount} com erro` : "",
    ]
      .filter(Boolean)
      .join(", ");
    setUploadMessage(`${summary}.`);
    announce(`${summary}.`);
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const files = Array.from(input.files ?? []);
    try {
      await processImportedFiles(files);
    } finally {
      input.value = "";
    }
  }

  async function handleQuickSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(quickAmount.replace(",", "."));
    if (!quickCompany.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      announce("Informe empresa e valor para o lançamento rápido.");
      return;
    }

    const preset = findCompanyDefaults(quickCompany);
    const resolvedDue = quickDueDate || today;
    setQuickSaving(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-demo-user": "local-demo" },
        body: JSON.stringify({
          type: quickType,
          company: quickCompany.trim(),
          document: "Lançamento rápido",
          amount: numericAmount,
          taxes: 0,
          issueDate: today,
          dueDate: resolvedDue,
          category: preset?.lastCategory || "Operacional",
          status: "Pendente",
          source: "Manual",
        } satisfies Partial<NoteDraft>),
      });
      const payload = (await response.json()) as { record?: NoteRecord; syncWarning?: string | null; error?: string };
      if (!response.ok || !payload.record) {
        announce(payload.error || "Não foi possível salvar o lançamento rápido.");
        return;
      }
      setRecords((current) => [payload.record as NoteRecord, ...current]);
      setQuickCompany("");
      setQuickAmount("");
      setQuickDueDate(today);
      await refreshConnectionConfig();
      announce(payload.syncWarning ? `Salvo (${payload.syncWarning})` : "Nota lançada com sucesso.");
    } finally {
      setQuickSaving(false);
    }
  }

  pasteHandlerRef.current = (event: ClipboardEvent) => {
    const target = event.target as HTMLElement | null;
    const isTypingField = Boolean(
      target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable),
    );

    const pastedImages = Array.from(event.clipboardData?.files ?? []).filter(
      (file) => file.type.startsWith("image/") || isImageFileName(file.name),
    );
    if (pastedImages.length) {
      event.preventDefault();
      void processImportedFiles([pastedImages[0]]);
      return;
    }

    if (isTypingField || showForm || showScanner) return;
    const text = event.clipboardData?.getData("text/plain")?.trim() || "";
    if (!text) return;
    if (parseBoletoCode(text) || parseAccessKey(text)) {
      event.preventDefault();
      const extracted = extractDocumentFields(text, "", "Scanner");
      setEditingId(null);
      setForm(draftToForm({ ...extracted.draft, status: "Pendente" }, "Scanner"));
      setShowForm(true);
      setUploadMessage("Código colado identificado automaticamente. Confira e salve.");
    }
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => pasteHandlerRef.current(event);
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function handleRestoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-demo-user": "local-demo" },
        body: text,
      });
      const payload = (await response.json()) as { imported?: number; records?: NoteRecord[]; error?: string };
      if (!response.ok) {
        announce(payload.error || "Falha ao restaurar backup.");
        return;
      }
      if (payload.records) setRecords(payload.records);
      announce(`Backup restaurado: ${payload.imported ?? 0} novo(s) registro(s) importado(s).`);
    } catch {
      announce("Não foi possível ler o arquivo de backup.");
    } finally {
      input.value = "";
    }
  }

  function handleExportCsv(scope: ExportScope = exportScope) {
    const targetRecords = resolveExportRecords(scope);
    if (!targetRecords.length) {
      announce(
        scope === "all"
          ? "Não há documentos cadastrados para exportar."
          : "Não há documentos no filtro atual para exportar (tente limpar o mês ou exportar todos).",
      );
      return;
    }
    const csv = buildCsvContent(targetRecords, today);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${resolveExportFileStem(scope)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    announce(`Planilha CSV (Excel pt-BR) exportada (${targetRecords.length} registro(s)).`);
  }

  function selectView(view: string) {
    setActiveView(view);
    setMobileMenuOpen(false);
  }

  return (
    <main
      className="app-shell"
      onDragEnter={(event) => {
        if (event.dataTransfer?.types?.includes("Files")) {
          event.preventDefault();
          dragDepthRef.current += 1;
          setIsDraggingFiles(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.includes("Files")) {
          event.preventDefault();
        }
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDraggingFiles(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingFiles(false);
        const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
        if (droppedFiles.length) void processImportedFiles(droppedFiles);
      }}
    >
      {isDraggingFiles && (
        <div className="drop-overlay" aria-live="polite">
          <div className="drop-overlay-card">
            <CloudUpload size={32} />
            <strong>Solte aqui seus arquivos</strong>
            <p>Aceita 1 ou vários XMLs, PDFs, imagens (print/foto) ou planilhas (.xlsx / .csv).</p>
          </div>
        </div>
      )}
      {mobileMenuOpen && <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={mobileMenuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand"><span className="brand-mark"><ReceiptText size={19} /></span><div><strong>Gerenciador</strong><span>de notas</span></div></div>
        <div className="workspace-switcher"><span className="workspace-avatar">G</span><div><b>Minha organização</b><small>Área financeira</small></div><ChevronDown size={15} /></div>
        <nav className="sidebar-nav">
          <p className="nav-label">Workspace</p>
          <button className={activeView === "Visão geral" ? "nav-item active" : "nav-item"} onClick={() => selectView("Visão geral")}><LayoutDashboard size={17} /> Visão geral</button>
          <button className={activeView === "Documentos" ? "nav-item active" : "nav-item"} onClick={() => { selectView("Documentos"); setTypeFilter("Todos"); setStatusFilter("Todos"); setCategoryFilter("Todas"); }}><FileText size={17} /> Documentos <span>{records.length}</span></button>
          <button className={activeView === "Vencimentos" ? "nav-item active" : "nav-item"} onClick={() => selectView("Vencimentos")}><CalendarDays size={17} /> Vencimentos {(dueToday.length + overdueCount) > 0 && <i>{dueToday.length + overdueCount}</i>}</button>
          <p className="nav-label section-label">Organização</p>
          <button className={activeView === "Empresas" ? "nav-item active" : "nav-item"} onClick={() => selectView("Empresas")}><Landmark size={17} /> Empresas <span>{companySummaries.length}</span></button>
          <button className={activeView === "Exportações" ? "nav-item active" : "nav-item"} onClick={() => selectView("Exportações")}><FileSpreadsheet size={17} /> Exportações</button>
          <button className={activeView === "Configurações" ? "nav-item active" : "nav-item"} onClick={() => selectView("Configurações")}><Settings2 size={17} /> Configurações</button>
        </nav>
        <div className="sidebar-footer"><div className="avatar">AJ</div><div><b>Antônio Junior</b><small>Conta local</small></div><ChevronDown size={15} /></div>
      </aside>

      <section className="content-area">
        <header className="topbar">
          <button type="button" className="mobile-brand" aria-label="Abrir menu" onClick={() => setMobileMenuOpen((open) => !open)}>
            <Menu size={20} /><span>Gerenciador de notas</span>
          </button>
          <div className="topbar-actions">
            <span className="secure-note"><span className="online-dot" /> Dados locais ativos</span>
            <button className="icon-button" aria-label="Notificações" onClick={() => { selectView("Vencimentos"); setTypeFilter("Boleto"); announce(dueToday.length ? `${dueToday.length} boleto(s) vencendo hoje.` : overdueCount ? `${overdueCount} documento(s) vencido(s).` : "Nenhum boleto vence hoje."); }}>
              <BellRing size={18} />
              {(dueToday.length > 0 || overdueCount > 0) && <span className="notification-dot" />}
            </button>
            <div className="user-menu-wrap">
              <button className="avatar top-avatar" onClick={() => setUserMenuOpen((open) => !open)}>AJ</button>
              {userMenuOpen && (
                <div className="user-menu">
                  <b>Antônio Junior</b>
                  <small>Conta local</small>
                  <button onClick={() => { setUserMenuOpen(false); selectView("Configurações"); }}>Armazenamento e backup</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Workspace financeiro</p>
              <h1>Organize tudo em um só lugar.</h1>
              <p className="page-subtitle">Notas, boletos, scanner e documentos prontos para sua conferência mensal.</p>
            </div>
            <div className="heading-actions">
              <button type="button" className="secondary-button" onClick={() => setShowScanner(true)}>
                <ScanLine size={16} /> Scanner / Código
              </button>
              <button type="button" className="primary-button" onClick={openNewForm}>
                <Plus size={17} /> Novo registro
              </button>
            </div>
          </div>

          {activeView === "Empresas" && (
            <section className="context-panel companies-panel">
              <div className="companies-header">
                <div>
                  <p className="eyebrow">Organização</p>
                  <h2>Empresas cadastradas</h2>
                  <p>{companySummaries.length ? "Clique em uma empresa para filtrar seus documentos." : "Cadastre ou importe documentos para agrupar por empresa."}</p>
                </div>
                <span className="context-count">{companySummaries.length}</span>
              </div>
              {companySummaries.length > 0 && (
                <div className="company-chips">
                  {companySummaries.map((item) => (
                    <button key={item.company} type="button" className="company-chip" onClick={() => { setSearch(item.company); selectView("Documentos"); }}>
                      <b>{item.company}</b>
                      <span>{item.count} doc(s) · {currency.format(item.total)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          {activeView === "Exportações" && (
            <section className="context-panel sheets-panel">
              <div className="sheets-header">
                <div>
                  <p className="eyebrow">Central de planilhas e exportação</p>
                  <h2>Exportação e conexão com planilha</h2>
                  <p>
                    Exporte para Excel (.xlsx com abas Documentos e Resumo) ou CSV pt-BR, importe planilhas prontas ou conecte uma planilha para manter seus dados sincronizados.
                  </p>
                </div>
                <div className="settings-actions">
                  <div className="scope-switch" role="group" aria-label="Escopo da exportação">
                    <button
                      type="button"
                      className={exportScope === "filtered" ? "scope-btn active" : "scope-btn"}
                      onClick={() => setExportScope("filtered")}
                    >
                      Filtro atual ({filteredRecords.length})
                    </button>
                    <button
                      type="button"
                      className={exportScope === "all" ? "scope-btn active" : "scope-btn"}
                      onClick={() => setExportScope("all")}
                    >
                      Todos ({records.length})
                    </button>
                  </div>
                  <button type="button" className="secondary-button small-btn" onClick={handleDownloadTemplate}>
                    <FileSpreadsheet size={14} /> Modelo .xlsx
                  </button>
                  <button type="button" className="secondary-button small-btn" onClick={() => handleExportCsv()}>
                    <Download size={14} /> Exportar CSV
                  </button>
                  <button type="button" className="primary-button small" onClick={() => handleExport()}>
                    <FileSpreadsheet size={15} /> Exportar XLSX
                  </button>
                </div>
              </div>

              <div className="sheets-grid">
                <div className="sheet-box">
                  <div className="sheet-box-head">
                    <strong><Link2 size={15} /> Planilha Excel local conectada (.xlsx)</strong>
                    {sheetConfig.localFilePath && <span className="sheet-badge">Conectada</span>}
                  </div>
                  <p className="sheet-help">
                    Vincule um arquivo .xlsx no computador (ex.: na pasta Documentos ou OneDrive) para atualizar a planilha automaticamente ou importar lançamentos dela.
                  </p>
                  <div className="sheet-input-row">
                    <input
                      type="text"
                      placeholder={"Ex.: C:\\Users\\...\\Documents\\gerenciador-de-notas.xlsx"}
                      value={localSheetInput}
                      onChange={(event) => setLocalSheetInput(event.target.value)}
                    />
                    {isDesktop && window.desktopApp?.pickSpreadsheetSave && (
                      <button
                        type="button"
                        className="secondary-button small-btn"
                        disabled={sheetBusy}
                        onClick={handlePickDesktopSpreadsheet}
                      >
                        <FolderOpen size={14} /> Escolher arquivo
                      </button>
                    )}
                    <button
                      type="button"
                      className="primary-button small"
                      disabled={sheetBusy}
                      onClick={() => handleConnectionAction("connect-local", { localFilePath: localSheetInput })}
                    >
                      <Check size={14} /> Conectar
                    </button>
                  </div>

                  {sheetConfig.localFilePath && (
                    <div className="sheet-connected-actions">
                      <label className="sheet-checkbox">
                        <input
                          type="checkbox"
                          checked={sheetConfig.autoSync}
                          disabled={sheetBusy}
                          onChange={(event) =>
                            handleConnectionAction("toggle-auto", { autoSync: event.target.checked })
                          }
                        />
                        <span>Atualizar planilha automaticamente ao salvar, editar ou excluir</span>
                      </label>
                      <div className="settings-actions">
                        <button
                          type="button"
                          className="secondary-button small-btn"
                          disabled={sheetBusy}
                          onClick={() => handleConnectionAction("sync-local")}
                        >
                          <RefreshCw size={14} /> Sincronizar agora
                        </button>
                        <button
                          type="button"
                          className="secondary-button small-btn"
                          disabled={sheetBusy}
                          onClick={() => handleConnectionAction("pull-local")}
                        >
                          <Upload size={14} /> Importar dela
                        </button>
                        {isDesktop && window.desktopApp?.openFilePath && (
                          <button
                            type="button"
                            className="secondary-button small-btn"
                            onClick={() => window.desktopApp?.openFilePath?.(sheetConfig.localFilePath)}
                          >
                            <Eye size={14} /> Abrir arquivo
                          </button>
                        )}
                        <button
                          type="button"
                          className="secondary-button small-btn"
                          disabled={sheetBusy}
                          onClick={() => handleConnectionAction("disconnect-local")}
                        >
                          <Unlink size={14} /> Desconectar
                        </button>
                      </div>
                      {sheetConfig.lastLocalSyncAt && (
                        <small className="sheet-meta">
                          Última sincronização local: {new Date(sheetConfig.lastLocalSyncAt).toLocaleString("pt-BR")}
                        </small>
                      )}
                    </div>
                  )}
                </div>

                <div className="sheet-box">
                  <div className="sheet-box-head">
                    <strong><CloudUpload size={15} /> Importar planilha ou conectar Google Sheets</strong>
                    {sheetConfig.googleSheetUrl && <span className="sheet-badge">Google conectado</span>}
                  </div>
                  <p className="sheet-help">
                    Envie um arquivo .xlsx, .xls ou .csv, ou cole o link de uma planilha do Google Sheets compartilhada com leitura por link.
                  </p>
                  <div className="settings-actions">
                    <label className="secondary-button small-btn upload-button">
                      <Upload size={14} /> Importar .xlsx / .csv
                      <input type="file" accept=".xlsx,.xls,.xlsm,.csv,text/csv" onChange={handleSpreadsheetUpload} />
                    </label>
                  </div>
                  <div className="sheet-input-row">
                    <input
                      type="url"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={googleSheetInput}
                      onChange={(event) => setGoogleSheetInput(event.target.value)}
                    />
                    <button
                      type="button"
                      className="primary-button small"
                      disabled={sheetBusy}
                      onClick={() => handleImportGoogleSheet(true)}
                    >
                      <RefreshCw size={14} /> {sheetConfig.googleSheetUrl ? "Atualizar" : "Conectar"}
                    </button>
                    {sheetConfig.googleSheetUrl && (
                      <button
                        type="button"
                        className="secondary-button small-btn"
                        disabled={sheetBusy}
                        onClick={() => handleConnectionAction("disconnect-google")}
                      >
                        <Unlink size={14} /> Desconectar
                      </button>
                    )}
                  </div>
                  {sheetConfig.lastGoogleSyncAt && (
                    <small className="sheet-meta">
                      Última leitura do Google Sheets: {new Date(sheetConfig.lastGoogleSyncAt).toLocaleString("pt-BR")}
                    </small>
                  )}
                  {sheetConfig.lastError && <div className="scanner-error">{sheetConfig.lastError}</div>}
                </div>
              </div>
            </section>
          )}
          {activeView === "Configurações" && (
            <section className="context-panel settings-panel">
              <div>
                <p className="eyebrow">Armazenamento e backup</p>
                <h2>Persistência {storageInfo.storage === "postgres" ? "PostgreSQL" : "Local (offline)"}</h2>
                <p>{storageInfo.dataDir ? `Dados e anexos salvos em: ${storageInfo.dataDir}` : "Registros persistidos no banco configurado."}</p>
              </div>
              <div className="settings-actions">
                <a className="secondary-button small-btn" href="/api/backup" download>
                  <Download size={14} /> Exportar backup JSON
                </a>
                <label className="secondary-button small-btn upload-button">
                  <Upload size={14} /> Restaurar backup
                  <input type="file" accept=".json,application/json" onChange={handleRestoreBackup} />
                </label>
                {isDesktop && window.desktopApp?.openDataDir && (
                  <button type="button" className="primary-button small" onClick={() => window.desktopApp?.openDataDir?.()}>
                    <FolderOpen size={14} /> Abrir pasta de dados
                  </button>
                )}
              </div>
            </section>
          )}
          {activeView === "Vencimentos" && <section className="context-panel warning-panel"><div><p className="eyebrow">Agenda de vencimentos</p><h2>Boletos em aberto</h2><p>O filtro abaixo mostra boletos pendentes ou vencidos no período selecionado.</p></div><BellRing size={21} color="#b84c3c" /></section>}
          {activeView === "Documentos" && <section className="context-panel"><div><p className="eyebrow">Arquivo financeiro</p><h2>Todos os documentos</h2><p>Esta visão reúne notas fiscais e boletos usando os filtros abaixo.</p></div><FileText size={21} color="#2b8b70" /></section>}

          {dueToday.length > 0 && <div className="due-alert"><div className="alert-icon"><AlertTriangle size={19} /></div><div><b>Boletos vencendo hoje</b><p>{dueToday.map((item) => item.company).join(", ")} · {currency.format(dueToday.reduce((sum, item) => sum + item.amount, 0))}</p></div><button onClick={() => { selectView("Vencimentos"); setTypeFilter("Boleto"); }}>Revisar agora <ArrowUpRight size={15} /></button></div>}

          <section className="summary-grid">
            <article className="summary-card main-total"><div className="summary-head"><span>Movimentação no mês</span><CircleDollarSign size={18} /></div><strong>{currency.format(notesTotal + billsTotal)}</strong><div className="summary-meta"><span className="positive"><ArrowDownLeft size={13} /> {currency.format(notesTotal)} em notas</span><span className="negative"><ArrowUpRight size={13} /> {currency.format(billsTotal)} em boletos</span></div></article>
            <article className="summary-card"><div className="summary-head"><span>Notas registradas</span><span className="metric-icon mint"><FileCheck2 size={16} /></span></div><strong>{monthRecords.filter((item) => item.type === "Nota fiscal").length}</strong><p>documentos no período</p></article>
            <article className="summary-card"><div className="summary-head"><span>Vencendo hoje</span><span className="metric-icon coral"><BellRing size={16} /></span></div><strong className={dueToday.length ? "pulse-number" : ""}>{dueToday.length}</strong><p>{overdueCount > 0 ? `${overdueCount} já vencido(s)` : dueToday.length ? "atenção necessária" : "nenhum boleto para hoje"}</p></article>
            <article className="summary-card"><div className="summary-head"><span>Para revisar</span><span className="metric-icon gold"><Sparkles size={16} /></span></div><strong>{pendingReview}</strong><p>dados aguardando conferência</p></article>
          </section>

          <section className="content-card documents-card" aria-busy={loadingRecords}>
            <div className="card-heading">
              <div><p className="eyebrow">Documentos recentes</p><h2>Notas e boletos</h2></div>
              <div className="heading-actions">
                <button type="button" className="secondary-button" onClick={() => setShowScanner(true)}>
                  <ScanLine size={15} /> Scanner
                </button>
                <label className="secondary-button upload-button">
                  <Upload size={15} /> Importar arquivo(s)
                  <input type="file" accept=".xml,.pdf,image/*,.xlsx,.xls,.csv" multiple onChange={handleFiles} />
                </label>
                <button type="button" className="primary-button small" onClick={() => { selectView("Documentos"); openNewForm(); }}>
                  <Plus size={15} /> Manual
                </button>
              </div>
            </div>

            <form className="quick-entry-bar" onSubmit={handleQuickSave}>
              <span className="quick-entry-label">Lançamento rápido</span>
              <input
                type="text"
                list="known-companies"
                placeholder="Empresa / fornecedor"
                value={quickCompany}
                onChange={(event) => {
                  const val = event.target.value;
                  setQuickCompany(val);
                  const preset = findCompanyDefaults(val);
                  if (preset) setQuickType(preset.lastType);
                }}
              />
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Valor (R$)"
                value={quickAmount}
                onChange={(event) => setQuickAmount(event.target.value)}
                className="quick-amount-input"
              />
              <select
                aria-label="Tipo no lançamento rápido"
                value={quickType}
                onChange={(event) => setQuickType(event.target.value as NoteType)}
              >
                <option value="Nota fiscal">Nota fiscal</option>
                <option value="Boleto">Boleto</option>
              </select>
              <input
                type="date"
                aria-label="Vencimento no lançamento rápido"
                value={quickDueDate}
                onChange={(event) => setQuickDueDate(event.target.value)}
              />
              <button type="submit" className="primary-button small" disabled={quickSaving}>
                <Check size={14} /> {quickSaving ? "Salvando..." : "Lançar"}
              </button>
              <span className="quick-tip">Ou arraste arquivos / aperte Ctrl+V</span>
            </form>
            <datalist id="known-companies">
              {companySummaries.map((item) => (
                <option key={item.company} value={item.company} />
              ))}
            </datalist>

            {ocrStatus && (
              <div className="upload-message">
                <Loader2 size={15} className="spin-icon" /> {ocrStatus}
              </div>
            )}
            {uploadMessage && <div className="upload-message"><Check size={15} /> {uploadMessage} <button onClick={() => setUploadMessage("")}><X size={14} /></button></div>}

            <div className="toolbar">
              <div className="search-field">
                <Search size={16} />
                <input placeholder="Buscar por empresa ou documento" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <div className="filter-field">
                <CalendarDays size={15} />
                <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                {month && (
                  <button type="button" className="clear-month-btn" title="Mostrar todos os meses" aria-label="Mostrar todos os meses" onClick={() => setMonth("")}>
                    <X size={13} />
                  </button>
                )}
              </div>
              <button className="filter-button" onClick={() => setTypeFilter(typeFilter === "Todos" ? "Nota fiscal" : typeFilter === "Nota fiscal" ? "Boleto" : "Todos")}>
                <Filter size={15} /> {typeFilter}
              </button>
              <select
                className="filter-select"
                aria-label="Filtrar por status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "Todos" | NoteStatus)}
              >
                <option value="Todos">Status: Todos</option>
                <option value="Pendente">Pendente</option>
                <option value="Pago">Pago</option>
                <option value="Vencido">Vencido</option>
                <option value="Revisar">Revisar</option>
              </select>
              <select
                className="filter-select"
                aria-label="Filtrar por categoria"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="Todas">Categoria: Todas</option>
                <option value="Operacional">Operacional</option>
                <option value="Serviços">Serviços</option>
                <option value="Impostos">Impostos</option>
                <option value="Fornecedores">Fornecedores</option>
                <option value="Vendas">Vendas</option>
                <option value="Outros">Outros</option>
              </select>
              <button
                className="filter-button"
                title="Alterar ordenação"
                onClick={() => setSortBy(sortBy === "recentes" ? "vencimento" : sortBy === "vencimento" ? "valor" : "recentes")}
              >
                <ArrowUpDown size={14} /> {sortBy === "recentes" ? "Recentes" : sortBy === "vencimento" ? "Vencimento" : "Maior valor"}
              </button>
              <button className="export-button" onClick={() => handleExport("filtered")}><FileSpreadsheet size={15} /> Exportar XLSX</button>
            </div>

            {filteredRecords.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Empresa</th>
                      <th>Vencimento</th>
                      <th>Categoria</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => {
                      const displayStatus = getEffectiveStatus(record, today);
                      return (
                        <tr key={record.id}>
                          <td>
                            <div className="doc-cell">
                              <span className={record.type === "Boleto" ? "doc-icon boleto" : "doc-icon nota"}>
                                {record.type === "Boleto" ? <FileText size={16} /> : <ReceiptText size={16} />}
                              </span>
                              <div>
                                <b>{record.document}</b>
                                <small>{record.type} · {record.source}</small>
                              </div>
                            </div>
                          </td>
                          <td>{record.company}</td>
                          <td>{dateLabel(record.dueDate)}</td>
                          <td><span className="category-tag">{record.category}</span></td>
                          <td className="amount-cell">{currency.format(record.amount)}</td>
                          <td><span className={`status status-${displayStatus.toLowerCase()}`}>{displayStatus}</span></td>
                          <td>
                            <div className="row-actions">
                              {record.storedFileName && (
                                <button type="button" className="row-action-button neutral" title="Ver documento original" aria-label="Ver documento original" onClick={() => setPreviewRecord(record)}>
                                  <Eye size={14} />
                                </button>
                              )}
                              <button type="button" className="row-action-button neutral" title="Repetir para o mês atual" aria-label="Repetir para o mês atual" onClick={() => openRepeatForm(record)}>
                                <Copy size={14} />
                              </button>
                              <button type="button" className="row-action-button neutral" title="Editar documento" aria-label="Editar documento" onClick={() => openEditForm(record)}>
                                <Pencil size={14} />
                              </button>
                              <button type="button" className="row-action-button" title={record.status === "Pago" ? "Marcar como pendente" : "Marcar como pago"} aria-label={record.status === "Pago" ? "Marcar como pendente" : "Marcar como pago"} onClick={() => handleTogglePaid(record)}>
                                <Check size={14} />
                              </button>
                              <button type="button" className="row-action-button danger" title="Excluir documento" aria-label="Excluir documento" onClick={() => setDeleteTarget(record)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon"><CloudUpload size={22} /></div>
                <h3>Seu arquivo financeiro começa aqui.</h3>
                <p>Use o scanner/câmera, importe um XML, PDF ou imagem, ou crie um registro manual.</p>
                <div className="empty-actions">
                  <button type="button" className="secondary-button" onClick={() => setShowScanner(true)}>
                    <ScanLine size={15} /> Scanner
                  </button>
                  <label className="secondary-button upload-button">
                    <Upload size={15} /> Importar arquivo(s)
                    <input type="file" accept=".xml,.pdf,image/*,.xlsx,.xls,.csv" multiple onChange={handleFiles} />
                  </label>
                  <button type="button" className="primary-button small" onClick={() => { selectView("Documentos"); openNewForm(); }}>
                    <Plus size={15} /> Novo registro
                  </button>
                </div>
              </div>
            )}
          </section>

          <footer className="page-footer"><span>Gerenciador de Notas · Organização para conferência</span><span>Seus dados são privados por padrão.</span></footer>
        </div>
      </section>

      {toast && <div className="toast" role="status">{toast}</div>}

      {showScanner && (
        <ScannerModal
          onClose={() => setShowScanner(false)}
          onDetected={(draft, message) => {
            setShowScanner(false);
            setEditingId(null);
            setForm(draftToForm({ ...draft, status: "Pendente" }, "Scanner"));
            setShowForm(true);
            setUploadMessage(message);
          }}
        />
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{editingId ? "Editar registro" : "Novo registro"}</p>
                <h2>{editingId ? "Atualizar documento" : "Adicionar documento"}</h2>
              </div>
              <button className="icon-button" aria-label="Fechar formulário" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="type-switch">
                <button type="button" className={form.type === "Nota fiscal" ? "selected" : ""} onClick={() => setForm({ ...form, type: "Nota fiscal" })}>
                  <ReceiptText size={16} /> Nota fiscal
                </button>
                <button type="button" className={form.type === "Boleto" ? "selected" : ""} onClick={() => setForm({ ...form, type: "Boleto" })}>
                  <FileText size={16} /> Boleto
                </button>
              </div>
              {!editingId && companySummaries.length > 0 && (
                <div className="quick-company-chips" aria-label="Empresas frequentes">
                  <span>Empresas frequentes:</span>
                  {companySummaries.slice(0, 5).map((item) => (
                    <button
                      key={item.company}
                      type="button"
                      className="quick-chip"
                      onClick={() => applyCompanyPreset(item.company)}
                    >
                      {item.company}
                    </button>
                  ))}
                </div>
              )}
              <div className="form-grid">
                <label>Nome da empresa<input list="known-companies" value={form.company} onChange={(event) => applyCompanyPreset(event.target.value)} placeholder="Ex.: Empresa Exemplo Ltda." required /></label>
                <label>Número / identificação<input value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} placeholder="NF 000123 ou linha digitável" /></label>
                <label>Valor bruto<input type="number" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0,00" required /></label>
                <label>Impostos / retenções<input type="number" step="0.01" value={form.taxes} onChange={(event) => setForm({ ...form, taxes: event.target.value })} placeholder="0,00" /></label>
                <label>Data de emissão<input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} /></label>
                <label>Vencimento<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} required /></label>
                <label>Categoria<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Operacional</option><option>Serviços</option><option>Impostos</option><option>Fornecedores</option><option>Vendas</option><option>Outros</option></select></label>
                <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as NoteStatus })}><option>Pendente</option><option>Pago</option><option>Vencido</option><option>Revisar</option></select></label>
              </div>
              <div className="form-notes-field">
                <label>Observações / Linha digitável / Chave
                  <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Opcional" />
                </label>
              </div>
              {duplicateWarning && (
                <div className="duplicate-alert">
                  <AlertTriangle size={15} />
                  <span>{duplicateWarning}</span>
                </div>
              )}
              <div className="review-note"><Sparkles size={16} /><span>Os dados importados ou digitalizados devem ser conferidos antes de entrar na planilha.</span></div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="primary-button">{editingId ? "Atualizar registro" : "Salvar registro"} <Check size={16} /></button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewRecord?.storedFileName && (
        <div className="modal-backdrop" onClick={() => setPreviewRecord(null)}>
          <div className="modal preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Arquivo original</p>
                <h2>{previewRecord.originalFileName || previewRecord.document}</h2>
              </div>
              <button className="icon-button" aria-label="Fechar prévia" onClick={() => setPreviewRecord(null)}><X size={18} /></button>
            </div>
            <div className="preview-stage">
              {isImageFileName(previewRecord.storedFileName) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/documents/${encodeURIComponent(previewRecord.storedFileName)}`} alt={previewRecord.document} className="preview-image" />
              ) : (
                <iframe src={`/api/documents/${encodeURIComponent(previewRecord.storedFileName)}`} title={previewRecord.document} className="preview-frame" />
              )}
            </div>
            <div className="modal-actions">
              <a className="secondary-button" href={`/api/documents/${encodeURIComponent(previewRecord.storedFileName)}`} download={previewRecord.originalFileName || previewRecord.storedFileName}>
                <Download size={15} /> Baixar original
              </a>
              <button type="button" className="primary-button" onClick={() => setPreviewRecord(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Confirmar exclusão</p>
                <h2>Remover documento?</h2>
              </div>
              <button className="icon-button" aria-label="Fechar confirmação" onClick={() => setDeleteTarget(null)}><X size={18} /></button>
            </div>
            <p className="confirm-text">
              Tem certeza que deseja excluir <b>{deleteTarget.document}</b> ({deleteTarget.company})? Esta ação remove o registro da lista.
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button type="button" className="danger-button" onClick={confirmDelete}><Trash2 size={15} /> Excluir</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
