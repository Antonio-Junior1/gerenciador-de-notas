import { neon } from "@neondatabase/serverless";
import type { NoteDraft, NoteRecord, NoteStatus } from "./notes";
import { deleteLocalDocument, getLocalDataDir, readLocalRecords, writeLocalRecords } from "./local-storage";

const databaseUrl = process.env.NOTAS_DATABASE_URL;
const hasValidDatabaseUrl = typeof databaseUrl === "string" && /^postgres(ql)?:\/\//.test(databaseUrl);
const sql = hasValidDatabaseUrl ? neon(databaseUrl as string) : null;
let schemaReady: Promise<void> | null = null;
let localWriteQueue: Promise<void> = Promise.resolve();

function formatDbDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value ?? "");
  return str.length >= 10 ? str.slice(0, 10) : str;
}

async function ensureSchema() {
  if (!sql) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT 'local-demo',
          type TEXT NOT NULL,
          company TEXT NOT NULL,
          document TEXT NOT NULL,
          amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
          due_date DATE NOT NULL,
          issue_date DATE NOT NULL,
          category TEXT NOT NULL,
          status TEXT NOT NULL,
          source TEXT NOT NULL,
          taxes NUMERIC(14, 2) NOT NULL DEFAULT 0,
          review_required BOOLEAN NOT NULL DEFAULT false,
          stored_file_name TEXT,
          original_file_name TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS stored_file_name TEXT`;
      await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS original_file_name TEXT`;
      await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS notes TEXT`;
    })();
  }
  await schemaReady;
}

function rowToRecord(row: Record<string, unknown>): NoteRecord {
  return {
    id: String(row.id), type: row.type as NoteRecord["type"], company: String(row.company), document: String(row.document),
    amount: Number(row.amount), dueDate: formatDbDate(row.due_date), issueDate: formatDbDate(row.issue_date), category: String(row.category),
    status: row.status as NoteRecord["status"], source: row.source as NoteRecord["source"], taxes: Number(row.taxes),
    createdAt: new Date(String(row.created_at)).toISOString(), reviewRequired: Boolean(row.review_required),
    storedFileName: row.stored_file_name ? String(row.stored_file_name) : undefined,
    originalFileName: row.original_file_name ? String(row.original_file_name) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
  };
}

export async function listPersistedRecords(userId = "local-demo"): Promise<NoteRecord[]> {
  if (!sql) return readLocalRecords();
  await ensureSchema();
  const rows = await sql`SELECT * FROM notes WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return rows.map(rowToRecord);
}

export async function persistRecord(draft: NoteDraft, userId = "local-demo"): Promise<NoteRecord> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  if (!sql) {
    const record: NoteRecord = { ...draft, id, createdAt };
    const run = localWriteQueue.then(async () => {
      const records = await readLocalRecords();
      const withoutDuplicate = records.filter((item) => item.id !== record.id);
      await writeLocalRecords([record, ...withoutDuplicate]);
    });
    localWriteQueue = run.catch(() => undefined);
    await run;
    return record;
  }
  await ensureSchema();
  await sql`
    INSERT INTO notes (id, user_id, type, company, document, amount, due_date, issue_date, category, status, source, taxes, review_required, stored_file_name, original_file_name, notes, created_at)
    VALUES (${id}, ${userId}, ${draft.type}, ${draft.company}, ${draft.document}, ${draft.amount}, ${draft.dueDate}, ${draft.issueDate}, ${draft.category}, ${draft.status}, ${draft.source}, ${draft.taxes}, ${draft.reviewRequired ?? false}, ${draft.storedFileName ?? null}, ${draft.originalFileName ?? null}, ${draft.notes ?? null}, ${createdAt})
  `;
  return { ...draft, id, createdAt };
}

export async function updatePersistedRecord(
  id: string,
  patch: Partial<NoteDraft>,
  userId = "local-demo",
): Promise<NoteRecord | null> {
  if (!sql) {
    let updated: NoteRecord | null = null;
    const run = localWriteQueue.then(async () => {
      const records = await readLocalRecords();
      const next = records.map((item) => {
        if (item.id !== id) return item;
        const nextStatus = patch.status ?? item.status;
        updated = {
          ...item,
          ...patch,
          status: nextStatus,
          reviewRequired: patch.reviewRequired ?? nextStatus === "Revisar",
        };
        return updated;
      });
      if (updated) await writeLocalRecords(next);
    });
    localWriteQueue = run.catch(() => undefined);
    await run;
    return updated;
  }
  await ensureSchema();
  const existingRows = await sql`SELECT * FROM notes WHERE id = ${id} AND user_id = ${userId}`;
  if (!existingRows.length) return null;
  const current = rowToRecord(existingRows[0]);
  const merged: NoteRecord = {
    ...current,
    ...patch,
    status: patch.status ?? current.status,
    reviewRequired: patch.reviewRequired ?? (patch.status ?? current.status) === "Revisar",
  };
  const rows = await sql`
    UPDATE notes
    SET type = ${merged.type},
        company = ${merged.company},
        document = ${merged.document},
        amount = ${merged.amount},
        due_date = ${merged.dueDate},
        issue_date = ${merged.issueDate},
        category = ${merged.category},
        status = ${merged.status},
        taxes = ${merged.taxes},
        review_required = ${merged.reviewRequired ?? false},
        stored_file_name = ${merged.storedFileName ?? null},
        original_file_name = ${merged.originalFileName ?? null},
        notes = ${merged.notes ?? null}
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `;
  return rows.length ? rowToRecord(rows[0]) : null;
}

export async function updatePersistedRecordStatus(
  id: string,
  status: NoteStatus,
  userId = "local-demo",
): Promise<NoteRecord | null> {
  return updatePersistedRecord(id, { status, reviewRequired: status === "Revisar" }, userId);
}

export async function restorePersistedRecords(incoming: NoteRecord[], userId = "local-demo"): Promise<number> {
  if (!sql) {
    let importedCount = 0;
    const run = localWriteQueue.then(async () => {
      const current = await readLocalRecords();
      const map = new Map(current.map((item) => [item.id, item]));
      for (const item of incoming) {
        if (!map.has(item.id)) importedCount += 1;
        map.set(item.id, item);
      }
      const merged = Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      await writeLocalRecords(merged);
    });
    localWriteQueue = run.catch(() => undefined);
    await run;
    return importedCount;
  }
  await ensureSchema();
  let importedCount = 0;
  for (const item of incoming) {
    const existing = await sql`SELECT id FROM notes WHERE id = ${item.id} AND user_id = ${userId}`;
    if (!existing.length) {
      importedCount += 1;
      await sql`
        INSERT INTO notes (id, user_id, type, company, document, amount, due_date, issue_date, category, status, source, taxes, review_required, stored_file_name, original_file_name, notes, created_at)
        VALUES (${item.id}, ${userId}, ${item.type}, ${item.company}, ${item.document}, ${item.amount}, ${item.dueDate}, ${item.issueDate}, ${item.category}, ${item.status}, ${item.source}, ${item.taxes}, ${item.reviewRequired ?? false}, ${item.storedFileName ?? null}, ${item.originalFileName ?? null}, ${item.notes ?? null}, ${item.createdAt})
      `;
    }
  }
  return importedCount;
}

export async function deletePersistedRecord(id: string, userId = "local-demo"): Promise<boolean> {
  if (!sql) {
    let removed = false;
    let orphanFile: string | undefined;
    const run = localWriteQueue.then(async () => {
      const records = await readLocalRecords();
      const target = records.find((item) => item.id === id);
      const next = records.filter((item) => item.id !== id);
      removed = next.length !== records.length;
      if (removed) {
        await writeLocalRecords(next);
        if (target?.storedFileName && !next.some((item) => item.storedFileName === target.storedFileName)) {
          orphanFile = target.storedFileName;
        }
      }
    });
    localWriteQueue = run.catch(() => undefined);
    await run;
    if (orphanFile) await deleteLocalDocument(orphanFile);
    return removed;
  }
  await ensureSchema();
  const rows = await sql`DELETE FROM notes WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}

export function hasDatabase() { return Boolean(sql); }
export function getStorageInfo() {
  return { storage: hasDatabase() ? "postgres" : "local", dataDir: hasDatabase() ? null : getLocalDataDir() };
}
