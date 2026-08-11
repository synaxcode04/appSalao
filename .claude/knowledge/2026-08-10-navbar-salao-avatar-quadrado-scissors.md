---
**Agent:** ui-design (implementação) + code-reviewer (gate), via orchestrator
**Tipo:** decisao
**Data:** 2026-08-10
**Tela:** Tela inicial do salão — navbar (módulo cliente)

## Arquivos alterados

- `app/src/pages/client/SalonDetails.jsx` — marcação do avatar na `.client-salon-navbar`
- `app/src/client-ds.css` — regras visuais do avatar e remoção de `.salon-avatar span` morto

## Contexto / pedido

Continuidade do redesenho visual do módulo cliente (mesma sessão do redesenho do wizard de agendamento, `2026-08-10-redesenho-wizard-agendamento-cliente.md`). O usuário pediu que o avatar da navbar da página inicial do salão ficasse EXATAMENTE igual ao avatar do header do wizard de agendamento (`WizardHeader.jsx`, classe `.ds-wizard-header-avatar`), aprovado na rodada imediatamente anterior da mesma sessão.

## O que mudou

### Antes (avatar circular, fallback = inicial do salão)
- `border-radius: 50%` (círculo)
- Fundo `--ds-primary-soft` (verde-claro) quando sem logo
- Fallback: `<span>` com a inicial do `salon.name` em `--ds-primary`
- Regra `.salon-avatar span` em `client-ds.css` controlava esse fallback

### Depois (avatar quadrado arredondado com ícone Scissors, espelho do wizard)
- `border-radius: var(--ds-radius-sm)` (8 px — quadrado arredondado)
- Fundo `--ds-primary` (#3B823E, verde sólido) quando sem logo
- Fallback: `<Scissors size={24} color="var(--ds-on-primary)" />` (ícone lucide-react, traço 2 px, sem preenchimento)
- Quando `salon.logo_url` existe: `<img src={salon.logo_url} alt={salon.name} />` com `object-fit: cover`, igual ao wizard
- Regra `.salon-avatar span` removida de `client-ds.css` (ficou morta após a troca do fallback)

## Decisão de NÃO extrair CSS compartilhado

Navbar e wizard compartilham as mesmas propriedades visuais (radius, fundo, ícone, cor do ícone), mas diferem em tamanho:

| Contexto | Tamanho do avatar | Tamanho do ícone |
|---|---|---|
| `.client-salon-navbar` (navbar) | 52 × 52 px | `size={24}` |
| `.ds-wizard-header-avatar` (wizard) | 44 × 44 px | `size={22}` |

Uma classe base compartilhada exigiria override de dimensão por contexto (seja via modifier, custom property ou classe adicional), adicionando indireção sem deduplicação real de propriedades substanciais. Os dois blocos ficam alinhados nas propriedades visuais (radius, bg, cor do ícone) mas separados em arquivos/classes distintas.

## Escopo mantido / o que NÃO mudou

- Nome do salão (`salon.name`) e endereço (`salon.address`) inalterados
- Botão "Voltar" circular e stepper horizontal NÃO foram adicionados à navbar (esses elementos são exclusivos do `WizardHeader` — pertencem ao contexto de progresso do wizard, não à tela de descoberta/entrada do salão)
- Nenhum outro elemento visual da navbar foi alterado

## Gate: code-reviewer

Aprovado para deploy: **SIM** — 0 bloqueantes, 0 importantes.

1 sugestão opcional registrada: alinhar `size={24}` para `size={22}` (paridade pixel-perfeita com o wizard) — **não aplicada** pelo ui-design porque o avatar da navbar é 52 × 52 px (vs 44 × 44 px do wizard) e 24 px de ícone proporcional é mais adequado nesse container maior. Paridade visual foi atingida; paridade pixel-exata não é objetivo explicitado.

Contraste do ícone branco (`--ds-on-primary` = #FFFFFF) sobre `--ds-primary` (#3B823E): ~4,86:1 — passa WCAG AA para elementos gráficos (limiar 3:1).

## Resultado

215 testes passando. Nenhum teste precisou de ajuste — nenhum teste dependia da `<span>` com a inicial antiga nem do `border-radius: 50%`. Build limpo. Não commitado — aguardando validação visual do usuário.
