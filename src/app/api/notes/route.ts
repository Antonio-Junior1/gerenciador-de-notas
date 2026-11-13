import { NextResponse } from "next/server";
import { getStorageInfo, listPersistedRecords, persistRecord } from "@/lib/db";
import type { NoteDraft } from "@/lib/notes";
import { syncConnectedSpreadsheetIfEnabled } from "@/lib/spreadsheet-sync";

export async function GET(request: Request) {
  const userId = request.headers.get("x-demo-user") || "local-demo";
  const info = getStorageInfo();
  return NextResponse.json({ records: await listPersistedRecords(userId), ...info });
}

export async function POST(request: Request) {
  try {
    const draft = await request.json() as NoteDraft;
    if (!draft.company || !Number.isFinite(Number(draft.amount)) || !draft.dueDate) {
      return NextResponse.json({ error: "Empresa, valor e vencimento são obrigatórios." }, { status: 400 });
    }
    const userId = request.headers.get("x-demo-user") || "local-demo";
    const record = await persistRecord({ ...draft, amount: Number(draft.amount), taxes: Number(draft.taxes || 0) }, userId);
    const syncWarning = await syncConnectedSpreadsheetIfEnabled(userId);
    return NextResponse.json({ record, syncWarning }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Não foi possível criar o documento." }, { status: 400 });
  }
}
