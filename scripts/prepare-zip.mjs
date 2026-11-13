import { execFile } from "node:child_process";
import { rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const releaseDir = path.join(root, "release");
const portableDir = path.join(releaseDir, "GerenciadorDeNotas");
const portableZip = path.join(releaseDir, "Gerenciador-de-Notas-Portatil.zip");
const installerExe = path.join(releaseDir, "Gerenciador de Notas Setup 0.1.0.exe");
const installerReadme = path.join(releaseDir, "LEIA-ME-INSTALADOR.txt");
const installerZip = path.join(releaseDir, "Gerenciador-de-Notas-Instalador.zip");

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createZip(sourcePaths, zipPath) {
  await rm(zipPath, { force: true });
  const quotedSources = sourcePaths.map((item) => `'${item.replace(/'/g, "''")}'`).join(", ");
  const escapedDest = zipPath.replace(/'/g, "''");
  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Compress-Archive -Path ${quotedSources} -DestinationPath '${escapedDest}' -CompressionLevel Optimal -Force`,
    ],
    { windowsHide: true },
  );
}

if (!(await exists(portableDir))) {
  throw new Error("Pasta portátil não encontrada. Execute pnpm desktop:portable-simple antes.");
}

await createZip([portableDir], portableZip);
console.log(`ZIP portátil criado em ${portableZip}`);

if (await exists(installerExe)) {
  await writeFile(
    installerReadme,
    [
      "GERENCIADOR DE NOTAS - INSTALADOR WINDOWS",
      "",
      "1. Extraia este arquivo ZIP.",
      "2. Execute 'Gerenciador de Notas Setup 0.1.0.exe' para instalar.",
      "3. Se o Windows exibir o alerta do SmartScreen, clique em 'Mais informações' -> 'Executar assim mesmo'.",
      "",
    ].join("\r\n"),
    "utf8",
  );
  await createZip([installerExe, installerReadme], installerZip);
  await rm(installerReadme, { force: true });
  console.log(`ZIP do instalador criado em ${installerZip}`);
}
