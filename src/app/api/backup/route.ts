import { NextResponse } from "next/server";
import { listPersistedRecords, restorePersistedRecords } from "@/lib/db";
import type { NoteRecord } from "@/lib/notes";
import { syncConnectedSpreadsheetIfEnabled } from "@/lib/spreadsheet-sync";

export async function GET(request: Request) {
  const userId = request.headers.get("x-demo-user") || "local-demo";
  const records = await listPersistedRecords(userId);
  return NextResponse.json(
    { exportedAt: new Date().toISOString(), version: 1, records },
    {
      headers: {
        "Content-Disposition": `attachment; filename="gerenciador-notas-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { records?: unknown };
    if (!Array.isArray(payload.records)) {
      return NextResponse.json({ error: "Arquivo de backup inválido." }, { status: 400 });
    }
    const validRecords = payload.records.filter(
      (item): item is NoteRecord =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as NoteRecord).id === "string" &&
        typeof (item as NoteRecord).company === "string" &&
        typeof (item as NoteRecord).dueDate === "string" &&
        Number.isFinite(Number((item as NoteRecord).amount)),
    );
    if (!validRecords.length && payload.records.length > 0) {
      return NextResponse.json({ error: "Nenhum registro válido encontrado no backup." }, { status: 400 });
    }
    const userId = request.headers.get("x-demo-user") || "local-demo";
    const imported = await restorePersistedRecords(validRecords, userId);
    const syncWarning = await syncConnectedSpreadsheetIfEnabled(userId);
    const records = await listPersistedRecords(userId);
    return NextResponse.json({ imported, total: records.length, records, syncWarning });
  } catch {
    return NextResponse.json({ error: "Não foi possível restaurar o backup." }, { status: 400 });
  }
}
