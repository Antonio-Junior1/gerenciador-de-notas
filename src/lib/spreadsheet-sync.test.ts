import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { persistRecord } from "./db";
import {
  importFromLocalConnectedFile,
  readSpreadsheetConfig,
  syncConnectedSpreadsheetIfEnabled,
  syncLocalSpreadsheet,
  writeSpreadsheetConfig,
} from "./spreadsheet-sync";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.NOTAS_DATA_DIR;
  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe("spreadsheet connection and sync", () => {
  it("connects, syncs, and imports back from a local xlsx file without duplicates", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "notas-sheet-sync-"));
    tempDirs.push(dir);
    process.env.NOTAS_DATA_DIR = dir;

    const record = await persistRecord({
      type: "Boleto",
      company: "Fornecedor Alpha",
      document: "BOL-301",
      amount: 420.75,
      taxes: 0,
      issueDate: "2026-11-10",
      dueDate: "2026-11-25",
      category: "Fornecedores",
      status: "Pendente",
      source: "Manual",
    });

    const targetXlsx = path.join(dir, "planilha-conectada.xlsx");
    const syncedConfig = await syncLocalSpreadsheet(targetXlsx, [record]);
    expect(syncedConfig.localFilePath).toBe(targetXlsx);
    expect(syncedConfig.lastLocalSyncAt).toBeTruthy();

    const fileStat = await stat(targetXlsx);
    expect(fileStat.size).toBeGreaterThan(1000);

    await writeSpreadsheetConfig({ autoSync: true });
    const warning = await syncConnectedSpreadsheetIfEnabled();
    expect(warning).toBeNull();

    const saved = await readSpreadsheetConfig();
    expect(saved.localFilePath).toBe(targetXlsx);

    const pullResult = await importFromLocalConnectedFile();
    expect(pullResult.imported).toBe(0);
    expect(pullResult.skippedDuplicates).toBe(1);
    expect(pullResult.records).toHaveLength(1);
  });
});
