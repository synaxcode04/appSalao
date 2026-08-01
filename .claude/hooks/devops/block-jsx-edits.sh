#!/bin/bash
# devops: bloqueia edição/escrita de componentes React (.jsx, .tsx, .js em src/)
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

if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" ]]; then
  # Bloqueia arquivos React/source (componentes, pages, layouts, utils)
  if echo "$FILE" | grep -qiE '\.(jsx|tsx)$|/src/(components|pages|layouts|utils)/'; then
    echo "❌ BLOQUEADO [devops]: Edição de código fonte React não é permitida." >&2
    echo "   Arquivo bloqueado: $FILE" >&2
    echo "   devops só pode modificar arquivos de configuração:" >&2
    echo "   vercel.json, .env.example, vite.config.js (apenas bloco de build)" >&2
    exit 2
  fi
fi

exit 0
