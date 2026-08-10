export default async function handler(req, res) {
  // Ler slug de query parameters
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
    return res.status(502).json({ error: 'erro ao gerar og tags' });
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
      return res.status(502).json({ error: 'erro ao gerar og tags' });
    }

    const salons = await response.json();

    if (!salons || salons.length === 0) {
      return res.status(404).json({ error: 'salão não encontrado' });
    }

    const { name, logo_url } = salons[0];

    // Helper: escape HTML entities para evitar quebrar o HTML
    const escapeHtml = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    // Montar base URL absoluta a partir dos headers da request
    // Agnóstico de ambiente (produção vs preview)
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const base = host ? `${proto}://${host}` : 'https://appsalao-psi.vercel.app';

    // Determinar imagem: se logo_url preenchido e é URL absoluta, usar direto; senão fallback para logo padrão
    const ogImage = logo_url && logo_url.startsWith('http') ? logo_url : `${base}/logo.png`;

    // Dados para OG tags
    const salonName = name || 'Salão';
    const salonNameEscaped = escapeHtml(salonName);
    const ogDescription = `Agende seu horário na ${salonNameEscaped}`;

    // Escapar slug uma vez para uso em HTML (XSS prevention)
    const safeSlug = escapeHtml(slug);

    // Montar canonical URL com slug escapado
    const canonicalUrl = `${base}/s/${safeSlug}`;

    // Montar HTML com meta tags OG e redirect para humanos
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${salonNameEscaped}</title>

  <!-- Open Graph tags para crawlers do WhatsApp, Instagram, Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${salonNameEscaped}">
  <meta property="og:description" content="${ogDescription}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:url" content="${canonicalUrl}">

  <!-- Twitter Card para compartilhamento em rede social -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${salonNameEscaped}">
  <meta name="twitter:description" content="${ogDescription}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">

  <!-- Redirect para humanos (navegadores) -->
  <meta http-equiv="refresh" content="0; url=/s/${safeSlug}">
  <script>
    window.location.replace('/s/${safeSlug}');
  </script>
</head>
<body>
  <p>Redirecionando para <a href="/s/${safeSlug}">${salonNameEscaped}</a>...</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(html);
  } catch (error) {
    console.error('Erro ao gerar og tags:', error.message);
    return res.status(502).json({ error: 'erro ao gerar og tags' });
  }
}
