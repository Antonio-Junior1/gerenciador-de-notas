import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { NoteRecord } from "./notes";

const fallbackDataDir = path.join(process.cwd(), ".local-data");

export function getLocalDataDir() {
  return process.env.NOTAS_DATA_DIR || fallbackDataDir;
}

export function getDocumentsDir() {
  return path.join(getLocalDataDir(), "documents");
}

function getRecordsPath() {
  return path.join(getLocalDataDir(), "records.json");
}

async function ensureLocalDirectories() {
  await mkdir(getDocumentsDir(), { recursive: true });
}

export async function readLocalRecords(): Promise<NoteRecord[]> {
  await ensureLocalDirectories();
  try {
    const content = await readFile(getRecordsPath(), "utf8");
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as NoteRecord[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function writeLocalRecords(records: NoteRecord[]) {
  await ensureLocalDirectories();
  await writeFile(getRecordsPath(), JSON.stringify(records, null, 2), "utf8");
}

export async function saveLocalDocument(fileName: string, bytes: Uint8Array) {
  await ensureLocalDirectories();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "documento";
  const storedName = `${Date.now()}-${randomUUID()}-${safeName}`;
  const absolutePath = path.join(getDocumentsDir(), storedName);
  await writeFile(absolutePath, bytes);
  return { storedName, absolutePath };
}

export async function readLocalDocument(storedName: string): Promise<{ bytes: Buffer; safeName: string } | null> {
  const safeName = path.basename(storedName);
  if (!safeName || safeName !== storedName || safeName.includes("..")) return null;
  const docsDir = path.resolve(getDocumentsDir());
  const targetPath = path.resolve(docsDir, safeName);
  if (!targetPath.startsWith(`${docsDir}${path.sep}`)) return null;
  try {
    const bytes = await readFile(targetPath);
    return { bytes, safeName };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteLocalDocument(storedName: string): Promise<void> {
  const safeName = path.basename(storedName);
  if (!safeName || safeName !== storedName || safeName.includes("..")) return;
  const docsDir = path.resolve(getDocumentsDir());
  const targetPath = path.resolve(docsDir, safeName);
  if (!targetPath.startsWith(`${docsDir}${path.sep}`)) return;
  await rm(targetPath, { force: true }).catch(() => undefined);
}
