**Agent:** auth-guard
**Tipo:** bug
**Data:** 2026-08-01

## 1. Testes do ProtectedRoute — discrepância de redirect

O CLAUDE.md e a especificação do agent descrevem o comportamento "sem sessão → redireciona para `/login`". O código real em `app/src/components/ProtectedRoute.jsx` (linhas 46 e 48) faz `<Navigate to="/" replace />` em **ambos** os casos de negação:

- Sem sessão ativa
- Sessão com role incorreto para a rota

Os testes novos foram escritos assertando o comportamento **real** (`"/"` como destino), não o comportamento documentado. Não foi feita nenhuma alteração no destino do redirect — isso é decisão de roteamento que precisa de aprovação explícita.

Testes adicionados em `app/src/__tests__/ProtectedRoute.test.jsx`:
1. Sem sessão (`session: null`) → `<Navigate to="/" />`, conteúdo protegido não aparece.
2. Role `client` acessando `requiredRole="owner"` → idem.
3. Role `owner` acessando `requiredRole="client"` → idem.

`npm run test:run` encerrou com exit 0 — 23 testes passando (5 no ProtectedRoute, 7 no BookingEngine, 9 no notification, 2 no smoke).

## 2. Bloqueio de licença suspensa — estado real vs. documentação

### SuspendedScreen.jsx
O arquivo `app/src/components/SuspendedScreen.jsx` **não existe**. O visual de suspensão está implementado como JSX inline em dois layouts distintos.

### Coluna real no banco: `status`, não `is_active`
A documentação do agent (task 3.2) e o CLAUDE.md referenciam o campo `is_active` na tabela `salons` para controlar a licença. Isso é **incorreto** em relação ao código atual:

- `AdminDashboard.jsx` (`toggleBlockStatus`): alterna `status` entre `'active'` e `'expired'` — nunca toca `is_active`.
- `AdminDashboard.jsx` (filtro): usa `s.status !== 'expired'` para listar salões ativos.
- `is_active` existe apenas na tabela `professionals` (confirmado em `SalonDetails.jsx` linha 92: `.eq('is_active', true)`).

A coluna correta para licença na tabela `salons` é `status` (string `'active'`/`'expired'`) combinada com `subscription_expires_at` (timestamp).

### O que OwnerLayout já faz (linhas 221–234)
Verifica `salon?.status === 'expired' || (salon?.subscription_expires_at && new Date(salon.subscription_expires_at) < new Date())`. Se verdadeiro, renderiza um bloco JSX inline com título "Acesso Suspenso" e botão de WhatsApp — sem usar nenhum componente `SuspendedScreen`.

### O que SalonLayout já faz (linhas 107–118)
Mesma lógica de verificação. Se bloqueado, renderiza inline "Página Indisponível" sem componente separado.

### SalonDetails.jsx
Não tem verificação de suspensão. O comentário no topo do arquivo (linhas 9–10) delega explicitamente essa responsabilidade ao layout pai (`SalonLayout`). Está correto como está.

## Bloqueadores para implementação futura do SuspendedScreen

1. O visual e conteúdo da tela de suspensão são **decisão em aberto** no CLAUDE.md e no SPEC — não implementar sem aprovação.
2. A inconsistência de nomenclatura (`is_active` vs. `status`) precisa ser resolvida na documentação antes de qualquer refactor.
3. A lógica atual (inline nos dois layouts) já funciona. A refatoração para um componente `SuspendedScreen` é uma melhoria de manutenibilidade, não uma correção de bug.
