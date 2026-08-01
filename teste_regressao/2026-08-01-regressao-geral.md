# Teste de Regressão - 2026-08-01

**Data:** 2026-08-01
**Agente Executante:** orchestrator (executado via `qa` sub-agent checks)

## O que foi testado
Foi executado um teste de regressão completo (Pre-deploy check e suite de testes automatizados Vitest) em todo o sistema.

## Passos Reproduzidos
1. **Verificação de Segurança (RLS Permissiva):** Buscado por políticas `WITH CHECK (true)` no arquivo de banco de dados `Documentos/schema.sql`.
2. **Verificação de Segurança (.env):** Verificado se `app/.env` está rastreado no git.
3. **Build da Aplicação:** Executado `cd app && npm run build`.
4. **Testes Automatizados:** Executado `cd app && npm run test:run`.

## Resultado
**RESULTADO GLOBAL:** FAIL (Bloqueado)

### Detalhamento:
- **`.env` fora do git:** ✅ PASS (Nenhum arquivo `app/.env` rastreado)
- **Build da Vercel:** ✅ PASS (Compilado com sucesso usando Vite)
- **Testes (Vitest):** ✅ PASS (34/34 testes passando, englobando `BookingEngine`, `ProtectedRoute`, `SuspendedScreen`, `notification`, e smoke test)
- **Segurança (sem RLS permissivas):** ❌ FAIL (Encontradas múltiplas políticas permissivas em `Documentos/schema.sql`)

## Evidência (Logs relevantes)

### Falha de Segurança (RLS)
O schema.sql apresentou políticas que expõem os dados e não validam o `owner_id`:
```sql
CREATE POLICY "Anyone authenticated can insert services" ON public.services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone authenticated can update services" ON public.services FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone authenticated can insert working hours" ON public.working_hours FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone authenticated can update working hours" ON public.working_hours FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone authenticated can insert professionals" ON public.professionals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone authenticated can update professionals" ON public.professionals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone authenticated can insert appointments" ON public.appointments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone authenticated can update appointments" ON public.appointments FOR UPDATE TO authenticated USING (true);
```
Isso viola a regra de segurança expressa em `GEMINI.md`: *Nunca usar RLS com WITH CHECK (true) sem validar owner_id via JOIN com salons — vazaria dados entre salões.*

### Testes (Vitest)
```
 ✓ src/__tests__/notification.test.js (9 tests)
 ✓ src/__tests__/SuspendedScreen.test.jsx (2 tests)
 ✓ src/__tests__/ProtectedRoute.test.jsx (5 tests)
 ✓ src/__tests__/BookingEngine.test.jsx (16 tests)
 ✓ src/__tests__/smoke.test.jsx (2 tests)

 Test Files  5 passed (5)
      Tests  34 passed (34)
```

## Causa Raiz e Correção (Próximos Passos)
A causa raiz do FAIL é que a modelagem no banco (descrita em `schema.sql`) não restringe a inserção e atualização pelas tabelas dependentes do salão para verificar o `owner_id`. 
**Correção a ser aplicada:** O agente `rls-security` deve ser invocado para reescrever estas políticas, alterando o `WITH CHECK (true)` por uma subquery `EXISTS` vinculando ao dono correto do salão (`profiles.id` / `salons.owner_id`).
