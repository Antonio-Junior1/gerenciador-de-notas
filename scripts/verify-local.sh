#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
fuser -k 3210/tcp 2>/dev/null || true
rm -rf /tmp/gerenciador-notas-data
mkdir -p /tmp/gerenciador-notas-data

NODE_ENV=production PORT=3210 HOSTNAME=127.0.0.1 NOTAS_DATA_DIR=/tmp/gerenciador-notas-data node .next/standalone/server.js >/tmp/gerenciador-notas-server.log 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT

for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3210/api/notes >/tmp/gerenciador-notas-get.json; then break; fi
  sleep 1
done

curl -fsS -X POST http://127.0.0.1:3210/api/notes \
  -H 'content-type: application/json' \
  -H 'x-demo-user: local-demo' \
  -d '{"type":"Boleto","company":"Empresa Local","document":"001.pdf","amount":99.9,"dueDate":"2026-08-20","issueDate":"2026-08-01","category":"Operacional","status":"Pendente","source":"Manual","taxes":0,"reviewRequired":false}' \
  >/tmp/gerenciador-notas-post.json
curl -fsS http://127.0.0.1:3210/api/notes >/tmp/gerenciador-notas-after.json

printf '%s\n' '--- initial ---'
cat /tmp/gerenciador-notas-get.json
printf '%s\n' '--- created ---'
cat /tmp/gerenciador-notas-post.json
printf '%s\n' '--- after ---'
cat /tmp/gerenciador-notas-after.json
printf '%s\n' '--- data files ---'
find /tmp/gerenciador-notas-data -maxdepth 2 -type f -print
