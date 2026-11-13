import { XMLParser } from "fast-xml-parser";

export type NoteType = "Nota fiscal" | "Boleto";
export type NoteStatus = "Pendente" | "Pago" | "Vencido" | "Revisar";
export type NoteSource = "Manual" | "XML" | "PDF" | "Imagem" | "Scanner" | "Planilha";

export function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getEffectiveStatus(
  record: Pick<NoteRecord, "status" | "dueDate">,
  today = getLocalDateString(),
): NoteStatus {
  if (record.status === "Pendente" && record.dueDate && record.dueDate < today) {
    return "Vencido";
  }
  return record.status;
}

export type NoteRecord = {
  id: string;
  type: NoteType;
  company: string;
  document: string;
  amount: number;
  dueDate: string;
  issueDate: string;
  category: string;
  status: NoteStatus;
  source: NoteSource;
  taxes: number;
  createdAt: string;
  reviewRequired?: boolean;
  storedFileName?: string;
  originalFileName?: string;
  notes?: string;
};

export type NoteDraft = Omit<NoteRecord, "id" | "createdAt">;

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

function firstValue(value: unknown): string {
  if (Array.isArray(value)) return firstValue(value[0]);
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "#text" in value) return firstValue((value as { "#text"?: unknown })["#text"]);
  return String(value).trim();
}

function findValue(root: Record<string, unknown>, paths: string[]): string {
  for (const path of paths) {
    let current: unknown = root;
    for (const part of path.split(".")) {
      if (!current || typeof current !== "object") { current = undefined; break; }
      current = (current as Record<string, unknown>)[part];
    }
    const value = firstValue(current);
    if (value) return value;
  }
  return "";
}

function normalizeDate(value: string): string {
  if (!value) return "";
  const compact = value.replace(/[^0-9]/g, "");
  if (compact.length >= 8 && /^20\d{6}/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function normalizeAmount(value: string): number {
  if (!value) return 0;
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseNfXml(xml: string, fileName = "documento.xml"): NoteDraft {
  if (!xml.trim()) throw new Error("O XML está vazio.");
  const parsed = parser.parse(xml) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Não foram encontrados campos reconhecíveis de NF-e/NFS-e.");
  }

  const root = (parsed["nfeProc"] || parsed["NFe"] || parsed["nfe"] || parsed["enviNFe"] || parsed["NFSe"] || parsed["CompNfse"] || parsed) as Record<string, unknown>;
  const nestedNfe = (root["NFe"] || root["Nfse"] || {}) as Record<string, unknown>;
  const nestedProc = (root["nfeProc"] || {}) as Record<string, unknown>;
  const procNfe = (nestedProc["NFe"] || {}) as Record<string, unknown>;
  const infNFe = (root["infNFe"] || nestedNfe["infNFe"] || procNfe["infNFe"] || root["infNFSe"] || nestedNfe["InfNfse"] || root["InfNfse"] || root) as Record<string, unknown>;
  const ide = (infNFe["ide"] || infNFe) as Record<string, unknown>;
  const emit = (infNFe["emit"] || infNFe["PrestadorServico"] || {}) as Record<string, unknown>;
  const totalNode = (infNFe["total"] || infNFe["valores"] || (infNFe["Servico"] as Record<string, unknown> | undefined)?.["Valores"] || {}) as Record<string, unknown>;
  const total = (totalNode["ICMSTot"] || totalNode) as Record<string, unknown>;

  const rawCompany = findValue(emit, ["xNome", "xFant", "RazaoSocial", "NomeFantasia", "CNPJ", "IdentificacaoPrestador.Cnpj"]);
  const rawDocument = findValue(ide, ["nNF", "nNFSe", "nDoc", "cNF", "Numero"]);
  const issueDate = normalizeDate(findValue(ide, ["dhEmi", "dEmi", "dSaiEnt", "DataEmissao", "dhProc"]));
  const amount = normalizeAmount(findValue(total, ["vNF", "vProd", "vLiq", "ValorServicos", "ValorLiquidoNfse", "vTotTrib"]));
  if (!rawCompany && !rawDocument && !amount && !issueDate) {
    throw new Error("Não foram encontrados campos reconhecíveis de NF-e/NFS-e.");
  }

  const company = rawCompany || "Empresa não identificada";
  const document = rawDocument || fileName.replace(/\.xml$/i, "");
  return {
    type: "Nota fiscal",
    company,
    document,
    amount,
    dueDate: issueDate,
    issueDate,
    category: "Operacional",
    status: "Revisar",
    source: "XML",
    taxes: normalizeAmount(findValue(total, ["vTotTrib", "vICMS", "vIPI", "ValorIss"])),
    reviewRequired: true,
  };
}

const globalStore = globalThis as typeof globalThis & { __notaRecords?: NoteRecord[] };
export function getRecords() { return globalStore.__notaRecords ?? (globalStore.__notaRecords = []); }
export function createRecord(draft: NoteDraft): NoteRecord {
  const record: NoteRecord = { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  getRecords().unshift(record);
  return record;
}
