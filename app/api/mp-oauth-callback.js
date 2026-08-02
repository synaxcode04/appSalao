import crypto from 'crypto';

const REDIRECT_URI = 'https://appsalao-psi.vercel.app/api/mp-oauth-callback';
// Rota de Configurações do dono: /painel/configuracoes (confirmado em App.jsx)
const SUCCESS_REDIRECT = 'https://appsalao-psi.vercel.app/painel/configuracoes?mp=conectado';
const ERROR_REDIRECT = 'https://appsalao-psi.vercel.app/painel/configuracoes?mp=erro';

/**
 * Valida o state assinado gerado por mp-oauth-start.
 * Rejeita estados com mais de 10 minutos (anti-replay).
 * Retorna o salon_id se válido, null caso contrário.
 */
function verifyState(stateB64) {
  const secret = process.env.MP_CLIENT_SECRET;
  if (!secret) return null;

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(stateB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const { salon_id, ts, sig } = parsed;
  if (!salon_id || !ts || !sig) return null;

  if (Date.now() - parseInt(ts, 10) > 10 * 60 * 1000) return null;

  const expected = crypto.createHmac('sha256', secret).update(`${salon_id}:${ts}`).digest('hex');

  try {
    const valid = crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    return valid ? salon_id : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const { code, state, error: mpError } = req.query;

  if (mpError) {
    return res.redirect(302, ERROR_REDIRECT);
  }

  if (!code || !state) {
    return res.redirect(302, ERROR_REDIRECT);
  }

  const salon_id = verifyState(state);
  if (!salon_id) {
    return res.redirect(302, ERROR_REDIRECT);
  }

  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!clientId || !clientSecret) {
    console.error('Configuração OAuth do Mercado Pago ausente no callback');
    return res.redirect(302, ERROR_REDIRECT);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Configuração Supabase ausente no callback');
    return res.redirect(302, ERROR_REDIRECT);
  }

  try {
    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('MP token exchange falhou:', { salon_id, status: tokenRes.status, err });
      return res.redirect(302, ERROR_REDIRECT);
    }

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token, expires_in, user_id } = tokenData;

    const expiresAt = new Date(Date.now() + (expires_in || 0) * 1000).toISOString();
    const now = new Date().toISOString();

    const upsertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/salon_mp_credentials?on_conflict=salon_id`,
      {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          salon_id,
          access_token,
          refresh_token: refresh_token || null,
          expires_at: expiresAt,
          mp_user_id: user_id ? String(user_id) : null,
          connected_at: now,
          updated_at: now,
        }),
      }
    );

    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      console.error('Supabase upsert salon_mp_credentials falhou:', { salon_id, status: upsertRes.status, err });
      return res.redirect(302, ERROR_REDIRECT);
    }

    return res.redirect(302, SUCCESS_REDIRECT);
  } catch (err) {
    console.error('mp-oauth-callback erro inesperado:', { message: err.message });
    return res.redirect(302, ERROR_REDIRECT);
  }
}
