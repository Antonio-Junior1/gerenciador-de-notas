import type { NoteDraft, NoteSource, NoteType } from "./notes";

export type BoletoParseResult = {
  kind: "bancario" | "arrecadacao";
  barcode: string;
  linhaDigitavel: string;
  bankCode?: string;
  bankName?: string;
  segment?: string;
  amount: number;
  dueDate: string;
};

export type AccessKeyResult = {
  accessKey: string;
  ufCode: string;
  issueYearMonth: string;
  cnpj: string;
  model: string;
  series: string;
  documentNumber: string;
};

export type ScannedExtraction = {
  draft: Partial<NoteDraft>;
  detectedFields: string[];
  boleto?: BoletoParseResult;
  accessKey?: AccessKeyResult;
};

const BANK_NAMES: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "077": "Banco Inter",
  "104": "Caixa Econômica Federal",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "237": "Bradesco",
  "260": "Nubank",
  "290": "PagSeguro",
  "318": "Banco BMG",
  "323": "Mercado Pago",
  "336": "C6 Bank",
  "341": "Itaú",
  "380": "PicPay",
  "422": "Banco Safra",
  "623": "Banco Pan",
  "633": "Banco Rendimento",
  "655": "Banco Votorantim",
  "745": "Citibank",
  "748": "Sicredi",
  "756": "Sicoob",
};

const ARRECADACAO_SEGMENTS: Record<string, string> = {
  "1": "Prefeituras",
  "2": "Saneamento",
  "3": "Energia elétrica e gás",
  "4": "Telecomunicações",
  "5": "Órgãos governamentais",
  "6": "Carnês e assemelhados",
  "7": "Multas de trânsito",
  "9": "Uso exclusivo do banco",
};

function calcMod10(digits: string): number {
  let sum = 0;
  let multiplier = 2;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const prod = Number(digits[i]) * multiplier;
    sum += prod > 9 ? Math.floor(prod / 10) + (prod % 10) : prod;
    multiplier = multiplier === 2 ? 1 : 2;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

function addUtcDays(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Converte fator de vencimento FEBRABAN (4 dígitos).
 * Em 22/02/2025 o fator foi reiniciado para 1000.
 */
export function resolveFebrabanDueDate(factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) return "";
  if (factor >= 1000 && factor <= 6000) {
    return addUtcDays("2025-02-22", factor - 1000);
  }
  return addUtcDays("1997-10-07", factor);
}

function formatBancarioLinha(d: string): string {
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33, 47)}`;
}

function barcodeToBancarioLinha(barcode: string): string {
  const campo1Base = `${barcode.slice(0, 4)}${barcode.slice(19, 24)}`;
  const campo1 = `${campo1Base}${calcMod10(campo1Base)}`;
  const campo2Base = barcode.slice(24, 34);
  const campo2 = `${campo2Base}${calcMod10(campo2Base)}`;
  const campo3Base = barcode.slice(34, 44);
  const campo3 = `${campo3Base}${calcMod10(campo3Base)}`;
  const campo4 = barcode[4];
  const campo5 = barcode.slice(5, 19);
  return formatBancarioLinha(`${campo1}${campo2}${campo3}${campo4}${campo5}`);
}

export function parseBoletoCode(rawInput: string): BoletoParseResult | null {
  const cleaned = rawInput.replace(/[^\d]/g, "");

  // 1. Linha digitável de boleto bancário (47 dígitos)
  const match47 = rawInput.match(/(?:\d[ \t.\-]*){47}/g) ?? [];
  const candidate47 = cleaned.length === 47 ? cleaned : match47.map((m) => m.replace(/\D/g, "")).find((d) => d.length === 47);
  if (candidate47 && candidate47.length === 47 && !candidate47.startsWith("8")) {
    const c1 = candidate47.slice(0, 9);
    const dv1 = Number(candidate47[9]);
    const c2 = candidate47.slice(10, 20);
    const dv2 = Number(candidate47[20]);
    const c3 = candidate47.slice(21, 31);
    const dv3 = Number(candidate47[31]);
    if (calcMod10(c1) === dv1 && calcMod10(c2) === dv2 && calcMod10(c3) === dv3) {
      const bankCode = candidate47.slice(0, 3);
      const factor = Number(candidate47.slice(33, 37));
      const cents = Number(candidate47.slice(37, 47));
      const barcode =
        `${candidate47.slice(0, 4)}${candidate47[32]}${candidate47.slice(33, 47)}` +
        `${candidate47.slice(4, 9)}${candidate47.slice(10, 20)}${candidate47.slice(21, 31)}`;
      return {
        kind: "bancario",
        barcode,
        linhaDigitavel: formatBancarioLinha(candidate47),
        bankCode,
        bankName: BANK_NAMES[bankCode] || `Banco ${bankCode}`,
        amount: Number((cents / 100).toFixed(2)),
        dueDate: resolveFebrabanDueDate(factor),
      };
    }
  }

  // 2. Código de barras bancário (44 dígitos, não inicia com 8)
  if (cleaned.length === 44 && !cleaned.startsWith("8")) {
    const bankCode = cleaned.slice(0, 3);
    const factor = Number(cleaned.slice(5, 9));
    const cents = Number(cleaned.slice(9, 19));
    return {
      kind: "bancario",
      barcode: cleaned,
      linhaDigitavel: barcodeToBancarioLinha(cleaned),
      bankCode,
      bankName: BANK_NAMES[bankCode] || `Banco ${bankCode}`,
      amount: Number((cents / 100).toFixed(2)),
      dueDate: resolveFebrabanDueDate(factor),
    };
  }

  // 3. Arrecadação / Convênio (48 dígitos ou 44 dígitos iniciando com 8)
  const match48 = rawInput.match(/(?:\d[ \t.\-]*){48}/g) ?? [];
  const candidate48 = cleaned.length === 48 ? cleaned : match48.map((m) => m.replace(/\D/g, "")).find((d) => d.length === 48 && d.startsWith("8"));
  if (candidate48 && candidate48.length === 48 && candidate48.startsWith("8")) {
    const barcode =
      candidate48.slice(0, 11) +
      candidate48.slice(12, 23) +
      candidate48.slice(24, 35) +
      candidate48.slice(36, 47);
    const valueFlag = barcode[2];
    const hasEffectiveValue = valueFlag === "6" || valueFlag === "8";
    const cents = hasEffectiveValue ? Number(barcode.slice(4, 15)) : 0;
    const segment = ARRECADACAO_SEGMENTS[barcode[1]] || "Arrecadação";
    return {
      kind: "arrecadacao",
      barcode,
      linhaDigitavel: `${candidate48.slice(0, 11)}-${candidate48[11]} ${candidate48.slice(12, 23)}-${candidate48[23]} ${candidate48.slice(24, 35)}-${candidate48[35]} ${candidate48.slice(36, 47)}-${candidate48[47]}`,
      segment,
      amount: Number((cents / 100).toFixed(2)),
      dueDate: "",
    };
  }

  if (cleaned.length === 44 && cleaned.startsWith("8")) {
    const valueFlag = cleaned[2];
    const hasEffectiveValue = valueFlag === "6" || valueFlag === "8";
    const cents = hasEffectiveValue ? Number(cleaned.slice(4, 15)) : 0;
    const segment = ARRECADACAO_SEGMENTS[cleaned[1]] || "Arrecadação";
    return {
      kind: "arrecadacao",
      barcode: cleaned,
      linhaDigitavel: cleaned,
      segment,
      amount: Number((cents / 100).toFixed(2)),
      dueDate: "",
    };
  }

  return null;
}

export function parseAccessKey(rawInput: string): AccessKeyResult | null {
  const urlMatch = rawInput.match(/(?:chNFe=|p=)(\d{44})/i);
  const digitRuns = rawInput.match(/(?:\d[ \t.\-]*){44}/g) ?? [];
  const candidate =
    urlMatch?.[1] ||
    digitRuns.map((run) => run.replace(/\D/g, "")).find((d) => d.length === 44 && !d.startsWith("8"));
  if (!candidate || candidate.length !== 44) return null;

  const uf = Number(candidate.slice(0, 2));
  const yy = Number(candidate.slice(2, 4));
  const mm = Number(candidate.slice(4, 6));
  const model = candidate.slice(20, 22);
  if (uf < 11 || uf > 53 || mm < 1 || mm > 12 || (model !== "55" && model !== "65" && model !== "57")) {
    return null;
  }

  const cnpjRaw = candidate.slice(6, 20);
  const cnpj = `${cnpjRaw.slice(0, 2)}.${cnpjRaw.slice(2, 5)}.${cnpjRaw.slice(5, 8)}/${cnpjRaw.slice(8, 12)}-${cnpjRaw.slice(12, 14)}`;
  const series = String(Number(candidate.slice(22, 25)));
  const documentNumber = String(Number(candidate.slice(25, 34)));
  return {
    accessKey: candidate,
    ufCode: candidate.slice(0, 2),
    issueYearMonth: `20${String(yy).padStart(2, "0")}-${String(mm).padStart(2, "0")}`,
    cnpj,
    model,
    series,
    documentNumber,
  };
}

function parseBrazilianDate(raw: string): string {
  const match = raw.match(/(\d{2})\/(\d{2})\/(20\d{2})/);
  if (!match) return "";
  const [, day, month, year] = match;
  const numMonth = Number(month);
  const numDay = Number(day);
  if (numMonth < 1 || numMonth > 12 || numDay < 1 || numDay > 31) return "";
  return `${year}-${month}-${day}`;
}

function parseBrazilianMoney(raw: string): number {
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
}

function findDateAfterLabel(text: string, labelPattern: RegExp): string {
  const match = text.match(new RegExp(`${labelPattern.source}[^\\d\\n]{0,28}(\\d{2}\\/\\d{2}\\/20\\d{2})`, "i"));
  return match ? parseBrazilianDate(match[1]) : "";
}

function findAmountAfterLabel(text: string, labelPattern: RegExp): number {
  const match = text.match(new RegExp(`${labelPattern.source}[^\\d\\n]{0,30}(?:R\\$\\s*)?([\\d.]+,\\d{2})`, "i"));
  return match ? parseBrazilianMoney(match[1]) : 0;
}

function extractCompany(lines: string[], cnpj?: string): string {
  const labelPatterns = [
    /(?:Benefici[áa]rio|Cedente|Emitente|Raz[ãa]o Social|Nome Empresarial|Prestador)\s*[:\-]?\s*(.+)/i,
  ];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pattern of labelPatterns) {
      const match = line.match(pattern);
      if (match) {
        let candidate = match[1].replace(/CNPJ.*$/i, "").trim();
        if (candidate.length < 3 && lines[i + 1]) {
          candidate = lines[i + 1].replace(/CNPJ.*$/i, "").trim();
        }
        if (candidate.length >= 3 && !/^\d+$/.test(candidate)) return candidate.slice(0, 80);
      }
    }
  }
  if (cnpj) {
    const cnpjLine = lines.find((line) => line.includes(cnpj));
    if (cnpjLine) {
      const cleaned = cnpjLine.replace(cnpj, "").replace(/CNPJ[:\s-]*/i, "").trim();
      if (cleaned.length >= 3) return cleaned.slice(0, 80);
    }
  }
  const meaningful = lines.find((line) => line.length >= 4 && !/^(banco|boleto|danfe|nota fiscal|cnpj|cpf|r\$|\d)/i.test(line));
  return meaningful ? meaningful.slice(0, 80) : "";
}

export function extractDocumentFields(
  rawText: string,
  fileName = "",
  source: NoteSource = "Scanner",
): ScannedExtraction {
  const text = rawText.replace(/\r/g, "").trim();
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const detectedFields: string[] = [];

  const boleto = parseBoletoCode(text);
  const accessKey = !boleto ? parseAccessKey(text) : null;

  const isNotaFiscal =
    Boolean(accessKey) ||
    /\b(DANFE|NF-?e|NFS-?e|Nota Fiscal|Chave de Acesso)\b/i.test(text);
  const type: NoteType = boleto ? "Boleto" : isNotaFiscal ? "Nota fiscal" : "Boleto";

  const cnpjMatch = text.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
  const cnpj = cnpjMatch?.[0] || accessKey?.cnpj || "";
  if (cnpj) detectedFields.push("CNPJ");

  let company = extractCompany(lines, cnpj);
  if (!company && boleto?.bankName) company = boleto.bankName;
  if (!company && boleto?.segment) company = boleto.segment;
  if (company) detectedFields.push("Empresa");

  let amount = boleto?.amount || 0;
  if (!amount) {
    amount =
      findAmountAfterLabel(text, /(?:Valor do Documento|Valor Total da Nota|Valor Total|Valor a Pagar|Total Geral|Valor L[íi]quido)/i) ||
      (() => {
        const allMoney = Array.from(text.matchAll(/R\$\s*([\d.]+,\d{2})/gi)).map((m) => parseBrazilianMoney(m[1]));
        return allMoney.length ? Math.max(...allMoney) : 0;
      })();
  }
  if (amount > 0) detectedFields.push("Valor");

  let dueDate = boleto?.dueDate || "";
  if (!dueDate) {
    dueDate = findDateAfterLabel(text, /(?:Data de Vencimento|Vencimento)/i);
  }
  const issueDate =
    findDateAfterLabel(text, /(?:Data de Emiss[ãa]o|Emiss[ãa]o|Data do Documento)/i) ||
    (accessKey ? `${accessKey.issueYearMonth}-01` : "");
  if (!dueDate && isNotaFiscal && issueDate) {
    dueDate = issueDate;
  }
  if (dueDate) detectedFields.push("Vencimento");
  if (issueDate) detectedFields.push("Emissão");

  const taxes = findAmountAfterLabel(text, /(?:Valor Aproximado dos Tributos|Total dos Tributos|Valor do ISS|Valor do ICMS)/i);
  if (taxes > 0) detectedFields.push("Impostos");

  const nfNumberMatch = text.match(/(?:N[úu]mero da Nota|NF-?e?\s*N[º°o.]?|N[º°]\s*(?:do Documento)?)\s*[:\-]?\s*0*(\d{1,12})/i);
  const document =
    accessKey?.documentNumber ||
    nfNumberMatch?.[1] ||
    boleto?.linhaDigitavel ||
    fileName ||
    "";
  if (document && document !== fileName) detectedFields.push("Identificação");

  const notesParts: string[] = [];
  if (boleto) {
    detectedFields.push("Código de barras");
    notesParts.push(`Linha digitável: ${boleto.linhaDigitavel}`);
  }
  if (accessKey) {
    detectedFields.push("Chave NF-e/NFC-e");
    notesParts.push(`Chave de acesso: ${accessKey.accessKey}`);
  }

  return {
    draft: {
      type,
      company,
      document,
      amount,
      dueDate,
      issueDate,
      category: "Operacional",
      status: "Revisar",
      source,
      taxes,
      reviewRequired: true,
      notes: notesParts.join(" | ") || undefined,
    },
    detectedFields,
    boleto: boleto || undefined,
    accessKey: accessKey || undefined,
  };
}
