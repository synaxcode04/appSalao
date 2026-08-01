---
globs: app/api/**
---

## Serverless Functions — Vercel

Contexto que não emerge da leitura de `notify.js`.

**Estrutura de arquivos**
- Um arquivo = um endpoint. Sem roteamento interno por método ou path dentro do arquivo.
- Handler exportado como `export default function handler(req, res)` — Vercel detecta automaticamente.
- Sem estado persistente entre chamadas — cada invocação é isolada (sem variáveis de módulo mutáveis).

**`notify.js` — regras específicas**
- O mapa de eventos é a fonte de verdade dos 8 eventos do SPEC. Qualquer evento fora do mapa retorna HTTP 400 — nunca 200 silencioso.
- O campo `recipientRole` (`'owner'` | `'client'`) determina o filtro de destinatário na chamada ao OneSignal. Inverta e você notifica a pessoa errada.
- A API key do OneSignal vem de variável de ambiente sem prefixo `VITE_` — ela nunca é exposta ao cliente.
- Erros da API do OneSignal: logue com `console.error` mas não vaze detalhes no corpo da resposta para o cliente.

**Limites do plano gratuito**
- Vercel Hobby: sem warm-up garantido (cold start). Mantenha imports enxutos — sem dependências pesadas no topo do arquivo.
- Sem acesso a filesystem persistente — qualquer dado temporário deve ir para memória ou banco.

**Resposta de erro**
- Sempre retorne `res.status(4xx).json({ error: '...' })`. O cliente em `notification.js` verifica `response.ok` e lança com base nisso.
