#!/bin/bash
# UserPromptSubmit hook — busca conhecimento relevante e injeta no contexto
# A saída stdout é adicionada como contexto antes do prompt do usuário
INPUT=$(cat)

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SCRIPTS_DIR="$ROOT/.claude/scripts"

if [ ! -f "$SCRIPTS_DIR/search.ts" ]; then
  exit 0
fi

PROMPT=$(echo "$INPUT" | node -e "
  let b='';
  process.stdin.on('data', c => b += c);
  process.stdin.on('end', () => {
    try {
      const d = JSON.parse(b);
      console.log(d.prompt || d.message || '');
    } catch(e) { console.log(''); }
  });
")

if [ -z "$PROMPT" ]; then
  exit 0
fi

# Extrai agent ativo se houver (para priorização de categoria)
ACTIVE_AGENT=$(echo "$INPUT" | node -e "
  let b='';
  process.stdin.on('data', c => b += c);
  process.stdin.on('end', () => {
    try {
      const d = JSON.parse(b);
      console.log(d.agent_name || '');
    } catch(e) { console.log(''); }
  });
")

cd "$SCRIPTS_DIR"

if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  npm install --silent 2>/dev/null
fi

# Verifica se o banco existe antes de buscar
if [ ! -f "$ROOT/.claude/rag.db" ]; then
  exit 0
fi

# Busca e imprime contexto relevante (vai para stdout → injetado no prompt)
npx tsx search.ts "$PROMPT" --agent="$ACTIVE_AGENT" 2>/dev/null

exit 0
