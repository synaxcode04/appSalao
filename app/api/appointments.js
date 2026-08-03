import { createClient } from '@supabase/supabase-js';

/**
 * Converte "HH:MM" ou "HH:MM:SS" para minutos totais desde meia-noite.
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

/**
 * Converte minutos totais para "HH:MM".
 */
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Calcula a janela do CICLO CORRENTE de 30 dias de uma assinatura, a partir da
 * sua data de assinatura (started_at, ou created_at como fallback).
 *
 * Regra de negócio: a cota do plano NÃO é por mês-calendário. Ela reinicia a
 * cada 30 dias contados da data de assinatura, sem acúmulo entre ciclos.
 *   cyclesElapsed      = floor((hoje - dataAssinatura) / 30 dias)
 *   inicioCicloCorrente = dataAssinatura + cyclesElapsed * 30 dias
 *   fimCicloCorrente    = inicioCicloCorrente + 30 dias
 *
 * Timezone / borda de data: `appointment_date` é uma coluna DATE ("YYYY-MM-DD",
 * sem hora nem fuso). Para evitar off-by-one, tudo é calculado em UTC de forma
 * consistente: reduzimos tanto a data de assinatura (timestamptz) quanto "hoje"
 * à meia-noite UTC do respectivo dia-calendário, e derivamos as bordas como
 * strings "YYYY-MM-DD" via toISOString(). Como só somamos múltiplos exatos de
 * 30 dias a meia-noites UTC, não há resíduo de horário — as bordas caem sempre
 * em meia-noite UTC e a string de data é exata.
 *
 * @param {string} subscriptionDateIso - started_at (ou created_at) — ISO timestamptz
 * @returns {{ start: string, end: string }} bordas [start, end) como "YYYY-MM-DD"
 */
function computeCycleWindow(subscriptionDateIso) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CYCLE_MS = 30 * DAY_MS;

  // Meia-noite UTC do dia-calendário da assinatura.
  const anchor = new Date(subscriptionDateIso);
  anchor.setUTCHours(0, 0, 0, 0);

  // Meia-noite UTC de hoje.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Ciclos completos decorridos desde a assinatura (nunca negativo: se a data de
  // assinatura estiver no futuro por qualquer inconsistência, usa o ciclo 0).
  const cyclesElapsed = Math.max(0, Math.floor((today.getTime() - anchor.getTime()) / CYCLE_MS));

  const startMs = anchor.getTime() + cyclesElapsed * CYCLE_MS;
  const endMs = startMs + CYCLE_MS;

  return {
    start: new Date(startMs).toISOString().slice(0, 10),
    end: new Date(endMs).toISOString().slice(0, 10),
  };
}

/**
 * Verifica se há conflito de horário entre [start, end] e agendamentos existentes.
 * @param {Array} existingAppointments - Agendamentos já no banco com status='scheduled'
 * @param {string} startTime - "HH:MM"
 * @param {string} endTime - "HH:MM"
 * @returns {boolean} true se há conflito
 */
function hasConflict(existingAppointments, startTime, endTime) {
  if (!existingAppointments || existingAppointments.length === 0) {
    return false;
  }

  const newStartMin = timeToMinutes(startTime);
  const newEndMin = timeToMinutes(endTime);

  for (const appt of existingAppointments) {
    const existingStartMin = timeToMinutes(appt.start_time);
    const existingEndMin = timeToMinutes(appt.end_time);

    // Overlaps if: newStart < existingEnd AND newEnd > existingStart
    if (newStartMin < existingEndMin && newEndMin > existingStartMin) {
      return true;
    }
  }

  return false;
}

/**
 * Valida entrada para operações.
 */
function validateInput(action, body) {
  // list_scheduled: nenhum campo obrigatório (salon_id vem do contexto)
  // list_by_client: salon_id, client_id
  // list_history: salon_id, client_id
  // create: salon_id, client_id, service_id, professional_id, appointment_date, start_time, end_time
  // reschedule: appointment_id, client_id, appointment_date, start_time, end_time
  // cancel: appointment_id, client_id
  // complete: appointment_id, client_id
  // create_review: salon_id, client_id, rating, comment
  // mark_notifications_read: client_id (id opcional)
  // list_notifications: client_id
  // notify_client: client_id, salon_id, title, message
  // get_salon_contact: salon_id

  if (action === 'list_scheduled' || action === 'list_by_client' || action === 'list_history') {
    if (!body.salon_id) return 'salon_id is required';
    if (action !== 'list_scheduled' && !body.client_id) {
      return 'client_id is required';
    }
  }

  if (action === 'create') {
    if (!body.salon_id) return 'salon_id is required';
    if (!body.client_id) return 'client_id is required';
    const hasServiceIds = Array.isArray(body.service_ids) && body.service_ids.length > 0;
    if (!body.service_id && !hasServiceIds) return 'service_id or service_ids is required';
    if (!body.appointment_date) return 'appointment_date is required';
    if (!body.start_time) return 'start_time is required';
    // end_time é recomputado server-side a partir da soma das durações
    // professional_id pode ser null
  }

  if (action === 'reschedule') {
    if (!body.appointment_id) return 'appointment_id is required';
    if (!body.client_id) return 'client_id is required';
    if (!body.appointment_date) return 'appointment_date is required';
    if (!body.start_time) return 'start_time is required';
    if (!body.end_time) return 'end_time is required';
  }

  if (action === 'cancel' || action === 'complete') {
    if (!body.appointment_id) return 'appointment_id is required';
    if (!body.client_id) return 'client_id is required';
  }

  if (action === 'create_review') {
    if (!body.salon_id) return 'salon_id is required';
    if (!body.client_id) return 'client_id is required';
    if (typeof body.rating !== 'number' || body.rating < 1 || body.rating > 5) {
      return 'rating must be a number between 1 and 5';
    }
    // comment pode ser vazio ou nulo
  }

  if (action === 'mark_notifications_read') {
    if (!body.client_id) return 'client_id is required';
    // id é opcional (se omitido, marca todos do cliente como lidos)
  }

  if (action === 'list_notifications') {
    if (!body.client_id) return 'client_id is required';
  }

  if (action === 'notify_client') {
    if (!body.client_id) return 'client_id is required';
    if (!body.salon_id) return 'salon_id is required';
    if (!body.title) return 'title is required';
    if (!body.message) return 'message is required';
  }

  if (action === 'get_salon_contact') {
    if (!body.salon_id) return 'salon_id is required';
  }

  if (action === 'get_salon_payment_options') {
    if (!body.salon_id) return 'salon_id is required';
  }

  if (action === 'subscribe') {
    if (!body.salon_id) return 'salon_id is required';
    if (!body.client_id) return 'client_id is required';
    if (!body.plan_id) return 'plan_id is required';
    // payment_method é opcional: só 'external' é aceito aqui (pagamento direto com
    // o dono). O fluxo Mercado Pago cria a assinatura por criar-preferencia-plano.js.
    if (body.payment_method != null && body.payment_method !== 'external') {
      return 'payment_method inválido';
    }
  }

  if (action === 'cancel_subscription') {
    if (!body.subscription_id) return 'subscription_id is required';
    if (!body.client_id) return 'client_id is required';
    if (!body.salon_id) return 'salon_id is required';
  }

  if (action === 'list_client_subscriptions') {
    if (!body.salon_id) return 'salon_id is required';
    if (!body.client_id) return 'client_id is required';
  }

  return null;
}

export default async function handler(req, res) {
  // Apenas POST suportado
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    action,
    salon_id,
    client_id,
    appointment_id,
    service_id,
    service_ids,
    professional_id,
    appointment_date,
    start_time,
    end_time,
    rating,
    comment,
    id,
    exclude_id,
    plan_id,
    subscription_id,
    payment_method,
    title,
    message
  } = req.body;

  // Validar ação
  const validActions = [
    'list_scheduled',
    'list_by_client',
    'list_history',
    'create',
    'reschedule',
    'cancel',
    'complete',
    'create_review',
    'mark_notifications_read',
    'list_notifications',
    'notify_client',
    'get_salon_contact',
    'get_salon_payment_options',
    'subscribe',
    'cancel_subscription',
    'list_client_subscriptions'
  ];

  if (!action || !validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid or missing action' });
  }

  // Validar entrada
  const validationError = validateInput(action, req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Obter credenciais do servidor (service_role bypassa RLS)
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase service role configuration missing');
    return res.status(500).json({ error: 'Configuração do servidor ausente' });
  }

  // Instanciar Supabase com service_role (bypassa RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  try {
    // ==========================================
    // AÇÃO: list_scheduled — retorna agendamentos já marcados para cálculo de slots
    // ==========================================
    if (action === 'list_scheduled') {
      let query = supabase
        .from('appointments')
        .select('id, professional_id, start_time, end_time, appointment_date, service_id')
        .eq('salon_id', salon_id)
        .eq('status', 'scheduled');

      // Filtro opcional por data
      if (appointment_date) {
        query = query.eq('appointment_date', appointment_date);
      }

      // Filtro opcional por profissional
      if (professional_id) {
        query = query.eq('professional_id', professional_id);
      }

      // Exclui o agendamento atual no fluxo de reagendamento para não auto-bloquear o slot
      if (exclude_id) {
        query = query.neq('id', exclude_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Supabase list_scheduled error:', { salon_id, error });
        return res.status(500).json({ error: 'Erro ao buscar agendamentos' });
      }

      return res.status(200).json({ appointments: data || [] });
    }

    // ==========================================
    // AÇÃO: list_by_client — retorna agendamentos do cliente no salão
    // ==========================================
    if (action === 'list_by_client') {
      // Validar vínculo cliente-salão
      const { data: link, error: linkError } = await supabase
        .from('salon_clients')
        .select('is_active')
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .maybeSingle();

      if (linkError) {
        console.error('Supabase list_by_client link check error:', { salon_id, client_id, error: linkError });
        return res.status(500).json({ error: 'Erro ao validar vínculo' });
      }

      if (!link) {
        // Sem vínculo → cliente não foi vinculado a este salão
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // Bloqueia se is_active === false
      if (link.is_active === false) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // Busca agendamentos (últimos 30 dias até o futuro, excluindo completed)
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - 30);
      const limitDateStr = limitDate.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('appointments')
        .select('id, salon_id, service_id, professional_id, appointment_date, start_time, end_time, status, services(id, name, duration_minutes, price), professionals(id, name), appointment_services(service_id, services(id, name, duration_minutes, price)), salons(id, name, logo_url, address)')
        .eq('client_id', client_id)
        .eq('salon_id', salon_id)
        .gte('appointment_date', limitDateStr)
        .neq('status', 'completed')
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) {
        console.error('Supabase list_by_client error:', { salon_id, client_id, error });
        return res.status(500).json({ error: 'Erro ao buscar agendamentos' });
      }

      return res.status(200).json({ appointments: data || [] });
    }

    // ==========================================
    // AÇÃO: list_history — retorna agendamentos concluídos do cliente
    // ==========================================
    if (action === 'list_history') {
      // Validar vínculo cliente-salão
      const { data: link, error: linkError } = await supabase
        .from('salon_clients')
        .select('is_active')
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .maybeSingle();

      if (linkError) {
        console.error('Supabase list_history link check error:', { salon_id, client_id, error: linkError });
        return res.status(500).json({ error: 'Erro ao validar vínculo' });
      }

      if (!link) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      if (link.is_active === false) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, start_time, status, services(name, price), salons(id, name, logo_url, address), appointment_services(service_id, services(id, name, price))')
        .eq('client_id', client_id)
        .eq('salon_id', salon_id)
        .eq('status', 'completed')
        .order('appointment_date', { ascending: false });

      if (error) {
        console.error('Supabase list_history error:', { salon_id, client_id, error });
        return res.status(500).json({ error: 'Erro ao buscar histórico' });
      }

      return res.status(200).json({ appointments: data || [] });
    }

    // ==========================================
    // AÇÃO: create — criar novo agendamento
    // ==========================================
    if (action === 'create') {
      // Normaliza service_ids: aceita array ou service_id singular (compat retroativa)
      const serviceIds = Array.isArray(service_ids) && service_ids.length > 0
        ? service_ids
        : service_id ? [service_id] : [];

      if (serviceIds.length === 0) {
        return res.status(400).json({ error: 'service_id or service_ids is required' });
      }

      // 1. Validar vínculo cliente-salão e bloqueio
      const { data: link, error: linkError } = await supabase
        .from('salon_clients')
        .select('is_active')
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .maybeSingle();

      if (linkError) {
        console.error('Supabase create link check error:', { salon_id, client_id, error: linkError });
        return res.status(500).json({ error: 'Erro ao validar vínculo' });
      }

      if (!link) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      if (link.is_active === false) {
        return res.status(403).json({ error: 'Cliente bloqueado neste salão' });
      }

      // 2. Validar que todos os serviços pertencem ao salão e buscar durações
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('id, name, duration_minutes')
        .in('id', serviceIds)
        .eq('salon_id', salon_id);

      if (servicesError) {
        console.error('Supabase create services validation error:', { salon_id, error: servicesError });
        return res.status(500).json({ error: 'Erro ao validar serviços' });
      }

      if (!servicesData || servicesData.length !== serviceIds.length) {
        return res.status(400).json({ error: 'Serviços inválidos para este salão' });
      }

      // 3. Computar duração total e end_time server-side — não confia no cliente
      const totalDuration = servicesData.reduce((sum, s) => sum + s.duration_minutes, 0);
      const startMin = timeToMinutes(start_time);
      const computedEndTime = minutesToTime(startMin + totalDuration);

      // 4. Recheca conflito do BLOCO INTEIRO no mesmo profissional
      let conflictCheckQuery = supabase
        .from('appointments')
        .select('id, start_time, end_time')
        .eq('salon_id', salon_id)
        .eq('appointment_date', appointment_date)
        .eq('status', 'scheduled');
      conflictCheckQuery = professional_id
        ? conflictCheckQuery.eq('professional_id', professional_id)
        : conflictCheckQuery.is('professional_id', null);
      const { data: existingAppointments, error: appointmentCheckError } = await conflictCheckQuery;

      if (appointmentCheckError) {
        console.error('Supabase create appointment check error:', { salon_id, professional_id, error: appointmentCheckError });
        return res.status(500).json({ error: 'Erro ao verificar disponibilidade' });
      }

      if (hasConflict(existingAppointments, start_time, computedEndTime)) {
        return res.status(409).json({ error: 'Horário indisponível' });
      }

      // 4b. Checagem de cota de plano de assinatura (retrocompatível — só bloqueia
      // quando o agendamento é coberto por um plano ativo do cliente NESTE salão).
      //
      // Retrocompatibilidade: se o cliente não tem assinatura ativa cobrindo o
      // serviço, o agendamento segue normal (pago avulso) — nada é bloqueado.
      //
      // OPEN: não existe coluna `appointments.subscription_id` para vincular
      // explicitamente o agendamento à assinatura consumida (guardrail de estrutura
      // nova impede criá-la aqui). Por isso o vínculo é DETECTADO por plano ativo
      // que cobre o serviço, não gravado. O frontend pode enviar `subscription_id`
      // opcional (Fase 3); hoje ele apenas restringe a detecção àquela assinatura.
      // Se for necessário débito/marcação persistente do consumo por assinatura,
      // será preciso decidir e adicionar a coluna via migration — PARAR e confirmar.
      {
        // Busca assinaturas ativas do cliente NESTE salão (isolamento por salon_id).
        let activeSubsQuery = supabase
          .from('client_subscriptions')
          .select('id, plan_id, started_at, created_at')
          .eq('salon_id', salon_id)
          .eq('client_id', client_id)
          .eq('status', 'active');
        // Se o frontend indicou a assinatura explicitamente, restringe a ela.
        if (subscription_id) {
          activeSubsQuery = activeSubsQuery.eq('id', subscription_id);
        }
        const { data: activeSubs, error: activeSubsError } = await activeSubsQuery;

        if (activeSubsError) {
          console.error('Supabase create active subscriptions lookup error:', { salon_id, client_id, error: activeSubsError });
          return res.status(500).json({ error: 'Erro ao validar assinatura' });
        }

        if (activeSubs && activeSubs.length > 0) {
          const activePlanIds = activeSubs.map(s => s.plan_id);

          // Mapa plan_id → data de assinatura (âncora do ciclo de 30 dias).
          // Cada plan_id ativo mapeia a exatamente UMA assinatura ativa (índice
          // único parcial por client_id+salon_id+plan_id). started_at é o padrão;
          // created_at é fallback se started_at vier nulo.
          const anchorByPlan = {};
          for (const s of activeSubs) {
            anchorByPlan[s.plan_id] = s.started_at || s.created_at;
          }

          // Dia da semana da data agendada (0=Domingo ... 6=Sábado, igual a
          // working_hours e subscription_plan_days). appointment_date é uma DATE
          // pura "YYYY-MM-DD"; o append de 'T00:00:00' força interpretação em
          // horário LOCAL (não UTC), evitando shift de fuso que jogaria a data
          // para o dia anterior. getDay() então devolve o dia correto.
          const scheduledDayOfWeek = new Date(appointment_date + 'T00:00:00').getDay();

          // Dias permitidos por plano ativo. Regra (subscription_plan_days):
          //   - plano SEM nenhuma linha → sem restrição, vale todos os dias.
          //   - plano COM linhas → só cobre se o dia agendado constar entre elas.
          // Planos que não cobrem esse dia são descartados da checagem de cota
          // (agendamento segue como avulso — nunca é bloqueado por isso).
          const { data: planDays, error: planDaysError } = await supabase
            .from('subscription_plan_days')
            .select('plan_id, day_of_week')
            .eq('salon_id', salon_id)
            .in('plan_id', activePlanIds);

          if (planDaysError) {
            console.error('Supabase create plan days lookup error:', { salon_id, error: planDaysError });
            return res.status(500).json({ error: 'Erro ao validar dias do plano' });
          }

          // Mapa plan_id → set de dias permitidos (só para planos que têm restrição).
          const allowedDaysByPlan = {};
          for (const pd of planDays || []) {
            (allowedDaysByPlan[pd.plan_id] = allowedDaysByPlan[pd.plan_id] || new Set()).add(pd.day_of_week);
          }

          // Planos elegíveis neste dia: sem restrição, OU com o dia entre os permitidos.
          const eligiblePlanIds = activePlanIds.filter(pid => {
            const days = allowedDaysByPlan[pid];
            return !days || days.has(scheduledDayOfWeek);
          });

          // Nenhum plano cobre esse dia → agendamento avulso, pula a checagem de cota.
          if (eligiblePlanIds.length === 0) {
            // (não bloqueia — segue o fluxo normal de inserção)
          } else {

          // Serviços deste agendamento cobertos por algum plano ativo ELEGÍVEL
          // NESTE dia, com sua cota.
          const { data: coveredServices, error: coveredError } = await supabase
            .from('subscription_plan_services')
            .select('plan_id, service_id, monthly_quota')
            .eq('salon_id', salon_id)
            .in('plan_id', eligiblePlanIds)
            .in('service_id', serviceIds);

          if (coveredError) {
            console.error('Supabase create plan services lookup error:', { salon_id, error: coveredError });
            return res.status(500).json({ error: 'Erro ao validar cota do plano' });
          }

          if (coveredServices && coveredServices.length > 0) {
            // A cota é por CICLO ROLANTE de 30 dias contado da data de assinatura
            // de CADA plano (não mês-calendário, sem acúmulo). Cada plano tem sua
            // própria âncora, portanto sua própria janela — calculada por linha
            // (plan_id, service_id). Semanticamente `monthly_quota` é "cota por
            // ciclo de 30 dias" (a coluna mantém o nome por compatibilidade).
            //
            // Conservador: se QUALQUER plano que cobre este serviço estiver com a
            // cota esgotada dentro da SUA janela de ciclo corrente, o agendamento
            // é bloqueado (o mais restritivo prevalece).
            for (const cs of coveredServices) {
              const anchorIso = anchorByPlan[cs.plan_id];
              // Sem âncora (não deveria ocorrer — todo plano coberto veio de uma
              // assinatura ativa) → pula por segurança, não bloqueia.
              if (!anchorIso) continue;

              const { start: cycleStart, end: cycleEnd } = computeCycleWindow(anchorIso);

              // Contagem de uso do serviço coberto no ciclo. Um serviço pode ser
              // consumido de DUAS formas: gravado direto em `appointments.service_id`
              // (sempre serviceIds[0]) OU apenas como linha em `appointment_services`
              // (serviços em posição 1+ de um agendamento multi-serviço). Contar só
              // por `service_id` permitia burlar a cota colocando o serviço do plano
              // como 2ª opção. Como o PostgREST não faz OR entre a coluna direta e o
              // join, fazemos DUAS consultas e unimos os appointment_ids DISTINTOS —
              // um Set garante que o mesmo agendamento (que aparece nas duas quando
              // o serviço é o primário) nunca seja contado em dobro. salon_id +
              // client_id + status scheduled + janela do ciclo são invariantes em
              // ambas as consultas.

              // (a) Agendamentos onde o serviço é o primário (appointments.service_id).
              const { data: directRows, error: directError } = await supabase
                .from('appointments')
                .select('id')
                .eq('salon_id', salon_id)
                .eq('client_id', client_id)
                .eq('service_id', cs.service_id)
                .eq('status', 'scheduled')
                .gte('appointment_date', cycleStart)
                .lt('appointment_date', cycleEnd);

              if (directError) {
                console.error('Supabase create quota direct count error:', { salon_id, client_id, service_id: cs.service_id, plan_id: cs.plan_id, error: directError });
                return res.status(500).json({ error: 'Erro ao validar cota do plano' });
              }

              // (b) Agendamentos onde o serviço aparece em appointment_services
              // (inclui posições 1+). Join !inner com appointments aplica os mesmos
              // filtros de cliente/status/janela do ciclo. appointment_services já
              // tem salon_id próprio (invariante multi-tenant preservada).
              const { data: linkedRows, error: linkedError } = await supabase
                .from('appointment_services')
                .select('appointment_id, appointments!inner(client_id, status, appointment_date)')
                .eq('salon_id', salon_id)
                .eq('service_id', cs.service_id)
                .eq('appointments.client_id', client_id)
                .eq('appointments.status', 'scheduled')
                .gte('appointments.appointment_date', cycleStart)
                .lt('appointments.appointment_date', cycleEnd);

              if (linkedError) {
                console.error('Supabase create quota linked count error:', { salon_id, client_id, service_id: cs.service_id, plan_id: cs.plan_id, error: linkedError });
                return res.status(500).json({ error: 'Erro ao validar cota do plano' });
              }

              // União de appointment_ids DISTINTOS — sem dupla-contagem.
              const consumingIds = new Set();
              for (const r of directRows || []) consumingIds.add(r.id);
              for (const r of linkedRows || []) consumingIds.add(r.appointment_id);

              if (consumingIds.size >= cs.monthly_quota) {
                return res.status(409).json({ error: 'Cota do plano esgotada para este serviço no ciclo atual' });
              }
            }
          }
          } // fim do else (eligiblePlanIds.length > 0)
        }
      }

      // 5. Buscar owner_id do salão
      const { data: salon, error: salonError } = await supabase
        .from('salons')
        .select('owner_id')
        .eq('id', salon_id)
        .single();

      if (salonError || !salon) {
        console.error('Supabase create salon lookup error:', { salon_id, error: salonError });
        return res.status(404).json({ error: 'Salão não encontrado' });
      }

      // 6. Inserir agendamento com o primeiro serviço (compat retroativa)
      const { data: newAppointment, error: createError } = await supabase
        .from('appointments')
        .insert({
          salon_id: salon_id,
          client_id: client_id,
          service_id: serviceIds[0],
          professional_id: professional_id || null,
          appointment_date: appointment_date,
          start_time: start_time,
          end_time: computedEndTime,
          status: 'scheduled'
        })
        .select('id, salon_id, service_id, professional_id, appointment_date, start_time, end_time, status')
        .single();

      if (createError) {
        console.error('Supabase create appointment error:', { salon_id, client_id, error: createError });
        // 23P01: exclusion_violation — trigger check_appointment_conflict (double-booking)
        if (createError.code === '23P01') {
          return res.status(409).json({ error: 'Horário indisponível' });
        }
        // 23505: unique_violation — double-booking via unique index
        if (createError.code === '23505') {
          return res.status(409).json({ error: 'Horário indisponível' });
        }
        // P0001: RAISE EXCEPTION sem ERRCODE (salvaguarda: trigger com mensagem de conflito)
        if (createError.code === 'P0001' && createError.message && createError.message.includes('Conflito de agendamento')) {
          return res.status(409).json({ error: 'Horário indisponível' });
        }
        // 23503: foreign_key_violation — client_id/service_id/professional_id inexistente
        if (createError.code === '23503') {
          return res.status(400).json({ error: 'Dados do agendamento inválidos. Recarregue a página e tente novamente.' });
        }
        // 23502: not_null_violation — campo obrigatório ausente
        if (createError.code === '23502') {
          return res.status(400).json({ error: 'Dados do agendamento incompletos.' });
        }
        // 23514: check_violation — valor fora de domínio permitido
        if (createError.code === '23514') {
          return res.status(400).json({ error: 'Dados do agendamento inválidos.' });
        }
        return res.status(500).json({ error: 'Erro ao criar agendamento' });
      }

      // 7. Inserir N linhas em appointment_services (um por serviço selecionado)
      // Rollback manual: se falhar, deleta o appointment recém-criado para evitar inconsistência.
      const appointmentServicesRows = serviceIds.map(sid => ({
        appointment_id: newAppointment.id,
        service_id: sid,
        salon_id: salon_id
      }));

      const { error: asError } = await supabase
        .from('appointment_services')
        .insert(appointmentServicesRows);

      if (asError) {
        console.error('Supabase create appointment_services error:', { appointment_id: newAppointment.id, error: asError });
        const { error: rollbackError } = await supabase.from('appointments').delete().eq('id', newAppointment.id);
        if (rollbackError) {
          console.error('Supabase rollback delete failed — orphan appointment:', { appointment_id: newAppointment.id, error: rollbackError });
        }
        return res.status(500).json({ error: 'Erro ao registrar serviços do agendamento' });
      }

      // 8. Inserir notificação para o dono com todos os nomes de serviços
      const { data: clientRow } = await supabase
        .from('clients')
        .select('full_name')
        .eq('id', client_id)
        .single();

      const clientFirstName = clientRow?.full_name?.split(' ')[0] || 'Cliente';
      const serviceNames = servicesData.map(s => s.name).join(', ');
      const dtParts = appointment_date.split('-');
      const dateBr = `${dtParts[2]}/${dtParts[1]}/${dtParts[0]}`;

      await supabase.from('notifications').insert([{
        salon_id: salon_id,
        title: 'Novo Agendamento',
        message: `${clientFirstName} agendou ${serviceNames} para o dia ${dateBr} às ${start_time}.`
      }]);

      return res.status(201).json({ appointment: newAppointment, owner_id: salon.owner_id });
    }

    // ==========================================
    // AÇÃO: reschedule — reagendar agendamento existente
    // ==========================================
    if (action === 'reschedule') {
      // 1. Validar que o agendamento pertence ao cliente
      const { data: appt, error: apptError } = await supabase
        .from('appointments')
        .select('id, client_id, salon_id, service_id, professional_id')
        .eq('id', appointment_id)
        .single();

      if (apptError || !appt) {
        if (apptError && apptError.code !== 'PGRST116') {
          console.error('Supabase reschedule lookup error:', { appointment_id, error: apptError });
        }
        return res.status(404).json({ error: 'Agendamento não encontrado' });
      }

      if (appt.client_id !== client_id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // 2. Buscar owner_id do salão
      const { data: salon, error: salonError } = await supabase
        .from('salons')
        .select('owner_id')
        .eq('id', appt.salon_id)
        .single();

      if (salonError || !salon) {
        console.error('Supabase reschedule salon lookup error:', { salon_id: appt.salon_id, error: salonError });
        return res.status(500).json({ error: 'Erro ao buscar informações do salão' });
      }

      // 3. Recomputa end_time server-side — não confia no valor enviado pelo cliente
      const { data: apptServices } = await supabase
        .from('appointment_services')
        .select('services(duration_minutes)')
        .eq('appointment_id', appointment_id);

      let computedEndTime = end_time;
      if (apptServices && apptServices.length > 0) {
        const totalDuration = apptServices.reduce((sum, as) => sum + (as.services?.duration_minutes || 0), 0);
        computedEndTime = minutesToTime(timeToMinutes(start_time) + totalDuration);
      } else {
        // Fallback para agendamentos legados sem appointment_services
        const { data: svc } = await supabase
          .from('services')
          .select('duration_minutes')
          .eq('id', appt.service_id)
          .single();
        if (svc) {
          computedEndTime = minutesToTime(timeToMinutes(start_time) + svc.duration_minutes);
        }
      }

      // 4. Recheca conflito (excluindo o agendamento atual)
      let rescheduleConflictQuery = supabase
        .from('appointments')
        .select('id, start_time, end_time')
        .eq('salon_id', appt.salon_id)
        .eq('appointment_date', appointment_date)
        .eq('status', 'scheduled')
        .neq('id', appointment_id);
      rescheduleConflictQuery = appt.professional_id
        ? rescheduleConflictQuery.eq('professional_id', appt.professional_id)
        : rescheduleConflictQuery.is('professional_id', null);
      const { data: existingAppointments, error: conflictError } = await rescheduleConflictQuery;

      if (conflictError) {
        console.error('Supabase reschedule conflict check error:', { appointment_id, error: conflictError });
        return res.status(500).json({ error: 'Erro ao verificar disponibilidade' });
      }

      if (hasConflict(existingAppointments, start_time, computedEndTime)) {
        return res.status(409).json({ error: 'Horário indisponível' });
      }

      // 5. Atualizar com end_time recomputado server-side
      const { data: updated, error: updateError } = await supabase
        .from('appointments')
        .update({
          appointment_date: appointment_date,
          start_time: start_time,
          end_time: computedEndTime
        })
        .eq('id', appointment_id)
        .select('id, salon_id, service_id, professional_id, appointment_date, start_time, end_time, status')
        .single();

      if (updateError) {
        console.error('Supabase reschedule update error:', { appointment_id, error: updateError });
        return res.status(500).json({ error: 'Erro ao reagendar' });
      }

      // 6. Inserir notificação
      const { data: client } = await supabase
        .from('clients')
        .select('full_name')
        .eq('id', client_id)
        .single();

      const clientName = client?.full_name?.split(' ')[0] || 'Cliente';

      const { data: service } = await supabase
        .from('services')
        .select('name')
        .eq('id', appt.service_id)
        .single();

      const serviceName = service?.name || 'Serviço';
      const dtParts = appointment_date.split('-');
      const dateBr = `${dtParts[2]}/${dtParts[1]}/${dtParts[0]}`;

      await supabase.from('notifications').insert([{
        salon_id: appt.salon_id,
        title: 'Agendamento Alterado',
        message: `${clientName} remarcou ${serviceName} para ${dateBr} às ${start_time}.`
      }]);

      return res.status(200).json({ appointment: updated, owner_id: salon.owner_id });
    }

    // ==========================================
    // AÇÃO: cancel — cancelar agendamento
    // ==========================================
    if (action === 'cancel') {
      // 1. Validar posse
      const { data: appt, error: apptError } = await supabase
        .from('appointments')
        .select('id, client_id, salon_id, services(name)')
        .eq('id', appointment_id)
        .single();

      if (apptError || !appt) {
        if (apptError && apptError.code !== 'PGRST116') {
          console.error('Supabase cancel lookup error:', { appointment_id, error: apptError });
        }
        return res.status(404).json({ error: 'Agendamento não encontrado' });
      }

      if (appt.client_id !== client_id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // 2. Buscar owner_id do salão
      const { data: salon, error: salonError } = await supabase
        .from('salons')
        .select('owner_id')
        .eq('id', appt.salon_id)
        .single();

      if (salonError || !salon) {
        console.error('Supabase cancel salon lookup error:', { salon_id: appt.salon_id, error: salonError });
        return res.status(500).json({ error: 'Erro ao buscar informações do salão' });
      }

      // 3. Atualizar status
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'canceled' })
        .eq('id', appointment_id);

      if (updateError) {
        console.error('Supabase cancel update error:', { appointment_id, error: updateError });
        return res.status(500).json({ error: 'Erro ao cancelar agendamento' });
      }

      // 4. Notificação
      await supabase.from('notifications').insert([{
        salon_id: appt.salon_id,
        title: 'Agendamento Cancelado',
        message: `O cliente cancelou o serviço de ${appt.services?.name || 'serviço'}.`
      }]);

      return res.status(200).json({ message: 'Agendamento cancelado com sucesso', owner_id: salon.owner_id });
    }

    // ==========================================
    // AÇÃO: complete — marcar agendamento como concluído
    // ==========================================
    if (action === 'complete') {
      // 1. Validar posse
      const { data: appt, error: apptError } = await supabase
        .from('appointments')
        .select('id, client_id, salon_id, services(name)')
        .eq('id', appointment_id)
        .single();

      if (apptError || !appt) {
        if (apptError && apptError.code !== 'PGRST116') {
          console.error('Supabase complete lookup error:', { appointment_id, error: apptError });
        }
        return res.status(404).json({ error: 'Agendamento não encontrado' });
      }

      if (appt.client_id !== client_id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // 2. Buscar owner_id do salão
      const { data: salon, error: salonError } = await supabase
        .from('salons')
        .select('owner_id')
        .eq('id', appt.salon_id)
        .single();

      if (salonError || !salon) {
        console.error('Supabase complete salon lookup error:', { salon_id: appt.salon_id, error: salonError });
        return res.status(500).json({ error: 'Erro ao buscar informações do salão' });
      }

      // 3. Atualizar status
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', appointment_id);

      if (updateError) {
        console.error('Supabase complete update error:', { appointment_id, error: updateError });
        return res.status(500).json({ error: 'Erro ao concluir agendamento' });
      }

      // 4. Notificação
      await supabase.from('notifications').insert([{
        salon_id: appt.salon_id,
        title: 'Serviço Concluído',
        message: `O cliente confirmou a conclusão do serviço ${appt.services?.name || 'serviço'}.`
      }]);

      return res.status(200).json({ message: 'Agendamento marcado como concluído', owner_id: salon.owner_id });
    }

    // ==========================================
    // AÇÃO: create_review — criar avaliação
    // ==========================================
    if (action === 'create_review') {
      // 1. Validar vínculo e verificar is_active
      const { data: link, error: linkError } = await supabase
        .from('salon_clients')
        .select('is_active')
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .maybeSingle();

      if (linkError) {
        console.error('Supabase create_review link check error:', { salon_id, client_id, error: linkError });
        return res.status(500).json({ error: 'Erro ao validar vínculo' });
      }

      if (!link) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // NOVO: Bloqueia se is_active === false
      if (link.is_active === false) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // 2. Validar que existe pelo menos um agendamento completed elegível
      const { data: completedAppts, error: eligibilityError } = await supabase
        .from('appointments')
        .select('id')
        .eq('client_id', client_id)
        .eq('salon_id', salon_id)
        .eq('status', 'completed')
        .limit(1);

      if (eligibilityError) {
        console.error('Supabase create_review eligibility check error:', { salon_id, client_id, error: eligibilityError });
        return res.status(500).json({ error: 'Erro ao validar elegibilidade' });
      }

      if (!completedAppts || completedAppts.length === 0) {
        return res.status(403).json({ error: 'Sem elegibilidade para avaliar' });
      }

      // 3. Inserir review
      const { data: review, error: createError } = await supabase
        .from('reviews')
        .insert({
          salon_id: salon_id,
          client_id: client_id,
          rating: rating,
          comment: comment || ''
        })
        .select('id, salon_id, client_id, rating, comment, created_at')
        .single();

      if (createError) {
        console.error('Supabase create_review insert error:', { salon_id, client_id, error: createError });
        return res.status(500).json({ error: 'Erro ao criar avaliação' });
      }

      return res.status(201).json({ review });
    }

    // ==========================================
    // AÇÃO: mark_notifications_read — marcar notificações como lidas
    // ==========================================
    if (action === 'mark_notifications_read') {
      if (id) {
        // Marcar apenas uma notificação (validar que pertence ao cliente)
        const { data: notification, error: notifError } = await supabase
          .from('notifications')
          .select('id, client_id')
          .eq('id', id)
          .single();

        if (notifError || !notification) {
          if (notifError && notifError.code !== 'PGRST116') {
            console.error('Supabase mark_notifications_read lookup error:', { id, error: notifError });
          }
          return res.status(404).json({ error: 'Notificação não encontrada' });
        }

        if (notification.client_id !== client_id) {
          return res.status(403).json({ error: 'Acesso negado' });
        }

        const { error: updateError } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', id);

        if (updateError) {
          console.error('Supabase mark_notifications_read update error:', { id, error: updateError });
          return res.status(500).json({ error: 'Erro ao atualizar notificação' });
        }
      } else {
        // Marcar todas as notificações do cliente como lidas
        const { error: updateError } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('client_id', client_id)
          .eq('is_read', false);

        if (updateError) {
          console.error('Supabase mark_notifications_read bulk update error:', { client_id, error: updateError });
          return res.status(500).json({ error: 'Erro ao atualizar notificações' });
        }
      }

      return res.status(200).json({ message: 'Notificações marcadas como lidas' });
    }

    // ==========================================
    // AÇÃO: list_notifications — listar notificações do cliente
    // ==========================================
    if (action === 'list_notifications') {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Supabase list_notifications error:', { client_id, error });
        return res.status(500).json({ error: 'Erro ao buscar notificações' });
      }

      return res.status(200).json({ notifications: data || [] });
    }

    // ==========================================
    // AÇÃO: get_salon_contact — buscar owner_id e phone do salão
    // ==========================================
    if (action === 'get_salon_contact') {
      // 1. Buscar salon com owner_id
      const { data: salon, error: salonError } = await supabase
        .from('salons')
        .select('owner_id')
        .eq('id', salon_id)
        .single();

      if (salonError || !salon) {
        if (salonError && salonError.code !== 'PGRST116') {
          console.error('Supabase get_salon_contact salon lookup error:', { salon_id, error: salonError });
        }
        return res.status(404).json({ error: 'Salão não encontrado' });
      }

      // 2. Buscar phone do owner via profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', salon.owner_id)
        .single();

      if (profileError) {
        console.error('Supabase get_salon_contact profile lookup error:', { owner_id: salon.owner_id, error: profileError });
        return res.status(500).json({ error: 'Erro ao buscar contato do salão' });
      }

      return res.status(200).json({
        owner_id: salon.owner_id,
        phone: profile?.phone || null
      });
    }

    // ==========================================
    // AÇÃO: get_salon_payment_options — o cliente descobre se o salão aceita
    // pagamento pelo app (Mercado Pago conectado). O cliente não tem sessão Auth e
    // não pode ler a view salon_mp_connection_status (owner-only); por isso esta
    // consulta roda via service_role e devolve apenas um booleano — nunca o token.
    // ==========================================
    if (action === 'get_salon_payment_options') {
      const { data: cred, error: credError } = await supabase
        .from('salon_mp_credentials')
        .select('access_token')
        .eq('salon_id', salon_id)
        .maybeSingle();

      if (credError) {
        console.error('Supabase get_salon_payment_options error:', { salon_id, error: credError });
        return res.status(500).json({ error: 'Erro ao verificar formas de pagamento' });
      }

      // Uma linha só existe se a conexão OAuth foi concluída (access_token NOT NULL).
      const mpConnected = !!(cred && cred.access_token);

      return res.status(200).json({ mp_connected: mpConnected });
    }

    // ==========================================
    // AÇÃO: subscribe — cliente assina um plano do salão
    // Sem payment_method → assinatura 'active' (legado, sem pagamento).
    // payment_method='external' → assinatura 'pending' para o dono confirmar depois.
    // ==========================================
    if (action === 'subscribe') {
      // 1. Validar vínculo cliente-salão e bloqueio
      const { data: link, error: linkError } = await supabase
        .from('salon_clients')
        .select('is_active')
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .maybeSingle();

      if (linkError) {
        console.error('Supabase subscribe link check error:', { salon_id, client_id, error: linkError });
        return res.status(500).json({ error: 'Erro ao validar vínculo' });
      }

      if (!link) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      if (link.is_active === false) {
        return res.status(403).json({ error: 'Cliente bloqueado neste salão' });
      }

      // 2. Validar que o plano pertence ao salão e está ativo
      const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('id, salon_id, is_active')
        .eq('id', plan_id)
        .eq('salon_id', salon_id)
        .maybeSingle();

      if (planError) {
        console.error('Supabase subscribe plan lookup error:', { salon_id, plan_id, error: planError });
        return res.status(500).json({ error: 'Erro ao validar plano' });
      }

      if (!plan) {
        return res.status(404).json({ error: 'Plano não encontrado neste salão' });
      }

      if (plan.is_active === false) {
        return res.status(400).json({ error: 'Plano indisponível' });
      }

      // Pagamento direto com o dono (fora do app): a assinatura entra como PENDING
      // e só passa a valer (status='active', payment_status='approved') quando o dono
      // confirmar o pagamento manualmente no painel. Sem payment_method (legado) a
      // assinatura entra 'active' como antes — retrocompatível.
      const isExternal = payment_method === 'external';

      // 3. Impedir assinatura ATIVA duplicada do mesmo cliente no mesmo plano
      const { data: existing, error: existingError } = await supabase
        .from('client_subscriptions')
        .select('id')
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .eq('plan_id', plan_id)
        .eq('status', 'active')
        .maybeSingle();

      if (existingError) {
        console.error('Supabase subscribe existing check error:', { salon_id, client_id, plan_id, error: existingError });
        return res.status(500).json({ error: 'Erro ao validar assinatura' });
      }

      if (existing) {
        return res.status(409).json({ error: 'Você já possui uma assinatura ativa deste plano' });
      }

      // 3b. Para pagamento externo, reutiliza uma pendência já existente do mesmo
      // plano (idempotência — evita várias linhas pending se o cliente clicar de novo).
      if (isExternal) {
        const { data: pendingExisting, error: pendingErr } = await supabase
          .from('client_subscriptions')
          .select('id, salon_id, plan_id, client_id, status, payment_status, payment_method, started_at, created_at')
          .eq('salon_id', salon_id)
          .eq('client_id', client_id)
          .eq('plan_id', plan_id)
          .eq('status', 'pending')
          .eq('payment_method', 'external')
          .maybeSingle();

        if (pendingErr) {
          console.error('Supabase subscribe pending check error:', { salon_id, client_id, plan_id, error: pendingErr });
          return res.status(500).json({ error: 'Erro ao validar assinatura' });
        }

        if (pendingExisting) {
          return res.status(200).json({ subscription: pendingExisting });
        }
      }

      // 4. Inserir assinatura (pending para pagamento externo; active para o legado)
      const insertPayload = isExternal
        ? {
            salon_id: salon_id,
            plan_id: plan_id,
            client_id: client_id,
            status: 'pending',
            payment_status: 'pending',
            payment_method: 'external'
          }
        : {
            salon_id: salon_id,
            plan_id: plan_id,
            client_id: client_id,
            status: 'active'
          };

      const { data: subscription, error: createError } = await supabase
        .from('client_subscriptions')
        .insert(insertPayload)
        .select('id, salon_id, plan_id, client_id, status, payment_status, payment_method, started_at, created_at')
        .single();

      if (createError) {
        console.error('Supabase subscribe insert error:', { salon_id, client_id, plan_id, error: createError });
        // 23505: unique_violation — corrida com o índice único parcial de assinatura ativa
        if (createError.code === '23505') {
          return res.status(409).json({ error: 'Você já possui uma assinatura ativa deste plano' });
        }
        // 23503: foreign_key_violation — client_id/plan_id/salon_id inexistente
        if (createError.code === '23503') {
          return res.status(400).json({ error: 'Dados da assinatura inválidos' });
        }
        // 23514: check_violation — valor fora do CHECK (ex: status inválido)
        if (createError.code === '23514') {
          return res.status(400).json({ error: 'Status de assinatura inválido' });
        }
        return res.status(500).json({ error: 'Erro ao criar assinatura' });
      }

      return res.status(201).json({ subscription });
    }

    // ==========================================
    // AÇÃO: cancel_subscription — cliente cancela sua assinatura
    // Não cancela agendamentos futuros (decisão: negociação humana pelo dono).
    // ==========================================
    if (action === 'cancel_subscription') {
      // 1. Validar posse da assinatura
      const { data: sub, error: subError } = await supabase
        .from('client_subscriptions')
        .select('id, salon_id, client_id, status')
        .eq('id', subscription_id)
        .maybeSingle();

      if (subError) {
        console.error('Supabase cancel_subscription lookup error:', { subscription_id, error: subError });
        return res.status(500).json({ error: 'Erro ao buscar assinatura' });
      }

      if (!sub) {
        return res.status(404).json({ error: 'Assinatura não encontrada' });
      }

      if (sub.client_id !== client_id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // Escopo multi-tenant: client_id é identidade GLOBAL (o mesmo cliente pode
      // ter assinaturas em vários salões). Sem validar o salão, um cliente poderia
      // cancelar sua assinatura de OUTRO salão a partir do contexto deste. Exige que
      // a assinatura pertença ao salão informado.
      if (sub.salon_id !== salon_id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      if (sub.status === 'canceled') {
        return res.status(409).json({ error: 'Assinatura já cancelada' });
      }

      // 2. Cancelar (não toca em nenhum agendamento — gestão manual pelo dono)
      const { data: updated, error: updateError } = await supabase
        .from('client_subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          canceled_by: 'client'
        })
        .eq('id', subscription_id)
        .select('id, salon_id, plan_id, client_id, status, started_at, canceled_at, canceled_by')
        .single();

      if (updateError) {
        console.error('Supabase cancel_subscription update error:', { subscription_id, error: updateError });
        return res.status(500).json({ error: 'Erro ao cancelar assinatura' });
      }

      return res.status(200).json({ subscription: updated });
    }

    // ==========================================
    // AÇÃO: list_client_subscriptions — assinaturas ATIVAS do cliente NESTE salão
    // (isolamento por salon_id) com plano e serviços/cotas. Alimenta a tela do cliente.
    // ==========================================
    if (action === 'list_client_subscriptions') {
      // 1. Validar vínculo cliente-salão e bloqueio
      const { data: link, error: linkError } = await supabase
        .from('salon_clients')
        .select('is_active')
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .maybeSingle();

      if (linkError) {
        console.error('Supabase list_client_subscriptions link check error:', { salon_id, client_id, error: linkError });
        return res.status(500).json({ error: 'Erro ao validar vínculo' });
      }

      if (!link) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      if (link.is_active === false) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      // 2. Buscar assinaturas ATIVAS e PENDENTES do cliente NESTE salão, com plano e
      // serviços/cotas. Pendentes (aguardando pagamento) são retornadas para a tela do
      // cliente exibir o estado "aguardando pagamento" — o frontend só trata como ativa
      // (consumindo cota) quando status='active' E payment_status='approved'.
      const { data, error } = await supabase
        .from('client_subscriptions')
        .select('id, salon_id, plan_id, status, payment_status, payment_method, started_at, created_at, subscription_plans(id, name, description, price, is_active, subscription_plan_services(service_id, monthly_quota, services(id, name)), subscription_plan_days(day_of_week))')
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .in('status', ['active', 'pending'])
        .order('started_at', { ascending: false });

      if (error) {
        console.error('Supabase list_client_subscriptions error:', { salon_id, client_id, error });
        return res.status(500).json({ error: 'Erro ao buscar assinaturas' });
      }

      return res.status(200).json({ subscriptions: data || [] });
    }

    // ==========================================
    // AÇÃO: notify_client — inserir notificação para o cliente via service_role
    // Usado pelo painel do dono (que não tem permissão RLS para inserir com client_id).
    // ==========================================
    if (action === 'notify_client') {
      const { data: clientLink, error: linkError } = await supabase
        .from('salon_clients')
        .select('client_id')
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .maybeSingle();

      if (linkError) {
        console.error('Supabase notify_client salon_clients lookup error:', { salon_id, client_id, error: linkError });
        return res.status(500).json({ error: 'Erro ao verificar vínculo do cliente' });
      }

      if (!clientLink) {
        return res.status(403).json({ error: 'client_id não pertence a este salão' });
      }

      const { error: notifyError } = await supabase
        .from('notifications')
        .insert([{ client_id, salon_id, title, message }]);

      if (notifyError) {
        console.error('Supabase notify_client insert error:', { client_id, salon_id, error: notifyError });
        return res.status(500).json({ error: 'Erro ao registrar notificação para o cliente' });
      }

      return res.status(201).json({ message: 'Notificação registrada' });
    }
  } catch (error) {
    console.error('Unexpected error in appointments handler:', {
      action,
      salon_id,
      client_id,
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
