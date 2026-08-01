Investigue o bug descrito abaixo via **orchestrator**.

Bug: $ARGUMENTS

Instruções ao orchestrator:
1. Identifique qual módulo do SPEC.md está afetado (Motor de Agendamento, Auth, Notificações, Licenças, Painel)
2. Leia os arquivos relevantes do módulo — não apenas o arquivo com erro, mas o fluxo completo
3. Identifique a **causa raiz** — não o sintoma superficial
4. Mapeie todos os arquivos afetados (diretos e indiretos)
5. Verifique se há testes existentes que deveriam ter capturado este bug

Produza um relatório com:
- **Causa raiz**: o que realmente está errado e por quê
- **Arquivos afetados**: lista com o papel de cada um no bug
- **Impacto no SPEC**: qual critério de aceitação está sendo violado
- **Plano de correção**: passos específicos para corrigir (sem implementar)
- **Testes necessários**: quais testes cobririam este bug no futuro

Ao final, sugira o comando: `/corrigir-bug [plano resumido]`
