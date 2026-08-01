export default async function handler(req, res) {
  // Ler slug e size de query parameters
  const { slug, size } = req.query;
  const sizeParam = size ? parseInt(size, 10) : 192;

  // Validar slug
  if (!slug || slug.length < 36) {
    return res.status(400).json({ error: 'slug inválido' });
  }

  // Validar size: aceitar apenas 192 ou 512
  if (![192, 512].includes(sizeParam)) {
    return res.status(400).json({ error: 'size deve ser 192 ou 512' });
  }

  // Extrair ID do salão
  const id = slug.slice(0, 36);

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('Supabase configuration missing: SUPABASE_URL or SUPABASE_ANON_KEY not set');
    // Fallback para ícone estático se env vars não disponíveis
    return res.status(302).redirect(`/pwa-${sizeParam}x${sizeParam}.png`);
  }

  try {
    // Buscar logo_url do salão via REST API
    const response = await fetch(
      `${supabaseUrl}/rest/v1/salons?id=eq.${id}&select=logo_url`,
      {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error(`Supabase REST error: ${response.status}`);
      // Fallback para ícone estático
      return res.status(302).redirect(`/pwa-${sizeParam}x${sizeParam}.png`);
    }

    const salons = await response.json();

    if (!salons || salons.length === 0 || !salons[0].logo_url) {
      // Sem logo_url: redirecionar para ícone estático
      return res.status(302).redirect(`/pwa-${sizeParam}x${sizeParam}.png`);
    }

    const logoUrl = salons[0].logo_url;

    // Fazer fetch do logo externo e retransmitir
    // Nota: Não fazemos resize server-side por restrição de cold start Hobby
    // (dependências pesadas como sharp causam cold start lento).
    // O browser aceita ícone mesmo sem exatamente o tamanho especificado.
    // Objetivo primário é same-origin (/api/icon), que é garantido.
    const logoResponse = await fetch(logoUrl, { method: 'GET' });

    if (!logoResponse.ok) {
      console.error(`Logo fetch error: ${logoResponse.status}`);
      // Fallback para ícone estático se logo falhar
      return res.status(302).redirect(`/pwa-${sizeParam}x${sizeParam}.png`);
    }

    const contentType = logoResponse.headers.get('content-type') || 'image/png';
    const buffer = await logoResponse.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error('Erro ao servir ícone:', error.message);
    // Fallback para ícone estático em caso de erro
    return res.status(302).redirect(`/pwa-${sizeParam}x${sizeParam}.png`);
  }
}
