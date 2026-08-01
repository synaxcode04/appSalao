Corrija o bug conforme o plano abaixo via **orchestrator**.

Plano de correção: $ARGUMENTS

Instruções ao orchestrator:
1. Identifique o(s) agent(s) responsável(is) pelo domínio afetado no plano acima
2. Delegue a correção com o plano completo como briefing — o agent não tem contexto da análise anterior
3. Exija que o agent:
   - Escreva ou atualize os testes que cobrem exatamente o bug descrito (TDD)
   - Faça os testes passarem antes de considerar pronto
   - Não altere comportamento fora do escopo do bug
4. Após a correção, invoque o **@code-reviewer** para confirmar que o bug foi resolvido sem regressões

Se o plano estiver vago ou incompleto, pergunte ao usuário pelo output do `/analisa-bug` antes de prosseguir.
