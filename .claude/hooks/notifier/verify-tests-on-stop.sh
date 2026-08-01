#!/bin/bash
# Stop hook: bloqueia encerramento do notifier se testes estiverem falhando
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT/app" 2>/dev/null || exit 0

echo "" >&2
echo "⏸  [notifier] Verificando testes antes de encerrar..." >&2

npm run test:run --silent 2>&1 >&2
EXIT=$?

if [ $EXIT -ne 0 ]; then
  echo "" >&2
  echo "❌ BLOQUEADO [notifier]: Testes falhando — encerramento negado." >&2
  echo "   Task 3.1 exige 9 testes passando (8 eventos + 1 inválido)." >&2
  echo "   Corrija os erros em notification.test.js." >&2
  exit 2
fi

echo "✅ [notifier] Todos os testes passando — encerramento permitido." >&2
exit 0
