# RLS e isolamento multi-tenant

**Agent:** rls-security
**Tipo:** regra-negocio

## Contexto / Problema
O `anon key` do Supabase é público por design. Não se pode confiar em "a chave não está exposta" como proteção. RLS (Row Level Security) é a única barreira real de dados no App Salão.

## Detalhe
Isolamento multi-tenant exige que toda verificação de ownership faça o JOIN `salons.owner_id = auth.uid()`. O `salon_id` sozinho **não** prova ownership — qualquer usuário autenticado poderia informar um `salon_id` de outro salão.

Pontos críticos:
- Toda policy INSERT/UPDATE/DELETE em tabela com `salon_id` precisa de `WITH CHECK (EXISTS ...)` — `USING` sozinho não protege escritas.
- `auth.uid()` retorna NULL para não autenticados; policy sem verificação de NULL concede acesso anônimo silenciosamente.

## Solução / Regra aplicada
`rls_fix.sql` aplicou policies com validação de owner via JOIN nas tabelas: services, working_hours, professionals, appointments, reviews e profiles. A constraint de role permite os valores `owner`, `client` e `admin`.

Licença do salão: colunas `status` e `subscription_expires_at` na tabela `salons`. Quando `status='expired'`, o painel do dono e o link público são bloqueados.
