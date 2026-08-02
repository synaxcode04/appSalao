import crypto from 'crypto';

const REDIRECT_URI = 'https://appsalao-psi.vercel.app/api/mp-oauth-callback';

/**
 * Assina o state com HMAC-SHA256 (MP_CLIENT_SECRET como chave).
 * Formato: base64url( JSON({ salon_id, ts, sig }) )
 * ts (timestamp em ms) limita a validade a 10 min no callback.
 */
function buildSignedState(salonId) {
  const secret = process.env.MP_CLIENT_SECRET;
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', secret).update(`${salonId}:${ts}`).digest('hex');
  return Buffer.from(JSON.stringify({ salon_id: salonId, ts, sig })).toString('base64url');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { salon_id } = req.body;

  if (!salon_id) {
    return res.status(400).json({ error: 'salon_id obrigatório' });
  }

  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!clientId || !clientSecret) {
    console.error('Configuração OAuth do Mercado Pago ausente: MP_CLIENT_ID ou MP_CLIENT_SECRET');
    return res.status(500).json({ error: 'Configuração de pagamento ausente' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Configuração Supabase ausente em mp-oauth-start');
    return res.status(500).json({ error: 'Configuração de servidor ausente' });
  }

  // Validação de ownership: o dono tem sessão Supabase Auth real.
  // O frontend envia o JWT de sessão no header Authorization (Bearer <token>).
  // Validamos via Supabase Auth REST (/auth/v1/user com o JWT do dono) para obter
  // o user_id, depois conferimos que salons.owner_id = user_id via service_role.
  // Essa abordagem é consistente com o modelo do projeto: dono tem sessão Auth
  // real, mas aqui estamos numa Vercel Function sem SDK React — validamos o JWT
  // manualmente em vez de depender do Supabase client autenticado do frontend.
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autenticação necessária' });
  }

  const jwt = authHeader.slice(7);

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (!userRes.ok) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const userData = await userRes.json();
  const userId = userData.id;

  if (!userId) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const salonRes = await fetch(
    `${SUPABASE_URL}/rest/v1/salons?id=eq.${salon_id}&owner_id=eq.${userId}&select=id`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!salonRes.ok) {
    console.error('Supabase salon ownership check falhou:', { salon_id, userId, status: salonRes.status });
    return res.status(500).json({ error: 'Erro ao validar propriedade do salão' });
  }

  const salons = await salonRes.json();
  if (!salons || salons.length === 0) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const state = buildSignedState(salon_id);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: REDIRECT_URI,
    state,
  });

  return res.status(200).json({
    authUrl: `https://auth.mercadopago.com.br/authorization?${params.toString()}`,
  });
}
