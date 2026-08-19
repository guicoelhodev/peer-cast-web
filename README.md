# PeerCast Web

Aplicacao web de chamadas em grupo com video, audio, compartilhamento de tela e chat efemero.

- A midia trafega diretamente entre navegadores por WebRTC em topologia mesh.
- O servidor Go cria salas, controla seu ciclo de vida e encaminha sinalizacao WebSocket e chat.
- Salas e mensagens nao sao persistidas.

Consulte o [guia operacional](docs/operacao.md) para requisitos, configuracao, desenvolvimento, imagens e operacao.
