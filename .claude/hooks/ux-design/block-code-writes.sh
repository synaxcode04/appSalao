#!/bin/bash
# ux-design é consultivo — bloqueia Edit e Bash. Write só é permitido em Documentos/*.md (relatórios/specs).
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

if [ "$TOOL" = "Edit" ]; then
  echo "❌ BLOQUEADO [ux-design]: Edição de código não é permitida." >&2
  echo "   Arquivo tentado: $FILE" >&2
  echo "   ux-design apenas recomenda — a mudança é aplicada por ui-design ou pelo agent de frontend responsável pela tela." >&2
  exit 2
fi

if [ "$TOOL" = "Bash" ]; then
  echo "❌ BLOQUEADO [ux-design]: Execução de shell não é permitida." >&2
  echo "   Comando tentado: $CMD" >&2
  echo "   Este agent usa apenas Read, Glob, Grep e Write (para relatórios em Documentos/)." >&2
  exit 2
fi

exit 0
