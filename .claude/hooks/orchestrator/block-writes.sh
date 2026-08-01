#!/bin/bash
# Orchestrator é somente leitura — bloqueia Write, Edit e Bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | node -e "
  let b='';
  process.stdin.on('data', c => b += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(b).tool_name || ''); }
    catch(e) { console.log(''); }
  });
")

case "$TOOL" in
  Write|Edit|Bash)
    echo "❌ BLOQUEADO [orchestrator]: O orchestrator é somente leitura e não pode usar '$TOOL'." >&2
    echo "   Delegue a implementação para o agent correto:" >&2
    echo "   • booking-engine  → BookingEngine.jsx e testes" >&2
    echo "   • auth-guard      → ProtectedRoute, SuspendedScreen" >&2
    echo "   • notifier        → eventos de push" >&2
    echo "   • rls-security    → SQL de segurança" >&2
    echo "   • devops          → configuração Vercel" >&2
    echo "   • qa              → verificação de qualidade" >&2
    exit 2
    ;;
esac

exit 0
