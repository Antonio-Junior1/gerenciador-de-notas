# Versão desktop local

O Gerenciador de Notas agora pode ser executado como um aplicativo Electron que abre a interface Next.js em uma janela local. O uso principal não depende de Vercel, PostgreSQL ou internet.

## Dados locais

Os registros são gravados em `records.json` e os arquivos originais em `documents/`, dentro do diretório configurado por `NOTAS_DATA_DIR`. No aplicativo desktop, esse diretório é definido automaticamente como a pasta de dados do usuário do Electron. Em desenvolvimento, o fallback é `.local-data/` na raiz do projeto.

Para fazer backup, copie a pasta de dados completa com o aplicativo fechado. A restauração consiste em recolocar essa pasta no mesmo local antes de iniciar o aplicativo.

## Desenvolvimento

Use `pnpm dev` para abrir apenas a versão web local. Use `pnpm desktop:dev` para iniciar o servidor Next na porta 3210 e abrir a janela Electron apontando para ele.

## Build desktop

`pnpm desktop:start` gera o build standalone com Webpack, prepara os assets e abre a versão desktop local. `pnpm desktop:pack` gera um pacote executável não instalável para validação. `pnpm desktop:dist` prepara o instalador NSIS para Windows.

O instalador Windows deve ser gerado em uma máquina Windows ou em um ambiente Linux que possua Wine configurado. O ambiente de desenvolvimento atual conseguiu gerar o executável Windows desempacotado, mas não possui Wine para concluir a etapa NSIS.

## Importações

XML de NF-e/NFS-e é preservado na pasta local e interpretado no servidor local antes da revisão. PDF e imagem de boleto também são preservados localmente e abrem o formulário para conferência manual. A extração OCR de PDF/imagem ainda deve ser implementada antes de considerar o fluxo automático concluído.

## Segurança

Os arquivos pessoais não devem ser versionados. `.env*`, `.local-data/` e `release/` estão no `.gitignore`. O preload do Electron usa isolamento de contexto e não habilita Node.js diretamente na interface.

## Distribuição portátil por ZIP

O arquivo `gerenciador-notas-simples-v2.zip` contém uma pasta portátil do aplicativo Windows. O destinatário deve baixar o ZIP, clicar com o botão direito, escolher **Extrair tudo** e abrir a pasta `Gerenciador de Notas portátil`. Dentro dela, o arquivo `Gerenciador de Notas.exe` fica visível logo na primeira tela. Não é necessário instalar Node.js, pnpm ou dependências adicionais, e não se deve mover o executável para fora dessa pasta, porque ele utiliza as DLLs e a pasta `resources` que ficam ao lado.

O primeiro início pode demorar alguns segundos enquanto o servidor local é iniciado. O aplicativo funciona sem internet para cadastro, importação, persistência e exportação. O Windows pode exibir um aviso do SmartScreen por o arquivo não possuir assinatura digital; nesse caso, o usuário deve verificar a origem do ZIP antes de permitir a execução. Para criar uma nova versão portátil durante o desenvolvimento, use `pnpm desktop:portable-simple`, depois compacte `release/Gerenciador de Notas portátil` em ZIP.
