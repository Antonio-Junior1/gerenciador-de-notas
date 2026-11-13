import { describe, expect, it } from "vitest";
import { extractDocumentFields, parseAccessKey, parseBoletoCode, resolveFebrabanDueDate } from "./scanner";

describe("scanner", () => {
  it("resolve fator de vencimento FEBRABAN antes e após o reset de 22/02/2025", () => {
    expect(resolveFebrabanDueDate(1000)).toBe("2025-02-22");
    expect(resolveFebrabanDueDate(1629)).toBe("2026-11-13");
    expect(resolveFebrabanDueDate(9999)).toBe("2025-02-21");
  });

  it("extrai banco, valor e vencimento de linha digitável bancária de 47 dígitos", () => {
    const linha = "34191.23454 67890.123457 67890.123457 1 16290000025000";
    const parsed = parseBoletoCode(linha);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("bancario");
    expect(parsed?.bankCode).toBe("341");
    expect(parsed?.bankName).toBe("Itaú");
    expect(parsed?.amount).toBe(250);
    expect(parsed?.dueDate).toBe("2026-11-13");
    expect(parsed?.barcode).toHaveLength(44);
  });

  it("extrai dados de boleto de arrecadação de 48 dígitos", () => {
    const linha = "83660000001-2 50000000123-4 56789012345-6 78901234567-8";
    const parsed = parseBoletoCode(linha);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("arrecadacao");
    expect(parsed?.segment).toBe("Energia elétrica e gás");
    expect(parsed?.amount).toBe(150);
  });

  it("interpreta chave de acesso de NF-e de 44 dígitos", () => {
    const chave = "35261112345678000199550010000123451000123450";
    const parsed = parseAccessKey(`https://www.nfce.fazenda.sp.gov.br/qrcode?p=${chave}`);
    expect(parsed).not.toBeNull();
    expect(parsed?.cnpj).toBe("12.345.678/0001-99");
    expect(parsed?.model).toBe("55");
    expect(parsed?.documentNumber).toBe("12345");
    expect(parsed?.issueYearMonth).toBe("2026-11");
  });

  it("extrai campos de texto OCR/PDF de boleto com linha digitável", () => {
    const text = `
      Beneficiário: Energia Paulista S.A. CNPJ: 12.345.678/0001-99
      Vencimento: 13/11/2026
      Valor do Documento: R$ 250,00
      34191.23454 67890.123457 67890.123457 1 16290000025000
    `;
    const result = extractDocumentFields(text, "conta.pdf", "PDF");
    expect(result.draft.type).toBe("Boleto");
    expect(result.draft.company).toBe("Energia Paulista S.A.");
    expect(result.draft.amount).toBe(250);
    expect(result.draft.dueDate).toBe("2026-11-13");
    expect(result.detectedFields).toContain("Código de barras");
  });
});
