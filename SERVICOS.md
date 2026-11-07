# Serviços externos do VRUM — como criar as contas e onde colar as chaves

Cada integração liga sozinha quando a chave é colocada no Render. Sem a chave, o VRUM continua funcionando com uma alternativa (indicada em cada item).

Onde colar: no painel do Render (dashboard.render.com), abra o serviço indicado → **Environment** → edite a variável → **Save, rebuild and deploy**.

| Serviço | Para quê | Variáveis | Onde no Render | Sem a chave |
|---|---|---|---|---|
| Supabase Storage | Guardar fotos, vídeos, áudios e documentos | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `vrum-api` | Arquivos vão para o disco do servidor e **somem quando ele reinicia** |
| MapTiler | Mapa | `VITE_MAPTILER_KEY` | `vrum-app` | Mapa gratuito da CARTO |
| OpenRouteService | Rota pelas ruas e previsão de chegada | `ORS_API_KEY` | `vrum-api` | Distância em linha reta, sem previsão |
| Web Push | Notificações no navegador | — (automático) | — | — |

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

## 2. MapTiler (mapa)

1. Crie a conta em **cloud.maptiler.com** (plano gratuito).
2. Abra **Account → API keys** e copie a chave padrão.
3. Recomendado: em **Allowed HTTP origins**, adicione o endereço do app (ex.: `vrum-app.onrender.com` e, depois, o seu domínio). Assim ninguém usa sua cota em outro site.
4. No Render, serviço `vrum-app`, cole em `VITE_MAPTILER_KEY` e faça o deploy.

O estilo padrão é `dataviz-dark` (escuro, combina com o VRUM). Para outro estilo, abra **Maps** no MapTiler, escolha um e copie o ID para `VITE_MAPTILER_ESTILO`. Se a chave ou o estilo estiverem errados, o app volta sozinho para o mapa gratuito — confira se o mapa mudou de visual depois do deploy.

## 3. OpenRouteService (rotas e previsão de chegada)

1. Crie a conta em **openrouteservice.org** (**Sign up**, gratuito).
2. No **Dashboard**, em **Request a token**, escolha **Standard** e dê um nome (ex.: `vrum`).
3. Copie o token → no Render, serviço `vrum-api`, cole em `ORS_API_KEY` e faça o deploy.

Como confirmar: num chamado confirmado, o cartão de distância passa de “X km em linha reta” para “N min · X km de carro · previsão de chegada às HH:MM”, e o mapa desenha o caminho pelas ruas.

A rota é recalculada só quando o profissional anda mais de 300 m ou a cada 90 segundos, para não gastar a cota gratuita.

## 4. Notificações no navegador (Web Push)

Não precisa de conta. As chaves de segurança são criadas automaticamente pela API e guardadas no banco.

- O usuário toca em **Ativar** no aviso da tela inicial (motorista) ou do painel (profissional), ou em **Perfil → Notificações no navegador**.
- **iPhone:** o Safari só entrega notificações se o VRUM for adicionado à tela de início (Compartilhar → Adicionar à Tela de Início) e aberto por esse ícone.
- Notificações no app instalado pela Play Store/App Store (Firebase) ficam para a próxima etapa.

---

## Ainda a definir

- **Confirmação de contato e recuperação de senha:** você vai escolher o serviço. A tabela `recuperacoes_acesso` já existe na API.
- **Notificações no app nativo:** Firebase (Android) e Apple Developer (iPhone).
- **Domínio próprio:** Render → serviço → **Settings → Custom Domains**.
