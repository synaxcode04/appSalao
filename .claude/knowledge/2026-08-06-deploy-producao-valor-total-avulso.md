# Deploy de produção — Valor total avulso em cards de plano

**Agent:** session (orchestrator + qa + devops)

**Tipo:** decisão

## Descrição

Deploy de produção do commit 50b396c — adição da linha "Valor total avulso: R$ XXX,XX" nos cards de plano de assinatura, tanto em `PlansManager` (painel do dono) quanto em `ClientPlans` (cliente).

## Pre-deploy check (QA)

**Status:** APROVADO

- Build ok — `vite build` sem erros
- Testes: 146/146 Vitest passando
- Segurança: `app/.env` fora do git
- Estrutura: sem duplicação de `api/`, `vercel.json`, `package.json` na raiz

## Deploy

- **Comando:** `vercel --prod` a partir da raiz
- **Status:** Ready
- **Deployment ID:** dpl_E3yWvHB1t7Yn3CPpBwW9Sw5Pb9Uv
- **URL de produção FIXA:** https://appsalao-psi.vercel.app (não usar alias temporário)

## Smoke test (QA)

**Status:** APROVADO

- Homepage: HTTP 200
- PWA: manifest e service worker funcionais
- API: `/api/notify` retorna 400 para evento desconhecido (sem 500/404 generalizado)
- SPA routes: funcionais

### Validação de features

As 4 linhas de texto dos cards de plano foram validadas:

1. Preço riscado (antigo)
2. Preço do plano (novo)
3. "Economize R$ X por mês"
4. **"Valor total avulso: R$ XXX,XX"** (nova)

Localização em código:
- `PlansManager.jsx` linhas 753-756
- `ClientPlans.jsx` linhas 436-439

Todos os testes passando — nenhuma regressão detectada.

Relatório completo em: `Documentos/smoke_test_result.md`
