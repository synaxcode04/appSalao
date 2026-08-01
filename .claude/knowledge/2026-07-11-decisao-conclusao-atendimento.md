# Decisão: quem pode marcar atendimento como concluído

**Agent:** auth-guard
**Tipo:** decisao

## Contexto / Problema
Havia uma decisão em aberto sobre qual perfil de usuário pode marcar um atendimento como concluído: apenas o dono, apenas o cliente, ou ambos.

## Detalhe
Decisão fechada em 2026-07-11: AMBOS podem marcar um atendimento como concluído — tanto o dono (owner) quanto o cliente (client).

## Solução / Regra aplicada
A decisão reflete diretamente nos eventos de notificação push:
- `completed_by_owner` — disparado quando o dono conclui; a notificação vai para o **client**.
- `completed_by_client` — disparado quando o cliente conclui; a notificação vai para o **owner**.

Ou seja, quem conclui gera o push para a outra parte.
