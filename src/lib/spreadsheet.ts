import * as XLSX from "xlsx";
import {
  getEffectiveStatus,
  getLocalDateString,
  type NoteDraft,
  type NoteRecord,
  type NoteSource,
  type NoteStatus,
  type NoteType,
} from "./notes";

const CURRENCY_FORMAT = "R$ #,##0.00";
const VALID_SOURCES: NoteSource[] = ["Manual", "XML", "PDF", "Imagem", "Scanner", "Planilha"];
const VALID_STATUSES: NoteStatus[] = ["Pendente", "Pago", "Vencido", "Revisar"];

export type ExportRow = {
  Tipo: NoteType;
  Empresa: string;
  Documento: string;
  "Valor bruto": number;
  Impostos: number;
  "Valor líquido": number;
  Emissão: string;
  Vencimento: string;
  Categoria: string;
  Status: NoteStatus;
  Origem: NoteSource;
  Observações: string;
};

export type ParsedSpreadsheetResult = {
  drafts: NoteDraft[];
  skipped: number;
  sheetName: string;
};

export function roundCurrency(value: number): number {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function normalizeHeaderKey(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatPtBrDecimal(value: number): string {
  return roundCurrency(value).toFixed(2).replace(".", ",");
}

function sanitizeCsvText(value: string): string {
  const trimmed = value ?? "";
  const safe = /^[=+\-@\t\r]/.test(trimmed) ? `'${trimmed}` : trimmed;
  if (/[;"\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function computeColumnWidths(rows: Array<Record<string, string | number>>, headers: string[]) {
  return headers.map((header) => {
    let maxLen = header.length + 2;
    for (const row of rows) {
      const val = row[header];
      const str = typeof val === "number" ? `R$ ${val.toFixed(2)}` : String(val ?? "");
      if (str.length + 2 > maxLen) maxLen = str.length + 2;
    }
    return { wch: Math.min(Math.max(maxLen, 12), 42) };
  });
}

function applyCurrencyFormat(
  worksheet: XLSX.WorkSheet,
  rowCount: number,
  colIndices: number[],
  startRow = 1,
) {
  for (let row = startRow; row < startRow + rowCount; row += 1) {
    for (const col of colIndices) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[address];
      if (cell && typeof cell.v === "number") {
        cell.t = "n";
        cell.z = CURRENCY_FORMAT;
      }
    }
  }
}

export function buildExportRows(records: NoteRecord[], today = getLocalDateString()): ExportRow[] {
  return records.map((record) => {
    const amount = roundCurrency(record.amount);
    const taxes = roundCurrency(record.taxes);
    return {
      Tipo: record.type,
      Empresa: record.company,
      Documento: record.document,
      "Valor bruto": amount,
      Impostos: taxes,
      "Valor líquido": roundCurrency(amount - taxes),
      Emissão: record.issueDate,
      Vencimento: record.dueDate,
      Categoria: record.category,
      Status: getEffectiveStatus(record, today),
      Origem: record.source,
      Observações: record.notes || "",
    };
  });
}

export function buildExportWorkbook(records: NoteRecord[], today = getLocalDateString()): XLSX.WorkBook {
  const rows = buildExportRows(records, today);
  const docHeaders: Array<keyof ExportRow> = [
    "Tipo",
    "Empresa",
    "Documento",
    "Valor bruto",
    "Impostos",
    "Valor líquido",
    "Emissão",
    "Vencimento",
    "Categoria",
    "Status",
    "Origem",
    "Observações",
  ];

  const docSheet = XLSX.utils.json_to_sheet(rows, { header: docHeaders });
  docSheet["!cols"] = computeColumnWidths(rows, docHeaders);
  applyCurrencyFormat(docSheet, rows.length, [3, 4, 5], 1);

  const totalBruto = roundCurrency(rows.reduce((sum, item) => sum + item["Valor bruto"], 0));
  const totalImpostos = roundCurrency(rows.reduce((sum, item) => sum + item.Impostos, 0));
  const totalLiquido = roundCurrency(totalBruto - totalImpostos);

  const groupSum = (picker: (row: ExportRow) => string) => {
    const map = new Map<string, { Quantidade: number; Total: number }>();
    for (const row of rows) {
      const key = picker(row) || "Outros";
      const current = map.get(key) ?? { Quantidade: 0, Total: 0 };
      current.Quantidade += 1;
      current.Total = roundCurrency(current.Total + row["Valor bruto"]);
      map.set(key, current);
    }
    return map;
  };

  const byType = groupSum((r) => r.Tipo);
  const byStatus = groupSum((r) => r.Status);
  const byCategory = groupSum((r) => r.Categoria);

  const summaryRows = [
    { Indicador: "Quantidade de documentos", Quantidade: rows.length, Total: totalBruto },
    { Indicador: "Total de impostos", Quantidade: rows.length, Total: totalImpostos },
    { Indicador: "Total líquido", Quantidade: rows.length, Total: totalLiquido },
    ...Array.from(byType.entries()).map(([label, data]) => ({
      Indicador: `Tipo: ${label}`,
      Quantidade: data.Quantidade,
      Total: data.Total,
    })),
    ...Array.from(byStatus.entries()).map(([label, data]) => ({
      Indicador: `Status: ${label}`,
      Quantidade: data.Quantidade,
      Total: data.Total,
    })),
    ...Array.from(byCategory.entries()).map(([label, data]) => ({
      Indicador: `Categoria: ${label}`,
      Quantidade: data.Quantidade,
      Total: data.Total,
    })),
  ];

  const summaryHeaders = ["Indicador", "Quantidade", "Total"];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows, { header: summaryHeaders });
  summarySheet["!cols"] = computeColumnWidths(summaryRows, summaryHeaders);
  applyCurrencyFormat(summarySheet, summaryRows.length, [2], 1);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, docSheet, "Documentos");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo");
  return workbook;
}

export function buildTemplateWorkbook(today = getLocalDateString()): XLSX.WorkBook {
  const sampleRow: ExportRow = {
    Tipo: "Nota fiscal",
    Empresa: "Empresa Exemplo Ltda.",
    Documento: "NF 000100",
    "Valor bruto": 1250.5,
    Impostos: 75.25,
    "Valor líquido": 1175.25,
    Emissão: today,
    Vencimento: today,
    Categoria: "Operacional",
    Status: "Pendente",
    Origem: "Planilha",
    Observações: "Linha de exemplo - pode editar ou substituir",
  };
  const headers: Array<keyof ExportRow> = [
    "Tipo",
    "Empresa",
    "Documento",
    "Valor bruto",
    "Impostos",
    "Valor líquido",
    "Emissão",
    "Vencimento",
    "Categoria",
    "Status",
    "Origem",
    "Observações",
  ];
  const sheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
  sheet["!cols"] = computeColumnWidths([sampleRow], headers);
  applyCurrencyFormat(sheet, 1, [3, 4, 5], 1);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Documentos");
  return workbook;
}

export function workbookToUint8Array(workbook: XLSX.WorkBook): Uint8Array {
  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer | Uint8Array;
  return output instanceof Uint8Array ? output : new Uint8Array(output);
}

export function buildCsvContent(records: NoteRecord[], today = getLocalDateString()): string {
  const rows = buildExportRows(records, today);
  const headers: Array<keyof ExportRow> = [
    "Tipo",
    "Empresa",
    "Documento",
    "Valor bruto",
    "Impostos",
    "Valor líquido",
    "Emissão",
    "Vencimento",
    "Categoria",
    "Status",
    "Origem",
    "Observações",
  ];

  const lines = [
    headers.map((header) => sanitizeCsvText(header)).join(";"),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const val = row[header];
          if (typeof val === "number") return formatPtBrDecimal(val);
          return sanitizeCsvText(String(val ?? ""));
        })
        .join(";"),
    ),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

function parsePtBrNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? roundCurrency(value) : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  let cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    cleaned = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (hasComma) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
}

function parseSpreadsheetDate(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 20000 && value < 90000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return getLocalDateString(value);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  const brMatch = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (brMatch) {
    const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
    return `${year}-${brMatch[2].padStart(2, "0")}-${brMatch[1].padStart(2, "0")}`;
  }
  return "";
}

function inferType(rawType: string, rawDoc: string): NoteType {
  const combined = `${rawType} ${rawDoc}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/boleto|cobranca|fatura|duplicata|arrecadacao/.test(combined)) return "Boleto";
  return "Nota fiscal";
}

function inferStatus(rawStatus: string): NoteStatus {
  const normalized = normalizeHeaderKey(rawStatus);
  if (/pago|quitad|liquidado|recebido/.test(normalized)) return "Pago";
  if (/vencid|atrasad/.test(normalized)) return "Vencido";
  if (/revis/.test(normalized)) return "Revisar";
  if (/pendent|aberto/.test(normalized)) return "Pendente";
  return VALID_STATUSES.includes(rawStatus as NoteStatus) ? (rawStatus as NoteStatus) : "Pendente";
}

function inferSource(rawSource: string): NoteSource {
  const normalized = normalizeHeaderKey(rawSource);
  const found = VALID_SOURCES.find((src) => normalizeHeaderKey(src) === normalized);
  return found ?? "Planilha";
}

function isZipOrOleWorkbook(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return isZip || isOle;
}

function decodeCsvText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (utf8.includes("\uFFFD")) {
    return new TextDecoder("windows-1252").decode(bytes);
  }
  return utf8.replace(/^\uFEFF/, "");
}

function readWorkbook(input: ArrayBuffer | Uint8Array | string): XLSX.WorkBook {
  if (typeof input === "string") {
    const clean = input.replace(/^\uFEFF/, "");
    const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
    const fs = firstLine.includes(";") ? ";" : ",";
    return XLSX.read(clean, { type: "string", FS: fs });
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (isZipOrOleWorkbook(bytes)) {
    return XLSX.read(bytes, { type: "array" });
  }
  const text = decodeCsvText(bytes);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const fs = firstLine.includes(";") ? ";" : ",";
  return XLSX.read(text, { type: "string", FS: fs });
}

function pickField(row: Record<string, unknown>, aliases: string[]): unknown {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const match = entries.find(([key]) => normalizeHeaderKey(key) === alias);
    if (match && match[1] !== "" && match[1] !== null && match[1] !== undefined) {
      return match[1];
    }
  }
  for (const alias of aliases) {
    const match = entries.find(([key]) => normalizeHeaderKey(key).includes(alias));
    if (match && match[1] !== "" && match[1] !== null && match[1] !== undefined) {
      return match[1];
    }
  }
  return undefined;
}

export function parseSpreadsheetInput(
  input: ArrayBuffer | Uint8Array | string,
  fallbackDate = getLocalDateString(),
): ParsedSpreadsheetResult {
  const workbook = readWorkbook(input);
  if (!workbook.SheetNames.length) {
    throw new Error("A planilha não possui abas legíveis.");
  }
  const sheetName = workbook.SheetNames.includes("Documentos")
    ? "Documentos"
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const drafts: NoteDraft[] = [];
  let skipped = 0;

  for (let idx = 0; idx < rawRows.length; idx += 1) {
    const row = rawRows[idx];
    const company = String(
      pickField(row, ["empresa", "fornecedor", "emissor", "razao social", "cliente", "company"]) ?? "",
    ).trim();
    const document = String(
      pickField(row, ["documento", "numero", "identificacao", "nf", "chave", "document"]) ?? "",
    ).trim();
    const amount = parsePtBrNumber(
      pickField(row, ["valor bruto", "valor", "total", "valor total", "amount"]),
    );
    const taxes = parsePtBrNumber(pickField(row, ["impostos", "tributos", "retencoes", "taxes"]));
    const issueDate = parseSpreadsheetDate(
      pickField(row, ["emissao", "data emissao", "data de emissao", "issuedate", "data"]),
    );
    const dueDate = parseSpreadsheetDate(
      pickField(row, ["vencimento", "data vencimento", "data de vencimento", "duedate"]),
    );
    const rawType = String(pickField(row, ["tipo", "type"]) ?? "").trim();
    const category =
      String(pickField(row, ["categoria", "category"]) ?? "").trim() || "Operacional";
    const status = inferStatus(String(pickField(row, ["status", "situacao"]) ?? ""));
    const source = inferSource(String(pickField(row, ["origem", "source"]) ?? ""));
    const notes = String(
      pickField(row, ["observacoes", "obs", "anotacoes", "linha digitavel", "notes"]) ?? "",
    ).trim();

    if (!company && !document && amount <= 0) {
      skipped += 1;
      continue;
    }

    const resolvedDue = dueDate || issueDate || fallbackDate;
    const resolvedIssue = issueDate || resolvedDue;

    drafts.push({
      type: inferType(rawType, `${document} ${notes}`),
      company: company || "Empresa importada",
      document: document || `Planilha #${idx + 1}`,
      amount,
      taxes,
      issueDate: resolvedIssue,
      dueDate: resolvedDue,
      category,
      status,
      source,
      reviewRequired: status === "Revisar",
      notes: notes || undefined,
    });
  }

  return { drafts, skipped, sheetName };
}

export function buildRecordDuplicateKey(record: Pick<NoteDraft, "company" | "document" | "amount" | "dueDate">): string {
  return [
    record.company.trim().toLowerCase(),
    record.document.trim().toLowerCase(),
    roundCurrency(record.amount).toFixed(2),
    record.dueDate.trim(),
  ].join("|");
}

export function normalizeGoogleSheetsCsvUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== "docs.google.com") {
    return null;
  }

  const pubMatch = parsed.pathname.match(/^\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)\/pub/);
  if (pubMatch) {
    const out = new URL(`https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pub`);
    const gid = parsed.searchParams.get("gid");
    if (gid && /^\d+$/.test(gid)) out.searchParams.set("gid", gid);
    out.searchParams.set("single", "true");
    out.searchParams.set("output", "csv");
    return out.toString();
  }

  const docMatch = parsed.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!docMatch) return null;

  const out = new URL(`https://docs.google.com/spreadsheets/d/${docMatch[1]}/export`);
  out.searchParams.set("format", "csv");

  const hashGid = parsed.hash.match(/gid=(\d+)/)?.[1];
  const queryGid = parsed.searchParams.get("gid");
  const gid = queryGid && /^\d+$/.test(queryGid) ? queryGid : hashGid;
  if (gid) out.searchParams.set("gid", gid);

  return out.toString();
}
