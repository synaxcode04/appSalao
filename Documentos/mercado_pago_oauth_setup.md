# Configuração OAuth Marketplace — Mercado Pago

> Manual passo a passo para criar e configurar a integração OAuth com Mercado Pago, permitindo que donos de salão recebam pagamentos diretamente em suas contas.

## Contexto da integração

O App Salão permite que **clientes paguem assinatura de planos via Mercado Pago**. O modelo é **MARKETPLACE sem comissão da plataforma**:
- 100% do dinheiro vai direto para a conta Mercado Pago de **cada dono de salão** (não há retenção ou taxa da plataforma).
- Cada dono conecta sua própria conta Mercado Pago ao seu salão via OAuth.
- A plataforma precisa registrar **UM app OAuth** no painel Developers do Mercado Pago (distinto do app que hoje cobra a licença SaaS).

**Domínio de produção:** `appsalao-psi.vercel.app`

---

## Passo 1: Acessar o painel Developers do Mercado Pago

1. Acesse https://www.mercadopago.com.br/developers
2. Faça login com sua conta Mercado Pago (mesma conta que usará para gerenciar as credenciais da plataforma).
3. No menu superior, clique em **"Suas integrações"** ou **"Aplicações"**.

> **Importante:** Se você já tem um app registrado para cobrar a licença SaaS, **não reutilize aquele app**. A integração de marketplace requer escopos e configurações diferentes. Crie um novo app, separado.

---

## Passo 2: Criar uma nova aplicação

1. Clique no botão **"Criar aplicação"** (ou **"+ Criar app"**).
2. Escolha um nome descritivo, por exemplo:
   - `App Salão Marketplace`
   - `App Salão Pagamentos (Marketplace)`
3. Na pergunta "Qual tipo de solução você quer desenvolver?", selecione:
   - **Pagamentos online** (ou **Online payments**)
4. Se aparecer uma segunda pergunta sobre o caso de uso:
   - Selecione **Marketplace** (ou a opção equivalente; pode estar em "Integrar pagamentos" > "Marketplace/Divide payment")
5. Clique em **"Criar"**.

A aplicação será criada e você será redirecionado para o painel de configuração.

---

## Passo 3: Obter Client ID e Client Secret

Essas credenciais são usadas para autenticar a plataforma junto ao Mercado Pago.

1. No painel da aplicação, procure a aba **"Credenciais"** ou **"Chaves de acesso"**.
2. Você verá dois grupos: **Ambiente de produção** e **Ambiente de testes (Sandbox)**.
3. Copie e guarde em local seguro:
   - **Client ID** (também pode aparecer como "App ID" ou "Application ID")
   - **Client Secret** (também pode aparecer como "Secret key")

**Para começar, use as credenciais do Sandbox** (ambiente de teste). Quando estiver pronto para ativar em produção, volte aqui e use as credenciais de Produção.

> **Nunca compartilhe o Client Secret publicamente.** Ele só deve estar no código do servidor (Vercel) e nas variáveis de ambiente.

---

## Passo 4: Cadastrar a Redirect URI do OAuth

A Redirect URI é o endereço para onde o Mercado Pago redireciona o usuário após autenticação. Este é um **endereço fixo da plataforma**, não do dono individual.

1. No painel da aplicação, procure a seção **"Configurações"** ou **"Settings"**.
2. Busque a opção **"OAuth"** ou **"Autenticação"**.
3. Procure por um campo chamado **"Redirect URIs"** ou **"Authorized redirect URIs"**.
4. Clique em **"Adicionar Redirect URI"** (ou **"+ Add"**).
5. Cole a seguinte URI:

```
https://appsalao-psi.vercel.app/api/mp-oauth-callback
```

6. Clique em **"Salvar"** ou **"Confirmar"**.

---

## Passo 5: Configurar escopos/permissões OAuth

Os escopos definem quais dados e ações a plataforma pode fazer em nome do dono após autenticação.

1. Ainda na seção **"OAuth"** ou **"Autenticações"**, procure por **"Escopos"** ou **"Scopes"**.
2. Certifique-se de que os seguintes escopos estão **habilitados**:
   - `offline_access` — **crucial**: permite renovar o token de acesso sem o dono precisar re-autorizar toda vez. Sem ele, o token expira e a integração para de funcionar.
   - `read` — para ler dados da conta do dono (ex: transações, saldo).
   - `write` — para criar e gerenciar pagamentos em nome do dono.
   - `payments:read` — (se disponível) para ler histórico de pagamentos.
   - `payments:write` — (se disponível) para criar pagamentos.

3. Salve as configurações.

> **Por que `offline_access` é importante?** O access token do Mercado Pago expira (geralmente em 6 horas). O `refresh_token` permite renovar esse acesso automaticamente sem pedir ao dono para se logar novamente. Sem `offline_access`, você receberá um refresh_token; com ele habilitado, a renovação é automática e silenciosa.

---

## Passo 6: Configurar Webhook/Notificações

O webhook permite que a plataforma seja notificada quando:
- Um cliente paga uma assinatura.
- Um pagamento é reembolsado.
- O status de uma transação muda.

### 6.1 — Cadastrar a URL do webhook

1. No painel da aplicação, procure a seção **"Notificações"** ou **"Webhooks"**.
2. Clique em **"Adicionar notificação"** ou **"+ Novo webhook"**.
3. Digite a seguinte URL:

```
https://appsalao-psi.vercel.app/api/mp-webhook
```

4. Selecione os eventos que deseja receber:
   - `payment.created` — novo pagamento iniciado.
   - `payment.updated` — pagamento atualizado (aprovado, rejeitado, pendente).
   - `invoice.created` — fatura gerada (se aplicável).
5. Clique em **"Salvar"** ou **"Criar"**.

### 6.2 — Obter o Secret do webhook

1. Após salvar o webhook, você verá a URL cadastrada listada.
2. Clique em **"Editar"** ou no ícone de configuração dessa URL.
3. Procure um campo chamado **"Assinatura secreta"**, **"Webhook secret"** ou **"Token secreto"**.
4. Se não estiver visível, ele pode estar em uma aba **"Autenticação"** ou **"Segurança"**.
5. Copie o valor. Se não houver um gerado, clique em **"Gerar"** ou **"Generate"**.

> Este valor vira a variável de ambiente `MERCADO_PAGO_WEBHOOK_SECRET` na Vercel. Ela é usada para validar que os webhooks recebidos realmente vêm do Mercado Pago.

---

## Passo 7: Configurar variáveis de ambiente no Vercel

Essas variáveis são **server-side only** — nunca são expostas ao navegador do cliente.

1. Acesse https://vercel.com/dashboard
2. Selecione o projeto **App Salão**.
3. Vá para **Settings** → **Environment Variables**.
4. Adicione (ou atualize) as seguintes variáveis **em Production E Preview**:

| Variável | Valor | Origem |
|----------|-------|--------|
| `MP_CLIENT_ID` | `<SEU_CLIENT_ID>` | Credenciais (Passo 3) — Sandbox ou Produção |
| `MP_CLIENT_SECRET` | `<SEU_CLIENT_SECRET>` | Credenciais (Passo 3) — Sandbox ou Produção |
| `MERCADO_PAGO_WEBHOOK_SECRET` | `<WEBHOOK_SECRET>` | Configuração de webhook (Passo 6.2) |

Exemplo (com valores fictícios):

```
MP_CLIENT_ID=1234567890123456
MP_CLIENT_SECRET=abcdefghijklmnopqrstuvwxyz1234567890
MERCADO_PAGO_WEBHOOK_SECRET=webhook_secret_xyz789
```

5. Para cada variável, certifique-se de selecionar:
   - ☑ Production
   - ☑ Preview
6. Clique em **"Save"** após cada variável.

> **Sem essas variáveis configuradas, o fluxo de pagamento não funcionará.** Os endpoints `/api/mp-oauth-callback` e `/api/mp-webhook` retornarão erros claros indicando que faltam as env vars. A opção "Pagar assinatura" ficará indisponível no app até que essas configurações sejam completas.

---

## Passo 8: Testar em Sandbox (Ambiente de testes)

Antes de ativar em Produção, **sempre teste em Sandbox** com credenciais de teste.

### 8.1 — Criar conta de teste no Mercado Pago

1. No painel Developers, vá para **"Ambiente de testes"** ou **"Sandbox"**.
2. Procure a seção **"Usuários de teste"** ou **"Test users"**.
3. Clique em **"Criar usuário de teste"** para criar **dois usuários**:
   - **Vendedor de teste** (simula o dono do salão)
     - Email: ex. `vendedor_teste@test.com`
     - Senha: ex. `TestPass123` (guarde em local seguro)
   - **Comprador de teste** (simula o cliente que paga)
     - Email: ex. `comprador_teste@test.com`
     - Senha: ex. `TestPass456`

### 8.2 — Fluxo esperado de teste

1. **No app (em dev ou preview), como admin/dono:**
   - Acesse a tela de "Configurações" ou "Integração Mercado Pago" do seu salão.
   - Clique em **"Conectar conta Mercado Pago"**.
   - Você será redirecionado para a URL de OAuth do Mercado Pago.
   
2. **Na tela de login do Mercado Pago:**
   - Use as credenciais do **vendedor de teste** (ex. `vendedor_teste@test.com`).
   - Autorize o acesso (conceda os escopos necessários).
   - Você será redirecionado de volta para `/api/mp-oauth-callback`, que armazena o token em segurança.
   
3. **De volta no app:**
   - A conexão será marcada como ativa.
   - O status deve indicar "Conta Mercado Pago conectada" ou similar.
   
4. **Como cliente (sessão anônima no salão):**
   - Acesse a tela de planos/assinatura.
   - Escolha um plano e clique em **"Pagar"**.
   - Você será redirecionado para o Checkout Pro do Mercado Pago (sandbox).
   - Na tela de pagamento, use as credenciais do **comprador de teste** (ex. `comprador_teste@test.com`).
   - Selecione um método de pagamento de teste (ex. cartão de teste `4111 1111 1111 1111`, vencimento futuro, CVV qualquer).
   - Confirme o pagamento.
   
5. **Após o pagamento:**
   - O Mercado Pago enviará um webhook para `/api/mp-webhook`.
   - O webhook será validado (usando `MERCADO_PAGO_WEBHOOK_SECRET`) e processado.
   - A assinatura do cliente será ativada no banco (tabela `client_subscriptions`).
   - **Resultado esperado:** O cliente vê a assinatura ativa e pode agendar dentro da cota do plano.

Se alguma etapa falhar, verifique:
- Logs da Vercel (`vercel logs`).
- Network DevTools do navegador (status de redirecionamento, respostas HTTP).
- Painel de webhooks no Mercado Pago (se o webhook foi entregue com sucesso).

---

## Passo 9: Ativar em Produção

Quando tudo estiver funcionando em Sandbox, **mude para credenciais de Produção**:

1. No painel Developers, vá para **"Ambiente de produção"**.
2. Copie o **Client ID** e **Client Secret** de produção.
3. No Vercel Dashboard, vá para **Settings** → **Environment Variables**.
4. **Substitua** os valores de `MP_CLIENT_ID` e `MP_CLIENT_SECRET` pelos valores de **produção** (não de sandbox).
5. Certifique-se de que as mesmas variáveis estão em **Production E Preview**.
6. Clique em **"Save"**.

> **Importante:** Depois de alterar as env vars, o Vercel redeploy automaticamente a aplicação. Nenhuma ação manual adicional é necessária — a mudança entra em efeito em minutos.

> A Redirect URI e a webhook URL são sempre as mesmas (`appsalao-psi.vercel.app`), quer em sandbox quer em produção. O que muda são apenas as credenciais (Client ID/Secret).

---

## Passo 10: Checklist de ativação

Antes de considerar a feature funcional em produção, marque todos os itens abaixo:

- [ ] **App OAuth criado no Mercado Pago**
  - Nome: `App Salão Marketplace` (ou similar)
  - Tipo: Pagamentos online / Marketplace
  
- [ ] **Client ID e Client Secret copiados**
  - Credenciais de Sandbox testadas e validadas
  - Credenciais de Produção prontas para uso
  
- [ ] **Redirect URI cadastrada**
  - URI: `https://appsalao-psi.vercel.app/api/mp-oauth-callback`
  - Status: Salvo e confirmado no painel MP
  
- [ ] **Escopos OAuth configurados**
  - ☑ `offline_access`
  - ☑ `read`
  - ☑ `write`
  - ☑ `payments:read` (se aplicável)
  - ☑ `payments:write` (se aplicável)
  
- [ ] **Webhook configurado**
  - URL: `https://appsalao-psi.vercel.app/api/mp-webhook`
  - Eventos: `payment.created`, `payment.updated` (no mínimo)
  - Secret: Gerado e copiado
  
- [ ] **Variáveis de ambiente no Vercel**
  - `MP_CLIENT_ID` — configurado em Production + Preview
  - `MP_CLIENT_SECRET` — configurado em Production + Preview
  - `MERCADO_PAGO_WEBHOOK_SECRET` — configurado em Production + Preview
  
- [ ] **Teste em Sandbox**
  - ☑ Dono conecta conta de teste via OAuth
  - ☑ Cliente faz pagamento de teste
  - ☑ Webhook é recebido e processado
  - ☑ Assinatura fica ativa no app
  
- [ ] **Migrations aplicadas no Supabase**
  - Script `Documentos/mp_marketplace.sql` foi executado
  - Tabelas e colunas necessárias existem (verificar em `Supabase Dashboard → SQL Editor`)
  
- [ ] **Credenciais de Produção configuradas**
  - `MP_CLIENT_ID` e `MP_CLIENT_SECRET` já são de Produção (não Sandbox)
  - Vercel redeploy concluído (espere 1-2 minutos)
  
- [ ] **Teste fim-a-fim em Produção**
  - ☑ Acessar `https://appsalao-psi.vercel.app`
  - ☑ Dono se conecta com conta MP real
  - ☑ Cliente faz pagamento real (ou de teste se MP oferece essa opção)
  - ☑ Assinatura é ativada corretamente

---

## Troubleshooting

### "Erro ao conectar conta Mercado Pago" / "Invalid Client ID"
- Verifique se `MP_CLIENT_ID` está correto no Vercel.
- Confirme que a Redirect URI está **exatamente** como cadastrado no Mercado Pago (`https://appsalao-psi.vercel.app/api/mp-oauth-callback`).
- Se testando em sandbox, use Client ID de **Sandbox**, não de Produção.

### "Webhook não está sendo recebido"
- Verifique se a URL no painel Developers é exatamente `https://appsalao-psi.vercel.app/api/mp-webhook`.
- No painel MP, na seção de webhooks, clique em "Reenviar" de um evento anterior — o app deve receber.
- Verifique os logs: `vercel logs` ou https://vercel.com/dashboard → App Salão → Functions.

### "Erro ao processar pagamento" / "Payment not found"
- Verifique se `MERCADO_PAGO_WEBHOOK_SECRET` está configurado corretamente.
- O webhook pode estar sendo recebido mas rejeitado por validação de assinatura — verifique logs.

### "Assinatura não ativa após pagamento"
- Verifique se a migration `Documentos/mp_marketplace.sql` foi aplicada.
- Confirme se o webhook foi recebido (painel MP → Notificações → histórico).
- Verifique logs da Vercel para erros no processamento do webhook.

---

## Suporte

Dúvidas sobre a documentação ou configuração?
- Consulte a [documentação oficial do Mercado Pago OAuth](https://developers.mercadopago.com.br/pt-BR/guides/additional-content/your-integrations/oauth).
- Ou contate o time técnico do App Salão.

---

**Última atualização:** 2026-08-02
