const EVENT_MAP = {
  new_appointment:     { recipientRole: 'owner' },
  client_canceled:     { recipientRole: 'owner' },
  owner_canceled:      { recipientRole: 'client' },
  client_rescheduled:  { recipientRole: 'owner' },
  owner_rescheduled:   { recipientRole: 'client' },
  completed_by_owner:  { recipientRole: 'client' },
  new_review:          { recipientRole: 'owner' },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { event, title, message, targetExternalId } = req.body;

  if (!event || !(event in EVENT_MAP)) {
    return res.status(400).json({ error: 'Evento desconhecido' });
  }

  if (!title || !message || !targetExternalId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // targetExternalId deve ser o id do usuário com recipientRole indicado pelo evento
  const { recipientRole } = EVENT_MAP[event];

  const APP_ID = process.env.ONESIGNAL_APP_ID;
  const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

  if (!APP_ID || !REST_API_KEY) {
    console.error('OneSignal configuration missing: APP_ID or REST_API_KEY not set');
    return res.status(500).json({ error: 'Configuração de notificação ausente' });
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${REST_API_KEY}`
      },
      body: JSON.stringify({
        app_id: APP_ID,
        target_channel: "push",
        include_aliases: {
          "external_id": [targetExternalId]
        },
        headings: { en: title },
        contents: { en: message }
      })
    });

    const result = await response.json();

    if (response.ok) {
      const hasErrors = result.errors && result.errors.length > 0;
      const delivered = result.recipients > 0 && !hasErrors;

      if (!delivered) {
        console.error('[notify] push enviado mas sem entrega confirmada:', {
          event,
          targetExternalId,
          recipientRole,
          notificationId: result.id,
          recipients: result.recipients,
          errors: result.errors ?? null,
        });
      } else {
        console.info('[notify] push entregue:', {
          event,
          targetExternalId,
          recipientRole,
          notificationId: result.id,
          recipients: result.recipients,
        });
      }

      return res.status(200).json({
        success: true,
        delivered,
        recipients: result.recipients ?? 0,
        notificationId: result.id ?? null,
      });
    } else {
      console.error('OneSignal API error:', { event, targetExternalId, recipientRole, result });
      return res.status(response.status).json({ success: false, error: 'Erro ao enviar notificação' });
    }
  } catch (error) {
    console.error('OneSignal notification error:', { event, targetExternalId, message: error.message });
    return res.status(500).json({ success: false, error: 'erro ao enviar notificação' });
  }
}
