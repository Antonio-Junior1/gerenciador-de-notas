import { describe, expect, it } from "vitest";
import { parseNfXml } from "./notes";

const sampleNfe = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe>
      <ide><nNF>12345</nNF><dhEmi>2026-08-20T10:30:00-03:00</dhEmi></ide>
      <emit><CNPJ>12345678000199</CNPJ><xNome>Empresa Exemplo Ltda.</xNome></emit>
      <total><ICMSTot><vNF>1500.90</vNF><vTotTrib>120.10</vTotTrib></ICMSTot></total>
    </infNFe>
  </NFe>
</nfeProc>`;

describe("parseNfXml", () => {
  it("converte uma NF-e com namespace em rascunho revisável", () => {
    const result = parseNfXml(sampleNfe, "nota.xml");
    expect(result.company).toBe("Empresa Exemplo Ltda.");
    expect(result.document).toBe("12345");
    expect(result.amount).toBe(1500.9);
    expect(result.taxes).toBe(120.1);
    expect(result.issueDate).toBe("2026-08-20");
    expect(result.source).toBe("XML");
    expect(result.reviewRequired).toBe(true);
  });

  it("rejeita XML vazio", () => {
    expect(() => parseNfXml(" ")).toThrow("O XML está vazio.");
  });

  it("rejeita XML sem campos reconhecíveis", () => {
    expect(() => parseNfXml("<documento><campo>abc</campo></documento>", "invalido.xml")).toThrow(
      "Não foram encontrados campos reconhecíveis de NF-e/NFS-e.",
    );
  });

  it("converte NFS-e em rascunho revisável", () => {
    const nfse = `<?xml version="1.0" encoding="UTF-8"?>
    <CompNfse>
      <Nfse>
        <InfNfse>
          <Numero>456</Numero>
          <DataEmissao>2026-09-10</DataEmissao>
          <PrestadorServico><RazaoSocial>Consultoria Silva</RazaoSocial></PrestadorServico>
          <Servico><Valores><ValorServicos>800.00</ValorServicos><ValorIss>40.00</ValorIss></Valores></Servico>
        </InfNfse>
      </Nfse>
    </CompNfse>`;
    const result = parseNfXml(nfse, "nfse.xml");
    expect(result.company).toBe("Consultoria Silva");
    expect(result.document).toBe("456");
    expect(result.amount).toBe(800);
    expect(result.taxes).toBe(40);
    expect(result.issueDate).toBe("2026-09-10");
  });
});
