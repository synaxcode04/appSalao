import { createClient } from '@supabase/supabase-js';

/**
 * Normaliza telefone para armazenamento no banco.
 * Remove todos os caracteres não numéricos.
 * Exemplo: "(11) 99999-9999" → "11999999999"
 *
 * @param {string} phone - número de telefone em formato livre
 * @returns {string} telefone normalizado (apenas dígitos)
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return '';
  }
  return phone.replace(/\D/g, '');
}

/**
 * Valida entrada para operações. Retorna erro ou null se válido.
 */
function validateInput(action, body) {
  if (action === 'lookup' || action === 'create_or_get') {
    if (!body.phone) {
      return 'phone is required';
    }
  }

  if (action === 'create_or_get') {
    if (!body.full_name) {
      return 'full_name is required';
    }
  }

  if (action === 'link_to_salon') {
    if (!body.phone) {
      return 'phone is required';
    }
    if (!body.salon_id) {
      return 'salon_id is required';
    }
  }

  if (action === 'toggle_active') {
    if (!body.salon_id) {
      return 'salon_id is required';
    }
    if (!body.client_id) {
      return 'client_id is required';
    }
    if (typeof body.is_active !== 'boolean') {
      return 'is_active must be a boolean';
    }
  }

  if (action === 'check_active') {
    if (!body.salon_id) {
      return 'salon_id is required';
    }
    if (!body.client_id) {
      return 'client_id is required';
    }
  }

  if (action === 'update') {
    if (!body.client_id) {
      return 'client_id is required';
    }
    if (!body.current_phone) {
      return 'current_phone is required for update action';
    }
    // Valida que pelo menos um campo editável foi fornecido
    if (!body.full_name && !body.phone && !body.birth_date && !body.avatar_base64) {
      return 'At least one editable field must be provided (full_name, phone, birth_date, or avatar_base64)';
    }
  }

  return null;
}

export default async function handler(req, res) {
  // Apenas POST suportado
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, phone, full_name, birth_date, salon_id, client_id, is_active, avatar_base64, avatar_ext, current_phone } = req.body;

  // Validar ação
  if (!action || !['lookup', 'create_or_get', 'link_to_salon', 'toggle_active', 'check_active', 'update'].includes(action)) {
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

  // Normalizar telefone (apenas para ações baseadas em telefone)
  const phoneBasedActions = ['lookup', 'create_or_get', 'link_to_salon'];
  const normalizedPhone = normalizePhone(phone);
  if (phoneBasedActions.includes(action) && !normalizedPhone) {
    return res.status(400).json({ error: 'Invalid phone format' });
  }

  // Instanciar Supabase com service_role (bypassa RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // ==========================================
  // Autenticação/autorização das ações sensíveis
  // toggle_active e check_active bypassam RLS via service_role,
  // então a verificação de identidade/ownership é feita aqui.
  // ==========================================
  const authGuardedActions = ['toggle_active', 'check_active'];
  let authUser = null;
  if (authGuardedActions.includes(action)) {
    // Extrai o Bearer token do header Authorization
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Valida o token e resolve o usuário. O service_role client aceita o
    // access_token do usuário em getUser(token) sem tocar a sessão persistida.
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      if (userError) {
        console.error('Supabase getUser error:', { action, message: userError.message });
      }
      return res.status(401).json({ error: 'Não autenticado' });
    }
    authUser = userData.user;

    // check_active: o chamador só pode checar o próprio bloqueio.
    if (action === 'check_active' && authUser.id !== client_id) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // toggle_active: o chamador precisa ser o dono do salon_id.
    if (action === 'toggle_active') {
      const { data: salon, error: salonError } = await supabase
        .from('salons')
        .select('owner_id')
        .eq('id', salon_id)
        .single();

      if (salonError || !salon) {
        if (salonError && salonError.code !== 'PGRST116') {
          console.error('Supabase salon ownership lookup error:', { salon_id, message: salonError.message });
        }
        return res.status(403).json({ error: 'Sem permissão' });
      }

      if (salon.owner_id !== authUser.id) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    }
  }

  try {
    // ==========================================
    // AÇÃO: lookup — procura cliente por telefone
    // ==========================================
    if (action === 'lookup') {
      const { data, error } = await supabase
        .from('clients')
        .select('id, phone, full_name, created_at')
        .eq('phone', normalizedPhone)
        .single(); // Uma linha ou nenhuma

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = "requested single object but got none" (normal, cliente não existe)
        console.error('Supabase lookup error:', { phone: normalizedPhone, error });
        return res.status(500).json({ error: 'Erro ao buscar cliente' });
      }

      // Se não encontrou, retorna 404 com indicador
      if (!data) {
        return res.status(404).json({ error: 'Cliente não encontrado', client: null });
      }

      return res.status(200).json({ client: data });
    }

    // ==========================================
    // AÇÃO: create_or_get — UPSERT de cliente
    // ==========================================
    if (action === 'create_or_get') {
      // Primeiro, tenta buscar o cliente existente
      const { data: existing } = await supabase
        .from('clients')
        .select('id, phone, full_name, created_at')
        .eq('phone', normalizedPhone)
        .single();

      if (existing) {
        // Cliente já existe, retorna sem criar duplicata
        return res.status(200).json({ client: existing, created: false });
      }

      // Cliente não existe, cria novo
      const { data: newClient, error: createError } = await supabase
        .from('clients')
        .insert({
          phone: normalizedPhone,
          full_name: full_name.trim(),
          ...(birth_date ? { birth_date } : {})
        })
        .select('id, phone, full_name, created_at')
        .single();

      if (createError) {
        console.error('Supabase create client error:', { phone: normalizedPhone, error: createError });
        return res.status(500).json({ error: 'Erro ao criar cliente' });
      }

      return res.status(201).json({ client: newClient, created: true });
    }

    // ==========================================
    // AÇÃO: link_to_salon — vincular cliente a salão
    // ==========================================
    if (action === 'link_to_salon') {
      // TODO segurança: verificar ownership do salon_id (dono === auth.uid())
      // antes de vincular — mesma lacuna corrigida em toggle_active/check_active.
      // Não alterado aqui para não quebrar o fluxo atual do ClientsManager.
      // Primeiro, garante que o cliente existe (create_or_get)
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('phone', normalizedPhone)
        .single();

      if (clientError && clientError.code !== 'PGRST116') {
        console.error('Supabase client lookup error:', { phone: normalizedPhone, error: clientError });
        return res.status(500).json({ error: 'Erro ao buscar cliente' });
      }

      let clientId = client?.id;

      // Se cliente não existe, cria
      if (!clientId) {
        if (!full_name) {
          return res.status(400).json({ error: 'full_name required when creating new client' });
        }

        const { data: newClient, error: createError } = await supabase
          .from('clients')
          .insert({
            phone: normalizedPhone,
            full_name: full_name.trim(),
            ...(birth_date ? { birth_date } : {})
          })
          .select('id')
          .single();

        if (createError) {
          console.error('Supabase create client error:', { phone: normalizedPhone, error: createError });
          return res.status(500).json({ error: 'Erro ao criar cliente' });
        }

        clientId = newClient.id;
      }

      // Agora tenta vincular ao salão (UPSERT para respeitar UNIQUE(salon_id, client_id))
      // Se já existe, ignora (idempotente); se não existe, cria
      const { data: salonClient, error: linkError } = await supabase
        .from('salon_clients')
        .upsert(
          {
            salon_id: salon_id,
            client_id: clientId
          },
          {
            onConflict: 'salon_id,client_id' // Ignora se já existe
          }
        )
        .select('id, salon_id, client_id, created_at')
        .single();

      if (linkError) {
        console.error('Supabase link client to salon error:', {
          phone: normalizedPhone,
          salon_id,
          error: linkError
        });
        return res.status(500).json({ error: 'Erro ao vincular cliente ao salão' });
      }

      return res.status(200).json({
        message: 'Cliente vinculado ao salão com sucesso',
        salon_client: salonClient,
        client_id: clientId
      });
    }

    // ==========================================
    // AÇÃO: toggle_active — ativa/inativa vínculo cliente-salão
    // ==========================================
    if (action === 'toggle_active') {
      const { data: updated, error: updateError } = await supabase
        .from('salon_clients')
        .update({ is_active: is_active })
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .select('id, salon_id, client_id, is_active, created_at')
        .single();

      if (updateError) {
        // PGRST116 = nenhuma linha retornada → vínculo inexistente
        if (updateError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Vínculo cliente-salão não encontrado' });
        }
        console.error('Supabase toggle_active error:', { salon_id, client_id, error: updateError });
        return res.status(500).json({ error: 'Erro ao atualizar vínculo do cliente' });
      }

      if (!updated) {
        return res.status(404).json({ error: 'Vínculo cliente-salão não encontrado' });
      }

      return res.status(200).json({ salon_client: updated });
    }

    // ==========================================
    // AÇÃO: check_active — verifica se cliente está bloqueado no salão
    // ==========================================
    if (action === 'check_active') {
      const { data: link, error: checkError } = await supabase
        .from('salon_clients')
        .select('is_active')
        .eq('salon_id', salon_id)
        .eq('client_id', client_id)
        .maybeSingle();

      if (checkError) {
        console.error('Supabase check_active error:', { salon_id, client_id, error: checkError });
        return res.status(500).json({ error: 'Erro ao verificar vínculo do cliente' });
      }

      // Bloqueado somente se existir vínculo com is_active = false.
      // Ausência de vínculo ⇒ não bloqueado.
      const blocked = link ? link.is_active === false : false;

      return res.status(200).json({ blocked });
    }

    // ==========================================
    // AÇÃO: update — edita perfil do cliente
    // ==========================================
    if (action === 'update') {
      // GUARDA DE AUTORIZAÇÃO: Prova de posse por telefone
      // Busca o cliente e valida se current_phone bate com o telefone atual
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('phone')
        .eq('id', client_id)
        .single();

      // Se cliente não existe ou erro no banco
      if (clientError && clientError.code !== 'PGRST116') {
        console.error('Supabase client lookup error (update guard):', { client_id, error: clientError });
        return res.status(500).json({ error: 'Erro ao verificar cliente' });
      }

      if (!client) {
        // Cliente não encontrado
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }

      // Validar current_phone: normalizar e comparar com phone atual do cliente
      const normalizedCurrentPhone = normalizePhone(current_phone);
      if (normalizedCurrentPhone !== client.phone) {
        // Telefone não bate — sem permissão
        return res.status(403).json({ error: 'Sem permissão' });
      }

      // Se telefone foi enviado para atualizar: normalizar e validar unicidade
      let normalizedUpdatePhone = null;
      if (phone) {
        normalizedUpdatePhone = normalizePhone(phone);
        if (!normalizedUpdatePhone) {
          return res.status(400).json({ error: 'Invalid phone format' });
        }

        // Verificar se o novo telefone já pertence a OUTRO cliente
        const { data: existingClientWithPhone, error: checkPhoneError } = await supabase
          .from('clients')
          .select('id')
          .eq('phone', normalizedUpdatePhone)
          .single();

        // Se erro PGRST116, nenhum cliente com esse phone (ok).
        // Se outro erro, retorna 500.
        if (checkPhoneError && checkPhoneError.code !== 'PGRST116') {
          console.error('Supabase phone uniqueness check error:', { client_id, error: checkPhoneError });
          return res.status(500).json({ error: 'Erro ao verificar telefone' });
        }

        // Se existe cliente com esse phone e NÃO é o cliente atual, conflito
        if (existingClientWithPhone && existingClientWithPhone.id !== client_id) {
          return res.status(409).json({ error: 'Telefone já está em uso por outro cliente' });
        }
      }

      // Se avatar foi enviado: fazer upload no Storage e obter URL pública
      let avatarUrl = null;
      if (avatar_base64) {
        try {
          // Extrair parte base64 após a vírgula se for data URL
          // Exemplo: "data:image/jpeg;base64,/9j/..." → "/9j/..."
          const rawBase64 = avatar_base64.includes(',') ? avatar_base64.split(',')[1] : avatar_base64;

          // Decodificar base64 para Buffer
          const buffer = Buffer.from(rawBase64, 'base64');

          // Derivar extensão: extrair mime-type do prefixo data URL quando presente
          let ext = avatar_ext || 'jpg';
          if (avatar_base64.includes(',')) {
            // Prefixo: "data:image/TYPE;base64" ou "data:image/TYPE"
            const mimeMatch = avatar_base64.match(/^data:image\/([a-zA-Z0-9+\-\.]*)/);
            if (mimeMatch && mimeMatch[1]) {
              ext = mimeMatch[1];
              // Normalizar "jpeg" → "jpg"
              if (ext === 'jpeg') {
                ext = 'jpg';
              }
            }
          }

          // Caminho no bucket: {client_id}.{ext}
          // upsert: true = sobrescreve se já existe
          const filePath = `${client_id}.${ext}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('client-avatars')
            .upload(filePath, buffer, {
              contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
              upsert: true
            });

          if (uploadError) {
            console.error('Supabase storage upload error:', { client_id, error: uploadError });
            return res.status(500).json({ error: 'Erro ao fazer upload da foto' });
          }

          // Obter URL pública do arquivo
          const { data: publicUrlData } = supabase.storage
            .from('client-avatars')
            .getPublicUrl(filePath);

          avatarUrl = publicUrlData.publicUrl;
        } catch (parseError) {
          console.error('Avatar base64 parsing error:', { client_id, message: parseError.message });
          return res.status(400).json({ error: 'Invalid avatar_base64 format' });
        }
      }

      // Montar objeto de UPDATE apenas com campos presentes
      const updateObject = {};
      if (full_name) {
        updateObject.full_name = full_name.trim();
      }
      if (normalizedUpdatePhone) {
        updateObject.phone = normalizedUpdatePhone;
      }
      if (birth_date) {
        updateObject.birth_date = birth_date;
      }
      if (avatarUrl) {
        updateObject.avatar_url = avatarUrl;
      }

      // Executar UPDATE
      const { data: updated, error: updateError } = await supabase
        .from('clients')
        .update(updateObject)
        .eq('id', client_id)
        .select('id, phone, full_name, birth_date, avatar_url')
        .single();

      if (updateError) {
        // PGRST116 = cliente não encontrado
        if (updateError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Cliente não encontrado' });
        }
        console.error('Supabase update client error:', { client_id, error: updateError });
        return res.status(500).json({ error: 'Erro ao atualizar cliente' });
      }

      if (!updated) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }

      return res.status(200).json({ client: updated });
    }
  } catch (error) {
    console.error('Unexpected error in client-identity handler:', {
      action,
      phone: normalizedPhone,
      message: error.message
    });
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
