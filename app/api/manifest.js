export default async function handler(req, res) {
  // Ler slug de query parameter
  const { slug } = req.query;

  // Validar slug: deve ter pelo menos 36 caracteres (UUID)
  if (!slug || slug.length < 36) {
    return res.status(400).json({ error: 'slug inválido' });
  }

  // Extrair ID do salão (primeiros 36 caracteres = UUID)
  const id = slug.slice(0, 36);

  // Fetch nativo (Node 18+ no Vercel Hobby inclui fetch global)
  // Usar REST API do Supabase em vez de SDK pesado para evitar cold start lento
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('Supabase configuration missing: SUPABASE_URL or SUPABASE_ANON_KEY not set');
    return res.status(502).json({ error: 'erro ao gerar manifest' });
  }

  try {
    // Buscar dados do salão via REST API
    const response = await fetch(
      `${supabaseUrl}/rest/v1/salons?id=eq.${id}&select=name,logo_url`,
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
      return res.status(502).json({ error: 'erro ao gerar manifest' });
    }

    const salons = await response.json();

    if (!salons || salons.length === 0) {
      return res.status(404).json({ error: 'salão não encontrado' });
    }

    const { name, logo_url } = salons[0];

    // Construir manifest JSON
    const manifest = {
      name: name || 'Salão',
      short_name: name && name.length > 12 ? name.slice(0, 12) : name || 'Salão',
      description: `${name || 'Salão'} - Agendamentos`,
      display: 'standalone',
      start_url: `/s/${slug}`,
      scope: `/s/${slug}`,
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: [
        {
          src: `/api/icon?slug=${slug}&size=192`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: `/api/icon?slug=${slug}&size=512`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    };

    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(manifest);
  } catch (error) {
    console.error('Erro ao gerar manifest:', error.message);
    return res.status(502).json({ error: 'erro ao gerar manifest' });
  }
}
