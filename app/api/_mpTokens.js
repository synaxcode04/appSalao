const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Renova o access_token do dono usando o refresh_token armazenado e persiste
 * as credenciais atualizadas em salon_mp_credentials via service_role.
 *
 * @param {string} salonId
 * @param {string} refreshToken
 * @returns {Promise<string>} novo access_token
 */
export async function refreshMpToken(salonId, refreshToken) {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Configuração OAuth do Mercado Pago ausente: MP_CLIENT_ID ou MP_CLIENT_SECRET');
  }

  const response = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`MP token refresh falhou: ${response.status} ${err}`);
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/salon_mp_credentials?salon_id=eq.${salonId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.text();
    throw new Error(`Supabase credentials update falhou: ${updateRes.status} ${err}`);
  }

  return data.access_token;
}

/**
 * Retorna um access_token válido para o salão.
 * Se o token estiver expirado e houver refresh_token, renova automaticamente.
 * Retorna null se o salão não tiver credencial MP cadastrada.
 *
 * @param {string} salonId
 * @returns {Promise<string|null>}
 */
export async function getValidMpToken(salonId) {
  const credRes = await fetch(
    `${SUPABASE_URL}/rest/v1/salon_mp_credentials?salon_id=eq.${salonId}&select=access_token,refresh_token,expires_at`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!credRes.ok) {
    throw new Error(`Supabase credentials fetch falhou: ${credRes.status}`);
  }

  const rows = await credRes.json();
  if (!rows || rows.length === 0) {
    return null;
  }

  const cred = rows[0];
  const expiresAt = cred.expires_at ? new Date(cred.expires_at) : null;

  if (expiresAt && expiresAt <= new Date(Date.now() + 60_000)) {
    if (!cred.refresh_token) {
      throw new Error('Token MP expirado e sem refresh_token disponível');
    }
    return refreshMpToken(salonId, cred.refresh_token);
  }

  return cred.access_token;
}
