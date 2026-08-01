#!/bin/bash
# PostToolUse: roda testes após edição em arquivos de notificação
INPUT=$(cat)

PARSE=$(echo "$INPUT" | node -e "
  let b='';
  process.stdin.on('data', c => b += c);
  process.stdin.on('end', () => {
    try {
      const d = JSON.parse(b);
      const tool = d.tool_name || '';
      const file = (d.tool_input && d.tool_input.file_path) || '';
      console.log(JSON.stringify({ tool, file }));
    } catch(e) {
      console.log(JSON.stringify({ tool: '', file: '' }));
    }
  });
")

TOOL=$(echo "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).tool))")
FILE=$(echo "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).file))")

if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" ]]; then
  if echo "$FILE" | grep -qiE '(notification|notify|__tests__)'; then
    echo "" >&2
    echo "▶ [notifier] Rodando testes após edição em: $FILE" >&2

    ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
    cd "$ROOT/app" 2>/dev/null || { echo "⚠️  Diretório app/ não encontrado." >&2; exit 0; }

    npm run test:run -- --reporter=verbose 2>&1 >&2
    TEST_EXIT=$?

    echo "" >&2
    if [ $TEST_EXIT -ne 0 ]; then
      echo "⚠️  [notifier] Testes falhando. Corrija antes de continuar." >&2
    else
      echo "✅ [notifier] Todos os testes passando." >&2
    fi
  fi
fi

exit 0
