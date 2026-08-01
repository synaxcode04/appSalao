# Base de Conhecimento - App de Salão de Beleza

## Como Rodar o Projeto Localmente

1. Certifique-se de ter o Node.js instalado.
2. Navegue até a pasta do aplicativo (`app`).
3. Execute `npm install` para instalar as dependências.
4. Execute `npm run dev` para iniciar o servidor de desenvolvimento.
5. Acesse `http://localhost:5173` no seu navegador.

## Como Configurar o Supabase

1. Crie uma conta em [Supabase](https://supabase.com/).
2. Crie um novo projeto.
3. No painel do projeto, vá em "Project Settings" -> "API".
4. Copie a `Project URL` e a `anon public key`.
5. Crie um arquivo `.env` na raiz da pasta `app` com o seguinte formato:

```
VITE_SUPABASE_URL=sua_project_url_aqui
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

6. No SQL Editor do Supabase, crie as tabelas conforme detalhado no arquivo `Specs.md`.

## Conversão para Android (Passos Futuros)
Quando a versão web estiver madura e testada:
1. Instalar o Capacitor na pasta `app`:
   `npm install @capacitor/core @capacitor/cli`
2. Inicializar o Capacitor:
   `npx cap init`
3. Adicionar a plataforma Android:
   `npm install @capacitor/android`
   `npx cap add android`
4. Após fazer o build do React (`npm run build`), sincronizar:
   `npx cap sync`
5. Abrir no Android Studio:
   `npx cap open android`
