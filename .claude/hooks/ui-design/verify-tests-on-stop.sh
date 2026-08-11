#!/bin/bash
# Stop hook: bloqueia encerramento do ui-design se testes estiverem falhando
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT/app" 2>/dev/null || exit 0

echo "" >&2
echo "⏸  [ui-design] Verificando testes antes de encerrar..." >&2

npm run test:run --silent 2>&1 >&2
EXIT=$?

if [ $EXIT -ne 0 ]; then
  echo "" >&2
  echo "❌ BLOQUEADO [ui-design]: Testes falhando — encerramento negado." >&2
  echo "   Corrija os erros nos componentes do módulo cliente antes de encerrar." >&2
  exit 2
fi

echo "✅ [ui-design] Todos os testes passando — encerramento permitido." >&2
exit 0
