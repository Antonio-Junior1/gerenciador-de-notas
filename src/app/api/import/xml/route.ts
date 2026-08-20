import { NextResponse } from "next/server";
import { parseNfXml } from "@/lib/notes";

export async function POST(request: Request) {
  try {
    const fileName = request.headers.get("x-file-name") || "documento.xml";
    const xml = await request.text();
    const draft = parseNfXml(xml, fileName);
    return NextResponse.json({ draft, message: `${fileName} foi lido pelo parser server-side. Revise os campos antes de salvar.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível interpretar o XML.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
