# Teste de Regressão - 2026-08-01 (Deploy — Bloqueio pontual de horário por data)

**Data:** 2026-08-01
**Agente Executante:** orchestrator (devops + qa sub-agents)

## O que foi testado

Deploy de produção do commit `42e6e93` (topo da branch, incluindo a feature `90d26be` de
bloqueio pontual de horário por data — `time_blocks`) e regressão completa do sistema
pós-deploy via smoke test.

## Passos Reproduzidos

1. **Validação de ambiente (devops):** conferidas as env vars em Production e Preview na Vercel
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) e confirmado que `app/.env` não está rastreado.
2. **Pre-deploy check (qa):** build (`npm run build`), suite Vitest (`npm run test:run`) e
   checklist de segurança (sem RLS `WITH CHECK (true)`, sem chave server-side com prefixo `VITE_`).
3. **Deploy (devops):** `vercel --prod` a partir de `app/`, sem `git push` (decisão registrada em
   `CLAUDE.md`).
4. **Smoke test de produção (qa):** 10 verificações HTTP/API contra o ambiente real.

## Resultado

**RESULTADO GLOBAL:** PASS (Deploy concluído e estável em produção)

### Detalhamento:
- **Env vars Vercel:** ✅ PASS (todas presentes e encriptadas em Production + Preview)
- **Build:** ✅ PASS (exit 0, `dist/index.html` gerado, PWA/service worker OK)
- **Testes (Vitest):** ✅ PASS (63/63 testes, 7 arquivos, 0 skip/todo)
- **Segurança:** ✅ PASS (nenhuma RLS permissiva; RLS do papel `client` não depende de `auth.uid()`)
- **Deploy Vercel:** ✅ PASS (deployment `dpl_EWfBb4b8LggLuwJ8US23GgZv3qaz`, status READY)
- **Smoke test pós-deploy:** ✅ PASS (10/10 — SPA carrega, rewrites de rota profunda, manifest/SW
  acessíveis, `/api/notify` retorna 400 para evento desconhecido, `/api/appointments` responde)

## Evidência

- URL de produção: https://appsalao-psi.vercel.app
- Relatório de smoke test detalhado: `Documentos/smoke_test_result.md`
- Registro técnico da feature: `.claude/knowledge/2026-08-01-time-blocks-bloqueio-pontual-horario.md`

## Pendências (verificação manual — não bloqueiam, exigem estado/credenciais reais)

- Bloqueio pontual de horário end-to-end (criar bloqueio 14h-18h numa data → slot some para o cliente)
- Suspensão de licença bloqueando agendamento
- Conflito real de agendamento (double-booking)
- Múltiplos serviços em bloco contínuo
- Push real em app instalado
- Isolamento RLS entre donos de salões diferentes

## Próximos Passos

Sistema estável em produção. Recomenda-se validação manual dos cenários acima na próxima
sessão de uso real antes de considerar a feature 100% fechada.
