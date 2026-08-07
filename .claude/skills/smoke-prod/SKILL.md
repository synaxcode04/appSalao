---
name: smoke-prod
description: Executa o smoke test manual em produção após um deploy, verificando os 6 critérios de aceitação do SPEC no ambiente real e gerando o relatório em Documentos/smoke_test_result.md.
---

## O que esta skill faz

Guia o teste manual dos fluxos críticos na URL de produção (`https://appsalao-psi.vercel.app`) e registra o resultado de cada critério de aceitação do SPEC em `Documentos/smoke_test_result.md`.

## Pré-requisitos

- Deploy concluído na Vercel
- Acesso a uma conta de dono de salão de teste e uma de cliente de teste
- Acesso ao painel do Supabase para confirmar dados no banco

## Os 6 critérios de aceitação a verificar

Leia `Documentos/SPEC.md` seção "Critérios de aceitação" antes de iniciar. Os critérios são:

1. **Agendamento sem conflito** — dois agendamentos sobrepostos no mesmo profissional são rejeitados
2. **Slots corretos** — horários exibidos refletem a duração do serviço e os horários de funcionamento
3. **Notificações disparadas** — cada um dos 7 eventos entrega push em até 30 segundos
4. **Licença controlada** — salão suspenso bloqueia painel e página pública
5. **PWA instalável** — app pode ser instalado via Chrome no Android sem erro
6. **RLS correta** — dono autenticado não altera dados de outro salão

## Fluxo de teste manual

### Critério 1 e 2 — Agendamento
1. Acesse `/:slug` de um salão de teste
2. Agende um serviço em um horário específico (ex: 10:00)
3. Tente agendar outro serviço no mesmo horário com o mesmo profissional
4. Verifique no Supabase: apenas 1 registro em `appointments` para aquele slot
5. Verifique que o horário 10:00 não aparece mais como disponível

### Critério 3 — Notificações
Acione cada evento e verifique no dispositivo:
- Novo agendamento → dono recebe push
- Cliente cancela → dono recebe push
- Dono cancela → cliente recebe push
(registre quais eventos foram testados e quais passaram)

### Critério 4 — Licença
1. No painel admin, marque um salão de teste como `is_active = false`
2. Acesse o painel do dono → deve exibir SuspendedScreen
3. Acesse `/:slug` do salão → deve exibir SuspendedScreen

### Critério 5 — PWA
1. Acesse a URL no Chrome (Android ou desktop)
2. Verifique se o banner de instalação aparece ou se o ícone de install está na barra de endereços
3. Instale e confirme que abre em modo standalone (sem barra do browser)

### Critério 6 — RLS
1. Logado como dono do salão A, tente via Supabase JS inserir um serviço com `salon_id` do salão B
2. Confirme que a operação retorna erro de RLS

## Output

Salve o resultado em `Documentos/smoke_test_result.md`:

```markdown
# Smoke Test — Produção
Data: YYYY-MM-DD
Deploy: [URL ou hash do deploy]

| Critério | Resultado | Observação |
|----------|-----------|------------|
| Agendamento sem conflito | ✅ PASS / ❌ FAIL | |
| Slots corretos | ✅ PASS / ❌ FAIL | |
| Notificações (X/7 eventos) | ✅ PASS / ❌ FAIL | |
| Licença controlada | ✅ PASS / ❌ FAIL | |
| PWA instalável | ✅ PASS / ❌ FAIL | |
| RLS correta | ✅ PASS / ❌ FAIL | |

**Resultado geral: APROVADO / REPROVADO**
```

## Quando NÃO usar

- Não use em ambiente de desenvolvimento local — esta skill é exclusiva para produção pós-deploy.
- Não substitui os testes unitários — é complementar, não alternativa.
- Não use para testar uma feature isolada — use os testes unitários da feature específica.
