# Acesso do cliente no modelo de identidade global — mapa de impacto e decisão em aberto

**Agent:** auth-guard
**Tipo:** decisao/bug
**Data:** 2026-08-01

## Contexto

A Fase 2 do plano "cadastro de cliente global por telefone" (Opção A) alterou o fluxo de registro de clientes: o cliente deixou de entrar em `auth.users` / `profiles` e passa a existir apenas na tabela global `clients` (telefone como chave de identidade), acessada exclusivamente via Vercel Function server-side. Isso cria uma inconsistência direta com o controle de acesso atual.

## Mapa de impacto

### Rotas afetadas

Em `App.jsx`, as três rotas da área logada do cliente estão protegidas por `<ProtectedRoute requiredRole="client" />`:

```
/s/:slug/agenda    → ClientAppointments
/s/:slug/historico → ClientHistory
/s/:slug/perfil    → ClientProfile
```

### Como ProtectedRoute funciona hoje

1. Chama `supabase.auth.getSession()`.
2. Se não há sessão → redireciona para `/login`.
3. Se há sessão → busca `profiles.role` para o `user.id` e compara com `requiredRole`.

### O problema

Um cliente cadastrado pela Fase 2 **não tem sessão Supabase Auth**. Ao tentar acessar qualquer uma das três rotas acima, o `ProtectedRoute` vai redirecioná-lo para `/login`. O `/login` atual também espera credenciais de `auth.users` (email + senha) — o cliente do novo modelo não tem isso.

O resultado prático: as páginas de agenda, histórico e perfil **estão inacessíveis** para todo cliente cadastrado via identidade global por telefone.

### O que NÃO foi alterado (por ser decisão de arquitetura)

- `ProtectedRoute.jsx` — não modificado.
- `App.jsx` — rotas de cliente não modificadas.
- Nenhuma rota de owner/admin foi tocada.

## Decisão em aberto

A reconciliação exige responder: **como o cliente se autentica agora para acessar /agenda, /historico e /perfil?**

Nenhuma das opções abaixo foi implementada porque todas implicam redefinir o modelo de autenticação do cliente — fora do escopo de correção pontual.

### Opção 1 — OTP por telefone (magic link via SMS/WhatsApp)
- Ao acessar `/s/:slug/agenda` sem sessão, o `ProtectedRoute` (ou um guard específico) redireciona para uma tela de verificação por telefone.
- O cliente informa o número; a plataforma envia um código; o código gera uma sessão anônima ou autenticada no Supabase (usando Supabase Phone Auth ou custom JWT).
- **Prós:** fluxo fluido e seguro. **Contras:** requer Supabase Phone Auth (pago a partir de certo volume) ou um serviço de SMS externo; adiciona complexity à Function.

### Opção 2 — Sessão de cliente via token temporário (sem auth.users)
- Após o cadastro/login por telefone, a Vercel Function emite um token de curta duração (JWT assinado com segredo do servidor) que é salvo em `sessionStorage`.
- Um guard novo (ex.: `ClientRoute`) verifica esse token localmente em vez de chamar `supabase.auth.getSession()`.
- **Prós:** não depende de infraestrutura de SMS; totalmente controlado. **Contras:** viola a convenção atual de "controle de acesso só via ProtectedRoute"; requer novo guard, novo contexto de cliente, e validação do token em cada request ao banco.

### Opção 3 — Cliente continua em auth.users em paralelo (identidade híbrida)
- O cliente é criado tanto em `auth.users` (via `supabase.auth.signUp` sem senha, usando magic link ou phone OTP) quanto em `clients`.
- O `ProtectedRoute` continua funcionando como hoje.
- **Prós:** menor impacto no controle de acesso; aproveita a infra existente. **Contras:** duplica a identidade do cliente (dois registros para o mesmo usuário); a Fase 1 e 1b foram projetadas exatamente para evitar isso.

### Opção 4 — Rotas de cliente como públicas por contexto de salão
- `/s/:slug/agenda`, `/historico`, `/perfil` deixam de usar `ProtectedRoute requiredRole="client"`.
- O contexto do cliente (identificado pelo telefone confirmado no momento do agendamento) é mantido em `sessionStorage` e gerenciado por um Context (exceção à regra de "sem Context global" — precisaria de decisão explícita).
- **Prós:** consistente com o modelo "cliente sem auth". **Contras:** viola a convenção de "controle de acesso só via ProtectedRoute"; expõe dados do cliente se o token em sessionStorage for insuficiente.

## Estado dos testes

Suíte `npm run test:run` — **25 testes, todos passando** (exit 0).

Os testes de `ProtectedRoute.test.jsx` (5 casos) continuam passando porque mockam a sessão Supabase diretamente. Eles testam o comportamento do componente, não o fluxo real do novo modelo de cliente. Não há regressão — os testes refletem o comportamento atual correto do `ProtectedRoute`; a inconsistência é de produto/arquitetura, não de implementação do guard em si.

## Recomendação para o orchestrator/usuário

Escolher uma das 4 opções acima antes de qualquer implementação. A Opção 1 (OTP por telefone) é a mais alinhada com o modelo "cliente fora de auth.users" da Opção A, mas tem custo de infraestrutura. A Opção 3 é a de menor impacto no código existente, mas contradiz a decisão arquitetural já tomada nas Fases 1/1b.
