#!/bin/bash
# notifier: bloqueia git push, deploy e chamadas diretas à API do OneSignal
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
  if echo "$CMD" | grep -qiE '\bgit\s+(push|commit|reset)\b'; then
    echo "❌ BLOQUEADO [notifier]: Operação git não permitida: '$CMD'" >&2
    echo "   Este agent foca em notification.js, notify.js e seus testes." >&2
    exit 2
  fi

  if echo "$CMD" | grep -qiE '\bvercel\s+deploy\b'; then
    echo "❌ BLOQUEADO [notifier]: Deploy não é escopo deste agent. Use 'devops'." >&2
    exit 2
  fi

  # Bloqueia chamadas diretas à API do OneSignal (não deve ocorrer fora de testes mockados)
  if echo "$CMD" | grep -qiE 'onesignal\.com|api\.onesignal|curl.*onesignal'; then
    echo "❌ BLOQUEADO [notifier]: Chamadas diretas à API do OneSignal são proibidas." >&2
    echo "   Em testes use vi.fn() para mockar fetch. Em produção, o fluxo passa por /api/notify." >&2
    exit 2
  fi
fi

exit 0
