import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { saveLocalDocument } from "@/lib/local-storage";

const execFileAsync = promisify(execFile);

type ScannerDevice = {
  id: string;
  name: string;
};

async function runPowerShell(script: string, timeout = 30000): Promise<string> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
    { timeout, windowsHide: false },
  );
  return stdout.trim();
}

export async function GET() {
  if (process.platform !== "win32") {
    return NextResponse.json({ available: false, devices: [] as ScannerDevice[], reason: "Disponível apenas no Windows." });
  }
  try {
    const script = `
      $dm = New-Object -ComObject WIA.DeviceManager
      $list = @()
      foreach ($info in $dm.DeviceInfos) {
        if ($info.Type -eq 1) {
          $name = $info.Properties["Name"].Value
          $list += [PSCustomObject]@{ id = $info.DeviceID; name = [string]$name }
        }
      }
      if ($list.Count -eq 0) { "[]" } else { $list | ConvertTo-Json -Compress }
    `;
    const output = await runPowerShell(script, 10000);
    const parsed = output ? (JSON.parse(output) as ScannerDevice | ScannerDevice[]) : [];
    const devices = Array.isArray(parsed) ? parsed : [parsed];
    return NextResponse.json({ available: true, devices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar scanners WIA.";
    return NextResponse.json({ available: false, devices: [] as ScannerDevice[], reason: message });
  }
}

export async function POST(request: Request) {
  if (process.platform !== "win32") {
    return NextResponse.json({ error: "Scanner físico WIA disponível apenas no Windows." }, { status: 400 });
  }

  let deviceId = "";
  try {
    const body = (await request.json().catch(() => ({}))) as { deviceId?: string };
    deviceId = typeof body.deviceId === "string" ? body.deviceId.replace(/[^a-zA-Z0-9{}\-_\\:]/g, "") : "";
  } catch {
    deviceId = "";
  }

  const tempFile = path.join(os.tmpdir(), `scan-${randomUUID()}.png`);
  try {
    const escapedTemp = tempFile.replace(/'/g, "''");
    const escapedId = deviceId.replace(/'/g, "''");
    const script = `
      $ErrorActionPreference = 'Stop'
      $wiaFormatPNG = '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}'
      $image = $null
      if ('${escapedId}' -ne '') {
        $dm = New-Object -ComObject WIA.DeviceManager
        foreach ($info in $dm.DeviceInfos) {
          if ($info.DeviceID -eq '${escapedId}') {
            $device = $info.Connect()
            $item = $device.Items[1]
            $dialog = New-Object -ComObject WIA.CommonDialog
            $image = $dialog.ShowTransfer($item, $wiaFormatPNG, $false)
            break
          }
        }
      }
      if (-not $image) {
        $dialog = New-Object -ComObject WIA.CommonDialog
        $image = $dialog.ShowAcquireImage(1, 0, 65536, $wiaFormatPNG, $false, $true, $false)
      }
      if (-not $image) { throw 'Digitalização cancelada pelo usuário.' }
      $image.SaveFile('${escapedTemp}')
      Write-Output 'OK'
    `;
    await runPowerShell(script, 120000);
    const bytes = new Uint8Array(await readFile(tempFile));
    const fileName = `scanner-${new Date().toISOString().slice(0, 10)}.png`;
    const stored = await saveLocalDocument(fileName, bytes);
    return NextResponse.json({
      file: {
        name: fileName,
        storedName: stored.storedName,
        url: `/api/documents/${encodeURIComponent(stored.storedName)}`,
      },
      message: "Documento digitalizado pelo scanner e salvo localmente. Executando leitura...",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível digitalizar pelo scanner.";
    const friendly = /cancelad|0x80210064|no device|nenhum dispositivo/i.test(message)
      ? "Digitalização cancelada ou nenhum scanner WIA pronto foi encontrado."
      : message;
    return NextResponse.json({ error: friendly }, { status: 422 });
  } finally {
    await rm(tempFile, { force: true }).catch(() => undefined);
  }
}
