#!/bin/bash
# auth-guard: bloqueia git push, deploy e qualquer alteração no BookingEngine
INPUT=$(cat)

PARSE=$(echo "$INPUT" | node -e "
  let b='';
  process.stdin.on('data', c => b += c);
  process.stdin.on('end', () => {
    try {
      const d = JSON.parse(b);
      const tool = d.tool_name || '';
      const cmd  = (d.tool_input && d.tool_input.command)   || '';
      const file = (d.tool_input && d.tool_input.file_path) || '';
      console.log(JSON.stringify({ tool, cmd, file }));
    } catch(e) {
      console.log(JSON.stringify({ tool: '', cmd: '', file: '' }));
    }
  });
")

TOOL=$(echo "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).tool))")
CMD=$(echo  "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).cmd))")
FILE=$(echo "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).file))")

# Bloqueia operações git e deploy em Bash
if [ "$TOOL" = "Bash" ]; then
  if echo "$CMD" | grep -qiE '\bgit\s+(push|commit|reset)\b'; then
    echo "❌ BLOQUEADO [auth-guard]: Operação git não permitida: '$CMD'" >&2
    echo "   Este agent foca em ProtectedRoute, SuspendedScreen e OwnerLayout." >&2
    exit 2
  fi

  if echo "$CMD" | grep -qiE '\bvercel\s+deploy\b'; then
    echo "❌ BLOQUEADO [auth-guard]: Deploy não é escopo deste agent." >&2
    exit 2
  fi
fi

# Bloqueia edição do BookingEngine — é escopo do agent booking-engine
if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" ]]; then
  if echo "$FILE" | grep -qiE 'BookingEngine'; then
    echo "❌ BLOQUEADO [auth-guard]: '$FILE' é responsabilidade do agent 'booking-engine'." >&2
    echo "   auth-guard não altera a lógica de cálculo de slots." >&2
    exit 2
  fi
fi

exit 0
