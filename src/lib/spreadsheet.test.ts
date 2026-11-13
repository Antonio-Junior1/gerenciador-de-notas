import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import type { NoteRecord } from "./notes";
import {
  buildCsvContent,
  buildExportWorkbook,
  buildTemplateWorkbook,
  normalizeGoogleSheetsCsvUrl,
  parseSpreadsheetInput,
  roundCurrency,
  workbookToUint8Array,
} from "./spreadsheet";

const sampleRecords: NoteRecord[] = [
  {
    id: "1",
    type: "Nota fiscal",
    company: "Alfa Servicos Ltda",
    document: "NF 1024",
    amount: 100.1,
    taxes: 10.05,
    issueDate: "2026-11-10",
    dueDate: "2026-11-20",
    category: "Serviços",
    status: "Pendente",
    source: "XML",
    createdAt: "2026-11-10T10:00:00.000Z",
    notes: "Chave 123",
  },
  {
    id: "2",
    type: "Boleto",
    company: "=Distribuidora Sul",
    document: "BOL 99",
    amount: 1250.5,
    taxes: 0,
    issueDate: "2026-11-01",
    dueDate: "2026-11-05",
    category: "Fornecedores",
    status: "Pendente",
    source: "Scanner",
    createdAt: "2026-11-01T09:00:00.000Z",
  },
];

describe("spreadsheet helpers", () => {
  it("rounds floating-point currency cleanly and formats XLSX workbook sheets", () => {
    expect(roundCurrency(100.1 - 10.05)).toBe(90.05);

    const workbook = buildExportWorkbook(sampleRecords, "2026-11-13");
    expect(workbook.SheetNames).toEqual(["Documentos", "Resumo"]);

    const docSheet = workbook.Sheets["Documentos"];
    expect(docSheet["!cols"]?.length).toBe(12);
    expect(docSheet["D2"]?.z).toBe("R$ #,##0.00");
    expect(docSheet["F2"]?.v).toBe(90.05);

    const summaryRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Resumo"]);
    expect(summaryRows[0]).toMatchObject({
      Indicador: "Quantidade de documentos",
      Quantidade: 2,
      Total: 1350.6,
    });
    expect(summaryRows.some((row) => row.Indicador === "Status: Vencido" && row.Quantidade === 1)).toBe(true);
  });

  it("round-trips exported XLSX through parseSpreadsheetInput", () => {
    const bytes = workbookToUint8Array(buildExportWorkbook(sampleRecords, "2026-11-13"));
    const parsed = parseSpreadsheetInput(bytes, "2026-11-13");
    expect(parsed.sheetName).toBe("Documentos");
    expect(parsed.drafts).toHaveLength(2);
    expect(parsed.drafts[0]).toMatchObject({
      company: "Alfa Servicos Ltda",
      document: "NF 1024",
      amount: 100.1,
      taxes: 10.05,
      source: "XML",
      status: "Pendente",
    });
    expect(parsed.drafts[1].status).toBe("Vencido");
  });

  it("generates pt-BR CSV with comma decimals, BOM, and formula escaping", () => {
    const csv = buildCsvContent(sampleRecords, "2026-11-13");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(";100,10;10,05;90,05;");
    expect(csv).toContain(";'=Distribuidora Sul;");
  });

  it("parses custom pt-BR CSV spreadsheets with flexible headers and formats", () => {
    const rawCsv = [
      "Fornecedor;Número;Valor Total;Vencimento;Categoria;Status",
      "Energia Paulista;FAT-77;R$ 1.250,50;15/11/2026;Operacional;Pago",
    ].join("\r\n");
    const bytes = new TextEncoder().encode(`\uFEFF${rawCsv}`);
    const parsed = parseSpreadsheetInput(bytes, "2026-11-13");
    expect(parsed.drafts).toEqual([
      {
        type: "Nota fiscal",
        company: "Energia Paulista",
        document: "FAT-77",
        amount: 1250.5,
        taxes: 0,
        issueDate: "2026-11-15",
        dueDate: "2026-11-15",
        category: "Operacional",
        status: "Pago",
        source: "Planilha",
        reviewRequired: false,
        notes: undefined,
      },
    ]);
  });

  it("builds a non-empty template workbook and validates Google Sheets URLs", () => {
    const templateBytes = workbookToUint8Array(buildTemplateWorkbook("2026-11-13"));
    const parsed = parseSpreadsheetInput(templateBytes, "2026-11-13");
    expect(parsed.drafts).toHaveLength(1);
    expect(parsed.drafts[0].source).toBe("Planilha");

    expect(
      normalizeGoogleSheetsCsvUrl("https://docs.google.com/spreadsheets/d/abc123_XYZ/edit#gid=456"),
    ).toBe("https://docs.google.com/spreadsheets/d/abc123_XYZ/export?format=csv&gid=456");

    expect(
      normalizeGoogleSheetsCsvUrl("https://docs.google.com/spreadsheets/d/e/2PACX-test/pub?gid=0&output=html"),
    ).toBe("https://docs.google.com/spreadsheets/d/e/2PACX-test/pub?gid=0&single=true&output=csv");

    expect(normalizeGoogleSheetsCsvUrl("http://docs.google.com/spreadsheets/d/abc")).toBeNull();
    expect(normalizeGoogleSheetsCsvUrl("https://example.com/sheet.csv")).toBeNull();
  });
});
