// Mapa de planos: fonte de verdade. Qualquer plano fora deste mapa retorna 400.
const PLANS_MAP = {
  mensal: {
    title: 'appSalão - Plano Mensal',
    unit_price: 29.90
  },
  semestral: {
    title: 'appSalão - Plano Semestral',
    unit_price: 149.50
  },
  anual: {
    title: 'appSalão - Plano Anual',
    unit_price: 262.80
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { plano, salonName, contactEmail, salonId } = req.body;

  // Validar plano
  if (!plano || !(plano in PLANS_MAP)) {
    return res.status(400).json({ error: 'Plano inválido' });
  }

  // Validar env
  const ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    console.error('Mercado Pago configuration missing: MERCADO_PAGO_ACCESS_TOKEN not set');
    return res.status(500).json({ error: 'Configuração de pagamento ausente' });
  }

  // Gerar external_reference: prioriza salonId, depois contactEmail, fallback UUID
  // external_reference é usado para rastrear a transação no webhook e associá-la ao cliente/salão.
  const external_reference = salonId || contactEmail || `plano_${crypto.randomUUID()}`;

  const planData = PLANS_MAP[plano];
  const payloadBody = {
    items: [
      {
        title: planData.title,
        quantity: 1,
        unit_price: planData.unit_price,
        currency_id: 'BRL'
      }
    ],
    external_reference,
    back_urls: {
      success: 'https://appsalao-psi.vercel.app/?pagamento=sucesso',
      failure: 'https://appsalao-psi.vercel.app/?pagamento=falha',
      pending: 'https://appsalao-psi.vercel.app/?pagamento=pendente'
    },
    auto_return: 'approved',
    notification_url: 'https://appsalao-psi.vercel.app/api/mercado-pago-webhook',
    metadata: {
      plano,
      salonName: salonName || null,
      contactEmail: contactEmail || null,
      salonId: salonId || null
    }
  };

  // Se contactEmail fornecido, inclui no payer
  if (contactEmail) {
    payloadBody.payer = { email: contactEmail };
  }

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payloadBody)
    });

    const result = await response.json();

    if (response.ok) {
      return res.status(200).json({ initPoint: result.init_point });
    } else {
      console.error('Mercado Pago API error:', { plano, external_reference, status: response.status, result });
      return res.status(500).json({ error: 'Não foi possível iniciar o pagamento' });
    }
  } catch (error) {
    console.error('Mercado Pago request error:', { plano, external_reference, message: error.message });
    return res.status(500).json({ error: 'Não foi possível iniciar o pagamento' });
  }
}
