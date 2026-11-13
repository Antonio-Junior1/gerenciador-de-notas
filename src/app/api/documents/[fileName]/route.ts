import { NextResponse } from "next/server";
import { readLocalDocument } from "@/lib/local-storage";

function getMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "application/octet-stream";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileName: string }> },
) {
  const { fileName } = await context.params;
  const decoded = decodeURIComponent(fileName);
  const doc = await readLocalDocument(decoded);
  if (!doc) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(doc.bytes), {
    headers: {
      "Content-Type": getMimeType(doc.safeName),
      "Content-Disposition": `inline; filename="${doc.safeName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
