#!/bin/bash
# Stop hook (sessão) — sintetiza aprendizados da sessão inteira ao encerrar
# Roda de forma async (fire-and-forget) para não bloquear o encerramento
INPUT=$(cat)

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SCRIPTS_DIR="$ROOT/.claude/scripts"

if [ ! -f "$SCRIPTS_DIR/summarize.ts" ]; then
  exit 0
fi

# Async: não bloqueia o encerramento da sessão
(
  cd "$SCRIPTS_DIR"
  if [ ! -d "node_modules" ]; then
    npm install --silent 2>/dev/null
  fi
  FILEPATH=$(echo "$INPUT" | npx tsx summarize.ts --type=session 2>/dev/null)
  if [ -n "$FILEPATH" ] && [ -f "$FILEPATH" ]; then
    npx tsx embed.ts --file="$FILEPATH" 2>/dev/null
  fi
) &

exit 0
