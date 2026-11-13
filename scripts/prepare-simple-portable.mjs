import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "release", "win-unpacked");
const target = path.join(root, "release", "GerenciadorDeNotas");
const legacyTarget = path.join(root, "release", "Gerenciador de Notas portátil");
const executableName = "Gerenciador de Notas.exe";

await rm(legacyTarget, { recursive: true, force: true });
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });
await rm(path.join(target, executableName), { force: true });
await cp(path.join(source, executableName), path.join(target, executableName));
await writeFile(
  path.join(target, "LEIA-ME.txt"),
  [
    "GERENCIADOR DE NOTAS - VERSAO PORTATIL (WINDOWS)",
    "",
    "COMO USAR:",
    "1. Extraia o arquivo ZIP completo (botao direito -> Extrair tudo...).",
    "   Nao execute o programa diretamente de dentro do ZIP sem extrair.",
    "2. Abra a pasta 'GerenciadorDeNotas'.",
    "3. De um duplo clique em 'Gerenciador de Notas.exe'.",
    "4. Nao mova o arquivo .exe para fora desta pasta (ele depende das DLLs e da pasta 'resources').",
    "",
    "AVISO DO WINDOWS (SMARTSCREEN):",
    "Como este aplicativo local não possui assinatura digital comercial, o Windows pode",
    "exibir um alerta na primeira execução. Nesse caso, clique em 'Mais informações'",
    "e depois em 'Executar assim mesmo'.",
    "",
    "DADOS E BACKUP:",
    "- Não é necessário instalar Node.js, pnpm ou internet para cadastrar, importar ou exportar.",
    "- Seus registros e arquivos ficam salvos na pasta de dados do usuário no Windows.",
    "- Dentro do aplicativo, acesse 'Configurações' para abrir a pasta de dados ou exportar backup JSON.",
    "",
  ].join("\r\n"),
  "utf8",
);
console.log(`Pacote simples preparado em ${target}`);
