---
name: pre-deploy-check
description: Executa o checklist completo de pré-publicação antes de qualquer deploy na Vercel, verificando segurança, build, testes e critérios de aceitação do SPEC.
---

## O que esta skill faz

Roda uma sequência de verificações locais e reporta um checklist pass/fail. Não faz deploy — só garante que o projeto está pronto para ir a produção.

## Checklist obrigatório

Execute cada item na ordem e registre o resultado:

### 1. Segurança
- [ ] `.env` está listado no `.gitignore` raiz e no `app/.gitignore`
- [ ] `.env` **não** aparece em `git status` nem em `git ls-files app/.env`
- [ ] `app/.env.example` existe e não contém credenciais reais (sem `eyJ` ou URLs reais)
- [ ] Nenhuma política RLS usa `WITH CHECK (true)` sem JOIN com `salons` — verificar com grep:
  ```
  grep -n "WITH CHECK (true)" Documentos/schema.sql
  ```

### 2. Build
- [ ] `cd app && npm run build` encerra com exit 0
- [ ] Sem warnings de variáveis de ambiente indefinidas no output do build
- [ ] Diretório `app/dist/` foi gerado e contém `index.html`

### 3. Testes
- [ ] `cd app && npm run test:run` encerra com exit 0
- [ ] Todos os testes de smoke passam
- [ ] Nenhum teste com `skip` ou `todo` não resolvido

### 4. Decisões em aberto (do SPEC)
Leia `Documentos/SPEC.md` seção "Decisões em aberto" e verifique:
- [ ] Cada item em aberto está documentado ou tem um responsável — não bloqueiam o deploy se forem de UI/UX
- [ ] Nenhum item em aberto é um bloqueador de segurança ou funcionalidade core

### 5. Critérios de aceitação do SPEC
Leia `Documentos/SPEC.md` seção "Critérios de aceitação" e confirme que cada um pode ser verificado em produção após o deploy.

## Output esperado

Gere um relatório inline no formato:

```
PRÉ-DEPLOY CHECK — [data]

✅ .env fora do git
✅ Sem RLS permissivas
✅ Build passou (exit 0)
✅ 2/2 testes passando
⚠️  Decisão em aberto: visual do SuspendedScreen (não bloqueia deploy)
❌ npm run test:run falhou — ver erro acima

RESULTADO: BLOQUEADO / PRONTO PARA DEPLOY
```

## Quando NÃO usar

- Não substitui o smoke test em produção após o deploy — use a skill `smoke-prod` depois.
- Não use para verificar se uma feature específica está correta — use os testes unitários da feature.
- Não execute se não houver alterações desde o último deploy bem-sucedido — é redundante.
