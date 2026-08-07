#!/bin/bash
# devops: bloqueia vercel deploy e git force-push sem confirmação explícita do usuário
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
  # Bloqueia qualquer invocação do binário vercel que não seja consulta pura (deploy, --prod,
  # bare "vercel", "vercel link" etc. todos disparam deploy ou criam/linkam projeto novo) —
  # requer confirmação explícita do usuário. Incidente 2026-08-07: "vercel" bare rodado dentro
  # de app/ sem link criou um projeto Vercel novo e não intencional ("app").
  if echo "$CMD" | grep -qiE '(^|[;&|]|\bnpx\s+)vercel(\.exe)?\b'; then
    if ! echo "$CMD" | grep -qiE '\bvercel\s+(logs|ls|list|inspect|env\s+ls|whoami|--version|-v)\b'; then
      echo "❌ BLOQUEADO [devops]: comandos 'vercel' (deploy, --prod, ou bare) requerem confirmação explícita do usuário." >&2
      echo "   Relate os resultados das verificações e peça ao usuário para autorizar o deploy." >&2
      echo "   Instrução do PLAN.md: confirme .env, build e variaveis ANTES de fazer deploy." >&2
      exit 2
    fi
  fi

  # Bloqueia git push --force
  if echo "$CMD" | grep -qiE '\bgit\s+push\s+.*--force\b|\bgit\s+push\s+.*-f\b'; then
    echo "❌ BLOQUEADO [devops]: git push --force é proibido." >&2
    echo "   Nunca force-push em branches compartilhados." >&2
    exit 2
  fi

  # Bloqueia git rm --cached .env sem confirmação (seria feito pelo usuário)
  if echo "$CMD" | grep -qiE '\bgit\s+rm\s+.*\.env\b'; then
    echo "❌ BLOQUEADO [devops]: Remoção do .env do git requer confirmação do usuário." >&2
    echo "   Relate a situação e instrua o usuário a executar: git rm --cached app/.env" >&2
    exit 2
  fi
fi

exit 0
