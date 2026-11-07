# Serviços externos do VRUM — como criar as contas e onde colar as chaves

Cada integração liga sozinha quando a chave é colocada no Render. Sem a chave, o VRUM continua funcionando com uma alternativa (indicada em cada item).

Onde colar: no painel do Render (dashboard.render.com), abra o serviço indicado → **Environment** → edite a variável → **Save, rebuild and deploy**.

| Serviço | Para quê | Variáveis | Onde no Render | Sem a chave |
|---|---|---|---|---|
| Supabase (banco) | Banco de dados PostgreSQL | `DATABASE_URL` | `vrum-api` | **Obrigatório** — a API não sobe sem banco |
| Supabase Storage | Guardar fotos, vídeos, áudios e documentos | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `vrum-api` | Arquivos vão para o disco do servidor e **somem quando ele reinicia** |
| OpenFreeMap | Mapa | — (sem chave) | — | Se não responder, usa o mapa da CARTO |
| OpenRouteService | Rota pelas ruas e previsão de chegada | `ORS_API_KEY` | `vrum-api` | Distância em linha reta, sem previsão |
| Web Push (biblioteca web-push) | Notificações no navegador | — (automático) | — | — |

---

## 0. Supabase — banco de dados (obrigatório)

O mesmo projeto do Supabase guarda o banco e os arquivos.

1. Crie a conta em **supabase.com** → **New project**.
   - Nome: `vrum`
   - **Database password:** clique em **Generate a password** e guarde num lugar seguro (gerenciador de senhas).
   - **Region:** **South America (São Paulo)** — o mais perto de Sorriso.
   - Plano: Free. Aguarde 1–2 minutos até o projeto ficar pronto.
2. No topo do projeto, clique em **Connect**.
3. Na lista de tipos de conexão, escolha **Session pooler** (não use “Direct connection”: o Render não alcança esse endereço). O endereço tem este formato:
   `postgresql://postgres.SEU_PROJETO:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
4. Copie e troque `[YOUR-PASSWORD]` pela senha do passo 1.
5. No Render, cole o endereço completo em `DATABASE_URL` do serviço `vrum-api`.

A API cria as tabelas sozinha no primeiro deploy (e as atualiza nos seguintes). A conexão é criptografada automaticamente.

Opcional — verificar o certificado do servidor: em **Project Settings → Database → SSL Configuration**, baixe o certificado e cole o conteúdo na variável `DATABASE_CA` do `vrum-api`.

Plano gratuito: o projeto pausa depois de 7 dias **sem nenhum uso**; enquanto o app estiver sendo usado, ele fica ativo. Se pausar, reative em **Restore project** no painel.

## 1. Supabase Storage (arquivos)

1. Use o mesmo projeto do item 0.
2. No menu lateral, abra **Storage** → **New bucket**.
   - Nome: `vrum`
   - Marque **Public bucket** (as fotos dos trabalhos e dos perfis precisam abrir no app).
   - Limite de tamanho: 50 MB.
3. Abra **Project Settings** → **API Keys** (ou **API**):
   - Copie a **Project URL** (algo como `https://abcdxyz.supabase.co`) → cole em `SUPABASE_URL`.
   - Copie a chave **secret** (`sb_secret_...`) ou, na aba de chaves antigas, a **service_role** → cole em `SUPABASE_SERVICE_ROLE_KEY`.
4. No Render, serviço `vrum-api`, salve e faça o deploy.

**Atenção:** a chave secreta dá acesso total ao projeto do Supabase. Cole só no Render, nunca no app, no painel ou em mensagens.

Como confirmar: no app, envie uma foto num chamado. O endereço da imagem passa a começar com o seu `https://…supabase.co/storage/…`.

## 2. OpenFreeMap (mapa) — nada a fazer

O mapa usa a instância pública do **OpenFreeMap** (openfreemap.org): gratuita, sem cadastro, sem chave e sem limite de visualizações. Os dados são do OpenStreetMap, e o crédito aparece no canto do mapa, como pede a licença.

- Estilo padrão: `vrum-escuro`. O app baixa o estilo oficial **positron** e o recolore com as cores do VRUM (fundo grafite, água azul-escura, áreas verdes discretas, vias em cinza).
- Para trocar, mude `VITE_MAPA_ESTILO` no serviço `vrum-app` para `liberty`, `bright` ou `positron` (estilos oficiais), ou para a URL de um estilo próprio editado no Maputnik.
- Se o OpenFreeMap não responder, o app mostra o mapa da CARTO no lugar, sem quebrar a tela.
- O OpenFreeMap não calcula rotas: a rota e a previsão de chegada vêm do OpenRouteService (próximo item).

## 3. OpenRouteService (rotas e previsão de chegada)

1. Crie a conta em **openrouteservice.org** (**Sign up**, gratuito).
2. No **Dashboard**, em **Request a token**, escolha **Standard** e dê um nome (ex.: `vrum`).
3. Copie o token → no Render, serviço `vrum-api`, cole em `ORS_API_KEY` e faça o deploy.

Como confirmar: num chamado confirmado, o cartão de distância passa de “X km em linha reta” para “N min · X km de carro · previsão de chegada às HH:MM”, e o mapa desenha o caminho pelas ruas.

A rota é recalculada só quando o profissional anda mais de 300 m ou a cada 90 segundos, para não gastar a cota gratuita.

## 4. Notificações no navegador (Web Push)

Não precisa de conta. A API usa a biblioteca oficial **web-push** (github.com/web-push-libs/web-push — a mesma que você enviou), e as chaves de segurança (VAPID) são criadas automaticamente e guardadas no banco. Se quiser fixá-las, defina `VAPID_PUBLICA` e `VAPID_PRIVADA` no `vrum-api`.

- O usuário toca em **Ativar** no aviso da tela inicial (motorista) ou do painel (profissional), ou em **Perfil → Notificações no navegador**.
- **iPhone:** o Safari só entrega notificações se o VRUM for adicionado à tela de início (Compartilhar → Adicionar à Tela de Início) e aberto por esse ícone.
- Notificações no app instalado pela Play Store/App Store (Firebase) ficam para a próxima etapa.

---

## Ainda a definir

- **Confirmação de contato e recuperação de senha:** você vai escolher o serviço. A tabela `recuperacoes_acesso` já existe na API.
- **Notificações no app nativo:** Firebase (Android) e Apple Developer (iPhone).
- **Domínio próprio:** Render → serviço → **Settings → Custom Domains**.
