import { NextResponse } from "next/server";
import { saveLocalDocument } from "@/lib/local-storage";
import { parseNfXml } from "@/lib/notes";

export async function POST(request: Request) {
  try {
    const fileName = request.headers.get("x-file-name") || "documento.xml";
    const xml = await request.text();
    const draft = parseNfXml(xml, fileName);
    const stored = await saveLocalDocument(fileName, new TextEncoder().encode(xml));
    return NextResponse.json({
      draft,
      file: { name: fileName, storedName: stored.storedName },
      message: `${fileName} foi salvo localmente e lido pelo parser server-side. Revise os campos antes de salvar.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível interpretar o XML.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
