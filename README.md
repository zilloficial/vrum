# vrum

Plataforma para encontrar profissionais automotivos, solicitar atendimento e acompanhar a chegada em tempo real. Lançamento em Sorriso–MT.

O sistema tem três partes, num único repositório:

| Parte | Pasta | O que é |
|---|---|---|
| **API** | `apps/api` | Servidor Node + TypeScript (Fastify, Socket.IO, PostgreSQL via Drizzle). Toda a regra de negócio. |
| **App** | `apps/app` | Aplicativo do motorista e do profissional (React + Capacitor), com projetos Android e iOS. Também roda no navegador. |
| **Painel** | `apps/painel` | Painel web da empresa (equipe, chamados, avaliações) e da administração. |
| Compartilhado | `packages/shared` | Máquina de estados do chamado, contrato do tempo real, cores e catálogo — usado pelos três. |

## Aplicativo no Lovable

A configuração Vite da raiz abre o aplicativo existente de `apps/app`, preservando React, as rotas, os estilos e os projetos Android/iOS. Não há uma segunda versão das telas.

- `npm run dev`: inicia o aplicativo na porta 8080, acessível pela prévia.
- `npm run build`: mantém os builds do app e do painel e também gera `dist` na raiz para publicação.
- `npm run build:dev`: gera o aplicativo em `dist` no modo development.
- `npm run preview`: abre o build da raiz na porta 8080.
- `npm run dev:api`: mantém o comando de desenvolvimento da API separado.

### Conexão com os serviços existentes

Defina `VITE_API_URL` com o endereço HTTPS público da API VRUM nas variáveis do projeto. A API deve permitir a origem da prévia e do endereço publicado em sua configuração de CORS. Sem essa variável, o cliente existente usa `http://localhost:3333`, que não aponta para a API publicada.

A execução pela raiz lê os arquivos `.env` da raiz e as variáveis fornecidas pela plataforma. Os comandos específicos de `apps/app` continuam usando a configuração original dessa pasta. `VITE_MAPA_ESTILO` permanece opcional, com `vrum-escuro` como padrão. Nunca coloque senhas do banco ou chaves privadas em variáveis `VITE_`, pois elas ficam públicas no navegador.

Esta adaptação publica o frontend; não executa a API Fastify nem o Socket.IO dentro do site estático. O painel continua sendo uma aplicação separada, com build em `apps/painel/dist`. O banco conectado é preservado, sem execução de migrações. A estrutura de banco informada para esta adaptação não inclui as tabelas de chamados e prestadores, portanto não foi usada para substituir os serviços existentes.

## Como rodar (desenvolvimento)

Requisitos: Node 20+ e Docker (ou um PostgreSQL 14+).

```bash
npm install
npm run db:up                                   # sobe o PostgreSQL (docker compose)
cp apps/api/.env.example apps/api/.env          # ajuste se precisar
cp apps/app/.env.example apps/app/.env
cp apps/painel/.env.example apps/painel/.env
set -a; . apps/api/.env; set +a

npm run db:migrate                              # cria as tabelas
npm run db:seed                                 # Sorriso–MT, categorias e prazos padrão
npm run db:demo                                 # (opcional) contas e profissionais de exemplo

npm run dev:api                                 # API     → http://localhost:3333
npm run dev:app                                 # App     → http://localhost:5173
npm run dev:painel                              # Painel  → http://localhost:5174
```

### Contas de demonstração — só no seu computador (`npm run db:demo`, senha `vrum1234`)

| Conta | Uso |
|---|---|
| `ana@vrum.app` | Motorista com Hilux e Argo cadastrados |
| `ze@vrum.app` | Borracharia do Zé (autônomo, disponível, socorro 24h) |
| `oficina@vrum.app` | Dono do Auto Center Teles Pires (empresa) — use no painel |
| `joao@vrum.app` | Mecânico do Auto Center (disponível) |
| `admin@vrum.app` | Administrador — use no painel |

Para testar o fluxo completo, abra o app em duas janelas: uma como `ana@vrum.app` (peça ajuda) e outra como `ze@vrum.app` (em Perfil → área Profissional, aceite o convite).

### Celular (Android / iOS)

```bash
cd apps/app
# No .env, VITE_API_URL deve apontar para o IP da sua máquina na rede (ex.: http://192.168.0.10:3333)
npm run android     # build + sync + abre no Android Studio
npm run ios         # build + sync + abre no Xcode (macOS)
```

As permissões já estão configuradas: localização (inclusive em segundo plano durante o atendimento), câmera, microfone e notificações.

### Testes

```bash
createdb vrum_teste        # banco vazio só para testes — o schema é recriado a cada execução
DATABASE_URL_TESTE=postgresql://vrum:vrum@localhost:5432/vrum_teste npm test
npm run typecheck
```

São 44 testes: máquina de estados, tema escuro do mapa, fluxo completo do chamado contra PostgreSQL real (incluindo dois aceites simultâneos), tempo real via Socket.IO, todas as rotas de conteúdo, equipe e administração, e as integrações (Supabase, OpenRouteService e Web Push, com os serviços simulados).

## Publicar na internet (Render)

O arquivo `render.yaml` cria a API, o app e o painel. O banco de dados é o PostgreSQL do Supabase (crie antes — veja [SERVICOS.md](SERVICOS.md), item 0).

1. Crie uma conta em [render.com](https://render.com) (pode entrar com o GitHub).
2. **New → Blueprint**, escolha este repositório e clique em **Apply**.
3. Aguarde o primeiro deploy (uns 5–10 minutos). Os endereços ficam assim:
   - App: `https://vrum-app.onrender.com`
   - Painel: `https://vrum-painel.onrender.com`
   - API: `https://vrum-api.onrender.com`
   (se algum nome já estiver em uso, o Render acrescenta um sufixo — veja no painel dele.)

O sistema roda em **modo real**: não há contas de demonstração em produção (se existirem, são removidas a cada inicialização). O administrador geral é definido em `ADMIN_EMAILS` (hoje `zilglezio@gmail.com`): crie a conta com esse e-mail no app e entre no painel — ela recebe o acesso de administrador no primeiro login.

No plano gratuito, a API “dorme” após 15 minutos sem uso (o primeiro acesso demora cerca de 1 minuto). Para o lançamento, use um plano pago para a API.

## O que cada área faz

**Motorista (app):** cadastro e garagem com vários veículos · tela inicial com “Preciso de ajuda”, busca, serviços, profissionais disponíveis por perto e publicações · mapa com filtros · solicitação em 5 etapas (veículo, ocorrência, ponto no mapa com referência, descrição com fotos/vídeo/áudio e dados de guincho, escolher profissional ou buscar disponíveis) · acompanhamento do chamado com mapa ao vivo, linha do tempo, taxa de deslocamento para aceitar, chat · conclusão, avaliação e contestação · histórico, mensagens, notificações, salvos · perfis públicos com seguir, “Mensagem” e “Chamar profissional”.

**Profissional (app):** criar perfil (autônomo ou empresa) · disponível/indisponível com validade · convites com contagem regressiva, aceitar/recusar · propor valor, taxa de deslocamento ou “avaliação presencial” · estou a caminho, cheguei, iniciei, finalizei · navegação externa · vitrine de trabalhos · perfil do negócio (horários, raio, modalidade, veículos, plantão) · envio de documentos para verificação.

**Empresa (painel):** visão geral com indicadores · atendimentos em andamento com troca de responsável · ocupação da equipe · histórico centralizado · equipe (adicionar, função, quem atende, desativar) · avaliações com resposta pública.

**Administração (painel):** visão geral da operação · chamados com encerramento pelo suporte e acesso à localização com justificativa registrada · usuários (suspender) · prestadores (selo de verificação) · documentos · moderação (denúncias, contestações, avaliações) · catálogo (categorias, cidades, planos) · prazos e regras ajustáveis em tempo real · auditoria.

## Regras do documento garantidas no código

| Regra | Como está garantida |
|---|---|
| Só um prestador confirmado por chamado | Trava no chamado + índice único `convite_um_aceito_por_chamado`. Testado com aceites simultâneos. |
| Convite antigo não pode ser aceito | O aceite confere estado e prazo dentro da trava; ações enviam a `versao` vista e são recusadas se o chamado mudou. |
| Ocupação por profissional | `membro_um_chamado_por_vez`. A empresa recebe vários chamados, um por profissional. |
| Taxa de deslocamento aceita antes da saída | A máquina de estados bloqueia “Confirmar” com taxa pendente. |
| Ponto de atendimento separado da posição do motorista | Ponto fica no chamado; posições ficam à parte. |
| Nunca mostrar posição antiga como atual | Cada posição guarda o horário de captura; o app mostra “ao vivo”, “desatualizada” ou “sem sinal”, e o servidor recusa envios antigos ou fora de ordem. Parado, o app faz uma leitura nova a cada 20 s. |
| Localização só entre os envolvidos | Sala de rastreio só para motorista e profissional responsável. Gestores veem estado e chat, não a posição do motorista. |
| Encerrar compartilhamento ao concluir/cancelar/abandonar | Na própria transição; posições são apagadas. Um job fecha qualquer compartilhamento órfão. |
| Conclusão confirmada pelo motorista, com prazo e contestação | Confirma ou contesta; sem resposta, conclui por prazo; contestação posterior em até 7 dias. |
| “Disponível” com validade | Expira sozinho (8 h padrão); o app avisa para renovar. |
| Mapa público sem posição exata de profissional móvel | Posição aproximada (~1 km); oficina fixa aparece na base comercial. |
| Placa privada | Só aparece ao prestador depois da confirmação. |
| Acesso admin à localização justificado e registrado | Exige justificativa; fica na auditoria. |
| Push é só aviso | Toda notificação é gravada na central antes; avisos em tempo real só saem depois do commit. |
| Plano pago não gera nota nem selo | Selo só por análise de documentos; notas só de atendimentos concluídos. Destaques pagos aparecem como “Publicidade”. |

## Serviços externos

O passo a passo para criar cada conta e onde colar as chaves está em **[SERVICOS.md](SERVICOS.md)**. Cada integração liga sozinha quando a chave existe:

| Serviço | Situação |
|---|---|
| Arquivos — Supabase Storage | Integrado. Falta criar o projeto e colar as chaves. |
| Mapa — OpenFreeMap | Integrado, gratuito e sem chave. Tema escuro do VRUM; reserva da CARTO se cair. |
| Rotas e previsão de chegada — OpenRouteService | Integrado. Sem chave, mostra a distância em linha reta. |
| Notificações no navegador — web-push | Integrado e automático (sem conta). |
| Notificações no app nativo — Firebase/Apple | Próxima etapa. |
| Confirmação de contato e recuperação de senha | A definir. |
| Domínio próprio | Render → Settings → Custom Domains. |

## Estrutura

```
vrum/
├── packages/shared/src/      chamado.ts (máquina de estados) · geo.ts · tempo-real.ts · categorias.ts · tema.ts
├── apps/api/
│   ├── src/db/               schema.ts · migrar.ts · seed.ts · demo.ts
│   ├── drizzle/              migração SQL
│   ├── src/servicos/         chamados · localizacao · chat · prestadores · contas · conteudo · qualidade · equipe · admin · notificacoes
│   ├── src/http/             app.ts (núcleo) · rotas-extras.ts
│   ├── src/tempo-real/       socket.ts
│   └── test/                 integração com PostgreSQL real
├── apps/app/
│   ├── src/telas/            Entrada · motorista/ · prestador/ · Chamado · Mensagens · Perfil · PerfilPrestador
│   ├── android/  ios/        projetos nativos (Capacitor)
│   └── src/                  api · sessao · tempo-real · localizacao · mapa · componentes · publicacao
├── apps/painel/src/          base · empresa · admin · main
└── assets/marca/             logo e ícone aprovados
```
