---
name: fix-rls
description: Corrige políticas RLS permissivas no Supabase, garantindo que cada tabela valide o owner_id via JOIN com salons antes de permitir INSERT/UPDATE/DELETE.
---

## O que esta skill faz

Lê o schema atual, identifica políticas com `WITH CHECK (true)` ou `USING (true)` em tabelas que pertencem a um salão, e gera um arquivo SQL corrigido vinculando cada operação ao `owner_id` do usuário autenticado.

## Instruções

1. Leia `Documentos/schema.sql` para entender as tabelas e seus relacionamentos.
2. Leia `Documentos/rls_fix.sql` se já existir — não duplique políticas já corrigidas.
3. Para cada tabela que tenha `salon_id` como FK, substitua políticas permissivas pela estrutura:

```sql
-- Padrão obrigatório para tabelas filhas de salons
CREATE POLICY "Owners can manage their [tabela]"
ON public.[tabela] FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.salons
    WHERE salons.id = [tabela].salon_id
    AND salons.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.salons
    WHERE salons.id = [tabela].salon_id
    AND salons.owner_id = auth.uid()
  )
);
```

4. Políticas de SELECT público (clientes podem ver serviços, horários etc.) são mantidas separadas:

```sql
CREATE POLICY "[Tabela] são públicas para leitura"
ON public.[tabela] FOR SELECT USING (true);
```

5. Salve o resultado em `Documentos/rls_fix.sql`.
6. Liste as políticas antigas que devem ser removidas com `DROP POLICY` antes das novas.

## Exemplo

**Input:** "Corrija as RLS de services e working_hours"

**Output esperado em `Documentos/rls_fix.sql`:**
```sql
-- Remover políticas permissivas antigas
DROP POLICY IF EXISTS "Anyone authenticated can insert services" ON public.services;
DROP POLICY IF EXISTS "Anyone authenticated can update services" ON public.services;

-- Políticas corrigidas
CREATE POLICY "Services são públicas para leitura"
ON public.services FOR SELECT USING (true);

CREATE POLICY "Owners can manage their services"
ON public.services FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.salons WHERE salons.id = services.salon_id AND salons.owner_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.salons WHERE salons.id = services.salon_id AND salons.owner_id = auth.uid())
);
```

## Quando NÃO usar

- Não use para a tabela `profiles` — ela não tem `salon_id` e usa `auth.uid() = id` diretamente.
- Não use para a tabela `appointments` sem antes decidir se clientes também podem inserir (eles podem — a política deles é separada da do dono).
- Não aplique diretamente no Supabase sem revisão manual — sempre gere o SQL e peça confirmação antes de executar.
