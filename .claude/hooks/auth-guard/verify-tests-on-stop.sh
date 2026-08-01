#!/bin/bash
# Stop hook: bloqueia encerramento do auth-guard se testes estiverem falhando
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT/app" 2>/dev/null || exit 0

echo "" >&2
echo "⏸  [auth-guard] Verificando testes antes de encerrar..." >&2

npm run test:run --silent 2>&1 >&2
EXIT=$?

if [ $EXIT -ne 0 ]; then
  echo "" >&2
  echo "❌ BLOQUEADO [auth-guard]: Testes falhando — encerramento negado." >&2
  echo "   Tasks 2.2 e 3.2 exigem npm run test:run com exit 0." >&2
  echo "   Corrija os erros em ProtectedRoute.test.jsx ou SuspendedScreen.test.jsx." >&2
  exit 2
fi

echo "✅ [auth-guard] Todos os testes passando — encerramento permitido." >&2
exit 0
