# Operacao

## Arquitetura e uso

O navegador cria uma sala, recebe um identificador e entra imediatamente como host. O link `https://frontend.exemplo/?room=ID` permite a entrada de participantes. Cada participante abre um WebSocket com o servidor para sinalizacao e chat; audio, video e tela seguem diretamente entre os navegadores por WebRTC mesh.

O servidor mantem salas em memoria. Uma sala nova ou vazia expira apos o TTL; uma conexao antes do vencimento cancela a expiracao. Nao ha API para apagar uma sala: sair fecha os recursos locais e o WebSocket.

## Requisitos

- Go 1.22 para o servidor.
- Node.js 22 e pnpm 10.13.1 para o cliente.
- Docker Engine com Docker Compose para o ambiente em containers ou imagens.
- Navegador com WebRTC, `getUserMedia` e permissao para camera, microfone e tela. Os E2E requerem Chromium disponivel ao Playwright e Go instalado, pois a configuracao inicia o servidor Go.

## Variaveis

| Variavel | Padrao | Uso |
| --- | --- | --- |
| `CLIENT_PORT` | `5173` | Porta publicada pelo Compose para o cliente. |
| `SERVER_PORT` | `8080` | Porta publicada pelo Compose para o servidor. |
| `PORT` | `8080` | Porta HTTP do servidor. Inteiro entre 1 e 65535. |
| `PUBLIC_SERVER_URL` | `http://localhost:8080` | URL HTTP(S) absoluta do servidor usada pelo navegador; o cliente deriva `ws://` ou `wss://`. |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Origens HTTP(S) do cliente, separadas por virgula, aceitas por CORS e WebSocket. |
| `ROOM_EMPTY_TTL` | `5m` | Duracao positiva para remover salas sem conexoes. |
| `MAX_WS_MESSAGE_BYTES` | `65536` | Limite positivo do payload WebSocket, em bytes. |
| `LOG_LEVEL` | `info` | Nivel do servidor: `debug`, `info`, `warn` ou `error`. |

O arquivo raiz `.env.example` e usado pelo Compose. Em execucao nativa, exporte as variaveis desejadas no shell; o servidor nao carrega arquivos `.env` automaticamente. O arquivo `client/.env.example` contem somente `PUBLIC_SERVER_URL` para desenvolvimento do cliente.

## Desenvolvimento nativo

Em dois terminais:

```sh
# terminal 1
go run ./cmd/server
```

Execute-o no diretorio `server/`. No outro terminal, no diretorio `client/`:

```sh
pnpm install --frozen-lockfile
PUBLIC_SERVER_URL=http://localhost:8080 pnpm dev -- --host 0.0.0.0 --port 5173
```

Abra `http://localhost:5173`, informe um nome e use **Create room**. Copie o convite exibido para outro navegador ou perfil. Para outra origem ou porta, ajuste `PUBLIC_SERVER_URL` no cliente e inclua a origem exata em `ALLOWED_ORIGINS` no servidor.

## Desenvolvimento com Compose

Na raiz, opcionalmente crie a configuracao local e ajuste seus valores:

```sh
cp .env.example .env
docker compose up --build
```

O Compose publica cliente em `CLIENT_PORT` e servidor em `SERVER_PORT`, monta os fontes e mantem volumes separados para dependencias e caches. O cliente aguarda o healthcheck do servidor. Pare o ambiente com `docker compose down`.

## Endpoints

| Metodo e caminho | Resultado |
| --- | --- |
| `POST /api/rooms` | Cria uma sala; responde `201` com `roomId`, `websocketPath` e `expiresInSeconds`. |
| `GET /healthz` | Responde `200` com `{"status":"ok"}` quando o servidor esta pronto. |
| `GET /ws/{roomId}` | Faz upgrade WebSocket para uma sala existente e origem permitida; responde `404` para sala inexistente e `403` para origem bloqueada. |

O healthcheck do Compose consulta `http://localhost:$PORT/healthz`. A imagem de producao do servidor tambem consulta `/healthz` internamente na porta 8080.

## Verificacao

No diretorio `server/`:

```sh
go test ./...
go vet ./...
```

No diretorio `client/`:

```sh
pnpm check
pnpm format:check
pnpm test:unit
pnpm test:e2e
```

Os E2E configuram TTL de tres segundos e iniciam cliente e servidor em `127.0.0.1:5173` e `127.0.0.1:8080`; nao reutilize essas portas com processos incompatíveis durante a execucao.

## Imagens de producao

As imagens sao construidas independentemente na raiz do repositorio:

```sh
docker build -t peercast-server ./server
docker build -t peercast-client ./client
```

A imagem do servidor executa como usuario sem privilegios, expoe 8080 e inclui healthcheck. A do cliente usa Nginx sem privilegios, expoe 8080, atende `/healthz` e aplica fallback de SPA para `index.html`. Para executa-las localmente sem conflito de porta:

```sh
docker run --rm -p 8080:8080 -e ALLOWED_ORIGINS=http://localhost:8081 peercast-server
docker run --rm -p 8081:8080 peercast-client
```

`PUBLIC_SERVER_URL` e incorporada pelo Vite durante a compilacao. O Dockerfile atual do cliente nao recebe argumento de build para ela e exclui arquivos `.env` do contexto; portanto, a imagem produzida pelo comando acima usa o fallback `http://localhost:8080`. Para um endereco publico diferente, a imagem do cliente ainda precisa de um mecanismo de configuracao de build antes do deploy.

## Deploy, seguranca e privacidade

Sirva o cliente por HTTPS e configure `PUBLIC_SERVER_URL` para a URL HTTPS publica do servidor antes da compilacao do cliente; o navegador usara WSS automaticamente. Configure `ALLOWED_ORIGINS` com as origens HTTPS exatas do cliente, inclusive portas quando existirem. O proxy do servidor deve preservar o upgrade WebSocket em `/ws/` e publicar `POST /api/rooms` e `GET /healthz`.

Use HTTPS em producao para que o navegador permita captura de midia fora de `localhost`. Restrinja origens, mantenha o servidor atras de um proxy com TLS e nao registre SDP, candidatos ICE completos ou texto de chat. Links de convite concedem entrada na sala a quem os possuir; compartilhe-os apenas com participantes autorizados. Midia e chat sao efemeros, mas a transmissao direta revela enderecos de rede aos pares conforme o comportamento do WebRTC e do navegador.

## Troubleshooting e limitacoes

- `403` no WebSocket ou na API: confira se a origem completa do frontend esta em `ALLOWED_ORIGINS`.
- `404` em `/ws/{roomId}`: a sala nao existe ou expirou; crie outra sala.
- Sem camera, microfone ou tela: confirme permissao do navegador, HTTPS (exceto `localhost`) e se outro aplicativo nao esta usando o dispositivo.
- Falha para conectar pares em redes restritivas: a aplicacao nao configura servidor de retransmissao. Pode ser necessario adicionar TURN no futuro.
- A topologia mesh aumenta conexoes e consumo de banda/CPU a cada participante; nao e adequada para grupos grandes.
- Salas, participantes e chat vivem somente em memoria. Reiniciar o servidor encerra esse estado; nao ha banco de dados nem historico compartilhado.
- O TTL padrao e cinco minutos desde a criacao de uma sala sem conexoes ou desde a saida do ultimo participante. Reconectar antes disso preserva a sala.
