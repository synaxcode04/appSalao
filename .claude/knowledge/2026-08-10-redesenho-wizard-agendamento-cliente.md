---
**Agent:** ui-design (implementação) + ux-design (avaliação) + code-reviewer (gate), via orchestrator
**Tipo:** feature
**Data:** 2026-08-10
**Tela:** Wizard de agendamento do módulo cliente (BookingWizard + booking-wizard/*)

## Contexto
Redesenho visual do wizard de agendamento (modal aberto em /s/:slug ao clicar "Agendar Horário Agora") para seguir o design system do módulo cliente (client-ds.css). Só design — zero mudança de regra de negócio, validação, API ou disponibilidade de slot. Modal mantido (não vira tela cheia).

## Restrição arquitetural chave
O mecanismo de slide `.plan-wizard-*` vive em index.css e é COMPARTILHADO com o wizard de planos do dono (PlansManager.jsx). Para evitar vazamento de tema entre módulos (incidente de 2026-08-06), foram criadas classes próprias `.ds-wizard-viewport/-track/-panel/-nav` em client-ds.css replicando o mecanismo (overflow/flex/transform transition, sem cor/sombra), e BookingWizard passou a usá-las. index.css/App.css/owner NÃO foram tocados.

## Decisões de cor (verde-claro vs cinza) — avaliadas pelo ux-design por contraste WCAG AA
Tokens: --ds-primary #3B823E, --ds-primary-soft #E8F5E9, --ds-surface-2 #EEEEF0, --ds-text #262629, --ds-text-2 #68686F, --ds-text-3 #98989F.
- Card de serviço SELECIONADO: TROCADO verde-claro por fundo --ds-surface-2 (verde sobre verde-claro dava só 4.2:1, falha AA; e repetir verde-claro em nav+card+resumo+stepper diluía o sinal de seleção). Seleção agora sinalizada por check icon --ds-primary sólido + borda 2px --ds-primary. Texto em --ds-text.
- Barra de resumo persistente: MANTIDO fundo --ds-primary-soft, MAS todo texto obrigatoriamente em --ds-text (13.4:1), nunca --ds-primary colorido (4.2:1 falha).
- Círculos "futuros" do stepper: TROCADO para fundo --ds-surface-2, número/label em --ds-text-2 (o DS canônico usava --ds-text-3 = 2.5:1, que falha AA — corrigido nesta implementação).
- Botão "Voltar": ds-btn-secondary (não ds-btn-soft, cujo texto verde sobre verde-claro dá 4.2:1).

## Outras decisões de UX
- Stepper: 3 passos visuais para 4 etapas internas (interno 3 e 4 -> visual 3 "Dados"), com sub-rótulo dinâmico "Identifique-se" (step 3) / "Confirme" (step 4).
- Rótulo do botão da etapa 2 = "Continuar" (NÃO "Informar dados": cliente retornante pula a etapa de dados, então "Informar dados" criava expectativa incorreta).
- Alvo de toque: .ds-wizard-back-btn e botão X de fechar com min-width/min-height 44px explícitos (WCAG 2.5.5), não via padding calculado.

## Gate de design system (code-reviewer)
Primeira rodada reprovou com 2 BLOQUEANTES (hex hardcoded #d8eedb em .ds-btn-soft:hover e #f8d3d6 em .ds-btn-danger:hover) e 4 IMPORTANTES (box-shadow em .client-bottom-nav; borderTop não aprovado em SummaryStep; fontSize 1.05rem e 1.1rem fora da escala). Corrigidos: hexes viraram color-mix de tokens; box-shadow removida (border-top de superfície basta); borderTop virou div separador height:1px; fontSizes viraram 16px. Segunda rodada: Aprovado para deploy SIM.

## Componentes novos criados
WizardCalendar.jsx (calendário mensal JS puro, sem lib, formata YYYY-MM-DD via toLocaleDateString('en-CA') para não quebrar useAvailableSlots), WizardHeader.jsx (avatar Scissors/logo + nome + endereço + back circular), WizardStepper.jsx.

## Realocações (sem mudança de lógica)
Seletor de profissional movido de DateTimeStep para ServiceStep (mesmo estado/handler). Barra de resumo içada de ServiceStep para o pai BookingWizard (visível etapas 1-3, conteúdo do estado existente).

## Resultado
215 testes verdes (asserções de texto de BookingWizard.test.jsx ajustadas para os novos labels/estrutura — sem tocar lógica). Build limpo. Não commitado — aguardando validação visual do usuário.
