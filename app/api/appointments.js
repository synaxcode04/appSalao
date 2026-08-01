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
    if (!body.service_id) return 'service_id is required';
    if (!body.appointment_date) return 'appointment_date is required';
    if (!body.start_time) return 'start_time is required';
    if (!body.end_time) return 'end_time is required';
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

  if (action === 'get_salon_contact') {
    if (!body.salon_id) return 'salon_id is required';
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
    professional_id,
    appointment_date,
    start_time,
    end_time,
    rating,
    comment,
    id
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
    'get_salon_contact'
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
        .select('id, salon_id, service_id, professional_id, appointment_date, start_time, end_time, status, services(id, name, duration_minutes, price), professionals(id, name)')
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
        .select('id, appointment_date, start_time, status, services(name, price), salons(id, name, logo_url, address)')
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

      // 2. Recheca conflito de horário server-side
      // Busca todos os agendamentos já marcados para o profissional na data
      const { data: existingAppointments, error: appointmentCheckError } = await supabase
        .from('appointments')
        .select('id, start_time, end_time')
        .eq('salon_id', salon_id)
        .eq('professional_id', professional_id || null)
        .eq('appointment_date', appointment_date)
        .eq('status', 'scheduled');

      if (appointmentCheckError) {
        console.error('Supabase create appointment check error:', { salon_id, professional_id, error: appointmentCheckError });
        return res.status(500).json({ error: 'Erro ao verificar disponibilidade' });
      }

      if (hasConflict(existingAppointments, start_time, end_time)) {
        return res.status(409).json({ error: 'Horário indisponível' });
      }

      // 3. Buscar owner_id do salão
      const { data: salon, error: salonError } = await supabase
        .from('salons')
        .select('owner_id')
        .eq('id', salon_id)
        .single();

      if (salonError || !salon) {
        console.error('Supabase create salon lookup error:', { salon_id, error: salonError });
        return res.status(404).json({ error: 'Salão não encontrado' });
      }

      // 4. Inserir novo agendamento
      const { data: newAppointment, error: createError } = await supabase
        .from('appointments')
        .insert({
          salon_id: salon_id,
          client_id: client_id,
          service_id: service_id,
          professional_id: professional_id || null,
          appointment_date: appointment_date,
          start_time: start_time,
          end_time: end_time,
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

      // 5. Inserir notificação para o dono
      const { data: client } = await supabase
        .from('clients')
        .select('full_name')
        .eq('id', client_id)
        .single();

      const clientName = client?.full_name?.split(' ')[0] || 'Cliente';
      const { data: service } = await supabase
        .from('services')
        .select('name')
        .eq('id', service_id)
        .single();

      const serviceName = service?.name || 'Serviço';
      const dtParts = appointment_date.split('-');
      const dateBr = `${dtParts[2]}/${dtParts[1]}/${dtParts[0]}`;

      await supabase.from('notifications').insert([{
        salon_id: salon_id,
        title: 'Novo Agendamento',
        message: `${clientName} agendou ${serviceName} para o dia ${dateBr} às ${start_time}.`
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

      // 3. Recheca conflito (excluindo o agendamento atual)
      const { data: existingAppointments, error: conflictError } = await supabase
        .from('appointments')
        .select('id, start_time, end_time')
        .eq('salon_id', appt.salon_id)
        .eq('professional_id', appt.professional_id || null)
        .eq('appointment_date', appointment_date)
        .eq('status', 'scheduled')
        .neq('id', appointment_id);

      if (conflictError) {
        console.error('Supabase reschedule conflict check error:', { appointment_id, error: conflictError });
        return res.status(500).json({ error: 'Erro ao verificar disponibilidade' });
      }

      if (hasConflict(existingAppointments, start_time, end_time)) {
        return res.status(409).json({ error: 'Horário indisponível' });
      }

      // 4. Atualizar
      const { data: updated, error: updateError } = await supabase
        .from('appointments')
        .update({
          appointment_date: appointment_date,
          start_time: start_time,
          end_time: end_time
        })
        .eq('id', appointment_id)
        .select('id, salon_id, service_id, professional_id, appointment_date, start_time, end_time, status')
        .single();

      if (updateError) {
        console.error('Supabase reschedule update error:', { appointment_id, error: updateError });
        return res.status(500).json({ error: 'Erro ao reagendar' });
      }

      // 5. Inserir notificação
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
