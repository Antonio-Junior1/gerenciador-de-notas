import { NextResponse } from "next/server";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo foi enviado." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "O arquivo excede o limite de 10 MB." }, { status: 413 });
  const source = file.type === "application/pdf" ? "PDF" : file.type.startsWith("image/") ? "Imagem" : "Outro";
  if (source === "Outro") return NextResponse.json({ error: "Use PDF ou imagem para importar um boleto." }, { status: 415 });
  return NextResponse.json({
    draft: { type: "Boleto", company: "", document: file.name, amount: 0, dueDate: "", issueDate: "", category: "Operacional", status: "Revisar", source, taxes: 0, reviewRequired: true },
    message: `${file.name} recebido. O documento está aguardando conferência manual; nenhum OCR foi simulado.`,
  });
}
