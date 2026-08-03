# PWA instalabilidade do cliente — manifest duplicado e restauração

**Agent:** devops (via orchestrator)
**Tipo:** bug
**Data:** 2026-08-02

## Contexto
Cliente não conseguia instalar o PWA ao acessar por `/s/:slug` (requisição de "Instalar" nativa do Chrome não aparecia). Requisito: restaurar instalabilidade nativa SEM criar botão de "Instalar" próprio, e SEM regredir a instalação que já funcionava para o DONO nas rotas raiz (/, /painel, etc.).

## Histórico e causa raiz
A arquitetura dinâmica do manifest já apresentava fragilidade:

1. **Manifest dinâmico para cliente:** `SalonLayout.jsx` troca o `href` de uma tag `<link rel=manifest id="main-manifest">` para `/api/manifest?slug=...` em `/s/:slug` e restaura no cleanup para `/manifest.webmanifest`.

2. **Edições concorrentes em paralelo:** durante a investigação, dois agents editaram `app/index.html` e `app/vite.config.js` simultaneamente, resultando em:
   - Remoção completa da tag `<link rel=manifest>` do `index.html` (quebraria instalação do dono).
   - VitePWA 1.3.0 **auto-injetava uma SEGUNDA tag** `<link rel=manifest>` no build, copiada para `dist/index.html`.
   - Violação da spec HTML (duas tags de manifest).
   - Heurística de instalação do Chrome frágil (incerta sobre qual usar).

3. **O resultado:** `dist/index.html` continha `<link rel=manifest>` injetado pelo Vite, enquanto `index.html` source carecia de qualquer tag estática — a dinâmica do cliente nunca era utilizada em build.

## Solução aplicada
Separação clara entre static (dono/admin) e dynamic (cliente):

1. **Restaurar em `app/index.html` a tag estática única:**
   ```html
   <link rel="manifest" href="/manifest.webmanifest" id="main-manifest">
   ```
   Esta tag permanece para dono/admin/Welcome (rotas fora de `/s/:slug`).

2. **Desabilitar auto-injeção do VitePWA em `app/vite.config.js`:**
   ```javascript
   pwa: {
     manifest: false,  // ← não auto-injetar tag, já controlamos uma
     workbox: { /* ... */ },
   }
   ```
   A opção `manifest: false` **não desabilita o service worker** — Workbox continua registrado via `registerType: 'autoUpdate'`.

3. **Criar `app/public/manifest.webmanifest` como asset estático:**
   Arquivo JSON com a configuração antes inline no `vite.config.js`. O Vite copia para `dist/manifest.webmanifest` automaticamente.

4. **Cliente dinâmico intacto:** `SalonLayout.jsx` continua trocando o `href` para `/api/manifest?slug=...` ao entrar em `/s/:slug`, e volta para `/manifest.webmanifest` no cleanup.

## Resultado
- Uma única tag `<link rel=manifest>` no `dist/index.html` (oriunda do `index.html` source).
- `dist/manifest.webmanifest` gerado via asset estático.
- Dono continua instalável (raiz + /painel).
- Cliente agora instalável em `/s/:slug` (manifest dinâmico via API).
- 76 testes verdes.

## Lições
1. **Manifest injetado só por JS não cobre rotas fora do escopo** — sempre manter um estático de fallback para dono/admin/Welcome.
2. **Não spawnar múltiplos agents em paralelo editando os mesmos arquivos** — causa conflitos, edições contraditórias. Usar sequencial autoritativo com um agent por arquivo.
3. **`manifest: false` em VitePWA é a forma limpa de suprimir a auto-injeção** quando se controla um `<link rel=manifest>` próprio.
4. **Duplicatas na spec HTML (2 tags com mesmo rel) são frágeis** — o navegador pode ignorar uma, ou comportamento é undefined. Sempre validar `dist/` antes de deploy.
