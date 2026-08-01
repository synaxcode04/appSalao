#!/bin/bash
# qa: no Bash, só permite comandos de execução de testes e leitura — bloqueia todo o resto
INPUT=$(cat)

PARSE=$(echo "$INPUT" | node -e "
  let b='';
  process.stdin.on('data', c => b += c);
  process.stdin.on('end', () => {
    try {
      const d = JSON.parse(b);
      const tool = d.tool_name || '';
      const cmd  = (d.tool_input && d.tool_input.command) || '';
      console.log(JSON.stringify({ tool, cmd }));
    } catch(e) {
      console.log(JSON.stringify({ tool: '', cmd: '' }));
    }
  });
")

TOOL=$(echo "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).tool))")
CMD=$(echo  "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).cmd))")

if [ "$TOOL" = "Bash" ]; then
  # Lista de comandos permitidos: testes, build (para verificar), grep/ls para leitura
  ALLOWED_PATTERN='(npm\s+run\s+(test|test:run|build)|npx\s+(vitest|jest)|vitest|grep\s|git\s+ls-files|ls\b|cat\b|git\s+status\b)'

  if ! echo "$CMD" | grep -qiE "$ALLOWED_PATTERN"; then
    echo "❌ BLOQUEADO [qa]: Comando não autorizado: '$CMD'" >&2
    echo "   O agent qa só pode executar:" >&2
    echo "   • npm run test:run       — rodar suíte de testes" >&2
    echo "   • npm run build          — verificar build de produção" >&2
    echo "   • grep / git ls-files    — verificar arquivos" >&2
    echo "   • git status             — verificar estado do repositório" >&2
    echo "   Para qualquer outra operação, delegue ao agent correto." >&2
    exit 2
  fi
fi

exit 0
