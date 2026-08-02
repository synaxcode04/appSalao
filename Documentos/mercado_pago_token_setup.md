# Configuração de Access Token — Mercado Pago

> Manual passo a passo para o dono do salão encontrar e configurar o Access Token da conta Mercado Pago, permitindo que clientes paguem assinatura de planos diretamente na conta do dono.

## Contexto da integração

O App Salão permite que **clientes paguem assinatura de planos via Mercado Pago**. O modelo é **MARKETPLACE sem comissão da plataforma**:
- 100% do dinheiro vai direto para a conta Mercado Pago de **cada dono de salão** (não há retenção ou taxa da plataforma).
- Cada dono fornece seu próprio **Access Token** da conta Mercado Pago ao seu salão no app.
- **Nenhuma integração OAuth** — é um passo a passo simples de copia-cola do token.

**Domínio de produção:** `appsalao-psi.vercel.app`

---

## Passo 1: Acessar as Credenciais do Mercado Pago

1. Acesse https://www.mercadopago.com.br/
2. Faça login com sua conta Mercado Pago (a conta em nome do seu salão, ou a conta pessoal que será usada para receber os pagamentos).
3. No canto superior direito, clique em **"Sua conta"** ou no ícone do perfil.
4. Procure por **"Configurações"** ou **"Configuração da conta"**.
5. Dentro de Configurações, procure **"Credenciais"** ou **"Chaves de acesso"** (pode estar também em **"Integrações"** ou **"Developers"**).

Se não encontrar, acesse diretamente: https://www.mercadopago.com.br/developers/panel/

---

## Passo 2: Escolher ambiente (Teste ou Produção)

Na tela de Credenciais, você verá duas abas ou grupos:
- **Ambiente de testes (Sandbox)** — para testar pagamentos sem movimentar dinheiro real.
- **Ambiente de produção** — para pagamentos reais.

### Para começar: use o Ambiente de testes
- Copie o **Access Token** do Sandbox (formato: `APP_USR-...`).
- Use este token para testar o fluxo no app em fase de desenvolvimento.
- As transações de teste NÃO movem dinheiro real.

### Para ativar: use o Ambiente de produção
- Copie o **Access Token** de Produção (formato: `APP_USR-...`).
- Use este token quando tudo estiver funcionando e pronto para receber pagamentos reais.
- As transações de produção movem dinheiro real para sua conta Mercado Pago.

**Diferença importante:**
- **Sandbox:** Use para validar todo o fluxo. Não movimenta dinheiro real; útil para treinar, testar pagamentos etc.
- **Produção:** Use quando estiver confiante. Todo pagamento é real e cai na sua conta Mercado Pago imediatamente (pode haver período de processamento para alguns métodos).

---

## Passo 3: Copiar o Access Token

1. Na aba do ambiente escolhido (Teste ou Produção), procure o campo chamado **"Access Token"** ou **"Bearer token"**.
2. Clique em **"Copiar"** ou selecione o texto manualmente (formato começa com `APP_USR-`).
3. Cole em um local seguro (bloco de notas, gerenciador de senhas) — você precisará dele no passo 4.

> **⚠️ SEGURANÇA CRÍTICA:** O Access Token é o equivalente a sua senha de conta Mercado Pago. Com ele, qualquer pessoa consegue:
> - Fazer pagamentos em sua conta
> - Acessar histórico de transações
> - Movimentar dinheiro
>
> **Nunca compartilhe** o token com ninguém, nunca o envie por mensagem ou email, e **nunca o coloque em código público**. Guarde em local seguro.

---

## Passo 4: Colar o Access Token no App Salão

Agora você vai inserir o token na sua conta de salão no App Salão.

1. Acesse https://appsalao-psi.vercel.app (ou o ambiente correto do app).
2. Faça login com sua conta de **dono do salão** (email e senha que você usa como proprietário).
3. Vá para o **Painel do dono** → **Configurações** (ou **Settings**).
4. Procure pelo card/seção chamada **"Receber pagamentos pelo app (Mercado Pago)"** ou similar.
5. Clique no campo de texto e cole o Access Token que você copiou no Passo 3.
6. Clique em **"Salvar"** ou **"Atualizar"**.

**O token é armazenado com segurança** — nem você mesmo conseguirá lê-lo novamente pela interface do app. Se precisar trocar, basta colar um novo token e salvar de novo (o anterior será descartado).

---

## Passo 5: Testar em Sandbox

Antes de usar com clientes reais e dinheiro real, **sempre teste em Sandbox**.

### 5.1 — Criar usuários de teste no Mercado Pago

1. Acesse https://www.mercadopago.com.br/developers/panel/
2. Na aba **"Ambiente de testes"**, procure **"Usuários de teste"** ou **"Test users"**.
3. Clique em **"Criar usuário de teste"** e crie **dois usuários**:
   - **Vendedor de teste** (simula você, o dono do salão)
     - Email: ex. `vendedor_teste@test.com`
     - Guardar a senha em local seguro
   - **Comprador de teste** (simula o cliente que vai pagar)
     - Email: ex. `comprador_teste@test.com`
     - Guardar a senha em local seguro

### 5.2 — Fluxo de teste esperado

1. **No App Salão (como dono):**
   - Certifique-se de que o Access Token de **Sandbox** foi colado em Configurações (Passo 4).
   - Crie um plano de teste com um preço baixo (ex: R$ 1,00) para testar facilmente.

2. **Como cliente anônimo (simulando quem vai pagar):**
   - Acesse o link público do seu salão: `https://appsalao-psi.vercel.app/s/:seu-slug`
   - Navegue até a seção de **Planos** ou **Assinatura**.
   - Escolha o plano de teste e clique em **"Pagar"** ou **"Assinar"**.
   - Você será redirecionado para o Checkout do Mercado Pago (Sandbox).

3. **Na tela de pagamento do Mercado Pago:**
   - Faça login com o **comprador de teste** (ex: `comprador_teste@test.com`).
   - Escolha um método de pagamento de teste (ex: cartão `4111 1111 1111 1111`, vencimento qualquer futuro, CVV qualquer).
   - Confirme o pagamento.

4. **Após o pagamento:**
   - O Mercado Pago enviará uma notificação (webhook) para o app.
   - O app processará o webhook e ativará a assinatura do cliente.
   - **Resultado esperado:** Você volta à tela do app, vê a mensagem "Assinatura ativa" e o cliente consegue agendar dentro da cota do plano.

**Se algo der errado:**
- Verifique os logs da Vercel: `vercel logs` ou https://vercel.com/dashboard → App Salão → Functions.
- Cheque o painel do Mercado Pago → Notificações → histórico de webhooks (se foi entregue com sucesso).
- Releia as mensagens de erro no app — elas costumam apontar exatamente o problema.

---

## Passo 6: Ativar com Access Token de Produção

Quando o teste em Sandbox passou e você está pronto para **receber pagamentos reais**:

1. Acesse novamente https://www.mercadopago.com.br/developers/panel/
2. Vá para a aba **"Ambiente de produção"**.
3. Copie o **Access Token** de Produção (formato `APP_USR-...`).
4. No App Salão, vá para **Painel do dono** → **Configurações**.
5. Na seção **"Receber pagamentos pelo app (Mercado Pago)"**, **substitua** o token anterior (de Sandbox) pelo token de Produção.
6. Clique em **"Salvar"**.

**Pronto!** A partir desse momento, todo cliente que pagar uma assinatura estará movimentando **dinheiro real** para sua conta Mercado Pago. O dinheiro cai na sua conta em poucos minutos (pode variar conforme o método de pagamento).

---

## Passo 7: Checklist de ativação

Antes de considerar a feature funcional, marque todos os itens:

- [ ] **Access Token de Sandbox copiado**
  - Origem: Mercado Pago Dashboard → Credenciais → Ambiente de testes
  
- [ ] **Access Token colado no App Salão (Sandbox)**
  - Local: Painel do dono → Configurações → "Receber pagamentos (Mercado Pago)"
  - Clicado em "Salvar"
  
- [ ] **Plano de teste criado**
  - Preço baixo (ex: R$ 1,00) para facilitar teste
  - Serviços associados
  
- [ ] **Teste em Sandbox realizado**
  - ☑ Usuários de teste criados no Mercado Pago (vendedor + comprador)
  - ☑ Cliente fez agendamento de teste
  - ☑ Pagamento de teste foi processado no Checkout
  - ☑ Webhook foi recebido (verificar painel MP)
  - ☑ Assinatura ficou ativa no app
  - ☑ Cliente consegue agendar dentro da cota do plano
  
- [ ] **Migrations aplicadas no Supabase**
  - Script `Documentos/mp_marketplace.sql` foi executado
  - Tabelas necessárias existem (verificar em `Supabase Dashboard → SQL Editor`)
  
- [ ] **Access Token de Produção copiado**
  - Origem: Mercado Pago Dashboard → Credenciais → Ambiente de produção
  
- [ ] **Access Token de Produção colado no App Salão**
  - Painel do dono → Configurações → "Receber pagamentos (Mercado Pago)"
  - Clicado em "Salvar"
  
- [ ] **Teste fim-a-fim em Produção (OPCIONAL, mas recomendado)**
  - ☑ Fez um pagamento de teste com cartão real (ou aguarde cliente real fazer)
  - ☑ Dinheiro foi creditado na conta Mercado Pago
  - ☑ Assinatura foi ativada corretamente no app

---

## Variáveis de ambiente — referência

A plataforma **não precisa** mais de `MP_CLIENT_ID` ou `MP_CLIENT_SECRET` no Vercel, pois não há OAuth.

As únicas variáveis server-side ainda relevantes são:
- `SUPABASE_URL` — URL do banco Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — chave de admin do Supabase (para operações server-side em webhooks)
- `MERCADO_PAGO_WEBHOOK_SECRET` — secret para validar webhooks do Mercado Pago (se aplicável; ver documentação do webhook)

Não há nenhuma variável nova a configurar no Vercel — o token é guardado **no banco de dados** do seu salão, não em variáveis de ambiente.

---

## Troubleshooting

### "Erro ao salvar o token" / "Token inválido"
- Certifique-se de que copinou o **Access Token** completo (formato `APP_USR-...`).
- O token não pode ter espaços no início ou fim — tente copiar novamente.
- Se ainda não funcionar, verifique se o token é de **Sandbox** (se testando) ou de **Produção** (se ativando).

### "Cliente não consegue pagar" / "Checkout não abre"
- Certifique-se de que o Access Token foi salvo (Passo 4 ou 6).
- Verifique se está usando um token de **Sandbox** enquanto testa (não use produção em dev).
- Confira se o plano tem preço e serviços associados.

### "Pagamento foi feito mas assinatura não ficou ativa"
- Verifique se a migration `Documentos/mp_marketplace.sql` foi aplicada no Supabase.
- Confirme se o webhook foi recebido (painel Mercado Pago → Notificações → histórico).
- Verifique os logs da Vercel: https://vercel.com/dashboard → App Salão → Functions.

### "Quanto tempo demora o dinheiro cair na minha conta?"
- **Cartão de débito:** 1-2 dias úteis
- **Cartão de crédito:** 1-2 dias úteis (pós-resolução de chargeback, se houver)
- **PIX:** Instantâneo (segundos)
- **Boleto:** 1-3 dias úteis (após compensação)

Consulte a [documentação oficial do Mercado Pago](https://www.mercadopago.com.br/) para detalhes atualizados.

### "Perdi meu Access Token, como recupero?"
- Não é possível recuperar um token perdido — ele não fica visível novamente após salvo.
- Solução: Gere um novo token no Mercado Pago (se houver opção de "Regenerar") ou crie uma nova integração.
- Aí crie um novo Access Token e cole-o novamente no App Salão (Passo 4 ou 6).

---

## Suporte

Dúvidas sobre a documentação ou configuração?
- Consulte a [documentação oficial do Mercado Pago](https://developers.mercadopago.com.br/).
- Ou contate o time técnico do App Salão.

---

**Última atualização:** 2026-08-02
