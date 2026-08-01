import { createClient } from '@supabase/supabase-js';

/**
 * Gestão global de clientes pelo super-admin.
 *
 * Todas as ações exigem role='admin' (guard por Bearer token). Usa service_role
 * (bypassa RLS) porque a tabela `clients` só é acessível server-side. Espelha o
 * padrão de client-identity.js, mas SEM exigir ownership de salão — o chamador
 * já foi validado como admin global.
 */

/**
 * Normaliza telefone para armazenamento no banco.
 * Remove todos os caracteres não numéricos.
 * Exemplo: "(11) 99999-9999" → "11999999999"
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return '';
  }
  return phone.replace(/\D/g, '');
}

export default async function handler(req, res) {
  // Apenas POST suportado
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body || {};
  const { action } = body;

  const validActions = ['list', 'update', 'list_links', 'toggle_link'];
  if (!action || !validActions.includes(action)) {
    return res.status(400).json({ error: 'Ação inválida ou ausente.' });
  }

  // Credenciais do servidor (service_role bypassa RLS — sem prefixo VITE_)
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase service role configuration missing');
    return res.status(500).json({ error: 'Configuração do servidor ausente' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // ==========================================
  // GUARD DE ROLE ADMIN (crítico — service_role bypassa RLS)
  // ==========================================
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    if (userError) {
      console.error('Supabase getUser error:', { action, message: userError.message });
    }
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { data: callerProfile, error: profileLookupError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileLookupError || !callerProfile || callerProfile.role !== 'admin') {
    if (profileLookupError && profileLookupError.code !== 'PGRST116') {
      console.error('Supabase caller profile lookup error:', { message: profileLookupError.message });
    }
    return res.status(403).json({ error: 'Sem permissão' });
  }

  try {
    // ==========================================
    // AÇÃO: list — lista clientes (busca opcional por nome/telefone)
    // ==========================================
    if (action === 'list') {
      const search = typeof body.search === 'string' ? body.search.trim() : '';

      let query = supabase
        .from('clients')
        .select('id, phone, full_name, birth_date')
        .order('full_name', { ascending: true })
        .limit(200);

      if (search) {
        // Busca por nome OU telefone (dígitos). ilike é case-insensitive.
        const digits = normalizePhone(search);
        const orParts = [`full_name.ilike.%${search}%`];
        if (digits) {
          orParts.push(`phone.ilike.%${digits}%`);
        }
        query = query.or(orParts.join(','));
      }

      const { data, error } = await query;

      if (error) {
        console.error('Supabase admin list clients error:', { message: error.message });
        return res.status(500).json({ error: 'Erro ao listar clientes' });
      }

      return res.status(200).json({ clients: data || [] });
    }

    // ==========================================
    // AÇÃO: update — atualiza dados do cliente
    // ==========================================
    if (action === 'update') {
      const { client_id, full_name, phone, birth_date } = body;

      if (!client_id) {
        return res.status(400).json({ error: 'client_id é obrigatório.' });
      }
      if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        return res.status(400).json({ error: 'O nome não pode ficar vazio.' });
      }

      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Telefone inválido.' });
      }

      const updateFields = {
        full_name: full_name.trim(),
        phone: normalizedPhone,
        // birth_date pode ser null (limpar) ou uma data
        birth_date: birth_date || null
      };

      const { data: updated, error: updateError } = await supabase
        .from('clients')
        .update(updateFields)
        .eq('id', client_id)
        .select('id, phone, full_name, birth_date')
        .single();

      if (updateError) {
        // 23505 = violação de UNIQUE (telefone já usado por outro cliente)
        if (updateError.code === '23505') {
          return res.status(409).json({ error: 'Este telefone já pertence a outro cliente.' });
        }
        if (updateError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Cliente não encontrado.' });
        }
        console.error('Supabase admin update client error:', { client_id, message: updateError.message });
        return res.status(500).json({ error: 'Erro ao atualizar cliente' });
      }

      if (!updated) {
        return res.status(404).json({ error: 'Cliente não encontrado.' });
      }

      return res.status(200).json({ client: updated });
    }

    // ==========================================
    // AÇÃO: list_links — vínculos do cliente com salões
    // ==========================================
    if (action === 'list_links') {
      const { client_id } = body;

      if (!client_id) {
        return res.status(400).json({ error: 'client_id é obrigatório.' });
      }

      const { data, error } = await supabase
        .from('salon_clients')
        .select('id, salon_id, is_active, salon:salon_id(name)')
        .eq('client_id', client_id);

      if (error) {
        console.error('Supabase admin list_links error:', { client_id, message: error.message });
        return res.status(500).json({ error: 'Erro ao listar vínculos' });
      }

      const links = (data || []).map(row => ({
        id: row.id,
        salon_id: row.salon_id,
        salon_name: row.salon?.name || 'Salão desconhecido',
        is_active: row.is_active
      }));

      return res.status(200).json({ links });
    }

    // ==========================================
    // AÇÃO: toggle_link — ativa/inativa vínculo (sem exigir ownership; admin)
    // ==========================================
    if (action === 'toggle_link') {
      const { salon_id, client_id, is_active } = body;

      if (!salon_id) {
        return res.status(400).json({ error: 'salon_id é obrigatório.' });
      }
      if (!client_id) {
        return res.status(400).json({ error: 'client_id é obrigatório.' });
      }
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'is_active deve ser booleano.' });
      }

      const { data: updated, error: updateError } = await supabase
        .from('salon_clients')
        .update({ is_active })
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .select('id, salon_id, client_id, is_active')
        .single();

      if (updateError) {
        if (updateError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Vínculo cliente-salão não encontrado' });
        }
        console.error('Supabase admin toggle_link error:', { salon_id, client_id, message: updateError.message });
        return res.status(500).json({ error: 'Erro ao atualizar vínculo do cliente' });
      }

      if (!updated) {
        return res.status(404).json({ error: 'Vínculo cliente-salão não encontrado' });
      }

      return res.status(200).json({ salon_client: updated });
    }
  } catch (error) {
    console.error('Unexpected error in admin-clients handler:', {
      action,
      message: error.message
    });
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
