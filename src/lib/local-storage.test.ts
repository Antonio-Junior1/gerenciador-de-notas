import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readLocalRecords, saveLocalDocument, writeLocalRecords } from "./local-storage";
import type { NoteRecord } from "./notes";

let tempDir = "";

const sampleRecord: NoteRecord = {
  id: "local-test-1",
  type: "Boleto",
  company: "Empresa Teste",
  document: "boleto.pdf",
  amount: 120,
  dueDate: "2026-08-20",
  issueDate: "2026-08-01",
  category: "Operacional",
  status: "Revisar",
  source: "PDF",
  taxes: 0,
  reviewRequired: true,
  createdAt: "2026-08-20T12:00:00.000Z",
};

afterEach(async () => {
  delete process.env.NOTAS_DATA_DIR;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("local-storage", () => {
  it("persiste e lê registros em JSON", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "gerenciador-notas-"));
    process.env.NOTAS_DATA_DIR = tempDir;
    await writeLocalRecords([sampleRecord]);
    await expect(readLocalRecords()).resolves.toEqual([sampleRecord]);
  });

  it("salva documentos com nome seguro em subpasta própria", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "gerenciador-notas-"));
    process.env.NOTAS_DATA_DIR = tempDir;
    const stored = await saveLocalDocument("boleto cliente.pdf", new TextEncoder().encode("conteudo"));
    expect(stored.storedName).toContain("boleto_cliente.pdf");
    expect(stored.absolutePath).toContain(path.join(tempDir, "documents"));
  });
});
