# Teste de Regressão - 2026-08-01 (Planos de assinatura)

**Data:** 2026-08-01
**Agente Executante:** _(a preencher — teste a ser rodado manualmente pelo usuário via Gemini/Antigravity)_
**Status:** ROTEIRO PREPARADO — ainda NÃO executado.

## O que será testado

Fluxo end-to-end da feature "Planos de assinatura" do App Salão:
- CRUD de planos pelo dono (criar, editar, ativar/desativar, excluir), incluindo cota por
  serviço por ciclo e dias da semana permitidos.
- Assinatura, uso e cancelamento pelo cliente na área do salão (`/s/:slug/planos`), via Vercel
  Function `service_role`.
- Regra de cota: janela rolante de 30 dias a partir da data de assinatura (`started_at`), sem
  acúmulo entre ciclos; bloqueio ao esgotar; anti-bypass em agendamento multi-serviço.
- Regra de dias: agendar em dia não permitido → alerta não-bloqueante e tratamento como avulso.
- Isolamento multi-tenant (plano/cota por salão; cancelamento exige `salon_id`).
- Cancelamento não altera agendamentos futuros já marcados.

**Pré-requisitos do ambiente:**
- Um salão ativo (licença não suspensa) com pelo menos 2 serviços cadastrados (ex.: "Corte" e
  "Barba") e horário de funcionamento configurado.
- Um segundo salão ativo (salão B) para o teste de isolamento multi-tenant.
- Identidade de cliente por telefone (sessão leve) — sem Supabase Auth.
- Tabelas presentes: `subscription_plans`, `subscription_plan_services`, `client_subscriptions`.

---

## Passos a reproduzir

### Bloco 1 — Dono: CRUD do plano

1. Logar como **dono** do salão A e abrir o painel de planos de assinatura.
2. **Criar plano:** nome (ex.: "Plano Barba VIP"), preço, descrição/vantagens, adicionar serviço
   "Barba" com cota = **2** por ciclo, e marcar dias permitidos = **seg a sex** (excluir sáb/dom).
   Salvar.
   - **Aceitação:** plano aparece na listagem do dono com os dados salvos; serviço "Barba"
     vinculado com cota 2; dias permitidos seg–sex registrados.
3. **Editar plano:** alterar preço e a cota da "Barba" para **3**; salvar.
   - **Aceitação:** os novos valores persistem após recarregar a página.
4. **Desativar plano:** marcar como inativo.
   - **Aceitação:** plano deixa de ser ofertado ao cliente em `/s/:slug/planos` (ver Bloco 2),
     mas assinaturas já existentes não são apagadas.
5. **Reativar plano** e voltar cota da "Barba" a **2** (baseline para os testes de cota abaixo).
   - **Aceitação:** volta a ser ofertado ao cliente.
6. **Excluir plano (verificação isolada, ao final de tudo — ver Bloco 7):** deixado por último
   para não invalidar os demais blocos.

### Bloco 2 — Cliente: ver, assinar e ver uso

7. Acessar como **cliente** (telefone) a área pública do salão A: `/s/:slug/planos`.
   - **Aceitação:** os planos **ativos** do salão A aparecem com nome, preço, descrição/vantagens
     e serviços/cotas; planos inativos não aparecem.
8. **Assinar** o "Plano Barba VIP".
   - **Aceitação:** a escrita ocorre via **Vercel Function `service_role`** (não via
     `supabase.from(...)` direto do frontend — conferir na aba Network que a chamada vai para o
     endpoint `/api/...` de assinatura, e não para o PostgREST do Supabase). A assinatura passa a
     constar como ativa; `client_subscriptions.started_at` = data/hora da assinatura.
9. Observar o **contador de uso** do serviço "Barba" no ciclo atual.
   - **Aceitação:** exibe algo como "0 de 2 usados neste ciclo" (ciclo de 30 dias a partir de
     `started_at`).

### Bloco 3 — Regra de cota (esgotamento e bloqueio)

10. Como cliente, agendar "Barba" em um **dia permitido** (seg–sex) dentro do ciclo. Repetir até
    consumir a cota (2 agendamentos de "Barba").
    - **Aceitação:** contador vai para "1 de 2" e depois "2 de 2"; cada agendamento coberto
      desconta 1 da cota.
11. Tentar agendar uma **3ª "Barba"** ainda dentro do ciclo.
    - **Aceitação:** o sistema **bloqueia** com mensagem equivalente a
      **"Cota do plano esgotada... no ciclo atual"**. O agendamento não é criado.
12. **Anti-bypass multi-serviço:** montar um agendamento de **múltiplos serviços** onde a "Barba"
    NÃO está na primeira posição (ex.: "Corte" + "Barba", com a Barba em 2ª posição), começando um
    ciclo novo/uma assinatura com cota disponível.
    - **Aceitação:** a "Barba" em posição 1+ **também consome a cota** — não há brecha por
      posicioná-la fora da primeira posição. Se a cota já estiver esgotada, o bloco multi-serviço é
      bloqueado pela parte da "Barba".

### Bloco 4 — Ciclo conta da data de assinatura (não mês-calendário)

13. Verificar a janela do ciclo: com `started_at` conhecido (ex.: assinou dia 15), confirmar que a
    cota vale até 30 dias depois (dia ~14/15 do mês seguinte), e **não** reinicia na virada do mês
    calendário.
    - **Aceitação:** um agendamento feito no dia 1 do mês seguinte (ainda dentro dos 30 dias da
      assinatura) **ainda conta** no mesmo ciclo; a cota só reinicia após completar 30 dias de
      `started_at`. Não há saldo acumulado do ciclo anterior.
    - _(Se não for possível avançar o relógio, validar pela contagem derivada: confirmar que a
      contagem considera `now - started_at < 30 dias` e não `month(now)`.)_

### Bloco 5 — Regra de dias (fora dos dias permitidos → avulso)

14. Como cliente com assinatura ativa e cota **disponível**, tentar agendar "Barba" em um **dia NÃO
    permitido** pelo plano (ex.: sábado).
    - **Aceitação:** o BookingEngine exibe um **alerta não-bloqueante** informando que o dia está
      fora dos dias do plano; o agendamento **prossegue como avulso** — **não** desconta cota e
      **não** é bloqueado. O contador de uso permanece inalterado após esse agendamento.

### Bloco 6 — Isolamento multi-tenant

15. Com o mesmo cliente (mesmo telefone), acessar a área do **salão B** (`/s/:slugB/planos`).
    - **Aceitação:** o cliente **não** tem plano nem cota no salão B; a assinatura do salão A não
      aparece nem influencia o salão B. Agendar "Barba" no salão B é tratado sem cota (avulso),
      independentemente da cota esgotada no salão A.
16. **Cancelamento exige `salon_id`:** cancelar a assinatura do cliente.
    - **Aceitação:** o cancelamento é escopado ao salão (a chamada carrega `salon_id`); cancelar no
      salão A não afeta nenhum vínculo em outro salão. (Conferir na aba Network que a requisição de
      cancelamento inclui `salon_id`.)

### Bloco 7 — Cancelamento não altera agendamentos futuros + exclusão do plano

17. Antes de cancelar, ter pelo menos **1 agendamento futuro** de "Barba" já marcado com o plano.
18. **Cancelar** a assinatura (testar tanto pelo **cliente** quanto — em outra rodada — pelo
    **dono**).
    - **Aceitação:** a assinatura fica inativa/cancelada, mas **os agendamentos futuros já marcados
      permanecem intactos** (o sistema não cancela, não remarca nem altera nada automaticamente). O
      dono continua podendo gerenciá-los manualmente no painel.
19. **Excluir plano** (Bloco 1, passo 6): como dono, excluir um plano.
    - **Aceitação:** o plano some da oferta; comportamento com assinaturas/históricos existentes
      condiz com a decisão de produto (não deve corromper histórico de agendamentos já realizados).

---

## Critérios de aceitação (resumo — o que caracteriza PASS)

- **CRUD do dono:** criar/editar/ativar/desativar/excluir refletem corretamente na oferta ao
  cliente; cota e dias permitidos persistem.
- **Assinatura:** cliente assina via Vercel Function `service_role` (nunca RLS/`auth.uid()`);
  `started_at` correto; contador de uso visível.
- **Cota:** desconta a cada serviço coberto; bloqueia ao esgotar ("Cota do plano esgotada... no
  ciclo atual"); ciclo = 30 dias rolantes de `started_at`, sem acúmulo; serviço coberto em posição
  1+ de multi-serviço também consome cota (anti-bypass).
- **Dias:** fora dos dias permitidos → alerta não-bloqueante + agendamento avulso (não desconta,
  não bloqueia).
- **Multi-tenant:** plano/cota isolados por salão; cancelamento exige `salon_id`.
- **Cancelamento:** por cliente ou dono; não altera agendamentos futuros já marcados (sem
  automação).

---

## Resultado: [ ] PASS  [ ] FAIL — preencher após execução

_(Preencher por bloco após rodar. Se FAIL: registrar bloco/passo, comportamento observado,
evidência — print/log/aba Network — e, após correção, causa raiz e fix aplicado.)_

| Bloco | Item | Resultado | Observações |
|-------|------|-----------|-------------|
| 1 | CRUD do dono | [ ] PASS / [ ] FAIL | |
| 2 | Ver/assinar/uso | [ ] PASS / [ ] FAIL | |
| 3 | Cota (bloqueio + anti-bypass) | [ ] PASS / [ ] FAIL | |
| 4 | Ciclo 30 dias rolante | [ ] PASS / [ ] FAIL | |
| 5 | Dias permitidos (avulso) | [ ] PASS / [ ] FAIL | |
| 6 | Isolamento multi-tenant | [ ] PASS / [ ] FAIL | |
| 7 | Cancelamento + exclusão | [ ] PASS / [ ] FAIL | |

**RESULTADO GLOBAL:** [ ] PASS  [ ] FAIL — _(a preencher)_

## Evidência

_(a preencher — prints/logs/aba Network por bloco)_
