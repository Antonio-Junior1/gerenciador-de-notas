import { NextResponse } from "next/server";
import { normalizeGoogleSheetsCsvUrl, parseSpreadsheetInput } from "@/lib/spreadsheet";
import { importDraftsIntoStore, readSpreadsheetConfig, writeSpreadsheetConfig } from "@/lib/spreadsheet-sync";

const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(xlsx|xls|xlsm|csv)$/i;

export async function POST(request: Request) {
  try {
    const userId = request.headers.get("x-demo-user") || "local-demo";
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Selecione um arquivo .xlsx, .xls ou .csv." }, { status: 400 });
      }
      if (!ALLOWED_EXTENSIONS.test(file.name)) {
        return NextResponse.json({ error: "Formato inválido. Envie uma planilha .xlsx, .xls ou .csv." }, { status: 400 });
      }
      if (file.size === 0 || file.size > MAX_SPREADSHEET_BYTES) {
        return NextResponse.json({ error: "Planilha vazia ou maior que 10 MB." }, { status: 400 });
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseSpreadsheetInput(bytes);
      if (!parsed.drafts.length) {
        return NextResponse.json({ error: "Nenhum lançamento válido encontrado na planilha enviada." }, { status: 400 });
      }
      const result = await importDraftsIntoStore(parsed.drafts, userId, true);
      const config = await readSpreadsheetConfig();
      return NextResponse.json({
        ...result,
        skippedRows: parsed.skipped,
        sheetName: parsed.sheetName,
        config,
      });
    }

    const body = (await request.json()) as { url?: string; saveConnection?: boolean };
    const rawUrl = String(body.url ?? "").trim();
    const csvUrl = normalizeGoogleSheetsCsvUrl(rawUrl);
    if (!csvUrl) {
      return NextResponse.json(
        { error: "Informe um link válido do Google Sheets (docs.google.com/spreadsheets)." },
        { status: 400 },
      );
    }

    const response = await fetch(csvUrl, {
      headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            response.status === 401 || response.status === 403
              ? "A planilha do Google está privada. Compartilhe como 'Qualquer pessoa com o link' ou publique na web em CSV."
              : `Não foi possível acessar a planilha do Google (HTTP ${response.status}).`,
        },
        { status: 400 },
      );
    }

    const bodyText = await response.text();
    const trimmed = bodyText.trimStart();
    if (/^<!doctype html|^<html/i.test(trimmed)) {
      return NextResponse.json(
        {
          error:
            "O Google retornou uma página HTML em vez de CSV. Verifique se a planilha está compartilhada para leitura pública ou publicada como CSV.",
        },
        { status: 400 },
      );
    }

    const parsed = parseSpreadsheetInput(bodyText);
    if (!parsed.drafts.length) {
      return NextResponse.json({ error: "Nenhuma linha válida encontrada na planilha do Google Sheets." }, { status: 400 });
    }

    const result = await importDraftsIntoStore(parsed.drafts, userId, true);
    if (body.saveConnection) {
      await writeSpreadsheetConfig({
        googleSheetUrl: rawUrl,
        lastGoogleSyncAt: new Date().toISOString(),
        lastError: null,
      });
    }
    const config = await readSpreadsheetConfig();

    return NextResponse.json({
      ...result,
      skippedRows: parsed.skipped,
      sheetName: parsed.sheetName,
      config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao importar planilha.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
