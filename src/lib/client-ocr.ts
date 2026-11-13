"use client";

import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";
import type { NoteDraft, NoteSource } from "./notes";
import { extractDocumentFields, type ScannedExtraction } from "./scanner";

function createBarcodeReader() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  return reader;
}

function rgbaToLuminance(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const luminances = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    luminances[i] = Math.round(
      0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2],
    );
  }
  return luminances;
}

export function decodeBarcodeFromCanvas(canvas: HTMLCanvasElement): string | null {
  const reader = createBarcodeReader();
  const tryDecode = (targetCanvas: HTMLCanvasElement): string | null => {
    const ctx = targetCanvas.getContext("2d");
    if (!ctx || targetCanvas.width === 0 || targetCanvas.height === 0) return null;
    const imageData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    const luminances = rgbaToLuminance(imageData.data, targetCanvas.width, targetCanvas.height);
    const source = new RGBLuminanceSource(luminances, targetCanvas.width, targetCanvas.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    try {
      return reader.decode(bitmap).getText();
    } catch {
      return null;
    }
  };

  const direct = tryDecode(canvas);
  if (direct) return direct;

  // Tenta rotação 90° caso o código de barras do boleto esteja na vertical
  const rotated = document.createElement("canvas");
  rotated.width = canvas.height;
  rotated.height = canvas.width;
  const rctx = rotated.getContext("2d");
  if (!rctx) return null;
  rctx.translate(rotated.width / 2, rotated.height / 2);
  rctx.rotate(Math.PI / 2);
  rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return tryDecode(rotated);
}

export async function loadImageToCanvas(imageSource: string | Blob): Promise<HTMLCanvasElement> {
  const url = typeof imageSource === "string" ? imageSource : URL.createObjectURL(imageSource);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
      element.src = url;
    });
    const maxDim = 1800;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Contexto gráfico indisponível.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    if (typeof imageSource !== "string") URL.revokeObjectURL(url);
  }
}

export async function runClientOcr(
  imageInput: string | Blob | HTMLCanvasElement,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1, {
    logger: (message: { status?: string; progress?: number }) => {
      if (message.status === "recognizing text" && typeof message.progress === "number") {
        onProgress?.(Math.round(message.progress * 100));
      }
    },
  });
  try {
    const result = await worker.recognize(imageInput);
    return result.data.text || "";
  } finally {
    await worker.terminate();
  }
}

export function createEnhancedContrastCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = sourceCanvas.width;
  copy.height = sourceCanvas.height;
  const ctx = copy.getContext("2d");
  if (!ctx || copy.width === 0 || copy.height === 0) return sourceCanvas;
  ctx.drawImage(sourceCanvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, copy.width, copy.height);
  const { data } = imageData;
  const contrast = 1.35;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const adjusted = Math.max(0, Math.min(255, Math.round((lum - 128) * contrast + 128)));
    data[i] = adjusted;
    data[i + 1] = adjusted;
    data[i + 2] = adjusted;
  }
  ctx.putImageData(imageData, 0, 0);
  return copy;
}

export async function analyzeImageDocument(
  imageSource: string | File,
  fileName: string,
  source: NoteSource,
  onStatus?: (message: string, progress?: number) => void,
): Promise<ScannedExtraction> {
  onStatus?.("Analisando código de barras e QR Code...", 10);
  const canvas = await loadImageToCanvas(imageSource);
  const enhancedCanvas = createEnhancedContrastCanvas(canvas);
  const barcodeText = decodeBarcodeFromCanvas(canvas) || decodeBarcodeFromCanvas(enhancedCanvas);

  let ocrText = "";
  try {
    onStatus?.("Executando leitura OCR do documento...", 25);
    ocrText = await runClientOcr(enhancedCanvas, (pct) => {
      onStatus?.(`Lendo texto com OCR (${pct}%)...`, 25 + Math.round(pct * 0.7));
    });
  } catch {
    // Em ambiente totalmente offline sem cache prévio do idioma OCR, mantém leitura do código de barras
  }

  const combinedText = [barcodeText || "", ocrText].filter(Boolean).join("\n");
  if (!combinedText.trim()) {
    return {
      draft: {
        type: "Boleto",
        company: "",
        document: fileName,
        amount: 0,
        dueDate: "",
        issueDate: "",
        category: "Operacional",
        status: "Revisar",
        source,
        taxes: 0,
        reviewRequired: true,
      } satisfies Partial<NoteDraft>,
      detectedFields: [],
    };
  }

  return extractDocumentFields(combinedText, fileName, source);
}
