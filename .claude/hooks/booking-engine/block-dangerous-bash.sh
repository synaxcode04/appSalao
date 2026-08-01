#!/bin/bash
# booking-engine: bloqueia git push, deploy e comandos de banco no Bash
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
  # Bloqueia operações de deploy e git destrutivos
  if echo "$CMD" | grep -qiE '\bgit\s+(push|commit|reset|checkout\s+--)\b'; then
    echo "❌ BLOQUEADO [booking-engine]: Operação git não permitida: '$CMD'" >&2
    echo "   Este agent só pode rodar testes (npm run test:run) e editar BookingEngine.jsx." >&2
    echo "   Commits e pushes são feitos pelo usuário, não por agents de implementação." >&2
    exit 2
  fi

  if echo "$CMD" | grep -qiE '\bvercel\s+deploy\b'; then
    echo "❌ BLOQUEADO [booking-engine]: Deploy não é escopo deste agent." >&2
    echo "   Use o agent 'devops' para operações de deploy." >&2
    exit 2
  fi

  if echo "$CMD" | grep -qiE '\bsupabase\s+db\b|\bpsql\b'; then
    echo "❌ BLOQUEADO [booking-engine]: Operações de banco de dados não são escopo deste agent." >&2
    echo "   Use o agent 'rls-security' para SQL." >&2
    exit 2
  fi
fi

exit 0
