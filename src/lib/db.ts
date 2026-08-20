import { neon } from "@neondatabase/serverless";
import { createRecord, type NoteDraft, type NoteRecord } from "./notes";
import { readLocalRecords, writeLocalRecords } from "./local-storage";

const databaseUrl = process.env.NOTAS_DATABASE_URL;
const hasValidDatabaseUrl = typeof databaseUrl === "string" && /^postgres(ql)?:\/\//.test(databaseUrl);
const sql = hasValidDatabaseUrl ? neon(databaseUrl as string) : null;
let schemaReady: Promise<void> | null = null;
let localWriteQueue: Promise<void> = Promise.resolve();

async function ensureSchema() {
  if (!sql) return;
  if (!schemaReady) {
    schemaReady = sql`
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.then(() => undefined);
  }
  await schemaReady;
}

function rowToRecord(row: Record<string, unknown>): NoteRecord {
  return {
    id: String(row.id), type: row.type as NoteRecord["type"], company: String(row.company), document: String(row.document),
    amount: Number(row.amount), dueDate: String(row.due_date), issueDate: String(row.issue_date), category: String(row.category),
    status: row.status as NoteRecord["status"], source: row.source as NoteRecord["source"], taxes: Number(row.taxes),
    createdAt: new Date(String(row.created_at)).toISOString(), reviewRequired: Boolean(row.review_required),
  };
}

export async function listPersistedRecords(userId = "local-demo"): Promise<NoteRecord[]> {
  if (!sql) return readLocalRecords();
  await ensureSchema();
  const rows = await sql`SELECT * FROM notes WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return rows.map(rowToRecord);
}

export async function persistRecord(draft: NoteDraft, userId = "local-demo"): Promise<NoteRecord> {
  if (!sql) {
    const record = createRecord(draft);
    localWriteQueue = localWriteQueue.then(async () => {
      const records = await readLocalRecords();
      const withoutDuplicate = records.filter((item) => item.id !== record.id);
      await writeLocalRecords([record, ...withoutDuplicate]);
    });
    await localWriteQueue;
    return record;
  }
  await ensureSchema();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await sql`
    INSERT INTO notes (id, user_id, type, company, document, amount, due_date, issue_date, category, status, source, taxes, review_required, created_at)
    VALUES (${id}, ${userId}, ${draft.type}, ${draft.company}, ${draft.document}, ${draft.amount}, ${draft.dueDate}, ${draft.issueDate}, ${draft.category}, ${draft.status}, ${draft.source}, ${draft.taxes}, ${draft.reviewRequired ?? false}, ${createdAt})
  `;
  return { ...draft, id, createdAt };
}

export function hasDatabase() { return Boolean(sql); }
