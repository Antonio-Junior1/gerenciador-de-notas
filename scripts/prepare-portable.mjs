import { rm, stat } from "node:fs/promises";
import path from "node:path";

const outputDir = path.join(process.cwd(), "release", "win-unpacked");
const duplicatedModules = path.join(outputDir, "resources", "app", "node_modules");
const standaloneModules = path.join(outputDir, "resources", "srv", "node_modules");

try {
  await stat(duplicatedModules);
  await rm(duplicatedModules, { recursive: true, force: true });
  console.log("Dependências duplicadas removidas; .next/standalone permanece intacto.");
} catch (error) {
  if (error?.code === "ENOENT") console.log("Nenhuma cópia duplicada encontrada.");
  else throw error;
}

for (const directory of [
  path.join(standaloneModules, ".pnpm", "@img+sharp-linux-x64@0.35.3"),
  path.join(standaloneModules, ".pnpm", "@img+sharp-libvips-linux-x64@1.3.2"),
]) {
  await rm(directory, { recursive: true, force: true });
}
console.log("Módulos nativos Linux removidos do pacote Windows.");
