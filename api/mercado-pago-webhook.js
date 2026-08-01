import crypto from 'crypto';

// Webhook validation requires MERCADO_PAGO_WEBHOOK_SECRET to be configured in Vercel
// (obtained from Mercado Pago Dashboard → Developers → Your integrations → Webhooks → Secret key)
// Without it, the webhook operates in permissive mode (all notifications accepted)
// With it set, only requests with valid HMAC signature are processed

export default async function handler(req, res) {
  try {
    // Normaliza notificação do Mercado Pago: pode vir via query ou body
    // Formatos: topic/type e data.id/id
    const type = req.query.type || req.query.topic || req.body?.type || req.body?.topic;
    const paymentId = req.query['data.id'] || req.query.id || req.body?.data?.id || req.body?.id;

    // Apenas mensagens de payment nos interessam
    if (type !== 'payment') {
      return res.status(200).json({ received: true });
    }

    // Se não há ID, nada a fazer
    if (!paymentId) {
      return res.status(200).json({ received: true });
    }

    // HMAC signature validation (only for payment type with paymentId)
    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-signature'];
      const requestId = req.headers['x-request-id'];

      if (!signature) {
        return res.status(401).json({ error: 'invalid signature' });
      }

      // Parse signature header: format "ts=<timestamp>,v1=<hash>"
      const parts = signature.split(',');
      let ts = null;
      let v1Hash = null;
      for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 'ts') ts = value;
        if (key === 'v1') v1Hash = value;
      }

      if (!ts || !v1Hash) {
        return res.status(401).json({ error: 'invalid signature' });
      }

      // Build manifest per Mercado Pago spec: id:<id>;request-id:<request-id>;ts:<ts>;
      // Only include segments if the corresponding value exists
      let manifest = `id:${String(paymentId).toLowerCase()}`;
      if (requestId) {
        manifest += `;request-id:${requestId}`;
      }
      manifest += `;ts:${ts};`;

      // Compute HMAC-SHA256 and compare using timing-safe comparison
      const computedHash = crypto
        .createHmac('sha256', webhookSecret)
        .update(manifest)
        .digest('hex');

      try {
        crypto.timingSafeEqual(
          Buffer.from(v1Hash, 'hex'),
          Buffer.from(computedHash, 'hex')
        );
      } catch {
        return res.status(401).json({ error: 'invalid signature' });
      }
    } else {
      console.error('Mercado Pago webhook validation disabled: MERCADO_PAGO_WEBHOOK_SECRET not set');
    }

    const ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) {
      console.error('Mercado Pago configuration missing: MERCADO_PAGO_ACCESS_TOKEN not set');
      // Retorna 200 mesmo assim para não ativar retry do MP
      return res.status(200).json({ received: true });
    }

    // Consulta detalhe do pagamento no Mercado Pago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      }
    });

    if (!mpResponse.ok) {
      console.error('Mercado Pago payment query error:', { paymentId, status: mpResponse.status });
      return res.status(200).json({ received: true });
    }

    const paymentData = await mpResponse.json();
    const { status, external_reference, transaction_amount, metadata } = paymentData;

    // Grava em payment_leads
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      const insertPayload = {
        mp_payment_id: String(paymentId),
        status,
        external_reference,
        plano: metadata?.plano ?? null,
        salon_name: metadata?.salonName ?? null,
        contact_email: metadata?.contactEmail ?? null,
        amount: transaction_amount ?? null
      };

      try {
        // UPSERT via on_conflict query param to handle idempotent replays
        const supabaseResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/payment_leads?on_conflict=mp_payment_id`,
          {
            method: 'POST',
            headers: {
              'apikey': SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(insertPayload)
          }
        );

        if (!supabaseResponse.ok) {
          const errorData = await supabaseResponse.text();
          console.error('Supabase insert error:', { paymentId, status: supabaseResponse.status, error: errorData });
        }
      } catch (supabaseError) {
        console.error('Supabase request error:', { paymentId, message: supabaseError.message });
      }
    } else {
      console.error('Supabase configuration missing: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    }

    // Sempre retorna 200 para evitar retry do Mercado Pago
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', { message: error.message });
    return res.status(200).json({ received: true });
  }
}
