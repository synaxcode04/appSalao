# Preview dinâmico do link por salão (link dedicado de compartilhar)

**Agent:** session (orchestrator + devops + claude + code-reviewer)  
**Tipo:** feature  
**Data:** 2026-08-10

## Descrição do problema

O dono precisava que o link do salão compartilhado no WhatsApp/Instagram mostrasse nome + logo do salão na pré-visualização (meta tags Open Graph). Como a aplicação é uma SPA React que serve HTML estático, os crawlers não conseguem renderizar React e não veem as meta tags dinâmicas — resultado: link compartilhado aparecia sem preview.

## Decisão tomada

**Abordagem (B): Link dedicado de compartilhar**

- Botão "Compartilhar" no painel do dono gera um link `/api/og?slug=` que:
  - Para **crawlers** (bots, WhatsApp): retorna HTML com meta tags Open Graph dinâmicas (nome, logo, descrição)
  - Para **humanos** (navegador real): redireciona para `/s/:slug` (página pública do salão)
  
- Alternativas descartadas:
  - Rewrite por User-Agent: mais frágil (bots podem falsificar), difícil de manter
  - Vercel Cron + pré-gerar OGs: viola o guardrail de não criar estrutura nova (`vercel.json`)

## Solução aplicada

### 1. Nova Vercel Function: `app/api/og.js`

Padrão inspirado em `app/api/manifest.js` e `app/api/icon.js`:

- **Input:** query parameter `?slug=` (formato: `{36-char-uuid}-{slug-name}`)
- **Extração de ID:** `id = slug.slice(0, 36)` (os 36 primeiros caracteres são o UUID do salão)
- **Busca de dados:** REST API Supabase (sem SDK pesado):
  ```bash
  GET /rest/v1/salons?id=eq.{id}&select=name,logo_url
  Authorization: Bearer SUPABASE_ANON_KEY
  ```
- **Fallback de imagem:** `/logo.png` quando o salão não tem `logo_url` (campo nullable)
- **Redirecionamento:** Meta refresh + script para humanos — redireciona para `/s/:slug`
- **Base URL:** montada a partir de headers `x-forwarded-proto` + `x-forwarded-host`, com fallback `https://appsalao-psi.vercel.app`

### 2. Modificação em `app/src/pages/owner/Settings.jsx`

Adicionado botão "Compartilhar":
- Usa `navigator.share()` (Web Share API, suportada em navegadores modernos)
- Fallback: copia o link para clipboard se Share API não disponível
- Link gerado: `/api/og?slug=${salon.id}-${nome-slugificado}`

## Gotchas e correções aplicadas durante review

### XSS Refletido (2 rodadas)

**Primeira rodada:** O parâmetro `slug` da query era interpolado cru no HTML:
```javascript
// ❌ ERRADO
const html = `
  <meta property="og:url" content="${baseUrl}/s/${slug}">
  <meta http-equiv="refresh" content="0; url=/s/${slug}">
  <script>window.location = '/s/${slug}';</script>
`;
```

Qualquer slug com caracteres especiais (ex: `"><script>alert(1)</script>`) quebraria a tag.

**Correção:** Declarar `escapeHtml()` uma única vez ANTES de qualquer interpolação:
```javascript
const safeSlug = escapeHtml(slug);
// Depois usar safeSlug em TODA interpolação
```

### Double-escaping da `og:description`

**Segunda rodada:** O nome do salão era escapado duas vezes, gerando `&amp;amp;` no HTML final:
```javascript
// ❌ ERRADO
const description = escapeHtml(salonName); // primeira vez
// ... depois inserir em atributo já-escapado da HTML
```

**Correção:** Escapar cada valor **exatamente uma vez**:
```javascript
const safeDescription = escapeHtml(salonName);
// Depois usar direto em atributo
```

### Validação de `og:image` (URL absoluta)

Garantir que a imagem seja sempre uma URL absoluta:
```javascript
const imageUrl = logoUrl && logoUrl.startsWith('http') 
  ? logoUrl 
  : `${baseUrl}/logo.png`;
```

## Arquivos modificados

- **`app/api/og.js`** (novo, 119 linhas): Vercel Function
- **`app/src/pages/owner/Settings.jsx`**: Adicionado botão "Compartilhar" (45 linhas de mudança)

## Commit

```
feat(owner): link dedicado de compartilhar com preview OG dinamico por salao
Commit: 9d5036f4e3343ea43878516c2eae2705c702c641
```

## Testes recomendados (smoke test)

1. Compartilhar link via WhatsApp no celular — verificar se preview aparece com nome + logo
2. Acessar link `/api/og?slug=...` direto no navegador — deve redirecionar para `/s/:slug`
3. Link com slug inválido — deve retornar 404 ou fallback seguro
4. Slug com caracteres especiais (ex: XSS payload) — deve ser escapado e renderizado como texto
