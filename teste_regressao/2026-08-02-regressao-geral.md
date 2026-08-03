# Teste de Regressão - 2026-08-02 (Rodada geral pós-features do dia)

**Data:** 2026-08-02
**Agente Executante:** _(a preencher — teste a ser rodado manualmente pelo usuário)_
**Status:** ROTEIRO PREPARADO — ainda NÃO executado.

## O que será testado

Roteiro único, em sequência, cobrindo tudo que foi entregue em 2026-08-02 e ainda não tem
teste de regressão registrado:

1. Endereço estruturado do salão (campos separados + geocoding).
2. Avaliação interna removida / convite de avaliação no Google.
3. Reorganização do menu do dono (Planos em Cadastros, Bloqueios solto).
4. Checkout de plano de assinatura via Mercado Pago (marketplace, token colado).
5. Fix: agenda do cliente em branco pós-agendamento.
6. Fix: instalabilidade do PWA como cliente (`/s/:slug`).

**Pré-requisitos do ambiente:**
- Migrations aplicadas no Supabase: `add_structured_address.sql`, `add_google_review_link.sql`,
  `mp_marketplace.sql` (versão com token colado, sem colunas OAuth).
- Um salão ativo (dono) com pelo menos 1 plano de assinatura cadastrado (ver
  `2026-08-01-planos-assinatura.md` para pré-requisitos desse plano).
- Um Access Token de teste do Mercado Pago disponível para colar em Configurações (pode ser o
  token da plataforma usado temporariamente, conforme combinado).
- Navegador Chrome (desktop ou Android) para o teste de instalação PWA.

---

## Passos a reproduzir

### Bloco 1 — Endereço estruturado do salão

1. Como **dono**, abrir Configurações → editar endereço usando os 6 campos separados
   (Logradouro, Número, Bairro, CEP, Cidade, Estado). Salvar.
   - **Aceitação:** os 6 campos persistem após recarregar; o geocoding (Nominatim) roda ao
     salvar (conferir na aba Network ou pelo pino do Maps).
2. Acessar a página pública do salão (`/s/:slug`) como cliente.
   - **Aceitação:** o endereço formatado aparece corretamente (ex.: "Rua X, 123 - Bairro,
     Cidade - UF, CEP").
3. No histórico do cliente (`ClientAppointments.jsx`), clicar em "como chegar"/direções.
   - **Aceitação:** o link do Google Maps abre no local correto (lat/lng do geocoding novo,
     não o antigo).
4. **Compatibilidade com salão antigo:** abrir um salão que NUNCA teve os 6 campos preenchidos
   (endereço legado em texto livre).
   - **Aceitação:** continua funcionando normalmente com o endereço antigo (sem erro, sem
     campo em branco quebrando a tela).

### Bloco 2 — Avaliação interna removida / convite Google

5. Como **dono**, verificar que o item de menu "Avaliações" não existe mais e a rota antiga
   não é mais acessível diretamente.
   - **Aceitação:** menu sem "Avaliações"; navegar direto pra rota antiga não quebra o app
     (idealmente redireciona ou dá 404 tratado, não tela branca).
6. Como **cliente**, na página pública do salão, verificar que o formulário "Deixe sua
   avaliação" (estrelas + comentário) não existe mais.
   - **Aceitação:** sem formulário de avaliação por estrelas em nenhuma tela do cliente.
7. Em Configurações, como dono, cadastrar um link de avaliação do Google válido.
8. Como **cliente**, marcar um atendimento como concluído.
   - **Aceitação:** aparece um convite com o link clicável para avaliar no Google
     (`target="_blank"`), independente de qualquer nota (não existe mais nota interna).
9. Repetir o teste 8 com o salão **sem** link do Google cadastrado.
   - **Aceitação:** conclusão funciona normalmente, só sem o convite (toast de sucesso comum).

### Bloco 3 — Reorganização do menu do dono

10. Como **dono**, abrir o menu lateral.
    - **Aceitação:** "Planos" aparece **dentro** do submenu "Cadastros" (junto com Serviços,
      Profissionais, Horários, Clientes); "Bloqueios" aparece como item **solto**, fora de
      "Cadastros", no nível principal do menu.
11. Clicar em cada um dos dois itens.
    - **Aceitação:** ambos navegam para as telas corretas (rotas inalteradas, só mudou a
      posição visual).

### Bloco 4 — Checkout de plano via Mercado Pago

12. Como **dono**, em Configurações, colar um Access Token do Mercado Pago (pode ser o de
    teste da plataforma) no campo novo. Salvar.
    - **Aceitação:** status passa a exibir "Conectado" (via RPC `is_salon_mp_connected`, sem
      nunca expor o token de volta na tela).
13. Como **cliente**, selecionar um plano de assinatura para assinar.
    - **Aceitação:** aparecem **duas opções**: "Pagar pelo app" (Mercado Pago) e "Pagar direto
      com o dono" (abre WhatsApp com mensagem pré-preenchida citando o nome do plano).
14. Escolher **"Pagar pelo app"** e completar o checkout em sandbox do Mercado Pago.
    - **Aceitação:** ao voltar ao app, a tela de retorno (`/s/pagamento`) reflete o status;
      após o webhook confirmar, a assinatura aparece **ativa** no app do cliente com o
      contador de uso do ciclo.
15. Repetir a assinatura de um plano escolhendo **"Pagar direto com o dono"**.
    - **Aceitação:** abre o WhatsApp do salão com a mensagem correta; a assinatura fica
      registrada como pendente até o dono confirmar.
16. Como **dono**, na aba "Assinantes" da tela de Planos, localizar a assinatura pendente do
    passo 15 e clicar em "Marcar como pago".
    - **Aceitação:** a assinatura passa a `approved`/ativa; o cliente passa a ver o plano e o
      contador de uso no app dele.
17. **Salão sem MP conectado:** repetir o passo 13 num salão que não colou nenhum token.
    - **Aceitação:** só aparece a opção "Pagar direto com o dono" (WhatsApp); a opção de pagar
      pelo app não é exibida.

### Bloco 5 — Agenda do cliente em branco (fix)

18. Como **cliente**, fazer um agendamento (qualquer serviço) e, após confirmar, navegar para
    a aba "Agenda".
    - **Aceitação:** a tela renderiza normalmente, mostrando o agendamento com nome e endereço
      do salão — **sem tela em branco**.
19. Repetir com um cliente que **já tem** agendamentos anteriores (não é o primeiro).
    - **Aceitação:** a lista completa renderiza sem erro.

### Bloco 6 — Instalabilidade do PWA

20. Como **dono**, acessar o painel pelo Chrome (rota raiz/`/painel`) e verificar a opção de
    instalar o app (menu de três pontos ou ícone de instalar na barra de endereço).
    - **Aceitação:** opção de instalar **disponível** (sem regressão — continuava funcionando
      antes e deve seguir funcionando).
21. Como **cliente**, acessar `/s/:slug` pelo Chrome e verificar a opção de instalar.
    - **Aceitação:** opção de instalar **disponível** (era o bug reportado — antes não
      aparecia). Ao instalar, o app abre direto na página do salão (`start_url` correto).
22. Inspecionar (DevTools → Application → Manifest) em ambos os contextos.
    - **Aceitação:** rotas raiz mostram manifest estático (`/manifest.webmanifest`); `/s/:slug`
      mostra o manifest dinâmico (`/api/manifest?slug=...`) sem nenhum erro/warning de
      manifest duplicado.

---

## Critérios de aceitação (resumo — o que caracteriza PASS)

- **Endereço:** 6 campos persistem, geocoding atualiza, compatível com salões legados.
- **Avaliação:** UI interna removida (dono e cliente); convite do Google aparece ao concluir
  atendimento, condicionado só à existência do link (sem nota).
- **Menu:** Planos em Cadastros; Bloqueios solto; rotas inalteradas.
- **Mercado Pago:** conexão via token colado funciona; cliente vê as duas opções de pagamento
  (condicionada à conexão do dono); webhook ativa assinatura paga pelo app; dono confirma
  manualmente pagamento externo via "Marcar como pago".
- **Agenda:** nunca fica em branco, com 1 ou mais agendamentos.
- **PWA:** instalação disponível tanto para dono (raiz) quanto para cliente (`/s/:slug`), sem
  manifest duplicado.

---

## Resultado: [ ] PASS  [ ] FAIL — preencher após execução

_(Preencher por bloco após rodar. Se FAIL: registrar bloco/passo, comportamento observado,
evidência — print/log/aba Network — e, após correção, causa raiz e fix aplicado.)_

| Bloco | Item | Resultado | Observações |
|-------|------|-----------|-------------|
| 1 | Endereço estruturado | [ ] PASS / [ ] FAIL | |
| 2 | Avaliação → convite Google | [ ] PASS / [ ] FAIL | |
| 3 | Reorganização do menu | [ ] PASS / [ ] FAIL | |
| 4 | Checkout Mercado Pago | [ ] PASS / [ ] FAIL | |
| 5 | Agenda do cliente (fix) | [ ] PASS / [ ] FAIL | |
| 6 | Instalabilidade PWA (fix) | [ ] PASS / [ ] FAIL | |

**RESULTADO GLOBAL:** [ ] PASS  [ ] FAIL — _(a preencher)_

## Evidência

_(a preencher — prints/logs/aba Network por bloco)_
