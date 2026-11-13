import { afterEach, describe, expect, it } from "vitest";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  deletePersistedRecord,
  listPersistedRecords,
  persistRecord,
  updatePersistedRecordStatus,
} from "./db";
import { saveLocalDocument } from "./local-storage";

let tempDir = "";

afterEach(async () => {
  delete process.env.NOTAS_DATA_DIR;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("db local persistence", () => {
  it("cria, lista, atualiza status e remove registros locais", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "gerenciador-notas-db-"));
    process.env.NOTAS_DATA_DIR = tempDir;

    const created = await persistRecord({
      type: "Boleto",
      company: "Fornecedor Local",
      document: "BOL-100",
      amount: 350.5,
      dueDate: "2026-11-20",
      issueDate: "2026-11-10",
      category: "Fornecedores",
      status: "Pendente",
      source: "Manual",
      taxes: 0,
      reviewRequired: false,
    });

    const listed = await listPersistedRecords();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);

    const updated = await updatePersistedRecordStatus(created.id, "Pago");
    expect(updated?.status).toBe("Pago");

    const afterUpdate = await listPersistedRecords();
    expect(afterUpdate[0].status).toBe("Pago");

    const removed = await deletePersistedRecord(created.id);
    expect(removed).toBe(true);
    await expect(listPersistedRecords()).resolves.toEqual([]);
  });

  it("remove anexo órfão ao excluir o único registro vinculado", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "gerenciador-notas-db-"));
    process.env.NOTAS_DATA_DIR = tempDir;

    const stored = await saveLocalDocument("boleto.pdf", new TextEncoder().encode("%PDF-1.4"));
    const created = await persistRecord({
      type: "Boleto",
      company: "Empresa Anexo",
      document: "BOL-200",
      amount: 100,
      dueDate: "2026-11-20",
      issueDate: "2026-11-10",
      category: "Operacional",
      status: "Pendente",
      source: "PDF",
      taxes: 0,
      storedFileName: stored.storedName,
      originalFileName: "boleto.pdf",
    });

    await expect(access(stored.absolutePath)).resolves.toBeUndefined();
    await deletePersistedRecord(created.id);
    await expect(access(stored.absolutePath)).rejects.toThrow();
  });
});
