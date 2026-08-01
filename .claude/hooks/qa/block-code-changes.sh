#!/bin/bash
# qa: bloqueia Write e Edit completamente — QA nunca altera código
INPUT=$(cat)

PARSE=$(echo "$INPUT" | node -e "
  let b='';
  process.stdin.on('data', c => b += c);
  process.stdin.on('end', () => {
    try {
      const d = JSON.parse(b);
      const tool = d.tool_name || '';
      const file = (d.tool_input && d.tool_input.file_path) || '';
      console.log(JSON.stringify({ tool, file }));
    } catch(e) {
      console.log(JSON.stringify({ tool: '', file: '' }));
    }
  });
")

TOOL=$(echo "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).tool))")
FILE=$(echo "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).file))")

if [[ "$TOOL" == "Edit" ]]; then
  echo "❌ BLOQUEADO [qa]: O agent qa não pode editar código." >&2
  echo "   Arquivo tentado: $FILE" >&2
  echo "   Se encontrou um bug, relate qual agent deve corrigi-lo:" >&2
  echo "   booking-engine | auth-guard | notifier | rls-security | devops" >&2
  exit 2
fi

# Write é permitido apenas para o relatório smoke_test_result.md
if [[ "$TOOL" == "Write" ]]; then
  if ! echo "$FILE" | grep -qiE 'smoke_test_result\.md$'; then
    echo "❌ BLOQUEADO [qa]: Write só é permitido para Documentos/smoke_test_result.md." >&2
    echo "   Arquivo tentado: $FILE" >&2
    echo "   O qa não escreve código — apenas relatórios de qualidade." >&2
    exit 2
  fi
fi

exit 0
