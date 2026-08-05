**Agent:** session (orchestrator + general-purpose impl + code-reviewer)
**Tipo:** feature

# Repaginação da tela inicial do dono — agenda em timeline por hora

## Contexto
A tela inicial do dono (`app/src/pages/owner/DashboardHome.jsx`, rota `/painel` dentro de `OwnerLayout`) era uma lista vertical de cards de agendamento com 4 cards de stat no topo (Agendamentos Hoje, Faturamento Real/Estimado, Próximos Dias). Foi repaginada para uma agenda em timeline por hora estilo Google Agenda, tomando como referência de layout/interação (não de cor) o app concorrente Iuzer.

## O que mudou
- Nova visualização em timeline: `app/src/components/DayTimeline.jsx` — eixo vertical de horas com UMA COLUNA POR PROFISSIONAL; faixa de horas derivada de `working_hours` do dia (fallback 8h–20h); blocos posicionados por start_time/end_time; time_blocks aparecem como faixas hachuradas (professional_id null = todas as colunas).
- `app/src/components/WeekDaySelector.jsx` — tira de dias da semana corrente (Dom–Sáb), abre em hoje, navegação de semana.
- `app/src/components/AppointmentActionsModal.jsx` — modal ao clicar num agendamento: reagendar (abre BookingEngine existente) / WhatsApp / cancelar / concluir.
- `app/src/components/BlockSlotModal.jsx` — modal ao clicar em horário vazio: cria bloqueio inserindo em `time_blocks` via supabase client normal (dono tem sessão Auth real; sem endpoint novo). Mesma lógica de insert do antigo TimeBlocksManager.
- A aba "Bloqueios" foi REMOVIDA da navegação (`OwnerLayout.jsx`) e da rota (`App.jsx`). O arquivo `TimeBlocksManager.jsx` permanece no disco, sem rota. Todo bloqueio (pontual ou recorrente) agora é feito pelo modal na agenda.
- Os 4 cards de stat sumiram da tela inicial; faturamento fica só na aba Métricas.
- Layout passou a usar a largura total (classe `.agenda-page` em vez de `.page-content` com max-width 900px). Estilos em `app/src/App.css`, paleta verde/CSS próprio mantida.

## Decisões tomadas (validadas com o usuário)
- Aba Bloqueios removida totalmente (bloqueio vira ação na agenda).
- Cards de stat somem da home; faturamento só em Métricas.
- Multi-profissional = uma coluna por profissional (estilo Google Agenda multi-agenda).
- Fase de wireframe pulada (prints do Iuzer bastaram como referência de layout, não de cor).

## Notas técnicas
- Regra crítica respeitada: nenhum `.eq(coluna, null)` — usar `.is('coluna', null)` para professional_id quando null.
- Escrita do dono (cancelar/reagendar/bloquear) via supabase client normal, sem Vercel Function nova.
- Correção pós-review: `reloadDay` protegida com `useRef(true)` + guarda `if (!isMountedRef.current) return` para evitar setState após unmount.
- Code-reviewer: aprovado sem bloqueante. Commit local `0661943` na branch dev (sem push).
