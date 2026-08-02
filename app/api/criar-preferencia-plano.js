import { getValidMpToken } from './_mpTokens.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { salon_id, plan_id, client_id } = req.body;

  if (!salon_id || !plan_id || !client_id) {
    return res.status(400).json({ error: 'salon_id, plan_id e client_id são obrigatórios' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Configuração Supabase ausente em criar-preferencia-plano');
    return res.status(500).json({ error: 'Configuração de servidor ausente' });
  }

  try {
    // Busca o plano ativo escopado ao salon_id (isolamento multi-tenant)
    const planRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscription_plans?id=eq.${plan_id}&salon_id=eq.${salon_id}&is_active=eq.true&select=id,name,price`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!planRes.ok) {
      console.error('Supabase subscription_plans fetch error:', { plan_id, salon_id, status: planRes.status });
      return res.status(500).json({ error: 'Erro ao buscar plano' });
    }

    const plans = await planRes.json();
    if (!plans || plans.length === 0) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    const plan = plans[0];

    // Obtém token válido do dono, com refresh automático se expirado.
    // getValidMpToken retorna null se o salão não tiver credencial MP cadastrada.
    let ownerToken;
    try {
      ownerToken = await getValidMpToken(salon_id);
    } catch (err) {
      console.error('Erro ao obter token MP do dono:', { salon_id, message: err.message });
      return res.status(500).json({ error: 'Erro ao acessar credenciais do salão' });
    }

    if (!ownerToken) {
      return res.status(409).json({ error: 'Salão não conectado ao Mercado Pago' });
    }

    // Verifica assinatura já ativa e aprovada (status=active + payment_status=approved)
    // O índice único parcial (idx_client_subscriptions_unique_active) cobre apenas
    // status='active', mas semanticamente um plano aprovado não deve ser repago.
    const activeSubRes = await fetch(
      `${SUPABASE_URL}/rest/v1/client_subscriptions?client_id=eq.${client_id}&salon_id=eq.${salon_id}&plan_id=eq.${plan_id}&status=eq.active&payment_status=eq.approved&select=id`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!activeSubRes.ok) {
      console.error('Supabase active subscription check error:', { client_id, salon_id, plan_id });
      return res.status(500).json({ error: 'Erro ao verificar assinaturas existentes' });
    }

    const activeSubs = await activeSubRes.json();
    if (activeSubs && activeSubs.length > 0) {
      return res.status(409).json({ error: 'Já existe assinatura ativa aprovada para este plano' });
    }

    // Reutiliza linha pending existente (evita proliferação de linhas orphaned)
    // caso o cliente inicie o checkout mas abandone antes de pagar.
    const pendingSubRes = await fetch(
      `${SUPABASE_URL}/rest/v1/client_subscriptions?client_id=eq.${client_id}&salon_id=eq.${salon_id}&plan_id=eq.${plan_id}&payment_status=eq.pending&select=id`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );

    let subscriptionId;

    if (pendingSubRes.ok) {
      const pendingSubs = await pendingSubRes.json();
      if (pendingSubs && pendingSubs.length > 0) {
        subscriptionId = pendingSubs[0].id;
      }
    }

    if (!subscriptionId) {
      const insertRes = await fetch(
        `${SUPABASE_URL}/rest/v1/client_subscriptions`,
        {
          method: 'POST',
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            client_id,
            salon_id,
            plan_id,
            status: 'pending',
            payment_status: 'pending',
            payment_method: 'mercado_pago',
          }),
        }
      );

      if (!insertRes.ok) {
        const err = await insertRes.text();
        console.error('Supabase insert client_subscriptions error:', { client_id, salon_id, plan_id, status: insertRes.status, err });
        return res.status(500).json({ error: 'Erro ao criar assinatura' });
      }

      const inserted = await insertRes.json();
      subscriptionId = Array.isArray(inserted) ? inserted[0].id : inserted.id;
    }

    // Cria preferência de Checkout Pro usando o ACCESS TOKEN DO DONO (não da plataforma)
    const preferencePayload = {
      items: [
        {
          title: plan.name,
          quantity: 1,
          unit_price: Number(plan.price),
          currency_id: 'BRL',
        },
      ],
      external_reference: subscriptionId,
      back_urls: {
        success: `https://appsalao-psi.vercel.app/s/pagamento?status=sucesso&sub=${subscriptionId}`,
        failure: `https://appsalao-psi.vercel.app/s/pagamento?status=falha&sub=${subscriptionId}`,
        pending: `https://appsalao-psi.vercel.app/s/pagamento?status=pendente&sub=${subscriptionId}`,
      },
      auto_return: 'approved',
      notification_url: `https://appsalao-psi.vercel.app/api/mp-plano-webhook?salon_id=${salon_id}`,
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferencePayload),
    });

    if (!mpRes.ok) {
      const err = await mpRes.text();
      console.error('MP criar preferência plano error:', { salon_id, plan_id, status: mpRes.status, err });
      return res.status(500).json({ error: 'Não foi possível iniciar o pagamento' });
    }

    const mpData = await mpRes.json();

    // Persiste o preference id (external_id) na linha para reconciliação futura
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
        body: JSON.stringify({ external_id: mpData.id }),
      }
    );

    if (!patchRes.ok) {
      console.error('Supabase patch external_id error:', { subscriptionId, status: patchRes.status });
    }

    return res.status(200).json({ initPoint: mpData.init_point });
  } catch (err) {
    console.error('criar-preferencia-plano erro inesperado:', { message: err.message });
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
