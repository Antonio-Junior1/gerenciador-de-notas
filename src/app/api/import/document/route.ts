import { NextResponse } from "next/server";
import { extractImages, extractText } from "unpdf";
import { saveLocalDocument } from "@/lib/local-storage";
import { extractDocumentFields } from "@/lib/scanner";

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo foi enviado." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "O arquivo excede o limite de 10 MB." }, { status: 413 });

  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isImage = file.type.startsWith("image/") || IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const source = isPdf ? "PDF" : isImage ? "Imagem" : "Outro";
  if (source === "Outro") return NextResponse.json({ error: "Use PDF ou imagem para importar um boleto." }, { status: 415 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await saveLocalDocument(file.name, bytes);
  const fileUrl = `/api/documents/${encodeURIComponent(stored.storedName)}`;

  if (source === "PDF") {
    try {
      const { text } = await extractText(bytes, { mergePages: true });
      const cleanText = (text || "").trim();
      if (cleanText.length >= 15) {
        const extracted = extractDocumentFields(cleanText, file.name, "PDF");
        return NextResponse.json({
          draft: {
            ...extracted.draft,
            storedFileName: stored.storedName,
            originalFileName: file.name,
          },
          detectedFields: extracted.detectedFields,
          needsOcr: false,
          file: { name: file.name, storedName: stored.storedName, url: fileUrl },
          message: extracted.detectedFields.length
            ? `${file.name} lido automaticamente (${extracted.detectedFields.join(", ")}). Confira antes de salvar.`
            : `${file.name} salvo localmente. Nenhum campo fiscal padrão foi identificado no texto do PDF.`,
        });
      }
    } catch {
      // PDF escaneado sem texto embutido ou protegido: segue para revisão manual
    }

    let ocrImageDataUrl: string | undefined;
    try {
      const images = await extractImages(bytes, 1, { format: "png" });
      if (images.length) {
        const largest = images.reduce((best, current) =>
          current.width * current.height > best.width * best.height ? current : best,
        );
        if (largest.data.byteLength > 0 && largest.data.byteLength <= MAX_BYTES) {
          ocrImageDataUrl = `data:image/png;base64,${Buffer.from(largest.data).toString("base64")}`;
        }
      }
    } catch {
      // Segue para conferência manual caso não seja possível extrair imagem da página
    }

    return NextResponse.json({
      draft: {
        type: "Boleto",
        company: "",
        document: file.name,
        amount: 0,
        dueDate: "",
        issueDate: "",
        category: "Operacional",
        status: "Revisar",
        source: "PDF",
        taxes: 0,
        reviewRequired: true,
        storedFileName: stored.storedName,
        originalFileName: file.name,
      },
      detectedFields: [],
      needsOcr: true,
      ocrImageDataUrl,
      file: { name: file.name, storedName: stored.storedName, url: fileUrl },
      message: ocrImageDataUrl
        ? `${file.name} salvo localmente. PDF escaneado detectado; executando leitura OCR...`
        : `${file.name} salvo localmente. PDF sem texto selecionável (digitalizado); preencha ou confira os dados manualmente.`,
    });
  }

  return NextResponse.json({
    draft: {
      type: "Boleto",
      company: "",
      document: file.name,
      amount: 0,
      dueDate: "",
      issueDate: "",
      category: "Operacional",
      status: "Revisar",
      source: "Imagem",
      taxes: 0,
      reviewRequired: true,
      storedFileName: stored.storedName,
      originalFileName: file.name,
    },
    detectedFields: [],
    needsOcr: true,
    file: { name: file.name, storedName: stored.storedName, url: fileUrl },
    message: `${file.name} salvo localmente. Executando leitura de código de barras e OCR...`,
  });
}
