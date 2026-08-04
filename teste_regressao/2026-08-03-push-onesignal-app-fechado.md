# Teste de Regressão - 2026-08-03 (Push OneSignal não chegava com app fechado)

**Data:** 2026-08-03
**Agente Executante:** orchestrator (notifier + code-reviewer) — validação manual pendente com usuário

## Contexto / Bug original
Push do OneSignal não chegava com o app fechado, nem para o dono nem para o cliente (agendamento não notificava o dono; cancelamento não notificava o cliente). Apenas o sininho in-app funcionava, e só com o app aberto.

**Causa raiz identificada:** o Service Worker do OneSignal era registrado implicitamente pelo SDK, depois do bundle JS carregar — e podia perder a corrida contra o registro/ativação do Service Worker do Workbox (PWA), impedindo o handshake `pushManager → FCM → token` de completar. Isso acontecia mesmo com a permissão de notificação concedida (`optedIn = true`), por isso o app mostrava "notificações já ativadas" enquanto o painel do OneSignal mostrava "Never Subscribed / No Push Token".

## Correção aplicada
- `app/index.html`: registro explícito e síncrono do SW do OneSignal (`/onesignal/OneSignalSDKWorker.js`, scope `/onesignal/`) antes do bundle JS e do SDK do OneSignal carregarem.
- `app/src/pages/owner/Settings.jsx` e `app/src/pages/client/ClientProfile.jsx`: verificação de "já ativado" agora exige token real (`optedIn && (token || id)`), não só `optedIn`. Se não houver token, tenta `requestPermission()` novamente e avisa via toast (com o erro real, se houver) caso o token ainda não seja gerado após ~1.5s.
- Commit local: `1d25ace`.
- Deploy: `vercel --prod` a partir de `app/`, aliased em `https://appsalao-psi.vercel.app` (exit 0, build limpo, 106 testes Vitest passando antes do commit).

## Passos para reproduzir e validar (a fazer pelo usuário)

1. **Dono:**
   - Abrir `https://appsalao-psi.vercel.app` (painel do dono) no celular, ir em **Configurações**.
   - Clicar em **"Ativar Notificações"** (mesmo que já apareça "já ativadas" — clicar de novo força a nova verificação).
   - Verificar no [painel do OneSignal](https://onesignal.com) → Audience → Subscriptions se o dispositivo aparece como **"Subscribed"** (não "Never Subscribed / No Push Token").
2. **Cliente:**
   - Acessar o link do salão como cliente, ir em **Meu Perfil**, clicar em **"Ativar Notificações"**.
   - Confirmar "Subscribed" no OneSignal também para esse dispositivo/`external_id`.
3. **Teste ponta a ponta — app fechado:**
   - Fechar completamente o app/aba no celular do dono.
   - Como cliente, criar um novo agendamento.
   - Verificar se o **dono recebe o push** mesmo com o app fechado.
   - Fechar completamente o app do cliente.
   - Como dono, cancelar o agendamento criado.
   - Verificar se o **cliente recebe o push** mesmo com o app fechado.

## Resultado
**RESULTADO GLOBAL:** ⬜ PENDENTE (aguardando validação manual do usuário em produção)

### Detalhamento (preencher após teste):
- Dono aparece "Subscribed" no OneSignal após clicar em Ativar Notificações: ⬜ PASS / ⬜ FAIL
- Cliente aparece "Subscribed" no OneSignal após clicar em Ativar Notificações: ⬜ PASS / ⬜ FAIL
- Push chega ao dono (app fechado) ao criar agendamento: ⬜ PASS / ⬜ FAIL
- Push chega ao cliente (app fechado) ao cancelar agendamento: ⬜ PASS / ⬜ FAIL

## Evidência
_(anexar prints do OneSignal e/ou da notificação recebida no celular)_

## Se FAIL — causa raiz e próxima correção
_(preencher se algum passo falhar — provável próximo passo seria capturar o console real do dispositivo via `chrome://inspect`, tentativa que não foi concluída durante esta investigação por dificuldade de autorização USB)_
