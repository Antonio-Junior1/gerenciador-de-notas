# Gerenciador de Notas

O Gerenciador de Notas é uma aplicação web para organizar notas fiscais, boletos e documentos financeiros em um só lugar. A interface foi pensada para facilitar o cadastro manual, a revisão de dados importados, o acompanhamento de vencimentos e a exportação estruturada para conferência.

> **Aviso importante:** a aplicação organiza e exporta informações; ela não substitui a validação de um contador nem determina obrigações fiscais. Antes de declarar ou utilizar os dados em uma obrigação acessória, confira os valores, documentos e regras aplicáveis com um profissional contábil.

## Funcionalidades do primeiro marco

A versão inicial inclui um dashboard com movimentação mensal, quantidade de notas, boletos vencendo hoje e documentos aguardando revisão. Também possui cadastro manual de notas fiscais e boletos, filtros por mês e tipo, busca por empresa ou identificação e exportação para XLSX.

O fluxo de importação aceita arquivos XML, PDF e imagem. O XML possui uma leitura inicial de campos comuns de NF-e/NFS-e, como empresa, número, valor e data. PDFs e imagens entram em uma etapa de revisão manual para que os dados sejam conferidos e completados antes do salvamento.

## Arquitetura de deploy

O projeto usa **Next.js com App Router, TypeScript e Tailwind CSS**, uma base adequada para deploy na Vercel. A arquitetura foi mantida sem processos permanentes, com a intenção de evoluir o armazenamento e as rotas de processamento para funções serverless.

O próximo marco deve integrar autenticação, banco de dados e armazenamento de objetos. Documentos originais não devem ser armazenados em colunas do banco nem em diretórios públicos; o fluxo recomendado é usar storage privado e guardar apenas metadados e referências no banco.

## Execução local

```bash
pnpm install
pnpm dev
```

Depois, acesse `http://localhost:3000`. Para validar uma build de produção, use:

```bash
NODE_ENV=production pnpm build
pnpm start
```

## Deploy na Vercel

Importe o repositório na Vercel e mantenha o framework como Next.js. A configuração de banco, autenticação e storage deverá ser cadastrada como variável de ambiente no painel da Vercel, nunca commitada no repositório. Os limites de tamanho e tempo de processamento devem ser respeitados quando a importação de documentos for migrada para rotas serverless.

## Dados da planilha

A exportação XLSX contempla tipo, empresa, identificação, valor bruto, impostos, valor líquido, emissão, vencimento, categoria, status e origem do documento. O arquivo é uma ferramenta de organização e conferência, não uma garantia de que todos os campos necessários para uma declaração estejam presentes.

## Estado atual

O projeto está no primeiro marco visual e funcional, com dados mantidos no estado da sessão do navegador. Os próximos marcos são persistência por usuário, parser mais abrangente de XML, extração assistida de PDFs e imagens, revisão de dados importados, alertas persistentes e armazenamento seguro dos documentos originais.
