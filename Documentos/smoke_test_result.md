# Smoke Test — Produção

**Data:** 2026-08-03  
**Deploy:** https://appsalao-psi.vercel.app  
**Vercel Status:** Ready (HTTP 200 ✅)  
**Commits Deployados:** 
  - 99711c3 (fix: push OneSignal não chegava — Service Worker scope + client_id)
  - a6ffcd5 (fix: sininho in-app do cliente não recebia notificação — RLS + Realtime)

---

## Resumo Executivo

**RESULTADO GERAL: PENDENTE — Aguardando Testes Manuais**

Verificações automatizáveis (deploy, PWA, assets) **passaram ✅**. Dois bugfixes críticos foram deployados:
1. Push do OneSignal não chegava (scope de Service Worker + client_id nunca registrado)
2. Sininho in-app do cliente bloqueado (RLS impedia INSERT de notificação + Realtime sem auth.uid())

**Este smoke test aguarda execução manual dos 6 critérios, com foco especial em:**
- **Evento 3 (dono cancela → sininho cliente)** — valida fix a6ffcd5
- **Notificações push** — valida fix 99711c3

---

## Verificações Automatizáveis (Executadas com Sucesso)

| Item | Resultado | Evidência |
|------|-----------|-----------|
| Deploy servindo HTTP 200 | ✅ PASS | `curl -s https://appsalao-psi.vercel.app` → 200 |
| Manifest PWA acessível | ✅ PASS | `/manifest.json` retorna JSON válido (`display: standalone`, icons, start_url) |
| Service Worker acessível | ✅ PASS | `/sw.js` → HTTP 200 (Workbox precache + navigation route) |
| React app renderizando | ✅ PASS | Root `<div id="root">` presente, título "appSalão" renderizado |

---

## Detalhes por Critério — Testes Manuais Necessários

### Critério 1 e 2: Agendamento sem conflito + Slots corretos

**Objetivo:** Validar:
- Horários exibidos respeitam duração do serviço e horários de funcionamento
- Dois agendamentos sobrepostos no mesmo profissional são rejeitados
- Intervalo de almoço é respeitado

**Pré-requisitos:**
- Estar logado como **DONO** em `https://appsalao-psi.vercel.app/painel` (email/senha)
- Ter 1+ serviço cadastrado (ex: "Corte — 60 min")
- Ter 1+ profissional cadastrado
- Horários configurados (ex: seg-sex 09:00-18:00, almoço 12:00-13:00)

**Passos:**

1. Abra link público do salão: `https://appsalao-psi.vercel.app/s/[seu-slug]`
   - Deve exibir serviços e botão "Agendar"

2. Selecione o serviço "Corte — 60 min"
   - Escolha uma data futura (ex: amanhã)
   - Verifique horários disponíveis:
     - Não incluem período de almoço (ex: se 12:00-13:00, não pode haver 12:00)
     - Respeitam duração (se termina 17:00, não pode haver slot 17:00)

3. **Agende em 10:00** (preenchendo telefone, nome)
   - Confirme com "Confirmar agendamento"
   - Aguarde mensagem: "Seu agendamento foi confirmado para 10:00"

4. **Recarregue a página** (F5)
   - Slot 10:00 **deve desaparecer** da lista de disponíveis
   - Slots vizinhos (09:00, 11:00) devem permanecer

5. **Tente agendar novamente em 10:00** (nova aba/sessão, simulando outro cliente)
   - Sistema deve rejeitar: "Desculpe, este horário não está mais disponível"

6. **Valide no Supabase Dashboard:**
   - Tabela `appointments` → confirme 1 registro (não 2) para aquele slot
   - Campo `status = 'scheduled'`, `professional_id` preenchido

**Marque como:**
- ✅ PASS: Se horários respeitam duração/almoço, segundo agendamento foi rejeitado, apenas 1 registro no banco
- ❌ FAIL: Se aparecem 2 registros, ou horários incorretos, ou agendamento duplicado foi aceito

---

### Critério 3: Notificações Disparadas (8 Eventos) — FOCO CRÍTICO

**Objetivo:** Validar 8 eventos de notificação, com atenção especial no **Evento 3** (dono cancela → sininho cliente chega em até 45s, SEM erro no console).

**Pré-requisitos:**
- 2 sessões abertas:
  - **DONO:** `https://appsalao-psi.vercel.app/painel` (logado com email/senha)
  - **CLIENTE:** `https://appsalao-psi.vercel.app/s/[slug]` (identidade por telefone)
- OneSignal carregado (check: sem erro 404 em script)
- Agendamento futuro já criado

**Eventos a testar (em ordem):**

#### Evento 1: Novo agendamento → DONO recebe push

1. Como CLIENTE, em `/s/[slug]`, agende um serviço (ex: amanhã 14:00)
2. Confirme e aguarde mensagem de sucesso
3. **Como DONO** (aba `/painel`), verifique em até 45 segundos:
   - Push do navegador (canto inferior direito): "Novo agendamento..."
   - OU sininho in-app (ícone de sino no topo do painel) piscar

**Resultado:** ✅ PASS ou ❌ FAIL com descrição do tempo e tipo de notificação recebida

---

#### Evento 2: Cliente cancela → DONO recebe push

1. Como CLIENTE, acesse "Meus agendamentos" (seção de histórico/futuro)
2. Localize o agendamento criado em Evento 1
3. Clique "Cancelar" e confirme
4. **Como DONO** (painel), verifique em até 45 segundos:
   - Push ou sininho: "Cliente X cancelou agendamento..."

**Resultado:** ✅ PASS ou ❌ FAIL

---

#### Evento 3: Dono cancela → CLIENTE recebe notificação (CRÍTICO — recentemente corrigido em a6ffcd5)

**Este é o teste crítico para validar o fix do sininho in-app + RLS.**

1. Como DONO, em `/painel`, localize um agendamento futuro (ou crie um novo rápido)
2. Clique no agendamento → "Cancelar" e confirme

3. **Como CLIENTE** (aba `/s/[slug]`), em paralelo:
   - Abra DevTools: `F12` → aba **Console**
   - **Aguarde até 45 segundos**
   - Procure por sininho **piscando discretamente** no canto superior direito
   - Verifique que **NÃO há erro** de console relacionado a:
     - `Realtime` (ex: "cannot read property of null")
     - `client_id` (ex: "undefined client_id")
     - `RLS` (ex: "permission denied")

**Sinais de sucesso:**
- ✅ Sininho pisca no canto superior
- ✅ Nenhum erro no console
- ✅ Se recarregar a página de agendamentos do cliente, vê agendamento cancelado

**Sinais de falha:**
- ❌ Sininho não aparece após 45s
- ❌ Error no console: `Realtime subscription failed`, `Cannot read property 'client_id'`, etc.
- ❌ Agendamento ainda aparece como "scheduled" na lista do cliente

**Para este teste, registre:**
- Tempo entre cancelamento do dono e sininho do cliente (ex: "20 segundos")
- Tipo de notificação (sininho in-app / push / ambos / nenhuma)
- Erros de console (se houver)

---

#### Eventos 4-8 (testes adicionais se tempo permitir):

- **Evento 4:** Dono marca como concluído → Cliente recebe
- **Evento 5:** Cliente marca como concluído → Dono recebe
- **Evento 6:** Cliente reagenda → Dono recebe
- **Evento 7:** Dono reagenda → Cliente recebe
- **Evento 8:** Nova avaliação → Dono recebe

**Para cada, siga o mesmo padrão:** descrever qual tipo de notificação chegou (push/sininho), tempo, e se há erros no console.

---

### Critério 4: Licença Controlada

**Objetivo:** Verificar bloqueio quando `is_active = false` (painel do dono e página pública bloqueados).

**Pré-requisitos:**
- Acesso ao Supabase Dashboard
- Logado como DONO em `/painel`

**Passos:**

1. **Supabase Dashboard** → Tabela `salons`
   - Localize seu salão teste
   - Mude `is_active = false`
   - Aguarde ~3 segundos (Realtime)

2. **Recarregue `/painel`** como DONO
   - Deve exibir `SuspendedScreen`: "Sua licença foi suspensa"
   - Nenhum botão/ação disponível

3. **Acesse `/s/[slug]`** (página pública) em nova aba
   - Deve exibir `SuspendedScreen` bloqueando o agendamento
   - Cliente não vê serviços

4. **Reative:** Supabase → `is_active = true` → recarregue
   - `/painel` volta ao normal
   - `/s/[slug]` volta a mostrar serviços

**Marque como:**
- ✅ PASS: Se painel e página pública bloquearam e liberaram corretamente
- ❌ FAIL: Se ainda consegue acessar funcionalidades ou agendamentos

---

### Critério 5: PWA Instalável

**Objetivo:** Validar instalação em navegador.

**Passos:**

1. Acesse `https://appsalao-psi.vercel.app` em **Chrome, Edge ou Safari**

2. Procure ícone de instalação:
   - **Chrome/Edge desktop:** ícone de "install" (ícone de janela + seta) na barra de endereços
   - **Chrome Android:** banner "Instalar app" no topo, ou menu ⋮ → "Instalar app"
   - **Safari iOS:** Share → Add to Home Screen

3. Clique para instalar
   - Siga instruções
   - Confirme

4. Abra a app instalada
   - Deve abrir em modo **standalone** (sem barra de browser)
   - Deve exibir "appSalão" como nome
   - Funcionalidades (login, agendamento) devem estar operacionais

**Marque como:**
- ✅ PASS: Se ícone/banner aparece, instala sem erro, abre em standalone
- ❌ FAIL: Se ícone não aparece, ou erro durante instalação, ou abre com barra de browser

---

### Critério 6: RLS Correta

**Objetivo:** Verificar isolamento multi-tenant (dono não consegue alterar dados de outro salão).

**Pré-requisitos:**
- Estar logado como DONO em `/painel`
- Acesso ao Supabase Dashboard para identificar IDs de salões

**Passos:**

1. **Identifique seu `salon_id`:**
   - Em `/painel`, DevTools → Console
   - Execute: `localStorage.getItem('currentSalon')`
   - Anote o ID (ex: "123")

2. **Identifique `salon_id` de outro salão:**
   - Supabase Dashboard → Tabela `salons` → outro registro (ex: "456")

3. **Tente inserir em salão alheio (console do DevTools):**
   ```javascript
   const supabase = window.supabaseClient;
   supabase.from('services').insert({
     salon_id: 456,
     name: 'Teste hack',
     duration_minutes: 30,
     price: 99
   }).then(r => {
     console.log('Status:', r.status);
     console.log('Error:', r.error);
     console.log('Data:', r.data);
   });
   ```

4. **Verifique a resposta:**
   - **Esperado:** `status: 403` com mensagem de erro (RLS permission denied)
   - **Nunca deve ser:** `status: 201` (insert bem-sucedido)

5. **Confirme no Supabase:**
   - Tabela `services` do salão "456"
   - Não deve haver "Teste hack" criado

**Marque como:**
- ✅ PASS: Se INSERT retorna 403 (permission denied)
- ❌ FAIL: Se retorna 201 (insert bem-sucedido — RLS quebrada)

---

## Tabela de Resultados

Preencha após executar os testes:

| Critério | Resultado | Observação |
|----------|-----------|-----------|
| Agendamento sem conflito | PENDENTE | Aguarda teste manual |
| Slots corretos | PENDENTE | Aguarda teste manual |
| Notificações (X/8 eventos) | PENDENTE | Foco especial em Evento 3 (dono cancela) |
| Licença controlada | PENDENTE | Aguarda teste com Supabase |
| PWA instalável | PENDENTE | Aguarda teste em navegador |
| RLS correta | PENDENTE | Aguarda teste via console |

**Resultado geral:** PENDENTE — Aguardando confirmação do usuário para cada critério

---

## Próximas Etapas

1. **Usuário executa** os 6 testes descritos acima em `https://appsalao-psi.vercel.app`
2. **Registra resultado** para cada critério:
   - ✅ PASS — com breve observação (ex: "Sininho chegou em 20s, sem erros")
   - ❌ FAIL — com descrição do erro (ex: "Sininho não aparece, erro X no console")
3. **Avisa o agent** (via mensagem) o resultado de cada um
4. **Agent atualiza este documento** com os resultados finais
5. **Se todos forem ✅:** Relatório final = **APROVADO PARA PRODUÇÃO**
6. **Se algum falhar:** Relatório final = **REPROVADO**, lista agentes responsáveis

---

## Contexto dos Bugfixes Deployados

### Fix 99711c3 — Push OneSignal não chegava
**Problema:** Service Worker tinha scope incorreto + `client_id` nunca era registrado com OneSignal.
**Solução:** Corrigir scope do SW + registrar client_id via `OneSignal.login()` após determinar identidade.
**Validação:** Testar Eventos 1, 2, 6, 7, 8 (onde DONO ou CLIENTE recebem push).

### Fix a6ffcd5 — Sininho in-app do cliente bloqueado
**Problema:** RLS impedia INSERT de notificação na tabela + Realtime não sincroniza sem `auth.uid()` (cliente tem sessão leve, `auth.uid() = NULL`).
**Solução:** Inserir notificação via Vercel Function `service_role` + Realtime broadcast para cliente via channel público escopado.
**Validação:** Testar **Evento 3** especialmente (dono cancela → sininho cliente chega em até 45s, sem erro no console).

---

**Relatório iniciado:** 2026-08-03 10:00 UTC  
**Status:** Automático ✅, Manual PENDENTE  
**Próxima ação:** Usuário executa testes manuais descritos acima
