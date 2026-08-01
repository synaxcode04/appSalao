#!/bin/bash
# SubagentStop hook — captura aprendizado quando qualquer sub-agent encerra
# Roda de forma async (fire-and-forget) para não bloquear o encerramento do agent
INPUT=$(cat)

AGENT_NAME=$(echo "$INPUT" | node -e "
  let b='';
  process.stdin.on('data', c => b += c);
  process.stdin.on('end', () => {
    try {
      const d = JSON.parse(b);
      console.log(d.agent_name || d.subagent_name || 'unknown');
    } catch(e) { console.log('unknown'); }
  });
")

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SCRIPTS_DIR="$ROOT/.claude/scripts"

if [ ! -f "$SCRIPTS_DIR/summarize.ts" ]; then
  exit 0
fi

# Async: processa aprendizado sem bloquear o encerramento
(
  cd "$SCRIPTS_DIR"
  if [ ! -d "node_modules" ]; then
    npm install --silent 2>/dev/null
  fi
  FILEPATH=$(echo "$INPUT" | npx tsx summarize.ts --type=agent --agent="$AGENT_NAME" 2>/dev/null)
  if [ -n "$FILEPATH" ] && [ -f "$FILEPATH" ]; then
    npx tsx embed.ts --file="$FILEPATH" 2>/dev/null
  fi
) &

exit 0
