import { createClient } from '@supabase/supabase-js';

/**
 * Cadastro manual de salão pelo super-admin.
 *
 * Cria de fato a conta do dono (Supabase Auth + profiles + salons) com uma
 * senha temporária definida pelo admin. Espelha o fluxo do Register.jsx do
 * dono (role=owner), mas executado server-side com service_role para conseguir
 * criar o usuário via admin API.
 *
 * NOTA sobre e-mail: a tabela `profiles` NÃO possui coluna `email` — o e-mail
 * real do dono vive em `auth.users` (criado via auth.admin.createUser). Por isso
 * NÃO gravamos e-mail em profiles aqui.
 */

// Validação básica de formato de e-mail (não exaustiva, só evita lixo óbvio).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  // Apenas POST suportado
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body || {};
  // Compatibilidade retro: ausência de action ⇒ 'create' (modal original).
  const action = body.action || 'create';

  if (!['create', 'update'].includes(action)) {
    return res.status(400).json({ error: 'Ação inválida.' });
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
      console.error('Supabase getUser error:', { message: userError.message });
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

  // ==========================================
  // AÇÃO: update — edita dados de identificação/contato do salão.
  // NÃO permite alterar owner_id, status, subscription_expires_at, is_active
  // (esses têm fluxo próprio de Renovar/Bloquear no painel).
  // ==========================================
  if (action === 'update') {
    const { salonId, name, address, target_gender, document } = body;

    if (!salonId) {
      return res.status(400).json({ error: 'salonId é obrigatório.' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'O nome do salão não pode ficar vazio.' });
    }

    const updateFields = { name: name.trim() };
    // Campos opcionais — só incluídos se enviados (undefined não sobrescreve).
    if (address !== undefined) updateFields.address = address;
    if (target_gender !== undefined) updateFields.target_gender = target_gender;
    if (document !== undefined) updateFields.document = document;

    const { data: updatedSalon, error: updateError } = await supabase
      .from('salons')
      .update(updateFields)
      .eq('id', salonId)
      .select('id, owner_id, name, address, target_gender, document')
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Salão não encontrado.' });
      }
      console.error('Supabase update salon error:', { salonId, message: updateError.message });
      return res.status(500).json({ error: 'Erro ao atualizar o salão.' });
    }

    if (!updatedSalon) {
      return res.status(404).json({ error: 'Salão não encontrado.' });
    }

    return res.status(200).json({ salon: updatedSalon });
  }

  // ==========================================
  // AÇÃO: create — validação de entrada (todos obrigatórios)
  // ==========================================
  const { salonName, document, ownerFullName, ownerPhone, email, password } = body;

  if (!salonName || !document || !ownerFullName || !ownerPhone || !email || !password) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'E-mail em formato inválido.' });
  }

  // ==========================================
  // FLUXO DE CRIAÇÃO (ordem importa; rollback em falha parcial)
  // ==========================================

  // 1. Criar usuário no Supabase Auth.
  //    email_confirm:true permite que o dono logue direto sem confirmar o e-mail.
  const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (createUserError || !created?.user) {
    const rawMsg = createUserError?.message || '';
    // Mensagem amigável para e-mail já cadastrado
    if (/already been registered|already registered|already exists|duplicate/i.test(rawMsg)) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }
    console.error('Supabase admin createUser error:', { message: rawMsg });
    return res.status(400).json({ error: 'Não foi possível criar o usuário do dono.' });
  }

  const novoUserId = created.user.id;

  // 2. Criar registro em profiles (sem coluna email — ela vive em auth.users).
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: novoUserId,
      role: 'owner',
      full_name: ownerFullName,
      phone: ownerPhone
    });

  if (profileError) {
    console.error('Supabase insert profile error:', { message: profileError.message });
    // Rollback: remove o usuário auth para não deixar órfão
    const { error: delError } = await supabase.auth.admin.deleteUser(novoUserId);
    if (delError) {
      console.error('Rollback deleteUser (after profile fail) error:', { message: delError.message });
    }
    return res.status(500).json({ error: 'Erro ao salvar perfil do dono.' });
  }

  // 3. Criar o salão vinculado ao dono.
  const { data: salonData, error: salonError } = await supabase
    .from('salons')
    .insert({
      owner_id: novoUserId,
      name: salonName,
      document
    })
    .select('id')
    .single();

  if (salonError || !salonData) {
    console.error('Supabase insert salon error:', { message: salonError?.message });
    // Rollback: remove profile e usuário auth
    const { error: delProfileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', novoUserId);
    if (delProfileError) {
      console.error('Rollback delete profile (after salon fail) error:', { message: delProfileError.message });
    }
    const { error: delUserError } = await supabase.auth.admin.deleteUser(novoUserId);
    if (delUserError) {
      console.error('Rollback deleteUser (after salon fail) error:', { message: delUserError.message });
    }
    return res.status(500).json({ error: 'Erro ao criar o salão.' });
  }

  return res.status(201).json({ salonId: salonData.id, ownerId: novoUserId });
}
