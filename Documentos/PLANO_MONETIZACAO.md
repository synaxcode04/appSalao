# Estratégia de Monetização e Assinaturas (SaaS) 💰

Este documento registra a arquitetura que será implementada futuramente para gerenciar as mensalidades dos salões de beleza (R$ 19,90/mês), maximizando a margem de lucro e evitando as taxas abusivas das lojas de aplicativos.

## O Problema das Lojas (App Store e Play Store)
A Apple e o Google cobram uma taxa de **15% a 30%** sobre qualquer assinatura ou compra que libere funcionalidades "digitais" dentro de um aplicativo. Além disso, se o aplicativo tiver um botão direcionando o usuário para pagar em um site externo (como Stripe), o aplicativo é sumariamente **rejeitado** na análise.

## A Solução (Modelo "Netflix")
Para reter 100% da receita usando o **Stripe**, a venda do software não acontecerá dentro do aplicativo móvel, mas sim em uma página web externa.

### 1. Fluxo do Cliente (Gratuito)
* O cliente comum baixa o app nas lojas.
* Abre o aplicativo, clica em "Sou Cliente" e consegue criar a conta livremente.
* Não há barreiras.

### 2. Fluxo do Proprietário do Salão (Pagante)
* **Venda e Cadastro:** O salão conhecerá o sistema através de marketing ou landing page (ex: `www.seuapp.com.br`).
* **Pagamento Web:** No site, ele criará sua conta e passará o cartão via **Stripe Checkout** para iniciar sua assinatura.
* **Uso do App Móvel:** Após pagar, ele fará o download do aplicativo. A área "Sou Proprietário" no aplicativo servirá **apenas para Login**. Não existirá a opção "Criar Conta" para donos de salão no app móvel.

## Arquitetura a ser implementada no Banco de Dados (Supabase)
Quando formos iniciar a fase de pagamentos, aplicaremos as seguintes mudanças:

1. **Nova Tabela de Assinaturas:** 
   Criar uma tabela `subscriptions` ligada ao `owner_id` para armazenar o `stripe_customer_id` e o `status` (active, past_due, canceled).
2. **Webhooks do Stripe:** 
   Criar uma Edge Function (função backend no Supabase) para ouvir os eventos do Stripe (ex: quando o cartão do cliente passar ou falhar) e atualizar o status no banco de dados automaticamente.
3. **Bloqueio no App (Frontend):** 
   Na tela principal do proprietário (`OwnerLayout.jsx`), o sistema verificará o `status` da assinatura. Se estiver inativo, o sistema redirecionará o dono do salão para uma "Tela de Bloqueio" com a mensagem: *"Sua assinatura expirou. Acesse nosso site pelo computador para regularizar."*
4. **Remoção de Cadastro no App:** 
   O fluxo de registro (`Register.jsx`) precisará ser modificado para não permitir mais a criação de contas do tipo `owner`, deixando isso exclusivo para a Landing Page na web.
