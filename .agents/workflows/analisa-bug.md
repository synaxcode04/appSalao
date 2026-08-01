# analisa-bug
> Investiga um bug e produz relatório de causa raiz (sem corrigir). Invoque com `/analisa-bug <bug>`.

Assuma o papel do orchestrator (`.agents/agents/orchestrator.md`).

1. Identifique o módulo do SPEC.md afetado (Motor de Agendamento, Auth, Notificações, Licenças, Painel).
2. Leia o fluxo completo do módulo — não apenas o arquivo com erro.
3. Identifique a causa raiz, não o sintoma.
4. Mapeie todos os arquivos afetados (diretos e indiretos).
5. Verifique se havia testes que deveriam ter capturado o bug.

Relatório: Causa raiz · Arquivos afetados · Impacto no SPEC · Plano de correção (sem implementar) · Testes necessários.
Ao final, sugira `/corrigir-bug [plano resumido]`.
