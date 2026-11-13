import { NextResponse } from "next/server";
import { deletePersistedRecord, updatePersistedRecord } from "@/lib/db";
import type { NoteDraft, NoteStatus, NoteType } from "@/lib/notes";
import { syncConnectedSpreadsheetIfEnabled } from "@/lib/spreadsheet-sync";

const VALID_STATUSES: NoteStatus[] = ["Pendente", "Pago", "Vencido", "Revisar"];
const VALID_TYPES: NoteType[] = ["Nota fiscal", "Boleto"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Partial<NoteDraft>;
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    if (body.type && !VALID_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
    }
    if (body.amount !== undefined && !Number.isFinite(Number(body.amount))) {
      return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
    }
    const patch: Partial<NoteDraft> = {};
    if (body.type !== undefined) patch.type = body.type;
    if (body.company !== undefined) patch.company = String(body.company).trim();
    if (body.document !== undefined) patch.document = String(body.document).trim();
    if (body.amount !== undefined) patch.amount = Number(body.amount);
    if (body.taxes !== undefined) patch.taxes = Number(body.taxes || 0);
    if (body.dueDate !== undefined) patch.dueDate = String(body.dueDate);
    if (body.issueDate !== undefined) patch.issueDate = String(body.issueDate);
    if (body.category !== undefined) patch.category = String(body.category);
    if (body.status !== undefined) patch.status = body.status;
    if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : undefined;
    if (body.storedFileName !== undefined) patch.storedFileName = body.storedFileName;
    if (body.originalFileName !== undefined) patch.originalFileName = body.originalFileName;

    const userId = request.headers.get("x-demo-user") || "local-demo";
    const record = await updatePersistedRecord(id, patch, userId);
    if (!record) {
      return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    }
    const syncWarning = await syncConnectedSpreadsheetIfEnabled(userId);
    return NextResponse.json({ record, syncWarning });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar o documento." }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const userId = request.headers.get("x-demo-user") || "local-demo";
  const removed = await deletePersistedRecord(id, userId);
  if (!removed) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
  const syncWarning = await syncConnectedSpreadsheetIfEnabled(userId);
  return NextResponse.json({ removed: true, syncWarning });
}
