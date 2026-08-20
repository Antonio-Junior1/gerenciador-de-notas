"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  CloudUpload,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  Landmark,
  LayoutDashboard,
  Menu,
  Plus,
  ReceiptText,
  Search,
  Settings2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

type RecordType = "Nota fiscal" | "Boleto";
type RecordStatus = "Pendente" | "Pago" | "Vencido" | "Revisar";
type NoteRecord = {
  id: string;
  type: RecordType;
  company: string;
  document: string;
  amount: number;
  dueDate: string;
  issueDate: string;
  category: string;
  status: RecordStatus;
  source: "Manual" | "XML" | "PDF" | "Imagem";
  taxes: number;
};

const emptyForm = {
  type: "Nota fiscal" as RecordType,
  company: "",
  document: "",
  amount: "",
  dueDate: "",
  issueDate: "",
  category: "Operacional",
  taxes: "",
  source: "Manual" as NoteRecord["source"],
};

const initialRecords: NoteRecord[] = [];

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";

export default function Home() {
  const [records, setRecords] = useState<NoteRecord[]>(initialRecords);
  const [form, setForm] = useState(emptyForm);
  const [activeView, setActiveView] = useState("Visão geral");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"Todos" | RecordType>("Todos");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [uploadMessage, setUploadMessage] = useState("");
  const [toast, setToast] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(true);

  useEffect(() => {
    fetch("/api/notes", { headers: { "x-demo-user": "local-demo" } })
      .then((response) => response.json())
      .then((payload: { records?: NoteRecord[] }) => setRecords(payload.records ?? []))
      .catch(() => announce("Não foi possível carregar os documentos."))
      .finally(() => setLoadingRecords(false));
  }, []);

  const filteredRecords = useMemo(() => records.filter((record) => {
    const matchesSearch = `${record.company} ${record.document}`.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "Todos" || record.type === typeFilter;
    const matchesMonth = !month || record.issueDate.startsWith(month) || record.dueDate.startsWith(month);
    const matchesView = activeView !== "Vencimentos" || (record.type === "Boleto" && record.status !== "Pago");
    return matchesSearch && matchesType && matchesMonth && matchesView;
  }), [records, search, typeFilter, month, activeView]);

  const monthRecords = records.filter((record) => record.issueDate.startsWith(month) || record.dueDate.startsWith(month));
  const notesTotal = monthRecords.filter((record) => record.type === "Nota fiscal").reduce((sum, record) => sum + record.amount, 0);
  const billsTotal = monthRecords.filter((record) => record.type === "Boleto").reduce((sum, record) => sum + record.amount, 0);
  const dueToday = records.filter((record) => record.type === "Boleto" && record.dueDate === new Date().toISOString().slice(0, 10) && record.status !== "Pago");
  const pendingReview = records.filter((record) => record.status === "Revisar").length;
  const companies = Array.from(new Set(records.map((record) => record.company).filter(Boolean)));

  function announce(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function handleExport() {
    if (!filteredRecords.length) {
      announce("Não há documentos no filtro atual para exportar.");
      return;
    }
    exportWorkbook();
    announce("Planilha XLSX exportada com sucesso.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.company || !form.amount || !form.dueDate) {
      announce("Preencha empresa, valor e vencimento antes de salvar.");
      return;
    }
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-user": "local-demo" },
      body: JSON.stringify({
        type: form.type,
        company: form.company,
        document: form.document || "Sem número informado",
        amount: Number(form.amount),
        dueDate: form.dueDate,
        issueDate: form.issueDate || form.dueDate,
        category: form.category,
        taxes: Number(form.taxes || 0),
        status: "Pendente",
        source: form.source,
        reviewRequired: false,
      }),
    });
    const payload = await response.json() as { record?: NoteRecord; error?: string };
    if (!response.ok || !payload.record) {
      announce(payload.error || "Não foi possível salvar o documento.");
      return;
    }
    setRecords((current) => [payload.record as NoteRecord, ...current]);
    setForm(emptyForm);
    setShowForm(false);
    announce("Documento salvo no backend.");
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const maxBytes = 10 * 1024 * 1024;
    const invalidFile = files.find((file) => file.size > maxBytes);
    if (invalidFile) {
      setUploadMessage(`${invalidFile.name} excede o limite de 10 MB. Escolha um arquivo menor.`);
      event.target.value = "";
      return;
    }
    const allowed = files.every((file) => file.name.toLowerCase().endsWith(".xml") || file.type === "application/pdf" || file.type.startsWith("image/"));
    if (!allowed) {
      setUploadMessage("Formato não suportado. Use XML, PDF ou imagem.");
      event.target.value = "";
      return;
    }
    const xmlFile = files.find((file) => file.name.toLowerCase().endsWith(".xml"));
    if (xmlFile) {
      const response = await fetch("/api/import/xml", {
        method: "POST",
        headers: { "Content-Type": "application/xml", "x-file-name": xmlFile.name },
        body: await xmlFile.text(),
      });
      const payload = await response.json() as { draft?: Partial<NoteRecord>; message?: string; error?: string };
      if (!response.ok || !payload.draft) {
        setUploadMessage(payload.error || "Não foi possível interpretar este XML.");
        return;
      }
      const draft = payload.draft;
      setForm((current) => ({
        ...current,
        type: "Nota fiscal",
        company: draft.company || "",
        document: draft.document || "",
        amount: String(draft.amount || ""),
        issueDate: draft.issueDate || "",
        dueDate: draft.dueDate || draft.issueDate || "",
        source: "XML",
        taxes: String(draft.taxes || ""),
      }));
      setShowForm(true);
      setUploadMessage(payload.message || `${xmlFile.name} lido. Revise os campos antes de salvar.`);
      return;
    }
    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/import/document", { method: "POST", body: formData });
    const payload = await response.json() as { draft?: Partial<NoteRecord>; message?: string; error?: string };
    if (!response.ok || !payload.draft) {
      setUploadMessage(payload.error || "Não foi possível receber o documento.");
      return;
    }
    setForm((current) => ({ ...current, type: "Boleto", source: payload.draft?.source === "Imagem" ? "Imagem" : "PDF", document: payload.draft?.document || file.name }));
    setShowForm(true);
    setUploadMessage(payload.message || `${file.name} recebido para revisão manual.`);
  }

  function exportWorkbook() {
    const rows = filteredRecords.map((record) => ({
      Tipo: record.type,
      Empresa: record.company,
      Documento: record.document,
      "Valor bruto": record.amount,
      Impostos: record.taxes,
      "Valor líquido": record.amount - record.taxes,
      Emissão: record.issueDate,
      Vencimento: record.dueDate,
      Categoria: record.category,
      Status: record.status,
      Origem: record.source,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Documentos");
    XLSX.writeFile(workbook, `gerenciador-de-notas-${month || "exportacao"}.xlsx`);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><ReceiptText size={19} /></span><div><strong>Gerenciador</strong><span>de notas</span></div></div>
        <div className="workspace-switcher"><span className="workspace-avatar">G</span><div><b>Minha organização</b><small>Área financeira</small></div><ChevronDown size={15} /></div>
        <nav className="sidebar-nav">
          <p className="nav-label">Workspace</p>
          <button className={activeView === "Visão geral" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("Visão geral")}><LayoutDashboard size={17} /> Visão geral</button>
          <button className={activeView === "Documentos" ? "nav-item active" : "nav-item"} onClick={() => { setActiveView("Documentos"); setTypeFilter("Todos"); }}><FileText size={17} /> Documentos <span>{records.length}</span></button>
          <button className={activeView === "Vencimentos" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("Vencimentos")}><CalendarDays size={17} /> Vencimentos {dueToday.length > 0 && <i>{dueToday.length}</i>}</button>
          <p className="nav-label section-label">Organização</p>
          <button className={activeView === "Empresas" ? "nav-item active" : "nav-item"} onClick={() => setActiveView("Empresas")}><Landmark size={17} /> Empresas <span>{companies.length}</span></button>
          <button className={activeView === "Exportações" ? "nav-item active" : "nav-item"} onClick={() => { setActiveView("Exportações"); handleExport(); }}><FileSpreadsheet size={17} /> Exportações</button>
          <button className={activeView === "Configurações" ? "nav-item active" : "nav-item"} onClick={() => { setActiveView("Configurações"); announce("As configurações de persistência entram na próxima etapa."); }}><Settings2 size={17} /> Configurações</button>
        </nav>
        <div className="sidebar-footer"><div className="avatar">AJ</div><div><b>Antônio Junior</b><small>Conta pessoal</small></div><ChevronDown size={15} /></div>
      </aside>

      <section className="content-area">
        <header className="topbar"><div className="mobile-brand"><Menu size={20} /><span>Gerenciador de notas</span></div><div className="topbar-actions"><span className="secure-note"><span className="online-dot" /> Dados protegidos</span><button className="icon-button" aria-label="Notificações" onClick={() => { setActiveView("Vencimentos"); setTypeFilter("Boleto"); announce(dueToday.length ? `${dueToday.length} boleto(s) vencendo hoje.` : "Nenhum boleto vence hoje."); }}><BellRing size={18} />{dueToday.length > 0 && <span className="notification-dot" />}</button><div className="user-menu-wrap"><button className="avatar top-avatar" onClick={() => setUserMenuOpen((open) => !open)}>AJ</button>{userMenuOpen && <div className="user-menu"><b>Antônio Junior</b><small>Conta pessoal</small><button onClick={() => announce("A autenticação será conectada na próxima etapa.")}>Gerenciar conta</button></div>}</div></div></header>
        <div className="page-wrap">
          <div className="page-heading"><div><p className="eyebrow">Workspace financeiro</p><h1>Organize tudo em um só lugar.</h1><p className="page-subtitle">Notas, boletos e documentos prontos para sua conferência mensal.</p></div><button className="primary-button" onClick={() => setShowForm(true)}><Plus size={17} /> Novo registro</button></div>

          {activeView === "Empresas" && <section className="context-panel"><div><p className="eyebrow">Organização</p><h2>Empresas cadastradas</h2><p>Quando os documentos forem persistidos, cada empresa poderá reunir suas notas e boletos.</p></div><span className="context-count">{companies.length}</span></section>}
          {activeView === "Exportações" && <section className="context-panel"><div><p className="eyebrow">Centro de exportação</p><h2>Planilha de conferência</h2><p>Use o botão XLSX abaixo para exportar os registros que estão no filtro atual.</p></div><button className="primary-button small" onClick={handleExport}><FileSpreadsheet size={15} /> Exportar agora</button></section>}
          {activeView === "Configurações" && <section className="context-panel"><div><p className="eyebrow">Preferências</p><h2>Configurações do workspace</h2><p>A persistência, autenticação e preferências avançadas serão conectadas na próxima etapa.</p></div><Settings2 size={21} color="#7b8a84" /></section>}
          {activeView === "Vencimentos" && <section className="context-panel warning-panel"><div><p className="eyebrow">Agenda de vencimentos</p><h2>Boletos em aberto</h2><p>O filtro abaixo mostra boletos não pagos no mês selecionado.</p></div><BellRing size={21} color="#b84c3c" /></section>}
          {activeView === "Documentos" && <section className="context-panel"><div><p className="eyebrow">Arquivo financeiro</p><h2>Todos os documentos</h2><p>Esta visão reúne notas fiscais e boletos usando os filtros abaixo.</p></div><FileText size={21} color="#2b8b70" /></section>}

          {dueToday.length > 0 && <div className="due-alert"><div className="alert-icon"><AlertTriangle size={19} /></div><div><b>Boletos vencendo hoje</b><p>{dueToday.map((item) => item.company).join(", ")} · {currency.format(dueToday.reduce((sum, item) => sum + item.amount, 0))}</p></div><button onClick={() => { setActiveView("Vencimentos"); setTypeFilter("Boleto"); }}>Revisar agora <ArrowUpRight size={15} /></button></div>}

          <section className="summary-grid">
            <article className="summary-card main-total"><div className="summary-head"><span>Movimentação no mês</span><CircleDollarSign size={18} /></div><strong>{currency.format(notesTotal + billsTotal)}</strong><div className="summary-meta"><span className="positive"><ArrowDownLeft size={13} /> {currency.format(notesTotal)} em notas</span><span className="negative"><ArrowUpRight size={13} /> {currency.format(billsTotal)} em boletos</span></div></article>
            <article className="summary-card"><div className="summary-head"><span>Notas registradas</span><span className="metric-icon mint"><FileCheck2 size={16} /></span></div><strong>{monthRecords.filter((item) => item.type === "Nota fiscal").length}</strong><p>documentos no período</p></article>
            <article className="summary-card"><div className="summary-head"><span>Vencendo hoje</span><span className="metric-icon coral"><BellRing size={16} /></span></div><strong className={dueToday.length ? "pulse-number" : ""}>{dueToday.length}</strong><p>{dueToday.length ? "atenção necessária" : "nenhum boleto para hoje"}</p></article>
            <article className="summary-card"><div className="summary-head"><span>Para revisar</span><span className="metric-icon gold"><Sparkles size={16} /></span></div><strong>{pendingReview}</strong><p>dados aguardando conferência</p></article>
          </section>

          <section className="content-card documents-card" aria-busy={loadingRecords}><div className="card-heading"><div><p className="eyebrow">Documentos recentes</p><h2>Notas e boletos</h2></div><div className="heading-actions"><label className="secondary-button upload-button"><Upload size={15} /> Importar arquivo<input type="file" accept=".xml,.pdf,image/*" multiple onChange={handleFiles} /></label><button type="button" className="primary-button small" onClick={() => { setActiveView("Documentos"); setShowForm(true); }}><Plus size={15} /> Manual</button></div></div>
            {uploadMessage && <div className="upload-message"><Check size={15} /> {uploadMessage} <button onClick={() => setUploadMessage("")}><X size={14} /></button></div>}
            <div className="toolbar"><div className="search-field"><Search size={16} /><input placeholder="Buscar por empresa ou documento" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="filter-field"><CalendarDays size={15} /><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div><button className="filter-button" onClick={() => setTypeFilter(typeFilter === "Todos" ? "Nota fiscal" : typeFilter === "Nota fiscal" ? "Boleto" : "Todos")}><Filter size={15} /> {typeFilter}</button><button className="export-button" onClick={handleExport}><FileSpreadsheet size={15} /> Exportar XLSX</button></div>
            {filteredRecords.length ? <div className="table-wrap"><table><thead><tr><th>Documento</th><th>Empresa</th><th>Vencimento</th><th>Categoria</th><th>Valor</th><th>Status</th></tr></thead><tbody>{filteredRecords.map((record) => <tr key={record.id}><td><div className="doc-cell"><span className={record.type === "Boleto" ? "doc-icon boleto" : "doc-icon nota"}>{record.type === "Boleto" ? <FileText size={16} /> : <ReceiptText size={16} />}</span><div><b>{record.document}</b><small>{record.type} · {record.source}</small></div></div></td><td>{record.company}</td><td>{dateLabel(record.dueDate)}</td><td><span className="category-tag">{record.category}</span></td><td className="amount-cell">{currency.format(record.amount)}</td><td><span className={`status status-${record.status.toLowerCase()}`}>{record.status}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-icon"><CloudUpload size={22} /></div><h3>Seu arquivo financeiro começa aqui.</h3><p>Importe um XML, PDF ou imagem, ou crie seu primeiro registro manual.</p><div className="empty-actions"><label className="secondary-button upload-button"><Upload size={15} /> Importar arquivo<input type="file" accept=".xml,.pdf,image/*" multiple onChange={handleFiles} /></label><button className="primary-button small" onClick={() => { setActiveView("Documentos"); setShowForm(true); }}><Plus size={15} /> Novo registro</button></div></div>}
          </section>

          <footer className="page-footer"><span>Gerenciador de Notas · Organização para conferência</span><span>Seus dados são privados por padrão.</span></footer>
        </div>
      </section>

      {toast && <div className="toast" role="status">{toast}</div>}
      {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Novo registro</p><h2>Adicionar documento</h2></div><button className="icon-button" onClick={() => setShowForm(false)}><X size={18} /></button></div><form onSubmit={handleSubmit}><div className="type-switch"><button type="button" className={form.type === "Nota fiscal" ? "selected" : ""} onClick={() => setForm({ ...form, type: "Nota fiscal" })}><ReceiptText size={16} /> Nota fiscal</button><button type="button" className={form.type === "Boleto" ? "selected" : ""} onClick={() => setForm({ ...form, type: "Boleto" })}><FileText size={16} /> Boleto</button></div><div className="form-grid"><label>Nome da empresa<input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="Ex.: Empresa Exemplo Ltda." required /></label><label>Número / identificação<input value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} placeholder="NF 000123 ou linha digitável" /></label><label>Valor bruto<input type="number" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0,00" required /></label><label>Impostos / retenções<input type="number" step="0.01" value={form.taxes} onChange={(event) => setForm({ ...form, taxes: event.target.value })} placeholder="0,00" /></label><label>Data de emissão<input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} /></label><label>Vencimento<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} required /></label><label>Categoria<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Operacional</option><option>Serviços</option><option>Impostos</option><option>Fornecedores</option><option>Vendas</option><option>Outros</option></select></label></div><div className="review-note"><Sparkles size={16} /><span>Os dados importados devem ser revisados antes de entrar no resumo ou na planilha.</span></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className="primary-button">Salvar registro <Check size={16} /></button></div></form></div></div>}
    </main>
  );
}
