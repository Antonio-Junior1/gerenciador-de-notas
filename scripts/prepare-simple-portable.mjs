import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "release", "win-unpacked");
const target = path.join(root, "release", "Gerenciador de Notas portátil");
const executableName = "Gerenciador de Notas.exe";

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });
await rm(path.join(target, executableName), { force: true });
await cp(path.join(source, executableName), path.join(target, executableName));
await writeFile(path.join(target, "LEIA-ME.txt"), [
  "GERENCIADOR DE NOTAS",
  "",
  "1. Extraia esta pasta completa.",
  "2. Abra o arquivo Gerenciador de Notas.exe.",
  "3. Não mova o arquivo .exe para fora desta pasta.",
  "",
  "Não é necessário instalar Node.js ou pnpm.",
  "Os dados ficam na pasta de dados do usuário do aplicativo.",
  "",
].join("\n"), "utf8");
console.log(`Pacote simples preparado em ${target}`);
