# Relatório de testes local

Data da rodada: 20/08/2026.

A versão de produção local em `http://127.0.0.1:3212` carregou corretamente e os controles React responderam. O botão Manual abriu o formulário; o cadastro de teste foi salvo e apareceu na lista após atualização da página. O registro manual usado foi `Empresa de Teste Local`, documento `BOL-9001`, valor `R$ 99,90`, vencimento em 20/08/2026.

A importação XML foi simulada pela seleção de um arquivo NF-e de teste. O parser preencheu empresa `Empresa de Teste Local`, documento `9001`, valor `R$ 1.500,90`, impostos `R$ 120,10` e data de emissão 20/08/2026. O arquivo foi informado como salvo localmente e o formulário de revisão foi aberto antes do cadastro.

A importação de PDF foi simulada com `boleto-teste.pdf`. O arquivo foi informado como salvo localmente, o formulário abriu como Boleto e o valor ficou para preenchimento manual, coerente com a ausência de OCR. Depois de preencher `Empresa do Boleto`, `R$ 250,00` e vencimento de hoje, o registro foi salvo.

O alerta visual de vencimento apareceu com a mensagem `Boletos vencendo hoje`, exibindo `Empresa do Boleto · R$ 250,00`. O contador de Vencimentos passou para 1 e o resumo mensal foi atualizado para R$ 1.850,80.

A exportação XLSX foi acionada pela interface, mostrou o toast `Planilha XLSX exportada com sucesso.` e o navegador confirmou o download `gerenciador-de-notas-2026-08.xlsx`.

Observação: no servidor de desenvolvimento Turbopack, os cliques não responderam nesta sessão; no bundle de produção Webpack/standalone, a interatividade funcionou. Isso deve ser investigado separadamente antes de considerar o modo `desktop:dev` concluído.

A primeira rodada identificou um bug: o formulário sempre enviava `source: Manual`, mesmo após importação XML/PDF. O estado do formulário foi corrigido para preservar `XML`, `PDF` ou `Imagem`. Lint, TypeScript e build Webpack passaram depois da correção. Na nova versão, a simulação de importação XML abriu a revisão com empresa `Empresa Origem XML`, documento `9002`, valor `75,50`, impostos `5,50` e origem visual `Nota fiscal`; o botão de salvar foi encontrado no modal.

Após a correção, a importação XML preencheu automaticamente o vencimento `2026-08-20`. O registro salvo pela interface foi confirmado na API com `source: XML`, documento `9003` e vencimento `2026-08-20`.

As rotas de documento foram testadas diretamente: PDF retornou `source: PDF` e imagem PNG retornou `source: Imagem`. Os dois arquivos foram gravados em `documents/` na pasta de dados local.

A nova tentativa de empacotamento Windows com `electron-builder --win dir` foi iniciada, mas o processo terminou com código 143 neste sandbox sob pressão de memória. A estrutura Windows desempacotada já havia sido gerada anteriormente; o instalador NSIS continua limitado pela ausência de Wine.
