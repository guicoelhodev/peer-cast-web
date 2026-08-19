# Plano de migracao do PeerCast para Web

## 1. Objetivo

Migrar as funcionalidades do projeto legado `../peerCast` para uma arquitetura web composta por dois projetos independentes:

- `client/`: aplicacao SvelteKit/Svelte 5 responsavel pela interface, captura de midia e conexoes WebRTC.
- `server/`: servidor Go responsavel pela criacao e ciclo de vida das salas e pela sinalizacao via WebSocket.
- `docker-compose.yml`: ambiente local de desenvolvimento, subindo client e server separadamente.

Tauri, Rust e Tailscale nao fazem parte da nova arquitetura. A midia continua trafegando diretamente entre navegadores via WebRTC; o servidor Go transporta apenas sinalizacao e chat.

## 2. Decisoes confirmadas

- A aplicacao sera web, sem shell desktop.
- O servidor Go sera central e suportara varias salas simultaneas.
- Cada sala sera gerenciada por um hub/goroutine com channels de registro, remocao e broadcast.
- Ao criar uma sala, o usuario entrara imediatamente como host na mesma tela.
- Salas e mensagens serao efemeras, sem banco de dados.
- Quando uma sala ficar vazia, sua exclusao sera agendada para 5 minutos depois.
- Se alguem reconectar durante esse periodo, a exclusao sera cancelada.
- O `docker-compose.yml` sera voltado ao desenvolvimento local.
- `client/` e `server/` terao Dockerfiles proprios para builds de producao.
- O protocolo WebSocket atual sera preservado sempre que possivel para reduzir riscos na migracao do WebRTC.

## 3. Arquitetura alvo

```text
Browser A                         Browser B
  Svelte                           Svelte
  MediaDevices                     MediaDevices
  RTCPeerConnection <-----------> RTCPeerConnection
          |                              |
          +------- WebSocket ------------+
                         |
                    Go server
                  Room manager
                         |
             Room hub / broadcast channels
```

### Responsabilidades do client

- Criar salas pela API HTTP.
- Gerar e compartilhar links de convite.
- Identificar o host e os participantes.
- Abrir e reconectar o WebSocket da sala.
- Executar a negociacao WebRTC.
- Capturar camera, microfone, tela e audio de compartilhamento.
- Controlar qualidade, mute, volume, foco e fullscreen.
- Exibir participantes, estados de conexao e indicadores de fala.
- Enviar e receber chat efemero.
- Encerrar recursos locais ao sair ou desmontar a pagina.

### Responsabilidades do server

- Criar IDs de sala imprevisiveis.
- Manter um registro concorrente de salas.
- Fazer upgrade HTTP para WebSocket somente em salas existentes.
- Registrar e remover conexoes em cada sala.
- Repassar mensagens aos demais clientes da sala.
- Validar tamanho, formato e identidade das mensagens.
- Emitir `participant-left` quando uma conexao identificada sair.
- Iniciar o timer de 5 minutos quando a sala ficar vazia.
- Cancelar o timer quando a sala voltar a receber participantes.
- Remover a sala de forma segura quando o timer vencer e ela continuar vazia.
- Expor healthcheck para Docker e operacao.

## 4. Estrutura prevista

```text
peerCastWeb/
  client/
    src/
      lib/
        components/
        signaling/
        webrtc/
        types/
      routes/
        +layout.ts
        +page.svelte
      app.css
    static/
    e2e/
    Dockerfile
    nginx.conf
    package.json
    pnpm-lock.yaml
    svelte.config.js
    tsconfig.json
    vite.config.ts
  server/
    cmd/server/main.go
    internal/config/config.go
    internal/httpapi/router.go
    internal/room/hub.go
    internal/room/manager.go
    internal/room/message.go
    internal/room/client.go
    Dockerfile
    go.mod
    go.sum
  docker-compose.yml
  .env.example
  plan.md
```

A estrutura pode ser reduzida durante a implementacao quando um pacote ou componente nao justificar um arquivo proprio. O objetivo e separar dominios, nao criar abstracoes sem uso.

## 5. Contratos HTTP e WebSocket

### `POST /api/rooms`

Cria uma sala vazia e inicia sua janela inicial de expiracao.

Resposta sugerida:

```json
{
  "roomId": "uuid-sem-hifens",
  "websocketPath": "/ws/uuid-sem-hifens",
  "expiresInSeconds": 300
}
```

O client monta a URL WebSocket usando `PUBLIC_SERVER_URL`. O backend nao precisa conhecer a URL publica do frontend.

### `GET /healthz`

Retorna `200 OK` quando o processo estiver pronto para receber requisicoes.

Resposta sugerida:

```json
{
  "status": "ok"
}
```

### `GET /ws/{roomId}`

- Retorna `404` se a sala nao existir.
- Valida `Origin` conforme configuracao do ambiente.
- Faz upgrade para WebSocket em uma sala valida.
- Cancela a expiracao pendente ao registrar a conexao.
- Agenda expiracao ao remover a ultima conexao.

### Protocolo de sinalizacao

O client e o server devem compartilhar semanticamente estes eventos:

```ts
type SignalMessage =
  | {
      type: "ready";
      peerId: string;
      displayName?: string;
      microphoneMuted?: boolean;
    }
  | { type: "participant-left"; peerId: string }
  | {
      type: "offer" | "answer";
      peerId: string;
      targetPeerId: string;
      isHost?: boolean;
      displayName?: string;
      microphoneMuted?: boolean;
      videoState?: "camera" | "screen" | "off";
      description: RTCSessionDescriptionInit;
    }
  | {
      type: "ice";
      peerId: string;
      targetPeerId: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: "microphone-state";
      peerId: string;
      microphoneMuted: boolean;
    }
  | {
      type: "video-state";
      peerId: string;
      videoState: "camera" | "screen" | "off";
    }
  | {
      type: "chat";
      peerId: string;
      messageId: string;
      text: string;
      sentAt: string;
    };
```

O evento legado `audio-kind` e o data channel sem uso devem ser confirmados durante a migracao e removidos se continuarem sem consumidores funcionais.

### Limites iniciais

- Nome de exibicao: 50 caracteres.
- Chat: 500 caracteres por mensagem.
- Historico no navegador: ultimas 200 mensagens.
- Payload WebSocket: limite explicito, inicialmente 64 KiB.
- IDs de sala, peer e mensagem: UUIDs.
- Uma conexao nao pode enviar mensagens com um `peerId` diferente daquele registrado no seu primeiro evento `ready`.
- Mensagens direcionadas continuam sendo transmitidas para a sala e filtradas por `targetPeerId` no client durante a primeira migracao.

## 6. Ciclo de vida das salas

1. O client chama `POST /api/rooms`.
2. O manager cria a sala e agenda expiracao para 5 minutos, pois ainda nao ha conexoes.
3. O client navega para o estado de chamada como host e abre `/ws/{roomId}`.
4. O hub registra a conexao e cancela a expiracao pendente.
5. Participantes entram pelo link compartilhado e sao registrados no mesmo hub.
6. Cada fechamento normal, fechamento abrupto ou perda de rede encerra o WebSocket e remove a conexao.
7. Quando a ultima conexao sai, o manager agenda nova expiracao para 5 minutos.
8. Uma reconexao antes do vencimento cancela a expiracao.
9. Ao vencer, o manager confirma que a mesma sala continua vazia antes de remove-la do mapa.

O server nao deve depender de `beforeunload` ou de um evento customizado do navegador para detectar saidas. O fechamento do WebSocket e o mecanismo autoritativo, pois tambem cobre falhas de rede e encerramentos abruptos.

## 7. Plano do server Go

### Bootstrap

- Criar modulo Go e entrypoint em `cmd/server`.
- Ler configuracao por variaveis de ambiente.
- Usar `net/http` e uma biblioteca WebSocket mantida.
- Implementar encerramento gracioso com `context` e sinais do sistema.
- Configurar timeouts HTTP sem limitar a duracao das conexoes WebSocket.

### Configuracao proposta

- `PORT`: porta HTTP, padrao `8080`.
- `ALLOWED_ORIGINS`: origens do frontend separadas por virgula.
- `ROOM_EMPTY_TTL`: duracao para remover salas vazias, padrao `5m`.
- `MAX_WS_MESSAGE_BYTES`: limite de payload, padrao `65536`.
- `LOG_LEVEL`: nivel de log.

### Room manager

- Proteger o mapa de salas com mutex.
- Criar, consultar e remover salas.
- Garantir que callbacks de timers antigos nao removam uma sala recriada ou ocupada.
- Expor contagem de salas apenas para logs/metricas internas inicialmente.
- Nao manter referencias de hubs removidos no manager.

### Hub por sala

- Manter channels de `register`, `unregister` e `broadcast`.
- Manter os clientes conectados somente dentro da goroutine do hub.
- Evitar escritas WebSocket concorrentes com uma fila de envio por cliente.
- Remover clientes lentos quando a fila atingir o limite.
- Fechar todas as goroutines e channels quando a sala for definitivamente removida.

### Cliente WebSocket

- Uma goroutine de leitura valida e envia mensagens ao hub.
- Uma goroutine de escrita consome a fila do cliente.
- Ping/pong e deadlines detectam conexoes abandonadas.
- O primeiro `ready` associa a conexao ao `peerId`.
- Duplicidade de `peerId` deve substituir ou rejeitar a conexao anterior de forma deterministica.
- A desconexao emite `participant-left` somente se o cliente chegou a se identificar.

### Validacao

- Decodificar um envelope minimo antes de transmitir.
- Rejeitar JSON invalido, tipos desconhecidos e payloads acima do limite.
- Validar campos obrigatorios por tipo.
- Validar tamanho de nome e chat por quantidade de caracteres, nao bytes.
- Validar timestamps do chat e IDs nao vazios.
- Impedir spoofing de `peerId` depois da identificacao da conexao.
- Registrar erros operacionais sem registrar SDP, ICE completo ou texto de chat.

## 8. Plano do client Svelte

### Bootstrap

- Criar SvelteKit 2 com Svelte 5, TypeScript estrito e pnpm.
- Manter SPA estatica com `adapter-static` e `ssr = false`.
- Manter Tailwind CSS 4 e o visual atual como ponto de partida.
- Remover dependencias e deteccao de Tauri.
- Configurar `PUBLIC_SERVER_URL` para API e WebSocket.

### Fluxos de pagina

- Sem `room` na URL: exibir criacao de sala e opcao de entrar por link.
- Ao criar: solicitar nome, chamar API, atualizar a URL e entrar imediatamente como host.
- Com `room` na URL: solicitar nome e entrar como participante.
- Identificar papel do host na URL ou no estado criado localmente sem expor poderes administrativos inexistentes.
- Exibir link de convite baseado na origem atual do frontend e no `roomId`.
- Ao sair: fechar conexoes e voltar ao estado inicial sem tentar apagar a sala via API.

Formato de link sugerido:

```text
http://localhost:5173/?room=ROOM_ID
```

O host nao precisa compartilhar a URL bruta do WebSocket. O client deriva `ws://` ou `wss://` de `PUBLIC_SERVER_URL`.

### Estado e modulos

Separar apenas as areas que possuem ciclo de vida proprio:

- Cliente HTTP de salas.
- Parser e serializador do protocolo.
- Sessao de sinalizacao/reconexao.
- Gerenciamento de peers WebRTC.
- Captura e controle de midia.
- Componentes de video, chat e controles.

Evitar copiar as 2.454 linhas do `+page.svelte` legado para um unico arquivo. A pagina deve coordenar os modulos, enquanto recursos com cleanup proprio devem encapsular seus listeners, tracks, timers e conexoes.

### WebRTC

- Preservar a topologia mesh atual nesta migracao.
- Criar um `RTCPeerConnection` por participante remoto.
- Preservar `offer`, `answer`, ICE e renegociacao ao alterar tracks.
- Preservar camera, microfone, mute e compartilhamento de tela.
- Preservar audio da aba/tela quando fornecido pelo navegador.
- Preservar presets de 720p30, 1080p30, 1080p60, 1440p60 e 4K30.
- Preservar bitrate e framerate via `RTCRtpSender.setParameters` quando suportado.
- Manter fallback visual com avatar quando nao houver video.
- Encerrar todos os tracks e peers ao sair ou desmontar.

### Reconnect

- Manter backoff exponencial entre 1 e 10 segundos.
- Manter tracks locais ativos durante uma queda temporaria.
- Reenviar `ready` e reconstruir peers apos reconectar.
- Cancelar retries quando o usuario clicar em sair.
- Tratar `404`/sala expirada como encerramento definitivo, sem loop infinito.

### Interface

- Preservar responsividade desktop e mobile.
- Preservar sidebar, estados de conexao, grid 1/2/4/9 e tile focado.
- Preservar fullscreen, volume individual e indicadores de fala.
- Preservar chat, contador de nao lidas e limite de 200 mensagens locais.
- Substituir o painel Tauri/Tailscale por criacao da sala e compartilhamento do convite.
- Exibir erros de permissao de camera, microfone e tela de forma acionavel.

## 9. Docker e ambientes

### Desenvolvimento com Compose

O `docker-compose.yml` deve subir:

- `client`: Node/pnpm executando Vite em `0.0.0.0:5173`, com source mount e volume separado para dependencias.
- `server`: Go executando o entrypoint em `0.0.0.0:8080`, com source mount e cache separado para modulos/build.
- Rede interna compartilhada.
- Variaveis locais apontando o browser para `http://localhost:8080`.
- Healthcheck no server.
- Dependencia do client no healthcheck do server quando suportado pelo Compose.

Embora os containers se comuniquem pelo nome `server`, o valor usado pelo JavaScript no navegador deve ser `localhost:8080`, porque quem abre o WebSocket e o browser do usuario.

### Dockerfile de producao do client

- Build multi-stage com Node e pnpm.
- Instalar dependencias com lockfile congelado.
- Gerar build estatico.
- Servir os arquivos com Nginx sem privilegios quando possivel.
- Configurar fallback SPA para `index.html`.
- Adicionar headers basicos e cache longo apenas para assets versionados.

### Dockerfile de producao do server

- Build multi-stage.
- Executar testes/compilacao em imagem Go.
- Gerar binario estatico sem informacoes desnecessarias de debug.
- Rodar em imagem minima e como usuario sem privilegios.
- Expor apenas a porta HTTP.
- Incluir certificados CA para cenarios futuros que precisem de saidas TLS.

## 10. Testes e verificacao

### Server

- Testes unitarios do manager para criacao, consulta e remocao.
- Teste de expiracao de sala nunca ocupada.
- Teste de expiracao depois da ultima desconexao.
- Teste de cancelamento da expiracao em reconexao.
- Teste contra callback antigo removendo sala ativa.
- Testes do hub para broadcast sem eco ao remetente.
- Testes de `participant-left`.
- Testes de validacao, spoofing e limites de payload.
- Testes HTTP de criacao, healthcheck, CORS e sala inexistente.
- Executar `go test ./...` e `go vet ./...`.

### Client

- Typecheck com `pnpm check`.
- Format check com Prettier.
- Testes unitarios do protocolo e construcao de URLs.
- Migrar os E2E existentes de mesh, camera, chat e responsividade.
- Adicionar E2E de criacao de sala pela interface.
- Adicionar E2E de entrada imediata do host.
- Adicionar E2E de convite para participantes.
- Adicionar E2E de reconexao dentro da tolerancia de 5 minutos.
- Adicionar E2E de sala expirada.

### Docker

- Validar sintaxe do Compose.
- Validar healthcheck do server.
- Validar acesso ao client pelo host.
- Validar API e WebSocket a partir do navegador.
- Validar builds de producao dos dois Dockerfiles.

## 11. Criterios de aceite gerais

- `docker compose up` inicia os dois projetos em modo de desenvolvimento.
- Um usuario cria uma sala pelo frontend e entra automaticamente como host.
- O link compartilhado permite que outros navegadores entrem na mesma sala.
- Host e participantes trocam audio e video via WebRTC.
- Qualquer participante pode ativar camera, microfone e compartilhamento de tela conforme permissoes do navegador.
- Chat, estados de mute/video e saida de participantes sao propagados corretamente.
- Uma queda curta permite reconexao sem perder a sala.
- Uma sala vazia e removida apos 5 minutos.
- Multiplas salas funcionam sem vazamento de mensagens entre elas.
- Client e server possuem Dockerfiles de producao independentes.
- Typecheck, testes Go e E2E definidos passam.

## 12. Ordem recomendada

1. Definir contratos e bootstrap do server.
2. Implementar manager, hub e ciclo de vida das salas.
3. Implementar API e WebSocket com testes.
4. Criar bootstrap do client e migrar protocolo.
5. Implementar criacao/entrada de sala e sinalizacao.
6. Migrar WebRTC e controles de midia.
7. Migrar interface, chat e responsividade.
8. Integrar Docker Compose.
9. Criar Dockerfiles de producao.
10. Migrar e ampliar testes E2E.

## 13. Tarefas isoladas para sub-agents

As tarefas abaixo possuem escopo de arquivos delimitado para reduzir conflitos. Um sub-agent deve alterar somente os caminhos indicados, salvo ajuste previamente combinado. Tarefas marcadas com dependencia devem iniciar somente depois da entrega correspondente.

### T01 - Bootstrap do server Go

**Escopo:** `server/go.mod`, `server/go.sum`, `server/cmd/server/main.go`, `server/internal/config/config.go`.

**Entrega:** modulo Go, carregamento de configuracao, servidor HTTP base, shutdown gracioso e entrypoint compilavel.

**Dependencias:** nenhuma.

**Aceite:** `go test ./...` compila o projeto; configuracoes invalidas falham com mensagem clara.

### T02 - Manager e ciclo de vida de salas

**Escopo:** `server/internal/room/manager.go`, `server/internal/room/manager_test.go`.

**Entrega:** criacao e consulta concorrente de salas, timer vazio de 5 minutos configuravel, cancelamento em reconexao e remocao segura.

**Dependencias:** T01 para tipos de configuracao, ou uso temporario de duracao injetada diretamente.

**Aceite:** testes cobrem expiracao inicial, ultima saida, reconexao e timer obsoleto.

### T03 - Hub concorrente por sala

**Escopo:** `server/internal/room/hub.go`, `server/internal/room/hub_test.go`.

**Entrega:** event loop com channels de registro, remocao e broadcast, contagem de clientes e sinalizacao de sala vazia/ocupada.

**Dependencias:** nenhuma; alinhar interfaces com T02 antes do merge.

**Aceite:** testes sem corrida demonstram isolamento, broadcast sem eco e remocao de clientes lentos.

### T04 - Protocolo e validacao no server

**Escopo:** `server/internal/room/message.go`, `server/internal/room/message_test.go`.

**Entrega:** tipos/envelopes JSON, validacao por evento, limites de nome/chat/payload e validacao de identidade.

**Dependencias:** nenhuma.

**Aceite:** tabela de testes cobre todos os tipos validos e casos invalidos relevantes.

### T05 - Cliente WebSocket do server

**Escopo:** `server/internal/room/client.go`, `server/internal/room/client_test.go`.

**Entrega:** read/write pumps, fila de envio, ping/pong, deadlines, associacao do `peerId` e cleanup.

**Dependencias:** T03 e T04.

**Aceite:** nao existem escritas concorrentes; desconexao limpa goroutines e produz evento de saida quando aplicavel.

### T06 - API HTTP e roteamento do server

**Escopo:** `server/internal/httpapi/router.go`, `server/internal/httpapi/router_test.go`.

**Entrega:** `POST /api/rooms`, `GET /healthz`, `GET /ws/{roomId}`, CORS e validacao de Origin.

**Dependencias:** T02, T03 e T05.

**Aceite:** testes HTTP cobrem respostas, sala inexistente, upgrade valido e origens permitidas/bloqueadas.

### T07 - Bootstrap do client Svelte

**Escopo:** manifests e configuracoes na raiz de `client/`, `client/src/routes/+layout.ts`, `client/src/app.css`, `client/static/`.

**Entrega:** SvelteKit 2/Svelte 5, TypeScript estrito, pnpm, Tailwind 4, adapter-static e SPA sem Tauri.

**Dependencias:** nenhuma.

**Aceite:** `pnpm check` passa com uma pagina minima e o build estatico fica configurado.

### T08 - Contrato e cliente HTTP do frontend

**Escopo:** `client/src/lib/types/`, `client/src/lib/signaling/`, `client/src/lib/api/`.

**Entrega:** tipos do protocolo, parser/serializer, construcao segura de URLs e chamada de criacao de sala.

**Dependencias:** contrato de T04 e T06 estabilizado; T07 para aliases TypeScript.

**Aceite:** testes unitarios cobrem mensagens, URL HTTP/WS e resposta da API.

### T09 - Sessao WebSocket e reconexao do frontend

**Escopo:** `client/src/lib/signaling/session.svelte.ts` e testes correspondentes.

**Entrega:** conexao, estados, envio/recebimento, backoff exponencial, cancelamento de retries e tratamento de sala expirada.

**Dependencias:** T08.

**Aceite:** testes com WebSocket mock cobrem connect, reconnect, leave e falha definitiva.

### T10 - Gerenciamento WebRTC

**Escopo:** `client/src/lib/webrtc/peers.svelte.ts`, `client/src/lib/webrtc/types.ts` e testes correspondentes.

**Entrega:** criacao e remocao de peers, offer/answer/ICE, renegociacao, remote tracks e cleanup.

**Dependencias:** T08; interface de eventos alinhada com T09.

**Aceite:** testes mockados cobrem negociacao dirigida, tracks e remocao de participante.

### T11 - Captura e controles de midia

**Escopo:** `client/src/lib/webrtc/media.svelte.ts`, `client/src/lib/webrtc/quality.ts` e testes correspondentes.

**Entrega:** camera, microfone, mute, tela, audio de tela, presets de qualidade, aplicacao de bitrate/FPS e cleanup.

**Dependencias:** T07; interface de tracks alinhada com T10.

**Aceite:** testes cobrem estados e encerramento de tracks; erros de permissao sao representados explicitamente.

### T12 - Componentes da chamada

**Escopo:** `client/src/lib/components/call/`.

**Entrega:** grid responsivo, video tile, avatar, speaking indicator, foco, fullscreen e volume remoto.

**Dependencias:** contratos de estado de T10 e T11.

**Aceite:** componentes nao acessam diretamente API ou WebSocket e funcionam em 320 px de largura.

### T13 - Componentes de chat

**Escopo:** `client/src/lib/components/chat/`.

**Entrega:** painel, lista, composer, contador de nao lidas, limite de caracteres e historico local de 200 mensagens.

**Dependencias:** tipos de T08.

**Aceite:** envio com Enter, quebra com Shift+Enter e estados desconectados funcionam.

### T14 - Fluxo de criacao e entrada da pagina

**Escopo:** `client/src/routes/+page.svelte`, `client/src/lib/components/lobby/`, `client/src/lib/components/layout/`.

**Entrega:** lobby, criacao de sala, entrada imediata como host, entrada por convite, sidebar, estados e integracao dos modulos.

**Dependencias:** T08, T09, T10, T11, T12 e T13.

**Aceite:** a pagina nao possui referencias a Tauri/Tailscale e cobre os fluxos host/participante sem duplicar logica dos modulos.

### T15 - Docker Compose de desenvolvimento

**Escopo:** `docker-compose.yml`, `.env.example`, arquivos de desenvolvimento Docker estritamente necessarios.

**Entrega:** client com Vite/hot reload, server Go com source mount, caches, portas, rede e healthcheck.

**Dependencias:** T01, T06 e T07.

**Aceite:** `docker compose config` e valido e os endpoints esperados ficam expostos em `5173` e `8080`.

### T16 - Dockerfile de producao do client

**Escopo:** `client/Dockerfile`, `client/nginx.conf`, `client/.dockerignore`.

**Entrega:** build multi-stage, imagem Nginx minima, fallback SPA e execucao sem privilegios quando suportado.

**Dependencias:** T07.

**Aceite:** a imagem e construida e serve `/` e rotas de fallback.

### T17 - Dockerfile de producao do server

**Escopo:** `server/Dockerfile`, `server/.dockerignore`.

**Entrega:** build multi-stage do binario Go e runtime minimo sem root.

**Dependencias:** T01 e T06.

**Aceite:** a imagem e construida, inicia com variaveis de ambiente e responde em `/healthz`.

### T18 - Testes E2E funcionais

**Escopo:** `client/e2e/signaling.spec.ts`, `client/playwright.config.ts` e helpers E2E.

**Entrega:** migracao dos cenarios de 1 host + 3 participantes, camera, chat, saida e reconexao usando o server Go.

**Dependencias:** T06 e T14.

**Aceite:** testes nao dependem de Cargo/Rust e iniciam o server Go de teste de forma deterministica.

### T19 - Testes E2E responsivos

**Escopo:** `client/e2e/responsive.spec.ts` e fixtures exclusivamente responsivas.

**Entrega:** cenarios mobile para lobby, sidebar, chamada, chat e ausencia de overflow horizontal.

**Dependencias:** T12, T13 e T14.

**Aceite:** cenarios passam em viewport de 320 px e em dispositivo mobile do Playwright.

### T20 - Documentacao operacional

**Escopo:** `README.md` e documentacao nova sob `docs/`, sem alterar codigo.

**Entrega:** requisitos, desenvolvimento local, variaveis, Compose, builds de producao, arquitetura WebRTC/WebSocket e limitacoes conhecidas.

**Dependencias:** T15, T16 e T17.

**Aceite:** nenhum passo menciona Tauri, Rust ou Tailscale; comandos correspondem aos manifests finais.

### T21 - Integracao e verificacao final

**Escopo:** somente correcoes pequenas necessarias entre modulos; nao realizar refatoracao ampla.

**Entrega:** resolver incompatibilidades de contratos, executar formatacao, typecheck, testes Go, E2E e validacao Docker.

**Dependencias:** T01 a T20.

**Aceite:** todos os criterios da secao 11 sao demonstrados e falhas residuais sao documentadas.

## 14. Paralelismo sugerido

Podem iniciar em paralelo:

- Grupo server base: T01, T02, T03 e T04.
- Grupo client base: T07.
- Infraestrutura de producao inicial: T16, depois que T07 estabilizar.
- Documentacao preliminar: T20 pode mapear a estrutura, mas deve finalizar depois da infraestrutura.

Depois dos contratos estabilizados:

- Server: T05 e depois T06.
- Client: T08; depois T09, T10 e T11 em paralelo.
- UI: T12 e T13 em paralelo; depois T14.
- Infraestrutura: T15 e T17.
- Qualidade: T18 e T19 em paralelo; por ultimo T21.

Sub-agents trabalhando em paralelo nao devem editar o mesmo manifesto ou arquivo agregador. Alteracoes de dependencia devem ser informadas ao agente responsavel pelo bootstrap correspondente para aplicacao coordenada.
