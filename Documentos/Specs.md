# Especificações Técnicas (Specs)

## 1. Arquitetura do Sistema
- **Frontend:** React.js (via Vite)
- **Roteamento:** React Router DOM (Single Page Application)
- **Estilização:** CSS Vanilla (Mobile-First) - Paleta Branco/Verde
- **Backend/Banco de Dados:** Supabase (PostgreSQL)
- **Autenticação:** Supabase Auth (E-mail/Senha)
- **Ícones:** Lucide React
- **Conversão Mobile:** Capacitor JS (Futuro)

## 2. Estrutura de Banco de Dados (PostgreSQL - Supabase)

### Tabela `users` (Gerenciada pelo Supabase Auth)
- `id` (UUID)
- `email` (String)

### Tabela `profiles`
- `id` (UUID - Referência a users.id)
- `role` (Enum: 'owner', 'client')
- `full_name` (String)
- `phone` (String)

### Tabela `salons`
- `id` (UUID)
- `owner_id` (UUID - Referência a profiles.id)
- `name` (String)
- `logo_url` (String)
- `created_at` (Timestamp)

### Tabela `services`
- `id` (UUID)
- `salon_id` (UUID)
- `name` (String)
- `duration_minutes` (Integer)
- `price` (Decimal)

### Tabela `working_hours`
- `id` (UUID)
- `salon_id` (UUID)
- `day_of_week` (Integer 0-6)
- `start_time` (Time)
- `end_time` (Time)

### Tabela `appointments`
- `id` (UUID)
- `salon_id` (UUID)
- `service_id` (UUID)
- `client_id` (UUID)
- `appointment_date` (Date)
- `start_time` (Time)
- `end_time` (Time)
- `status` (Enum: 'scheduled', 'canceled', 'completed')

## 3. Fluxo de Autenticação
1. Usuário acessa o app.
2. Seleciona "Sou Proprietário" ou "Sou Cliente".
3. É redirecionado para a tela de Login ou Cadastro (baseado na escolha).
4. Após o login, a sessão do Supabase é salva localmente e o usuário é redirecionado para o painel correspondente à sua função.
