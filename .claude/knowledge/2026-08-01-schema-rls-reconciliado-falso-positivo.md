# Falso-Positivo RLS — Schema.sql Desatualizado vs. Rls_fix.sql em Produção

**Agent:** qa  
**Tipo:** bug (falso-positivo de segurança)  
**Data:** 2026-08-01  
**Status:** RESOLVIDO

## Problema

O teste de regressão de 2026-08-01 (pre-deploy-check) marcou FAIL ao detectar políticas RLS permissivas (`WITH CHECK (true)`) em `Documentos/schema.sql`:

```sql
CREATE POLICY "Anyone authenticated can insert services" ON public.services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone authenticated can update services" ON public.services FOR UPDATE TO authenticated USING (true);
-- ... similar para working_hours, professionals, appointments
```

Contudo, a produção (Vercel) **estava segura**. A causa não era um bug real em produção, mas um desalinhamento entre dois artefatos:
- `Documentos/schema.sql` — documentação do estado final esperado do schema (varrida pelo pre-deploy-check).
- `Documentos/rls_fix.sql` — migration que corrigiu as políticas vulneráveis; já aplicada em produção.

O schema.sql nunca foi reconciliado após o rls_fix.sql ser criado e aplicado.

## Causa Raiz

### Timeline
1. **Antes de 2026-08-01:** Schema.sql existia com políticas vulneráveis de escrita (BY-PASS sem validação de owner_id).
2. **Em 2026-08-01 (corrigido via rls_fix.sql):** Reconhecido que as políticas eram permissivas. Migration `Documentos/rls_fix.sql` foi criada substituindo todas as políticas com `EXISTS` validando `salons.owner_id = auth.uid()`. Aplicada em produção.
3. **Problema:** `Documentos/schema.sql` nunca foi atualizado com as políticas corrigidas — permanecia com as versões antigas.
4. **Detecção:** Pre-deploy-check (`grep -n "WITH CHECK (true)" Documentos/schema.sql`) encontrou a vulnerabilidade no schema.sql e marcou FAIL, mesmo que a produção estivesse segura.

### Raiz
- **Responsabilidade desambígua:** Quem quer que tenha criado `rls_fix.sql` não atualizou `schema.sql` — os dois ficaram out-of-sync.
- **Propósito conflitante:** `schema.sql` serve dois propósitos:
  1. Documentação do estado esperado (referência para DEVs).
  2. Validação em pre-deploy-check (via grep, detecta vulnerabilidades).
  
  Se um for atualizado e o outro não, o check falha falso-positivamente.

## Solução Aplicada

### Reconciliação Estrutural
Executado pelo agente `rls-security`:
1. Substituir todas as políticas INSERT/UPDATE/DELETE vulneráveis em `schema.sql` pelas versões corrigidas com `EXISTS` + owner_id validation.
2. Manter SELECTs públicos intencionais (profiles, salons, services, working_hours, professionals, reviews) inalterados.
3. Deixar `rls_fix.sql` intacto como referência histórica (idempotente, pode ser re-aplicada sempre).

### Resultado
- `schema.sql` agora reflete o estado seguro (idêntico ao que rls_fix.sql produziu em produção).
- Pre-deploy-check passará em futuras execuções.
- Schema.sql é nova fonte única de verdade para estado RLS esperado.

### Implementação
Grep-before-reconciliation:
```bash
$ grep -n "WITH CHECK (true)" Documentos/schema.sql
# Antes: múltiplas matches (vulneráveis)
# Depois: apenas 1 match = comentário (false positive do grep, não é código)
```

Grep-after-reconciliation:
```bash
$ grep -n "USING (true)" Documentos/schema.sql
9:-- comentário
193:CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);
197:CREATE POLICY "Salons are viewable by everyone." ON public.salons FOR SELECT USING (true);
202:CREATE POLICY "Services are viewable by everyone." ON public.services FOR SELECT USING (true);
243:CREATE POLICY "Working hours are viewable by everyone." ON public.working_hours FOR SELECT USING (true);
284:CREATE POLICY "Professionals are viewable by everyone." ON public.professionals FOR SELECT USING (true);
388:CREATE POLICY "Reviews are publicly viewable" ON public.reviews FOR SELECT USING (true);
```

Todos os matches remanescentes são SELECTs públicos intencionais — não são vulnerabilidades.

## Aprendizado

### Processo
- **Migrations** (`rls_fix.sql`) corrigem o banco em produção.
- **Schema.sql** deve refletir sempre o estado **final e seguro** esperado — não pode ficar desatualizado.
- **Pre-deploy-check** confere `schema.sql`, não a produção — o arquivo deve ser mantido sincronizado.

### Prevenção
- Toda migration que altera policies deve atualizar `schema.sql` na mesma tarefa.
- Pre-deploy-check é "line of defense" — se passar, presume-se que schema.sql (e, por extensão, o estado esperado) está seguro.
- Se um arquivo de referência (schema.sql) e um de aplicação (migration) divergem, atualizar ambos no mesmo commit/PR.

## Contexto Segurança
Violação corrigida: RLS sem validação de ownership via JOIN com `salons.owner_id`. Ver `CLAUDE.md` / `.claude/rules/seguranca.md`:
> Toda policy INSERT/UPDATE/DELETE em tabela com `salon_id` precisa de `WITH CHECK (EXISTS ...)` — `USING` sozinho não protege escritas.
> `salon_id` sozinho não prova ownership. Sempre faça o JOIN: `salons.owner_id = auth.uid()`.

Padrão agora seguido em schema.sql para todas as tabelas protegidas (services, working_hours, professionals, appointments, reviews, salon_settings).

## Referências
- Teste de regressão com falso-positivo: `teste_regressao/2026-08-01-regressao-geral.md`
- Reconciliação validada: `teste_regressao/2026-08-01-rls-schema-reconciliado.md`
- Migration histórica: `Documentos/rls_fix.sql`
- Regras de segurança: `CLAUDE.md` / `.claude/rules/seguranca.md`
