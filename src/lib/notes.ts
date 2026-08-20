import { XMLParser } from "fast-xml-parser";

export type NoteType = "Nota fiscal" | "Boleto";
export type NoteStatus = "Pendente" | "Pago" | "Vencido" | "Revisar";
export type NoteSource = "Manual" | "XML" | "PDF" | "Imagem";

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
  const root = (parsed["nfeProc"] || parsed["NFe"] || parsed["nfe"] || parsed["enviNFe"] || parsed) as Record<string, unknown>;
  const nestedNfe = (root["NFe"] || {}) as Record<string, unknown>;
  const nestedProc = (root["nfeProc"] || {}) as Record<string, unknown>;
  const procNfe = (nestedProc["NFe"] || {}) as Record<string, unknown>;
  const infNFe = (root["infNFe"] || nestedNfe["infNFe"] || procNfe["infNFe"] || root) as Record<string, unknown>;
  const ide = (infNFe["ide"] || {}) as Record<string, unknown>;
  const emit = (infNFe["emit"] || {}) as Record<string, unknown>;
  const totalNode = (infNFe["total"] || {}) as Record<string, unknown>;
  const total = (totalNode["ICMSTot"] || totalNode) as Record<string, unknown>;
  const company = findValue(emit, ["xNome", "xFant", "CNPJ"]) || "Empresa não identificada";
  const document = findValue(ide, ["nNF", "nDoc", "cNF"]) || fileName.replace(/\.xml$/i, "");
  const issueDate = normalizeDate(findValue(ide, ["dhEmi", "dEmi", "dSaiEnt"]));
  const amount = normalizeAmount(findValue(total, ["vNF", "vProd", "vTotTrib"]));
  if (!company && !document && !amount) throw new Error("Não foram encontrados campos reconhecíveis de NF-e/NFS-e.");
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
    taxes: normalizeAmount(findValue(total, ["vTotTrib", "vICMS", "vIPI"])),
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
