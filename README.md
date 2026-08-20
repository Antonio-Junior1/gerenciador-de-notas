# Gerenciador de Notas

O Gerenciador de Notas é um aplicativo desktop local para organizar notas fiscais, boletos e documentos financeiros. Ele reúne cadastro manual, importação de XML, recebimento de PDF e imagem para conferência, acompanhamento de vencimentos e exportação estruturada para Excel.

> **Aviso importante:** a aplicação organiza e exporta informações; ela não substitui a validação de um contador nem determina obrigações fiscais. Antes de declarar ou utilizar os dados em uma obrigação acessória, confira os valores, documentos e regras aplicáveis com um profissional contábil.

## Funcionalidades

O dashboard apresenta a movimentação mensal, o total de documentos, os boletos que vencem no dia e os itens que exigem atenção. É possível cadastrar notas fiscais e boletos manualmente, pesquisar por empresa ou identificação, filtrar por mês e tipo, acompanhar empresas e exportar os dados para XLSX.

A importação de XML de NF-e/NFS-e preserva o arquivo original e lê campos comuns como empresa, número, valor, tributos e data. PDFs e imagens de boleto também são preservados na pasta local e abrem uma etapa de conferência manual. O OCR automático de PDF e imagem ainda não faz parte do escopo concluído; nenhum dado é inventado quando a extração não está disponível.

## Aplicativo desktop local

O aplicativo usa Electron para abrir a interface Next.js em uma janela local. Os registros são persistidos em `records.json`, e os arquivos originais ficam em `documents/`, dentro da pasta de dados do usuário do aplicativo. O uso principal não depende de Vercel, PostgreSQL ou internet.

Para desenvolvimento local, é necessário ter Node.js e pnpm instalados:

```bash
pnpm install
pnpm dev
```

Para abrir a versão desktop durante o desenvolvimento, use:

```bash
pnpm desktop:dev
```

Para gerar uma build local de produção e abrir o desktop:

```bash
pnpm desktop:start
```

## Distribuição Windows

A distribuição portátil deve ser gerada em ambiente Windows nativo para garantir um executável compatível com o sistema operacional. O comando de preparação do pacote simples é:

```bash
pnpm desktop:portable-simple
```

Depois, compacte a pasta `release/Gerenciador de Notas portátil`. Para o usuário final, o procedimento é baixar o ZIP, escolher **Extrair tudo**, abrir a pasta extraída e executar `Gerenciador de Notas.exe`. O executável deve permanecer na mesma pasta que as DLLs e a pasta `resources`. O usuário final não precisa instalar Node.js, pnpm ou dependências do projeto.

O build Windows produzido no sandbox Linux é apenas um artefato de desenvolvimento e não deve ser usado como distribuição final. A validação final precisa ocorrer em uma máquina Windows x64.

## Dados e backup

Para fazer backup, feche o aplicativo e copie a pasta de dados completa. A restauração consiste em recolocar essa pasta no mesmo local antes de iniciar o aplicativo. Os diretórios `.local-data/`, `release/`, dependências e arquivos de ambiente não devem ser versionados.

## Exportação

A planilha XLSX contempla tipo, empresa, identificação, valor bruto, impostos, valor líquido, emissão, vencimento, categoria, status e origem do documento. Ela é uma ferramenta de organização e conferência, não uma garantia de que todos os campos necessários para uma declaração estejam presentes.

## Stack

O projeto utiliza Next.js com App Router, React, TypeScript, Tailwind CSS, Electron, `fast-xml-parser` e `xlsx`. A camada de dados local foi estruturada para permitir uma futura integração com armazenamento persistente externo, mas o modo desktop atual prioriza execução local e privacidade dos arquivos.

## Segurança

Arquivos pessoais, dados locais, ZIPs, executáveis e variáveis de ambiente ficam fora do Git por meio do `.gitignore`. O preload do Electron usa isolamento de contexto e não expõe Node.js diretamente à interface.
