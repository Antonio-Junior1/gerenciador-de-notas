import { rm, stat } from "node:fs/promises";
import path from "node:path";

const outputDir = path.join(process.cwd(), "release", "win-unpacked");
const duplicatedModules = path.join(outputDir, "resources", "app", "node_modules");

try {
  await stat(duplicatedModules);
  await rm(duplicatedModules, { recursive: true, force: true });
  console.log("Dependências duplicadas removidas; .next/standalone permanece intacto.");
} catch (error) {
  if (error?.code === "ENOENT") console.log("Nenhuma cópia duplicada encontrada.");
  else throw error;
}
