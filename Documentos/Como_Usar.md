# Como Rodar e Testar o App (Localhost)

Para testar o aplicativo no seu computador ou no seu celular (usando a mesma rede Wi-Fi), você precisa iniciar o servidor de desenvolvimento.

Siga os passos abaixo:

### Passo 1: Abrir o terminal
Abra o CMD (Prompt de Comando) ou o terminal do seu editor de código e navegue até a pasta `app`.

```bash
cd app
```

### Passo 2: Iniciar o servidor com suporte a rede e HTTPS
Como o aplicativo agora possui recursos avançados como **Geolocalização (GPS)**, os navegadores modernos (como Chrome e Safari no celular) exigem que o site seja seguro (`https://`) para permitir o uso da localização.

Para iniciar o servidor simulando uma conexão segura para que você consiga testar no celular, digite o seguinte comando:

```bash
npm run dev -- --host
```

### Passo 3: Acessar o App
Após digitar o comando, o terminal vai mostrar alguns links parecidos com este:

```text
  VITE v5.0.0  ready in 1500 ms

  ➜  Local:   https://localhost:5173/
  ➜  Network: https://192.168.0.10:5173/
```

- **Para testar no próprio computador:** Segure a tecla `CTRL` e clique no link `Local` (https://localhost:5173).
- **Para testar no celular (mesmo Wi-Fi):** Digite o endereço exato que aparecer na linha `Network` no navegador do seu celular (exemplo: `https://192.168.0.10:5173/`).

> **Aviso de Segurança:** Como o certificado HTTPS que estamos usando é "falso" (criado apenas para testes locais), o seu navegador vai avisar que "Sua conexão não é particular" ou "Não seguro". 
> Não se preocupe! **Pode clicar em "Avançado" e depois em "Ir para 192.168.x.x (inseguro)"**. O site vai carregar normalmente e a permissão do GPS vai funcionar!
