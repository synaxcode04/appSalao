import crypto from 'crypto';
import { getValidMpToken } from './_mpTokens.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function validateHmac(req, paymentId) {
  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Webhook HMAC validation desabilitada: MERCADO_PAGO_WEBHOOK_SECRET não configurado');
    return true;
  }

  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];

  if (!signature) return false;

  const parts = signature.split(',');
  let ts = null;
  let v1Hash = null;
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 'ts') ts = value;
    if (key === 'v1') v1Hash = value;
  }

  if (!ts || !v1Hash) return false;

  let manifest = `id:${String(paymentId).toLowerCase()}`;
  if (requestId) manifest += `;request-id:${requestId}`;
  manifest += `;ts:${ts};`;

  const computedHash = crypto
    .createHmac('sha256', webhookSecret)
    .update(manifest)
    .digest('hex');

  try {
    const bufA = Buffer.from(v1Hash, 'hex');
    const bufB = Buffer.from(computedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    const valid = crypto.timingSafeEqual(bufA, bufB);
    return valid;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  try {
    const type = req.body?.type || req.body?.topic || req.query.type || req.query.topic;
    const paymentId = req.body?.data?.id || req.body?.id || req.query['data.id'] || req.query.id;

    if (type !== 'payment') {
      return res.status(200).json({ received: true });
    }

    if (!paymentId) {
      return res.status(200).json({ received: true });
    }

    if (!validateHmac(req, paymentId)) {
      return res.status(401).json({ error: 'invalid signature' });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('Configuração Supabase ausente em mp-plano-webhook');
      return res.status(200).json({ received: true });
    }

    const salonId = req.query.salon_id;
    if (!salonId) {
      console.error('mp-plano-webhook: salon_id ausente na query — notificação não processada', { paymentId });
      return res.status(200).json({ received: true });
    }

    let ownerToken;
    try {
      ownerToken = await getValidMpToken(salonId);
    } catch (err) {
      console.error('Erro ao obter token MP do dono no webhook:', { salonId, message: err.message });
      return res.status(200).json({ received: true });
    }

    if (!ownerToken) {
      console.error('mp-plano-webhook: salão sem credenciais MP', { salonId });
      return res.status(200).json({ received: true });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    if (!mpRes.ok) {
      console.error('MP payment query error em mp-plano-webhook:', { paymentId, salonId, status: mpRes.status });
      return res.status(200).json({ received: true });
    }

    const paymentData = await mpRes.json();
    const subscriptionId = paymentData.external_reference;
    const mpPaymentStatus = paymentData.status;

    if (!subscriptionId) {
      return res.status(200).json({ received: true });
    }

    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/client_subscriptions?id=eq.${subscriptionId}&select=id,salon_id,payment_status,gateway_ref`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!subRes.ok) {
      console.error('Supabase client_subscriptions fetch error:', { subscriptionId, status: subRes.status });
      return res.status(200).json({ received: true });
    }

    const subs = await subRes.json();
    if (!subs || subs.length === 0) {
      console.error('Assinatura não encontrada para external_reference:', { subscriptionId });
      return res.status(200).json({ received: true });
    }

    const sub = subs[0];

    if (sub.salon_id !== salonId) {
      console.error('mp-plano-webhook: cross-tenant detectado', { subscriptionId, querySalonId: salonId, subSalonId: sub.salon_id });
      return res.status(200).json({ received: true });
    }

    if (sub.payment_status === 'approved') {
      return res.status(200).json({ received: true });
    }

    let updatePayload;
    if (mpPaymentStatus === 'approved') {
      updatePayload = {
        payment_status: 'approved',
        status: 'active',
        started_at: new Date().toISOString(),
        gateway_ref: String(paymentId),
        confirmed_by: 'webhook',
      };
    } else if (mpPaymentStatus === 'rejected' || mpPaymentStatus === 'cancelled') {
      updatePayload = {
        payment_status: mpPaymentStatus,
        gateway_ref: String(paymentId),
      };
    } else {
      updatePayload = {
        payment_status: mpPaymentStatus,
        gateway_ref: String(paymentId),
      };
    }

    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/client_subscriptions?id=eq.${subscriptionId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(updatePayload),
      }
    );

    if (!patchRes.ok) {
      const err = await patchRes.text();
      console.error('Supabase patch client_subscriptions error:', { subscriptionId, status: patchRes.status, err });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('mp-plano-webhook erro inesperado:', { message: err.message });
    return res.status(200).json({ received: true });
  }
}
