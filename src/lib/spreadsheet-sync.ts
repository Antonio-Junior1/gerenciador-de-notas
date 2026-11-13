import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { listPersistedRecords, persistRecord } from "./db";
import { getLocalDataDir } from "./local-storage";
import type { NoteDraft, NoteRecord } from "./notes";
import {
  buildExportWorkbook,
  buildRecordDuplicateKey,
  normalizeGoogleSheetsCsvUrl,
  parseSpreadsheetInput,
  workbookToUint8Array,
} from "./spreadsheet";

export type SpreadsheetConnectionConfig = {
  localFilePath: string;
  autoSync: boolean;
  googleSheetUrl: string;
  lastLocalSyncAt: string | null;
  lastGoogleSyncAt: string | null;
  lastError: string | null;
};

const defaultConfig: SpreadsheetConnectionConfig = {
  localFilePath: "",
  autoSync: true,
  googleSheetUrl: "",
  lastLocalSyncAt: null,
  lastGoogleSyncAt: null,
  lastError: null,
};

function getConfigPath(): string {
  return path.join(getLocalDataDir(), "spreadsheet-connection.json");
}

export function validateLocalSpreadsheetPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return "";
  const resolved = path.resolve(trimmed);
  if (!/\.(xlsx|xls|xlsm)$/i.test(resolved)) {
    throw new Error("Informe um caminho de arquivo Excel válido (.xlsx).");
  }
  return resolved;
}

export async function readSpreadsheetConfig(): Promise<SpreadsheetConnectionConfig> {
  try {
    const raw = await readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SpreadsheetConnectionConfig>;
    return {
      localFilePath: typeof parsed.localFilePath === "string" ? parsed.localFilePath : "",
      autoSync: parsed.autoSync !== false,
      googleSheetUrl: typeof parsed.googleSheetUrl === "string" ? parsed.googleSheetUrl : "",
      lastLocalSyncAt: typeof parsed.lastLocalSyncAt === "string" ? parsed.lastLocalSyncAt : null,
      lastGoogleSyncAt: typeof parsed.lastGoogleSyncAt === "string" ? parsed.lastGoogleSyncAt : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...defaultConfig };
    }
    throw error;
  }
}

export async function writeSpreadsheetConfig(
  patch: Partial<SpreadsheetConnectionConfig>,
): Promise<SpreadsheetConnectionConfig> {
  const current = await readSpreadsheetConfig();
  const next: SpreadsheetConnectionConfig = {
    ...current,
    ...patch,
  };
  if (patch.localFilePath !== undefined) {
    next.localFilePath = validateLocalSpreadsheetPath(patch.localFilePath);
  }
  if (patch.googleSheetUrl !== undefined) {
    const rawGoogle = patch.googleSheetUrl.trim();
    if (!rawGoogle) {
      next.googleSheetUrl = "";
    } else {
      const normalized = normalizeGoogleSheetsCsvUrl(rawGoogle);
      if (!normalized) {
        throw new Error("Informe uma URL válida do Google Sheets (docs.google.com/spreadsheets).");
      }
      next.googleSheetUrl = rawGoogle;
    }
  }
  await mkdir(getLocalDataDir(), { recursive: true });
  await writeFile(getConfigPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function syncLocalSpreadsheet(
  targetPath: string,
  records: NoteRecord[],
): Promise<SpreadsheetConnectionConfig> {
  const resolvedPath = validateLocalSpreadsheetPath(targetPath);
  if (!resolvedPath) {
    throw new Error("Nenhuma planilha local conectada.");
  }

  try {
    await mkdir(path.dirname(resolvedPath), { recursive: true });
    const workbook = buildExportWorkbook(records);
    const bytes = workbookToUint8Array(workbook);
    await writeFile(resolvedPath, bytes);
    return writeSpreadsheetConfig({
      localFilePath: resolvedPath,
      lastLocalSyncAt: new Date().toISOString(),
      lastError: null,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message =
      code === "EBUSY" || code === "EPERM"
        ? "Não foi possível atualizar a planilha porque o arquivo está aberto ou bloqueado no momento."
        : "Não foi possível gravar a planilha conectada no caminho informado.";
    await writeSpreadsheetConfig({ lastError: message }).catch(() => undefined);
    throw new Error(message);
  }
}

export async function syncConnectedSpreadsheetIfEnabled(userId = "local-demo"): Promise<string | null> {
  try {
    const config = await readSpreadsheetConfig();
    if (!config.localFilePath || !config.autoSync) return null;
    const records = await listPersistedRecords(userId);
    await syncLocalSpreadsheet(config.localFilePath, records);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Falha ao sincronizar planilha conectada.";
  }
}

export async function importDraftsIntoStore(
  drafts: NoteDraft[],
  userId = "local-demo",
  skipDuplicates = true,
) {
  const existing = await listPersistedRecords(userId);
  const existingKeys = new Set(existing.map((record) => buildRecordDuplicateKey(record)));

  let imported = 0;
  let skippedDuplicates = 0;

  for (const draft of drafts) {
    const key = buildRecordDuplicateKey(draft);
    if (skipDuplicates && existingKeys.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    await persistRecord(draft, userId);
    existingKeys.add(key);
    imported += 1;
  }

  const records = await listPersistedRecords(userId);
  await syncConnectedSpreadsheetIfEnabled(userId);
  return { imported, skippedDuplicates, records };
}

export async function importFromLocalConnectedFile(userId = "local-demo") {
  const config = await readSpreadsheetConfig();
  if (!config.localFilePath) {
    throw new Error("Nenhuma planilha local conectada.");
  }
  const bytes = await readFile(config.localFilePath);
  const parsed = parseSpreadsheetInput(bytes);
  const result = await importDraftsIntoStore(parsed.drafts, userId, true);
  return { ...result, skippedRows: parsed.skipped, sheetName: parsed.sheetName };
}
