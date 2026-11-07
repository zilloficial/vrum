# vrum

Plataforma para encontrar profissionais automotivos, solicitar atendimento e acompanhar a chegada em tempo real. Lançamento em Sorriso–MT.

Este repositório é o **início do código**: o núcleo do backend com o banco completo, a máquina de estados do chamado, o aceite sem duplicidade, o chat do atendimento e a localização em tempo real — tudo testado contra um PostgreSQL real.

## Estrutura

```
vrum/
├── packages/shared/        Código usado pela API e pelo app
│   └── src/
│       ├── chamado.ts      Máquina de estados do chamado (fonte única da verdade)
│       ├── geo.ts          Distância, posição aproximada e frescor da posição
│       ├── tempo-real.ts   Contrato tipado dos eventos Socket.IO
│       ├── categorias.ts   Catálogo inicial de serviços
│       └── tema.ts         Cores e tokens da identidade visual
├── apps/api/               Servidor (Node + TypeScript)
│   ├── src/db/schema.ts    Modelo de dados completo (Drizzle ORM / PostgreSQL)
│   ├── drizzle/            Migração SQL gerada
│   ├── src/servicos/       Regras de negócio
│   │   ├── chamados.ts     Criação, busca em etapas, convites, aceite, ações, prazos
│   │   ├── localizacao.ts  Rastreamento autorizado, pausa, frescor, acesso admin
│   │   ├── chat.ts         Mensagens, propostas e condições acordadas
│   │   ├── prestadores.ts  Disponibilidade com validade e mapa público
│   │   ├── contas.ts       Cadastro, entrada e garagem
│   │   └── notificacoes.ts Central de notificações
│   ├── src/http/app.ts     Rotas HTTP (Fastify + Zod + JWT)
│   ├── src/tempo-real/     Socket.IO (salas por usuário, chamado e rastreio)
│   └── test/               Testes de integração do fluxo completo
└── assets/marca/           Logo e ícone aprovados
```

## Como rodar

Requisitos: Node 20+ e Docker (ou um PostgreSQL 14+).

```bash
npm install
npm run db:up                         # sobe o PostgreSQL
cp apps/api/.env.example apps/api/.env
export $(cat apps/api/.env | xargs)
npm run db:migrate                    # cria as tabelas
npm run db:seed                       # Sorriso–MT, categorias e prazos padrão
npm run dev                           # API em http://localhost:3333
```

Testes (precisam de um banco vazio para testes; o schema é recriado a cada execução):

```bash
createdb vrum_teste
DATABASE_URL_TESTE=postgresql://vrum:vrum@localhost:5432/vrum_teste npm test
```

## Decisões que protegem as regras do documento

| Regra do documento | Como está garantida |
|---|---|
| Somente um prestador confirmado por chamado | Trava `FOR UPDATE` no chamado + índice único parcial `convite_um_aceito_por_chamado`. Testado com dois aceites simultâneos. |
| Convite antigo não pode ser aceito por notificação atrasada | O aceite confere estado e prazo do convite dentro da trava; ações do app podem enviar a `versao` vista e são recusadas se o chamado mudou. |
| Cada profissional com seu controle de ocupação | `membros_prestador.chamado_atual_id` único (`membro_um_chamado_por_vez`). Empresa recebe vários chamados, um por profissional. |
| Taxa de deslocamento aceita antes da saída | A máquina de estados bloqueia `CONFIRMAR` enquanto houver taxa proposta e não respondida. |
| Ponto de atendimento separado da posição do motorista | Ponto fica no chamado; posições ficam em `posicoes_atuais`. |
| Não mostrar posição antiga como atual | Toda posição guarda o horário de captura; a API devolve `ATUAL`, `DESATUALIZADA` ou `PERDIDA`, recusa envios antigos e fora de ordem. |
| Localização só entre os envolvidos | Sala `rastreio:<id>` só para motorista e profissional responsável; gestores da empresa veem estado e chat, não as posições do motorista. |
| Encerrar compartilhamento ao concluir/cancelar/abandonar | Feito na própria transição; posições são apagadas. Um job ainda fecha qualquer compartilhamento órfão. |
| Conclusão confirmada pelo motorista, com prazo e contestação | `CONCLUSAO_SOLICITADA` → motorista confirma ou contesta; sem resposta, conclui por prazo. |
| “Disponível” com validade | `disponivel_ate`; o job desliga quem não renovou. |
| Mapa público sem posição exata de profissional móvel | Atendimento móvel aparece com posição aproximada (~1 km); oficina fixa, na base comercial. |
| Placa privada | Só aparece ao prestador depois da confirmação do atendimento. |
| Acesso admin à localização justificado e registrado | `acessos_admin_localizacao`; exige justificativa. |
| Push é só aviso | Toda notificação é gravada na central antes; avisos em tempo real só saem depois do commit. |
| Um chamado ativo por motorista | Índice único parcial `chamado_um_ativo_por_motorista`. |

Os prazos ficam em `REGRAS_PADRAO` (`src/nucleo.ts`) e são semeados na tabela `configuracoes` para o painel administrativo: convite 90 s; busca em 4 etapas (3, 8, 15 e 30 km, até 5 prestadores por etapa); conclusão automática em 60 min; abandono em 6 h; disponibilidade por 8 h.

## Máquina de estados do chamado

```
BUSCANDO_PROFISSIONAL ──CONVITE_ENVIADO──▶ AGUARDANDO_RESPOSTA ──ACEITAR──▶ ACEITO_COMBINANDO ──CONFIRMAR──▶ CONFIRMADO
        ▲                                   │  CONVITES_SEM_RESPOSTA (próxima etapa)       │ DESISTIR (volta a buscar)     │ SAIR_A_CAMINHO
        │                                   ▼  BUSCA_ESGOTADA                              ▼                               ▼
        └──────REABRIR_BUSCA────────── SEM_ATENDIMENTO                              CONCLUIDO ◀──CONFIRMAR_CONCLUSAO──  A_CAMINHO ─CHEGAR▶ NO_LOCAL ─INICIAR_SERVICO▶ EM_ATENDIMENTO
                                                                                         ▲    ◀──CONCLUIR_POR_PRAZO──        │
                                                                                         └──── CONCLUSAO_SOLICITADA ◀─SOLICITAR_CONCLUSAO─┘ (CONTESTAR_CONCLUSAO volta para EM_ATENDIMENTO)

CANCELAR: motorista a qualquer momento; prestador depois de vinculado; ENCERRAR_ABANDONADO pelo sistema.
```

O app deve usar `eventosDisponiveis(estado, { ator })` de `@vrum/shared` para decidir quais botões mostrar — assim tela e servidor nunca discordam.

## Principais rotas

| Método | Rota | Uso |
|---|---|---|
| POST | `/auth/cadastro`, `/auth/entrar` | Conta e token |
| GET/POST | `/me/veiculos` | Garagem |
| GET | `/categorias`, `/prestadores/proximos` | Catálogo e mapa |
| POST | `/prestadores`, `/prestadores/:id/disponibilidade` | Área do prestador |
| POST | `/chamados` | Solicitar atendimento |
| POST | `/chamados/:id/acoes` | `{ evento, versao?, motivo? }` — confirmar, sair, chegar, concluir, cancelar… |
| GET | `/prestador/convites` · POST `/convites/:id/aceitar` · `/recusar` | Convites |
| POST | `/chamados/:id/propostas` · `/propostas/:id/responder` | Valor, taxa ou avaliação presencial |
| GET/POST | `/conversas/:id/mensagens` | Chat |
| GET | `/chamados/:id/localizacao` | Posições com frescor |
| POST | `/admin/chamados/:id/localizacao` | Acesso de suporte com justificativa |

Socket.IO (autenticação por `auth.token`): `chamado:entrar`, `localizacao:enviar`, `localizacao:pausar`/`retomar`; o servidor emite `chamado:estado`, `localizacao:posicao`, `chat:mensagem`, `convite:novo`, `convite:encerrado`, `notificacao:nova`.

## Próximos passos

1. **App móvel (Capacitor)** consumindo `@vrum/shared` — telas do motorista, chamado e mapa; plugin de localização em segundo plano enviando `localizacao:enviar`.
2. **Provedores externos**: mapas, rotas/ETA e fonte de estabelecimentos (resultados externos ainda não entram na API).
3. **Push real**: FCM/APNs e Web Push a partir da tabela `dispositivos` (hoje só a central e o aviso por socket).
4. **Armazenamento de arquivos** para fotos, áudios e documentos (as rotas já recebem URLs).
5. **Publicações, avaliações, denúncias e painel admin**: tabelas prontas, rotas a construir.
6. **Escala**: adaptador Redis do Socket.IO para várias instâncias; PostGIS se a busca por proximidade crescer.
