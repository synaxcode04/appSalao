---
Título: Ordenação alfabética de serviços e clientes

**Agent:** session (orchestrator + claude)
**Tipo:** feature

**Contexto:** Usuário pediu que serviços apareçam em ordem alfabética na visão do cliente e do dono, e que clientes na visão do dono também fiquem em ordem alfabética.

**Solução aplicada:**
- `app/src/pages/client/SalonDetails.jsx`: query de services trocou `.order('price', { ascending: true })` por `.order('name', { ascending: true })`. Isso também ordena a lista entregue ao BookingEngine (recebe services como prop; ordem não afeta cálculo de slots).
- `app/src/pages/owner/ServicesManager.jsx`: `loadServices` trocou `.order('created_at', { ascending: false })` por `.order('name', { ascending: true })`.
- `app/src/pages/owner/ClientsManager.jsx`: nome do cliente está em join aninhado `clients.full_name`; PostgREST `.order()` em coluna aninhada é instável, então a ordenação foi feita em JS após o fetch com `localeCompare('pt-BR', { sensitivity: 'base' })`, nulos/vazios ao final, respeitando o guard `mountedRef.value`.
- `PlansManager.jsx` já ordenava serviços por `name` — não precisou mudar.

**Notas:** Baixo risco, sem mudança de schema nem lógica de negócio. `npm run build` passou. Code-reviewer: aprovado para deploy, 0 bloqueantes.

**Padrão reutilizável:** para ordenar por coluna de tabela aninhada em join do Supabase, prefira sort client-side com localeCompare em vez de `.order()` do PostgREST em coluna aninhada.
