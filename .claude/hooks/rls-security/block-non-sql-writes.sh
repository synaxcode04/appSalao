#!/bin/bash
# rls-security só pode escrever .sql — bloqueia Edit e Write em qualquer outro tipo
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

# Edit é bloqueado completamente — rls-security nunca edita arquivos existentes
if [ "$TOOL" = "Edit" ]; then
  echo "❌ BLOQUEADO [rls-security]: Edição de arquivos não é permitida." >&2
  echo "   Use Write para criar Documentos/rls_fix.sql do zero." >&2
  echo "   Nunca edite código JavaScript ou arquivos existentes." >&2
  exit 2
fi

# Write só é permitido em arquivos .sql
if [ "$TOOL" = "Write" ]; then
  if [[ "$FILE" != *.sql ]]; then
    echo "❌ BLOQUEADO [rls-security]: Escrita em '$FILE' não permitida." >&2
    echo "   Este agent só pode escrever arquivos .sql (ex: Documentos/rls_fix.sql)." >&2
    echo "   Ele não modifica JavaScript, JSX ou qualquer outro tipo de arquivo." >&2
    exit 2
  fi
fi

# Bash não está no toolset mas por segurança extra
if [ "$TOOL" = "Bash" ]; then
  echo "❌ BLOQUEADO [rls-security]: Execução de shell não é permitida." >&2
  echo "   Apenas gere o arquivo SQL — a execução no banco é responsabilidade do usuário." >&2
  exit 2
fi

exit 0
