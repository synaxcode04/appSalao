# Correção do pipeline embed.ts (ingestão RAG)

**Agent:** devops
**Tipo:** correcao

## Contexto

O script `.claude/scripts/embed.ts` nunca havia funcionado antes. Ao rodá-lo pela primeira vez para indexar a base de conhecimento RAG (`rag.db`), quatro problemas distintos impediram a execução. Todos foram corrigidos e o pipeline passou a funcionar. Este documento registra cada problema e sua solução.

## Problema 1 — `tsx` fora do PATH

O comando `tsx embed.ts` falhava porque o `tsx` não está instalado globalmente nem disponível no PATH do ambiente.

**Solução:** invocar o binário local instalado em `.claude/scripts/node_modules/.bin/tsx`, ou alternativamente `npx tsx`. O comando canônico de indexação passou a ser:

```
.claude/scripts/node_modules/.bin/tsx .claude/scripts/embed.ts --file=<caminho>
```

## Problema 2 — Dependências nativas incompatíveis com Node v24

As dependências nativas do projeto não tinham binários compatíveis com o Node v24 do ambiente, e a compilação C++ falhava por ausência do Visual Studio (toolchain de build nativo no Windows).

**Solução — reinstalação das seguintes dependências:**
- `better-sqlite3`: atualizado de v9 para v12, para usar binário pré-compilado e evitar a compilação C++ que exigiria Visual Studio.
- `sqlite-vec@0.1.6` junto com `sqlite-vec-windows-x64@0.1.6` (extensão nativa da plataforma).
- Binário `sharp` para `win32-x64`.

## Problema 3 — Import do sqlite-vec

A linha `import sqliteVec from 'sqlite-vec'` (default import) falhava, pois o pacote só expõe named exports no ESM — não há default export.

**Solução:** trocado para namespace import em `embed.ts`:

```
import * as sqliteVec from 'sqlite-vec'
```

## Problema 4 — Rowid na vtable vec0

A inserção na tabela virtual `vec_knowledge` (vtable vec0) usando `result.lastInsertRowid as number` falhava, porque a vec0 exige rowid do tipo INTEGER/BigInt e o valor precisava ser convertido explicitamente.

**Solução:** em `embed.ts`, passar o rowid como BigInt:

```
BigInt(result.lastInsertRowid)
```

## Pendência — loop de inserção não transacional

O loop que insere os chunks em `knowledge` e `vec_knowledge` **não é transacional**. Quando um chunk falhava no meio do processamento, a linha já inserida em `knowledge` ficava órfã (sem o vetor correspondente em `vec_knowledge`), gerando inconsistência entre as duas tabelas. Essas linhas órfãs foram limpas manualmente.

**Melhoria futura (não implementada agora):** envolver o loop de inserção em uma transação, de modo que uma falha em qualquer chunk faça rollback de tudo e mantenha `knowledge` e `vec_knowledge` sempre consistentes.
