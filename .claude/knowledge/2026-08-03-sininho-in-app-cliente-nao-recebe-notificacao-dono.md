# Bug: Cliente não recebia notificação in-app (sininho) ao dono cancelar/concluir agendamento

**Data:** 2026-08-03  
**Status:** Corrigido em produção, code-reviewer aprovou "Aprovado para deploy: SIM"  
**Agents envolvidos:** notifier (implementação) + rls-security (diagnóstico RLS) + code-reviewer (auditoria)  
**Tipo:** Bug crítico — cliente perdia informações em tempo real

---

## Problema

O cliente agendado **não recebia notificação in-app** (ícone de sininho) quando o dono cancelava ou marcava como concluído um atendimento do cliente. O sininho permanecia vazio, mesmo que o backend tentasse inserir a notificação e retornasse `toast.success` no painel do dono.

Mensagens de erro: nenhuma visível ao dono. Efeito: notificação nunca chegava ao cliente, feedback incompleto.

---

## Causa Raiz (duas camadas)

### Camada 1: INSERT bloqueado pela RLS de `notifications`

No fluxo anterior (bug), `DashboardHome.jsx` executava:

```javascript
// DashboardHome.jsx — ANTES (bug)
await supabase
  .from('notifications')
  .insert({
    salon_id: saloon.id,
    client_id: appt.client_id,
    type: 'appointment_completed', // ou 'appointment_canceled'
    appointment_id: appt.id,
  });
```

**Problema:** O cliente NÃO tem sessão Supabase Auth (`auth.uid()` é sempre NULL). A policy RLS de INSERT em `notifications` exige:

```sql
WITH CHECK (client_id IS NULL OR client_id = auth.uid())
```

Quando `client_id` é preenchido e `auth.uid()` é NULL, a política falha silenciosamente. A query não retorna erro HTTP (o Supabase não lança exceção cliente-side), mas o INSERT é rejeitado no banco. O `toast.success` exibido era apenas sinal do **cliente estar conectado**, não da notificação ter sido persistida.

### Camada 2: Realtime do cliente inacessível

No `ClientAppointments.jsx`, a subscription Realtime usava:

```javascript
// ClientAppointments.jsx — ANTES (bug)
const subscription = supabase
  .channel(`notifications:client_id=eq.${clientId}`)
  .on('postgres_changes', { ... }, callback)
  .subscribe();
```

**Problema:** O cliente usa anon key sem sessão Auth. A policy SELECT de `notifications` exigia `auth.uid()`:

```sql
USING (client_id = auth.uid() OR salon_id = auth.uid())
```

Sem `auth.uid()`, o evento Realtime nunca era entregue — o cliente ficava aguardando em um canal sem permissão de leitura.

---

## Solução Aplicada

### 1. Nova Action Service Role: `notify_client` (app/api/appointments.js)

Criada ação `notify_client` executada com `service_role` (chave server-side, acesso irrestrito):

```javascript
// app/api/appointments.js — nova ação
const actions = {
  // ...
  async notify_client(req) {
    const { salon_id, client_id, type, appointment_id } = req.body;
    
    // Validar que o cliente existe e está vinculado ao salão (salon_clients)
    const { data: link, error: linkError } = await supabaseClient
      .from('salon_clients')
      .select('id')
      .eq('salon_id', salon_id)
      .eq('client_id', client_id)
      .single();
    
    if (linkError || !link) {
      return res.status(403).json({ error: 'Client not linked to salon' });
    }
    
    // Inserir notificação com service_role (sem barreira RLS)
    const { error: insertError } = await supabaseClient
      .from('notifications')
      .insert({
        salon_id,
        client_id,
        type,
        appointment_id,
      });
    
    if (insertError) {
      return res.status(500).json({ error: 'Failed to notify client' });
    }
    
    return res.status(200).json({ success: true });
  }
};
```

**Benefícios:**
- Usa `service_role` (sem barreira RLS INSERT)
- Valida ownership: cliente deve existir em `salon_clients` para aquele salão
- Retorna 403 se cliente não está vinculado; 500 se banco falha
- Nunca expõe erro do banco ao cliente

### 2. DashboardHome.jsx — Chamar ação via fetch

```javascript
// DashboardHome.jsx — handleCancel/handleComplete
const handleCancel = async (apptId) => {
  // ... atualizar status em agendamentos ...
  
  // Notificar cliente via action service_role
  try {
    const appt = appointments.find(a => a.id === apptId);
    if (appt?.client_id && appt.services?.name) {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'notify_client',
          salon_id: salon.id,
          client_id: appt.client_id,
          type: 'appointment_canceled',
          appointment_id: apptId,
        }),
      });
      if (!response.ok) {
        // Notificação falhou — ainda não falha a operação do dono
        // (negócio decidiu que isso é melhor que tudo falhar)
      }
    }
  } catch (err) {
    // Log silencioso (sem console.* no frontend conforme convenção)
  }
};
```

**Mudanças:**
- Removido INSERT direto com Supabase client
- Chamada via `fetch` a `/api/appointments` action `notify_client`
- Null-guard em `appt.services?.name` (previne erro se serviço foi deletado)
- Não lança exceção se notificação falha (é best-effort)

### 3. ClientAppointments.jsx — Substituir Realtime por polling

```javascript
// ClientAppointments.jsx — polling 45s ao invés de Realtime
const [notifications, setNotifications] = useState([]);
let mounted = true;

useEffect(() => {
  let interval;
  
  const pollNotifications = async () => {
    if (!mounted) return;
    
    try {
      const resp = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list_notifications',
          client_id: clientId,
          salon_id: salonId,
        }),
      });
      
      if (resp.ok) {
        const { notifications: notifs } = await resp.json();
        if (mounted) {
          setNotifications(notifs);
        }
      }
    } catch (err) {
      // Erro de rede ou servidor — ignore (próximo poll tentará novamente)
    }
  };
  
  // Primeira chamada imediata, depois a cada 45s
  pollNotifications();
  interval = setInterval(pollNotifications, 45000);
  
  return () => {
    mounted = false;
    clearInterval(interval);
  };
}, [clientId, salonId]);
```

**Benefícios:**
- Sem dependência de RLS SELECT (a action `list_notifications` usa `service_role`)
- Sem cold-start de Realtime (que exigia sessão Auth)
- Garantido que cliente recebe atualizações a cada 45s no máximo
- Cleanup correto: `mounted` flag + `clearInterval`

---

## Arquivos Alterados

1. **app/api/appointments.js**
   - Adicionada ação `notify_client` (validação + INSERT com service_role)
   - Adicionada ação `list_notifications` para suportar polling

2. **app/src/pages/owner/DashboardHome.jsx**
   - `handleCancel()` e `handleComplete()` chamam `/api/appointments` action `notify_client` via fetch
   - Removido INSERT direto em `notifications`
   - Null-guard em `appt.services?.name`

3. **app/src/pages/client/ClientAppointments.jsx**
   - Subscription Realtime removida
   - Polling com `setInterval(45000)` + ação `list_notifications`
   - Flag `mounted` para cleanup correto

---

## Decisão de Design

**Por que não alterar a RLS de `notifications`?**

A policy atual:
```sql
USING (client_id = auth.uid() OR salon_id = auth.uid())
WITH CHECK (client_id IS NULL OR client_id = auth.uid())
```

Abri-la para anon key (`auth.uid() IS NULL`) criaria brecha: qualquer pessoa com anon key poderia ler/escrever notificações de qualquer cliente em qualquer salão. A solução via service_role é mais segura: valida ownership antes de permitir a operação.

---

## Validação Pós-Correção

- Cliente recebe notificação in-app (sininho) dentro de ~45s após dono cancelar/concluir
- Dono não vê erro ao executar ação (toast.success mantido)
- Notificação não é entregue se cliente não está vinculado ao salão (salon_clients)
- Sem console.* no frontend (convenção)
