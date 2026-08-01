#!/bin/bash
# code-reviewer é ESTRITAMENTE somente leitura — bloqueia qualquer tentativa de modificar o projeto
INPUT=$(cat)

PARSE=$(echo "$INPUT" | node -e "
  let b='';
  process.stdin.on('data', c => b += c);
  process.stdin.on('end', () => {
    try {
      const d = JSON.parse(b);
      const tool = d.tool_name || '';
      const file = (d.tool_input && d.tool_input.file_path) || '';
      const cmd  = (d.tool_input && d.tool_input.command)   || '';
      console.log(JSON.stringify({ tool, file, cmd }));
    } catch(e) {
      console.log(JSON.stringify({ tool: '', file: '', cmd: '' }));
    }
  });
")

TOOL=$(echo "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).tool))")
FILE=$(echo "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).file))")
CMD=$(echo  "$PARSE" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>console.log(JSON.parse(b).cmd))")

case "$TOOL" in
  Write)
    echo "❌ BLOQUEADO [code-reviewer]: Write não é permitido." >&2
    echo "   Arquivo tentado: $FILE" >&2
    echo "   O code-reviewer apenas identifica e reporta — nunca corrige." >&2
    echo "   Delegue correções ao agent responsável pelo domínio." >&2
    exit 2
    ;;
  Edit)
    echo "❌ BLOQUEADO [code-reviewer]: Edit não é permitido." >&2
    echo "   Arquivo tentado: $FILE" >&2
    echo "   Classifique o problema como BLOQUEANTE / IMPORTANTE / SUGESTÃO e reporte." >&2
    exit 2
    ;;
  Bash)
    echo "❌ BLOQUEADO [code-reviewer]: Bash não é permitido." >&2
    echo "   Comando tentado: $CMD" >&2
    echo "   O code-reviewer usa apenas Read, Glob e Grep para leitura estática." >&2
    exit 2
    ;;
esac

exit 0
