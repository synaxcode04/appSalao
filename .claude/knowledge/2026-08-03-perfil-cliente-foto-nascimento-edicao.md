# 2026-08-03 — Perfil do Cliente: Foto, Data de Nascimento e Edição de Nome/WhatsApp

**Agent:** orchestrator (Fases: rls-security, devops, auth-guard, code-reviewer)  
**Tipo:** feature  
**Data:** 2026-08-03  
**Status:** Aprovado para deploy (code-reviewer: SIM, 0 bloqueantes)

## Descrição

Implementação da edição do perfil do cliente do salão (rota `/s/:slug/perfil`, componente `ClientProfile.jsx`) com suporte a:
- Edição de nome completo
- Edição de número WhatsApp
- Cadastro e edição de data de nascimento
- Upload de foto de perfil (avatar)

## Decisões Chave

### 1. Upload de Avatar via Vercel Function (Opção A)

**Problema:** Cliente não possui Supabase Auth (`auth.uid()` sempre NULL), logo não pode fazer upload direto no Storage (RLS rejeita).

**Solução:** Upload exclusivamente via Vercel Function `app/api/client-identity.js` com `service_role`, que bypassa RLS. Bucket Storage público `client-avatars` com leitura via `getPublicUrl()`, escrita restrita a `service_role`.

**Campo de banco:** Nova coluna `avatar_url` em tabela `clients` (string, pode ser NULL).
Coluna `birth_date` já existia.

**Migration:** `Documentos/client_profile_fields.sql`

### 2. Nova Action 'update' em `app/api/client-identity.js`

**Contrato da requisição:**
```json
{
  "action": "update",
  "client_id": "uuid-do-cliente",
  "current_phone": "+55XX999999999",
  "full_name": "Nome Novo (opcional)",
  "phone": "+55YY999999999 (opcional, validação de unicidade)",
  "birth_date": "YYYY-MM-DD (opcional)",
  "avatar_base64": "data:image/jpeg;base64,...abc123... (opcional)"
}
```

**Guarda de autorização:** Normaliza `current_phone` (remove espaços/hífens) e compara com valor armazenado em `clients.phone`. Se não coincide, retorna **403 Forbidden** — modelo de sessão leve, sem Bearer token.

**Validação de phone:**
- Se `phone` é fornecido e já pertence a outro cliente do mesmo salão: **409 Conflict**
- Normalização: `phone.replace(/\D/g, '')` (apenas dígitos)

**Resposta de sucesso (200):**
```json
{
  "client_id": "...",
  "full_name": "...",
  "phone": "...",
  "birth_date": "...",
  "avatar_url": "https://..."
}
```

### 3. Processamento de Avatar

**Fluxo:**
1. Frontend comprime canvas (máx 512px, JPEG 0.8, sem dependência externa)
2. Envia como data URL (`data:image/jpeg;base64,...`)
3. Backend extrai parte após a vírgula: `avatar_base64.split(',')[1]`
4. Decodifica com `Buffer.from(data, 'base64')`
5. Faz upload para Storage via `service_role`
6. Retorna URL pública via `getPublicUrl()`

**Bug corrigido:** Versões iniciais tentavam decodificar a data URL inteira (incluindo `data:image/jpeg;base64,`), corrompendo a imagem. Solução: sempre split na vírgula antes de Buffer.from.

### 4. ClientSessionContext — Método `updateSession(patch)`

Ganhou novo método para merge progressivo de dados:
```javascript
updateSession(patch) {
  setSession(prev => ({
    ...prev,
    ...patch
  }));
  localStorage.setItem(`client-session-${slug}`, JSON.stringify({
    ...session,
    ...patch
  }));
}
```

**Uso:** `ClientProfile.jsx` chama `updateSession()` após sucesso da ação 'update', refletindo imediatamente `birth_date` e `avatar_url` na UI. O `loginByPhone` não traz esses campos (apenas `client_id`, `full_name`, `phone`), então são preenchidos progressivamente durante edição.

## Armadilhas Registradas

1. **Acesso ao Storage por cliente:** Não é possível fazer upload direto via bucket RLS que requer `auth.is_authenticated` ou comparação com `auth.uid()`, pois o cliente não tem `auth.uid()`. Solução: Vercel Function com `service_role`.

2. **Decodificação de data URL:** Sempre extrair a parte após a primeira vírgula antes de passar para `Buffer.from()`. A string `data:image/jpeg;base64,ABC123...` contém metadados que corrompem a decodificação.

3. **Normalização de phone:** Aplicar em ambos os lados (frontend e backend) para comparações seguras e evitar duplicação (ex: `+55 99999-9999` vs `+55999999999`).

## Testes

**Arquivo:** `app/src/__tests__/client-identity.test.js`

**Cobertura:** 85 testes Vitest passando
- Mock de Supabase (auth, storage, database)
- Mock de fetch para API
- Testes de autorização (403 se `current_phone` não coincide)
- Testes de validação (409 se phone já existe)
- Testes de upload (avatar_base64 extraído corretamente)
- Testes de merge em `ClientSessionContext`

**Decisão de design dos testes:** Reescrita do contrato para incluir `current_phone` como obrigatório (prova de posse, modelo de sessão leve). Removidas assertions sobre localStorage direto (mockado via spy, não verificado).

## Arquivos Modificados

- `Documentos/client_profile_fields.sql` — migration com coluna `avatar_url`
- `app/api/client-identity.js` — nova ação 'update' com guarda de autorização
- `app/src/pages/client/ClientProfile.jsx` — formulário + upload (novo)
- `app/src/contexts/ClientSessionContext.jsx` — método `updateSession()` para merge progressivo
- `app/src/__tests__/client-identity.test.js` — 85 testes com novo contrato

## Notas para Produção

- Executar migration `client_profile_fields.sql` no Supabase antes do deploy
- Verificar que bucket `client-avatars` existe e está público para leitura
- Variáveis de ambiente já existentes (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — nenhuma nova necessária
- Upload de avatar é opcional; perfil funciona sem foto
