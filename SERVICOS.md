# Serviços externos do VRUM — como criar as contas e onde colar as chaves

Cada integração liga sozinha quando a chave é colocada no Render. Sem a chave, o VRUM continua funcionando com uma alternativa (indicada em cada item).

Onde colar: no painel do Render (dashboard.render.com), abra o serviço indicado → **Environment** → edite a variável → **Save, rebuild and deploy**.

| Serviço | Para quê | Variáveis | Onde no Render | Sem a chave |
|---|---|---|---|---|
| Supabase Storage | Guardar fotos, vídeos, áudios e documentos | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `vrum-api` | Arquivos vão para o disco do servidor e **somem quando ele reinicia** |
| OpenFreeMap | Mapa | — (sem chave) | — | Se não responder, usa o mapa da CARTO |
| OpenRouteService | Rota pelas ruas e previsão de chegada | `ORS_API_KEY` | `vrum-api` | Distância em linha reta, sem previsão |
| Web Push (biblioteca web-push) | Notificações no navegador | — (automático) | — | — |

---

## 1. Supabase Storage (arquivos)

1. Crie a conta em **supabase.com** e clique em **New project**. Nome: `vrum`. Região: **South America (São Paulo)**. Anote a senha do banco (não será usada pelo VRUM, mas guarde).
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
