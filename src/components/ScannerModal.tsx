"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Barcode, Camera, Check, Loader2, Printer, RefreshCw, ScanLine, X } from "lucide-react";
import { analyzeImageDocument, decodeBarcodeFromCanvas } from "@/lib/client-ocr";
import type { NoteDraft } from "@/lib/notes";
import { extractDocumentFields, parseAccessKey, parseBoletoCode } from "@/lib/scanner";

type ScannerMode = "codigo" | "camera" | "windows";
type WindowsScannerDevice = { id: string; name: string };

type ScannerModalProps = {
  onClose: () => void;
  onDetected: (draft: Partial<NoteDraft>, message: string) => void;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ScannerModal({ onClose, onDetected }: ScannerModalProps) {
  const [mode, setMode] = useState<ScannerMode>("codigo");
  const [codeInput, setCodeInput] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [busyMessage, setBusyMessage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [winAvailable, setWinAvailable] = useState<boolean | null>(null);
  const [winDevices, setWinDevices] = useState<WindowsScannerDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [winError, setWinError] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const liveCodeAnalysis = useMemo(() => {
    const trimmed = codeInput.trim();
    if (!trimmed) return null;
    const boleto = parseBoletoCode(trimmed);
    const accessKey = !boleto ? parseAccessKey(trimmed) : null;
    if (!boleto && !accessKey) return null;
    return extractDocumentFields(trimmed, "", "Scanner");
  }, [codeInput]);

  const releaseCameraStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    releaseCameraStream();
    setCameraActive(false);
  }, [releaseCameraStream]);

  function switchMode(nextMode: ScannerMode) {
    if (nextMode !== "camera") stopCamera();
    setMode(nextMode);
  }

  useEffect(() => {
    return () => releaseCameraStream();
  }, [releaseCameraStream]);

  useEffect(() => {
    if (mode !== "windows") return;
    let active = true;
    fetch("/api/scanner/windows")
      .then((res) => res.json())
      .then((data: { available?: boolean; devices?: WindowsScannerDevice[]; reason?: string }) => {
        if (!active) return;
        setWinAvailable(Boolean(data.available));
        const list = data.devices ?? [];
        setWinDevices(list);
        if (list.length && !selectedDevice) setSelectedDevice(list[0].id);
        if (!data.available && data.reason) setWinError(data.reason);
      })
      .catch(() => {
        if (active) {
          setWinAvailable(false);
          setWinError("Não foi possível consultar scanners WIA.");
        }
      });
    return () => {
      active = false;
    };
  }, [mode, selectedDevice]);

  useEffect(() => {
    if (!cameraActive) return;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      const canvas = scanCanvasRef.current ?? document.createElement("canvas");
      scanCanvasRef.current = canvas;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const decoded = decodeBarcodeFromCanvas(canvas);
      if (!decoded) return;

      const extraction = extractDocumentFields(decoded, "", "Scanner");
      if (extraction.boleto || extraction.accessKey) {
        stopCamera();
        onDetected(
          extraction.draft,
          `Código lido pela câmera (${extraction.detectedFields.join(", ")}). Confira os campos antes de salvar.`,
        );
      }
    }, 350);
    return () => window.clearInterval(interval);
  }, [cameraActive, onDetected, stopCamera]);

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Seu navegador ou ambiente não oferece acesso à câmera.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      }, 50);
    } catch {
      setCameraError("Permissão de câmera negada ou nenhuma webcam conectada.");
    }
  }

  async function captureCameraSnapshot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setBusyMessage("Salvando captura da câmera...");
    setProgress(5);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      setBusyMessage("");
      setProgress(null);
      return;
    }

    stopCamera();
    const fileName = `camera-${new Date().toISOString().slice(0, 10)}.png`;
    const file = new File([blob], fileName, { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/import/document", { method: "POST", body: formData });
      const payload = (await res.json()) as { file?: { storedName?: string; url?: string }; error?: string };
      if (!res.ok || !payload.file?.url) {
        setCameraError(payload.error || "Falha ao salvar captura.");
        return;
      }
      const extraction = await analyzeImageDocument(file, fileName, "Scanner", (msg, pct) => {
        setBusyMessage(msg);
        if (typeof pct === "number") setProgress(pct);
      });
      onDetected(
        {
          ...extraction.draft,
          storedFileName: payload.file.storedName,
          originalFileName: fileName,
          source: "Scanner",
        },
        extraction.detectedFields.length
          ? `Captura salva e lida (${extraction.detectedFields.join(", ")}). Confira antes de salvar.`
          : "Captura salva localmente. Preencha os campos manualmente.",
      );
    } finally {
      setBusyMessage("");
      setProgress(null);
    }
  }

  async function triggerWindowsScan() {
    setWinError("");
    setBusyMessage("Aguardando digitalização do scanner Windows...");
    setProgress(10);
    try {
      const response = await fetch("/api/scanner/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: selectedDevice }),
      });
      const payload = (await response.json()) as {
        file?: { name: string; storedName: string; url: string };
        error?: string;
      };
      if (!response.ok || !payload.file?.url) {
        setWinError(payload.error || "Não foi possível digitalizar o documento.");
        return;
      }
      const extraction = await analyzeImageDocument(payload.file.url, payload.file.name, "Scanner", (msg, pct) => {
        setBusyMessage(msg);
        if (typeof pct === "number") setProgress(pct);
      });
      onDetected(
        {
          ...extraction.draft,
          storedFileName: payload.file.storedName,
          originalFileName: payload.file.name,
          source: "Scanner",
        },
        extraction.detectedFields.length
          ? `Documento digitalizado e lido (${extraction.detectedFields.join(", ")}). Confira os dados antes de salvar.`
          : "Imagem do scanner salva localmente. Preencha os dados manualmente para concluir.",
      );
    } catch {
      setWinError("Erro de comunicação ao tentar usar o scanner.");
    } finally {
      setBusyMessage("");
      setProgress(null);
    }
  }

  function applyTypedCode() {
    const trimmed = codeInput.trim();
    if (!trimmed) return;
    if (liveCodeAnalysis) {
      onDetected(
        liveCodeAnalysis.draft,
        `Código interpretado (${liveCodeAnalysis.detectedFields.join(", ")}). Confira os campos antes de salvar.`,
      );
      return;
    }
    const fallback = extractDocumentFields(trimmed, "", "Scanner");
    onDetected(fallback.draft, "Texto do leitor aplicado no formulário para revisão.");
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal scanner-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Leitura inteligente</p>
            <h2>Scanner, Câmera e Código</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar scanner" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="type-switch scanner-tabs">
          <button type="button" className={mode === "codigo" ? "selected" : ""} onClick={() => switchMode("codigo")}>
            <Barcode size={15} /> Leitor / Código
          </button>
          <button type="button" className={mode === "camera" ? "selected" : ""} onClick={() => switchMode("camera")}>
            <Camera size={15} /> Câmera
          </button>
          <button type="button" className={mode === "windows" ? "selected" : ""} onClick={() => switchMode("windows")}>
            <Printer size={15} /> Scanner Windows
          </button>
        </div>

        {busyMessage && (
          <div className="scanner-progress">
            <Loader2 size={16} className="spin-icon" />
            <div className="scanner-progress-body">
              <span>{busyMessage}</span>
              {progress !== null && (
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.min(100, progress)}%` }} />
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "codigo" && (
          <div className="scanner-pane">
            <p className="scanner-help">
              Bipe com um leitor de código de barras USB ou cole a linha digitável do boleto (47/48 dígitos), chave da NF-e (44 dígitos) ou link do QR Code.
            </p>
            <textarea
              className="scanner-textarea"
              rows={3}
              autoFocus
              placeholder="Ex.: 34191.23454 67890.123457 67890.123457 1 16290000025000"
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  applyTypedCode();
                }
              }}
            />
            {liveCodeAnalysis && (
              <div className="scanner-preview-card">
                <div className="scanner-preview-head">
                  <ScanLine size={15} />
                  <b>{liveCodeAnalysis.boleto ? "Boleto reconhecido" : "Chave NF-e/NFC-e reconhecida"}</b>
                </div>
                <div className="scanner-preview-grid">
                  <span><b>Tipo:</b> {liveCodeAnalysis.draft.type}</span>
                  {liveCodeAnalysis.draft.company && <span><b>Banco/Segmento:</b> {liveCodeAnalysis.draft.company}</span>}
                  {Boolean(liveCodeAnalysis.draft.amount) && <span><b>Valor:</b> {currency.format(Number(liveCodeAnalysis.draft.amount))}</span>}
                  {liveCodeAnalysis.draft.dueDate && <span><b>Vencimento:</b> {liveCodeAnalysis.draft.dueDate}</span>}
                  {liveCodeAnalysis.accessKey && <span><b>NF Nº:</b> {liveCodeAnalysis.accessKey.documentNumber}</span>}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
              <button type="button" className="primary-button" disabled={!codeInput.trim()} onClick={applyTypedCode}>
                Usar no cadastro <Check size={16} />
              </button>
            </div>
          </div>
        )}

        {mode === "camera" && (
          <div className="scanner-pane">
            <p className="scanner-help">
              Aponte o código de barras do boleto ou o QR Code da nota fiscal para a câmera, ou capture uma foto para leitura com OCR.
            </p>
            {cameraError && <div className="scanner-error">{cameraError}</div>}
            <div className="camera-stage">
              {cameraActive ? (
                <video ref={videoRef} className="camera-video" playsInline muted />
              ) : (
                <div className="camera-placeholder">
                  <Camera size={28} />
                  <span>Câmera desligada</span>
                </div>
              )}
            </div>
            <div className="modal-actions">
              {!cameraActive ? (
                <button type="button" className="primary-button" onClick={startCamera}>
                  <Camera size={16} /> Ativar câmera
                </button>
              ) : (
                <>
                  <button type="button" className="secondary-button" onClick={stopCamera}>Parar</button>
                  <button type="button" className="primary-button" disabled={Boolean(busyMessage)} onClick={captureCameraSnapshot}>
                    <ScanLine size={16} /> Capturar foto e ler (OCR)
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {mode === "windows" && (
          <div className="scanner-pane">
            <p className="scanner-help">
              Digitalize diretamente de um scanner de mesa ou multifuncional conectado ao Windows (via WIA). A imagem é salva na pasta local e lida automaticamente.
            </p>
            {winError && <div className="scanner-error">{winError}</div>}
            <div className="scanner-device-box">
              <label className="scanner-label">
                Dispositivo WIA detectado
                <select
                  value={selectedDevice}
                  onChange={(event) => setSelectedDevice(event.target.value)}
                  disabled={!winDevices.length}
                >
                  {winDevices.length ? (
                    winDevices.map((dev) => (
                      <option key={dev.id} value={dev.id}>{dev.name}</option>
                    ))
                  ) : (
                    <option value="">Usar seletor padrão do Windows</option>
                  )}
                </select>
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setWinError("");
                  setSelectedDevice("");
                  fetch("/api/scanner/windows")
                    .then((r) => r.json())
                    .then((d: { available?: boolean; devices?: WindowsScannerDevice[]; reason?: string }) => {
                      setWinAvailable(Boolean(d.available));
                      setWinDevices(d.devices ?? []);
                      if (d.devices?.length) setSelectedDevice(d.devices[0].id);
                      if (!d.available && d.reason) setWinError(d.reason);
                    })
                    .catch(() => setWinError("Falha ao atualizar dispositivos."));
                }}
              >
                <RefreshCw size={14} /> Atualizar
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
              <button
                type="button"
                className="primary-button"
                disabled={winAvailable === false || Boolean(busyMessage)}
                onClick={triggerWindowsScan}
              >
                <Printer size={16} /> Digitalizar documento
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
