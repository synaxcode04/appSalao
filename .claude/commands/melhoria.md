Implemente a melhoria descrita abaixo via **orchestrator**.

Melhoria: $ARGUMENTS

Instruções ao orchestrator:
1. Verifique se a melhoria está **dentro do escopo do SPEC.md** — se não estiver (pagamento online, app nativo, WhatsApp, multi-owner), informe o usuário e pare
2. Verifique se a melhoria envolve alguma **decisão em aberto** do SPEC (tela de suspensão, quem conclui atendimento, reagendamento) — se sim, não implemente sem aprovação explícita
3. Crie um plano com:
   - Agent(s) envolvido(s)
   - Arquivos a criar/modificar
   - Testes que provarão que a melhoria funciona
4. Para melhorias que afetam 2+ módulos, apresente o plano e aguarde confirmação antes de executar
5. Execute com TDD obrigatório
6. Invoque **@code-reviewer** ao final

Se a descrição for vaga, faça no máximo 2 perguntas objetivas antes de prosseguir.
