# Client Identity Function — Vercel Serverless

**Agent:** devops  
**Tipo:** feature  
**Data:** 2026-08-01  
**Fase:** 1b (Sistema de cadastro global de cliente por telefone)

## Descrição

Vercel Function `app/api/client-identity.js` que gerencia o acesso server-side exclusivo às tabelas `clients` (identidade global) e `salon_clients` (vínculo N:N salão ↔ cliente).

Esta Function é o **ÚNICO ponto de acesso** para operações nestas tabelas. As tabelas possuem RLS que bloqueia completamente acessos via `anon` key e `authenticated` (frontend). Apenas `service_role` (server-side) pode ler/escrever — e o server-side usa apenas esta Function.

## Arquitetura de segurança

1. **RLS em `clients` e `salon_clients`:** ambas as tabelas têm:
   - `anon`: SEM policies → acesso completamente negado
   - `authenticated` (dono/cliente): apenas SELECT para dados próprios (via salon_clients); INSERT/UPDATE/DELETE bloqueados
   - `service_role`: bypassa RLS (Supabase behavior) — todas as operações CRUD passam

2. **Variáveis de ambiente server-side (SEM prefixo VITE_):**
   - `SUPABASE_URL`: endpoint do Supabase
   - `SUPABASE_SERVICE_ROLE_KEY`: chave que bypassa RLS (NUNCA exponha ao cliente)

3. **Normalização de telefone:** sempre executada server-side, antes de qualquer busca ou gravação. Remove caracteres não numéricos: `"(11) 99999-9999"` → `"11999999999"`.

## Contrato de I/O

### Método HTTP
POST `/api/client-identity`

### Request body

```json
{
  "action": "lookup" | "create_or_get" | "link_to_salon",
  "phone": "string (obrigatório para todas as ações)",
  "full_name": "string (obrigatório para create_or_get; opcional para link_to_salon se cliente já existe)",
  "salon_id": "string UUID (obrigatório apenas para link_to_salon)"
}
```

### Response

#### Action: `lookup`
Busca cliente por telefone normalizado. Não cria nada.

**Sucesso (200):**
```json
{
  "client": {
    "id": "uuid",
    "phone": "11999999999",
    "full_name": "João Silva",
    "created_at": "2026-08-01T14:30:00Z"
  }
}
```

**Não encontrado (404):**
```json
{
  "error": "Cliente não encontrado",
  "client": null
}
```

#### Action: `create_or_get`
UPSERT de cliente: se existe por telefone, retorna; se não existe, cria.

**Sucesso — cliente novo (201):**
```json
{
  "client": {
    "id": "uuid",
    "phone": "11999999999",
    "full_name": "João Silva",
    "created_at": "2026-08-01T14:30:00Z"
  },
  "created": true
}
```

**Sucesso — cliente já existia (200):**
```json
{
  "client": {
    "id": "uuid",
    "phone": "11999999999",
    "full_name": "João Silva",
    "created_at": "2026-07-15T10:00:00Z"
  },
  "created": false
}
```

#### Action: `link_to_salon`
Vincula cliente (create_or_get) a um salão. Idempotente: se vínculo já existe (UNIQUE(salon_id, client_id)), retorna sucesso sem duplicar.

**Sucesso (200):**
```json
{
  "message": "Cliente vinculado ao salão com sucesso",
  "salon_client": {
    "id": "uuid",
    "salon_id": "uuid",
    "client_id": "uuid",
    "created_at": "2026-08-01T14:30:00Z"
  },
  "client_id": "uuid"
}
```

### Respostas de erro

| Status | Erro | Causa |
|--------|------|-------|
| 400 | Invalid or missing action | `action` não informado ou inválido |
| 400 | phone is required | `phone` ausente |
| 400 | full_name is required | `full_name` ausente em create_or_get |
| 400 | salon_id is required | `salon_id` ausente em link_to_salon |
| 400 | Invalid phone format | Telefone vazio após normalização |
| 405 | Method Not Allowed | Método HTTP não é POST |
| 500 | Erro ao buscar cliente | Erro Supabase em lookup |
| 500 | Erro ao criar cliente | Erro Supabase em insert de cliente |
| 500 | Erro ao vincular cliente ao salão | Erro Supabase em insert de salon_clients |
| 500 | Configuração do servidor ausente | SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurada |

## Normalização de telefone

A função `normalizePhone()` remove todos os caracteres não numéricos:
- Input: `"(11) 99999-9999"`, `"+55 11 99999-9999"`, `"11 99999 9999"`, `"11999999999"`
- Output: `"11999999999"`

Aplica-se sempre, antes de qualquer operação (lookup, create, link).

## Variáveis de ambiente — configuração Vercel

Configure no **Vercel Dashboard → Settings → Environment Variables** (Production + Preview):

| Variável | Valor | Fonte |
|----------|-------|-------|
| `SUPABASE_URL` | `https://SEU_PROJECT_ID.supabase.co` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role key (secreta) | Supabase Dashboard → Settings → API → service_role key |

**CRÍTICO:** Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no frontend ou repositório. Variáveis sem prefixo `VITE_` não são expostas ao cliente automaticamente.

## Dependências

- `@supabase/supabase-js`: já no `package.json` do projeto

## Implementação — padrão Vercel

Segue o padrão estabelecido por `app/api/notify.js`:

- Handler: `export default function handler(req, res)`
- Validação de método HTTP: 405 para métodos não suportados
- Validação de entrada: 400 para dados faltando/inválidos
- Erros internos: console.error (log), resposta genérica ao cliente (sem vazar detalhes)
- Imports enxutos: sem dependências pesadas no topo (cold start Hobby)
- Sem estado persistente entre invocações

## Testes manuais — próximas fases

- [ ] POST `/api/client-identity` com `action: "lookup"` e telefone inexistente → 404
- [ ] POST `/api/client-identity` com `action: "lookup"` e telefone existente → 200 com cliente
- [ ] POST `/api/client-identity` com `action: "create_or_get"` (novo) → 201, `created: true`
- [ ] POST `/api/client-identity` com `action: "create_or_get"` (duplicata) → 200, `created: false`
- [ ] POST `/api/client-identity` com `action: "link_to_salon"` (novo vínculo) → 200 com salon_client
- [ ] POST `/api/client-identity` com `action: "link_to_salon"` (vínculo já existe) → 200 (idempotente, sem erro)
- [ ] POST `/api/client-identity` com `phone` normalizado diferentemente → mesmo resultado (normalização ok)
- [ ] POST `/api/client-identity` com método GET → 405

## Observações

1. **Fase 1a (schema) pré-requisito:** As tabelas `clients` e `salon_clients` devem estar criadas e com RLS habilitado conforme `Documentos/client_identity.sql`.

2. **Fase 2 (UI):** Componentes React no frontend chamarão esta Function (não acessarão Supabase diretamente para estas tabelas).

3. **Idempotência:** `create_or_get` e `link_to_salon` são idempotentes — podem ser chamadas múltiplas vezes com os mesmos parâmetros sem efeitos colaterais.

4. **Cleanup RLS:** O vínculo N:N (`salon_clients`) tem `ON DELETE CASCADE` para ambas as chaves estrangeiras. Remover `salons` ou `clients` limpa automaticamente os vínculos.
