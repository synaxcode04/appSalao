**Agent:** session (orchestrator + qa + devops)
**Tipo:** decisao / bug

# Deploy produção 2026-08-07 — edição de cliente no painel do dono

## Contexto
Deploy de produção aprovado explicitamente pelo usuário. Escopo: edição de cliente no painel do dono (subtítulo, modal de edição, autorização condicional via Bearer nas actions `update`/`link_to_salon` de `app/api/client-identity.js`). Branch dev em b6c28d2.

## Resultado
- pre-deploy-check: PRONTO — 171/171 testes passando, build exit 0, sem RLS `WITH CHECK (true)`, .env fora do git.
- Deploy: `vercel --prod` de `app/`. Deployment ID `dpl_3q7hoAHwK1JEMdyv4psnoN91NRA2` READY. Domínio fixo https://appsalao-psi.vercel.app servindo o build novo (HTTP 200).
- `.vercel/project.json` em `app/` confirmado apontando para projeto `appsalao` (prj_NftwDKcTjUKLt9an0GCI758cgs16).
- Autorização condicional validada: `update` sem Bearer rejeita (HTTP 400), com Bearer valida JWT do dono.

## Bug/atenção detectado (não bloqueador do deploy, mas afeta feature em prod)
Endpoints do `client-identity` que dependem de service_role (`toggle_active`, `check_active`, `link_to_salon`) retornaram HTTP 500 "Configuração do servidor ausente" em produção — indica `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` ausentes nas Environment Variables da Vercel (Production). Fix: adicionar essas vars no Vercel Dashboard → Settings → Environment Variables (Production) e redeploy. Requer os valores reais fornecidos pelo usuário. PENDENTE de confirmação/ação do usuário.

## Smoke test
Documentos/smoke_test_result.md atualizado. PWA PASS (manifest + sw). 5 dos 6 critérios exigem validação manual (agendamento sem conflito, slots, 8 notificações push, licença suspensa, RLS). Resultado geral: APROVADO COM PENDÊNCIAS MANUAIS.
