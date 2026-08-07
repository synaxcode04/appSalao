# SPEC.md

## Problema

Donos e donas de salões de beleza se perdem em agendamentos feitos via WhatsApp ou papel, o que causa conflitos de horário — duas pessoas marcadas no mesmo slot. O sistema centraliza a agenda em um único lugar, eliminando esse problema.

## Usuários

| Perfil | Responsabilidade |
|--------|-----------------|
| **Dono/Dona do Salão** | Gerencia agenda, serviços, profissionais e horários de funcionamento |
| **Cliente** | Agenda serviços pelo link público do salão |
| **Admin (Israel)** | Controla licenças e acesso dos salões cadastrados na plataforma |

Peso de uso: Dono e Cliente têm importância igual no dia a dia.

## Funcionalidades

### Essenciais

**Motor de Agendamento**
- Exibir apenas horários realmente disponíveis, calculados com base na duração do serviço e nos horários de funcionamento do salão
- Respeitar intervalos de almoço configurados
- Quando houver profissionais cadastrados, a disponibilidade é por profissional — sem sobreposição de horários por profissional

**Painel do Proprietário**
- Cadastro e edição de serviços (nome, duração, preço)
- Cadastro e edição de profissionais
- Configuração de horários de funcionamento por dia da semana (com intervalo opcional)
- Visualização e cancelamento de agendamentos
- Resposta a avaliações de clientes

**Área do Cliente**
- Agendamento de serviço pelo link público do salão (`/:slug`)
- Visualização e cancelamento de agendamentos futuros
- Histórico de atendimentos
- Avaliação pós-atendimento

**Notificações (Push via OneSignal)**

| Evento | Quem recebe |
|--------|-------------|
| Novo agendamento | Dono |
| Cliente cancela agendamento | Dono |
| Dono cancela agendamento | Cliente |
| Cliente reagenda | Dono |
| Dono reagenda | Cliente |
| Atendimento concluído (dono marca) | Cliente |
| Nova avaliação recebida | Dono |

**Controle de Licenças (Painel Admin)**
- Login com e-mail do administrador acessa painel `/admin`
- Ativar e suspender licença de um salão
- Quando suspenso: painel do dono e link público do cliente param de funcionar, exibindo aviso
- Cobrança de R$29,90/mês gerenciada externamente (Mercado Pago ou manual)

### Fora do escopo

- Pagamento online dentro do aplicativo
- Integração automática com WhatsApp
- Múltiplos donos por salão
- Aplicativo nativo (iOS/Android via App Store/Play Store)
- Marketplace de busca de salões por geolocalização (tabela existe mas feature não é prioridade)

## Módulos

| Módulo | Responsabilidade | Arquivos principais |
|--------|-----------------|---------------------|
| **Auth & Perfis** | Login, cadastro, controle de roles (owner/client/admin), rotas protegidas | `Login.jsx`, `Register.jsx`, `ProtectedRoute.jsx`, `supabase.js` |
| **Motor de Agendamento** | Cálculo de slots disponíveis, página pública do salão, criação de agendamentos | `BookingEngine.jsx`, `SalonDetails.jsx` |
| **Painel do Proprietário** | Gestão de serviços, profissionais, horários, agendamentos, métricas e avaliações | `pages/owner/*`, `OwnerLayout.jsx` |
| **Notificações** | Disparo de push via OneSignal em resposta a eventos de agendamento | `utils/notification.js`, `api/notify.js` |
| **Controle de Licenças** | Ativação/suspensão de salões, bloqueio de acesso quando sem licença | `pages/admin/*`, `AdminLayout.jsx` |

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + React Router 7 + Vite 8 |
| Estilo | CSS próprio (mobile-first, sem framework externo) |
| Backend/DB | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| Push | OneSignal (react-onesignal + SDK worker) |
| Serverless | Vercel Functions (`/api/notify.js`) |
| PWA | vite-plugin-pwa + Workbox |
| Deploy | Vercel |
| Gráficos | Recharts |

## Constraints técnicas

- Infraestrutura 100% no plano gratuito (Supabase, Vercel, OneSignal) — sem custo de servidor
- Sem build step adicional: todo o projeto sobe via `vite build` + Vercel
- PWA instalável em qualquer sistema operacional sem app store
- Sem ORM — queries diretas via `@supabase/supabase-js`
- Sem gerenciador de estado global — apenas `useState`/`useEffect` + props

## Critérios de aceitação

1. **Agendamento sem conflito** — não é possível criar dois agendamentos sobrepostos no mesmo profissional (ou no salão, quando não há profissional cadastrado)
2. **Slots corretos** — os horários exibidos ao cliente refletem exatamente a duração do serviço e os horários de funcionamento, incluindo intervalos
3. **Notificações disparadas** — cada um dos 7 eventos de notificação entrega o push para o destinatário correto em até 30 segundos
4. **Licença controlada** — salão com licença suspensa exibe tela de aviso tanto no painel do dono quanto na página pública do cliente; nenhuma ação de agendamento é possível
5. **PWA instalável** — o app pode ser instalado via browser em Android, iOS e desktop sem erro de manifesto ou service worker
6. **RLS correta** — um dono autenticado não consegue alterar dados de outro salão

---

*Decisões em aberto:*
- *Tela de aviso de licença suspensa: conteúdo e visual ainda não definidos*
- *Evento "atendimento concluído": quem pode marcar como concluído — **RESOLVIDO (2026-08-07): somente o dono.** O cliente não conclui mais atendimento. Agendamentos `scheduled` somem da agenda ativa do cliente 15 min após o horário e passam ao histórico sem mudar de status no banco.*
- *Reagendamento: será uma edição do agendamento existente ou cancelar + criar novo?*
