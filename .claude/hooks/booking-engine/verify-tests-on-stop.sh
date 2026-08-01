#!/bin/bash
# Stop hook: bloqueia encerramento do booking-engine se testes estiverem falhando
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT/app" 2>/dev/null || exit 0

echo "" >&2
echo "⏸  [booking-engine] Verificando testes antes de encerrar..." >&2

npm run test:run --silent 2>&1 >&2
EXIT=$?

if [ $EXIT -ne 0 ]; then
  echo "" >&2
  echo "❌ BLOQUEADO [booking-engine]: Testes falhando — encerramento negado." >&2
  echo "   Critério de conclusão da Task 2.1: npm run test:run com exit 0." >&2
  echo "   Corrija os erros em BookingEngine.jsx ou BookingEngine.test.jsx." >&2
  exit 2
fi

echo "✅ [booking-engine] Todos os testes passando — encerramento permitido." >&2
exit 0
