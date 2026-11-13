import { NextResponse } from "next/server";
import { listPersistedRecords } from "@/lib/db";
import {
  importFromLocalConnectedFile,
  readSpreadsheetConfig,
  syncLocalSpreadsheet,
  writeSpreadsheetConfig,
} from "@/lib/spreadsheet-sync";

type ConnectionRequestBody = {
  action?: "connect-local" | "sync-local" | "pull-local" | "disconnect-local" | "toggle-auto" | "disconnect-google";
  localFilePath?: string;
  autoSync?: boolean;
};

export async function GET() {
  const config = await readSpreadsheetConfig();
  return NextResponse.json({ config });
}

export async function POST(request: Request) {
  try {
    const userId = request.headers.get("x-demo-user") || "local-demo";
    const body = (await request.json()) as ConnectionRequestBody;

    if (body.action === "disconnect-local") {
      const config = await writeSpreadsheetConfig({
        localFilePath: "",
        lastLocalSyncAt: null,
        lastError: null,
      });
      return NextResponse.json({ config });
    }

    if (body.action === "disconnect-google") {
      const config = await writeSpreadsheetConfig({
        googleSheetUrl: "",
        lastGoogleSyncAt: null,
        lastError: null,
      });
      return NextResponse.json({ config });
    }

    if (body.action === "toggle-auto") {
      const config = await writeSpreadsheetConfig({
        autoSync: Boolean(body.autoSync),
        lastError: null,
      });
      return NextResponse.json({ config });
    }

    if (body.action === "pull-local") {
      const result = await importFromLocalConnectedFile(userId);
      const config = await readSpreadsheetConfig();
      return NextResponse.json({ ...result, config });
    }

    if (body.action === "connect-local" || body.action === "sync-local") {
      const current = await readSpreadsheetConfig();
      const targetPath = body.localFilePath ?? current.localFilePath;
      if (!targetPath?.trim()) {
        return NextResponse.json({ error: "Selecione ou informe o caminho do arquivo .xlsx." }, { status: 400 });
      }
      if (body.autoSync !== undefined) {
        await writeSpreadsheetConfig({ autoSync: Boolean(body.autoSync) });
      }
      const records = await listPersistedRecords(userId);
      const config = await syncLocalSpreadsheet(targetPath, records);
      return NextResponse.json({ config, total: records.length });
    }

    return NextResponse.json({ error: "Ação de conexão inválida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar conexão com planilha.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
