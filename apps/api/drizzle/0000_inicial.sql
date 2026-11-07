CREATE TYPE "public"."alvo_denuncia" AS ENUM('USUARIO', 'PRESTADOR', 'PUBLICACAO', 'COMENTARIO', 'MENSAGEM', 'AVALIACAO');--> statement-breakpoint
CREATE TYPE "public"."ator" AS ENUM('MOTORISTA', 'PRESTADOR', 'SISTEMA', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."estado_assinatura" AS ENUM('ATIVA', 'SUSPENSA', 'CANCELADA', 'EXPIRADA');--> statement-breakpoint
CREATE TYPE "public"."estado_chamado" AS ENUM('BUSCANDO_PROFISSIONAL', 'AGUARDANDO_RESPOSTA', 'ACEITO_COMBINANDO', 'CONFIRMADO', 'A_CAMINHO', 'NO_LOCAL', 'EM_ATENDIMENTO', 'CONCLUSAO_SOLICITADA', 'CONCLUIDO', 'CANCELADO', 'SEM_ATENDIMENTO');--> statement-breakpoint
CREATE TYPE "public"."estado_condicao" AS ENUM('PROPOSTA', 'ACEITA', 'RECUSADA', 'SUBSTITUIDA');--> statement-breakpoint
CREATE TYPE "public"."estado_convite" AS ENUM('PENDENTE', 'ACEITO', 'RECUSADO', 'EXPIRADO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."estado_documento" AS ENUM('ENVIADO', 'APROVADO', 'REPROVADO');--> statement-breakpoint
CREATE TYPE "public"."estado_moderacao" AS ENUM('ABERTA', 'EM_ANALISE', 'PROCEDENTE', 'IMPROCEDENTE');--> statement-breakpoint
CREATE TYPE "public"."funcao_membro" AS ENUM('DONO', 'GESTOR', 'PROFISSIONAL');--> statement-breakpoint
CREATE TYPE "public"."modalidade_atendimento" AS ENUM('NO_LOCAL', 'NA_OFICINA', 'AMBOS');--> statement-breakpoint
CREATE TYPE "public"."modalidade_busca" AS ENUM('ESCOLHER_PROFISSIONAL', 'BUSCAR_DISPONIVEIS');--> statement-breakpoint
CREATE TYPE "public"."papel_rastreamento" AS ENUM('MOTORISTA', 'PRESTADOR');--> statement-breakpoint
CREATE TYPE "public"."plataforma" AS ENUM('ANDROID', 'IOS', 'WEB');--> statement-breakpoint
CREATE TYPE "public"."tipo_condicao" AS ENUM('VALOR_SERVICO', 'TAXA_DESLOCAMENTO', 'AVALIACAO_PRESENCIAL', 'OUTRA');--> statement-breakpoint
CREATE TYPE "public"."tipo_fluxo" AS ENUM('IMEDIATO', 'AGENDADO', 'TRIAGEM');--> statement-breakpoint
CREATE TYPE "public"."tipo_mensagem" AS ENUM('TEXTO', 'IMAGEM', 'AUDIO', 'LOCALIZACAO', 'PROPOSTA', 'SISTEMA');--> statement-breakpoint
CREATE TYPE "public"."tipo_midia" AS ENUM('IMAGEM', 'VIDEO', 'AUDIO', 'DOCUMENTO');--> statement-breakpoint
CREATE TYPE "public"."tipo_prestador" AS ENUM('AUTONOMO', 'EMPRESA');--> statement-breakpoint
CREATE TYPE "public"."tipo_veiculo" AS ENUM('CARRO', 'MOTO', 'CAMINHONETE', 'CAMINHAO', 'ONIBUS', 'MAQUINA_AGRICOLA');--> statement-breakpoint
CREATE TABLE "acessos_admin_localizacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"chamado_id" uuid NOT NULL,
	"justificativa" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anexos_chamado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamado_id" uuid NOT NULL,
	"tipo" "tipo_midia" NOT NULL,
	"url" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assinaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestador_id" uuid NOT NULL,
	"plano_id" uuid NOT NULL,
	"estado" "estado_assinatura" DEFAULT 'ATIVA' NOT NULL,
	"inicio_em" timestamp with time zone DEFAULT now() NOT NULL,
	"fim_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "avaliacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamado_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"prestador_id" uuid,
	"nota" integer NOT NULL,
	"comentario" text,
	"resposta" text,
	"ocultada_em" timestamp with time zone,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bloqueios" (
	"bloqueador_id" uuid NOT NULL,
	"bloqueado_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bloqueios_bloqueador_id_bloqueado_id_pk" PRIMARY KEY("bloqueador_id","bloqueado_id")
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"fluxo" "tipo_fluxo" NOT NULL,
	"exemplos" text[] DEFAULT '{}' NOT NULL,
	"exige_dados_guincho" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "categorias_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "chamados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motorista_id" uuid NOT NULL,
	"veiculo_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"cidade_id" uuid NOT NULL,
	"estado" "estado_chamado" DEFAULT 'BUSCANDO_PROFISSIONAL' NOT NULL,
	"versao" integer DEFAULT 0 NOT NULL,
	"modalidade" "modalidade_busca" NOT NULL,
	"descricao" text,
	"ponto_lat" double precision NOT NULL,
	"ponto_lng" double precision NOT NULL,
	"ponto_referencia" text,
	"destino_endereco" text,
	"destino_lat" double precision,
	"destino_lng" double precision,
	"condicoes_acesso" text,
	"veiculo_se_move" boolean,
	"etapa_busca" integer DEFAULT 0 NOT NULL,
	"prestador_escolhido_id" uuid,
	"prestador_id" uuid,
	"responsavel_id" uuid,
	"aceito_em" timestamp with time zone,
	"confirmado_em" timestamp with time zone,
	"chegada_prevista_em" timestamp with time zone,
	"conclusao_solicitada_em" timestamp with time zone,
	"auto_concluir_em" timestamp with time zone,
	"abandono_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	"cancelado_por" "ator",
	"motivo_cancelamento" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"uf" char(2) NOT NULL,
	"slug" text NOT NULL,
	"ativa" boolean DEFAULT false NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	CONSTRAINT "cidades_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "comentarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publicacao_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"removido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compartilhamentos_localizacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamado_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" "papel_rastreamento" NOT NULL,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"pausado_em" timestamp with time zone,
	"encerrado_em" timestamp with time zone,
	"motivo_encerramento" text
);
--> statement-breakpoint
CREATE TABLE "condicoes_acordadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamado_id" uuid NOT NULL,
	"tipo" "tipo_condicao" NOT NULL,
	"estado" "estado_condicao" DEFAULT 'PROPOSTA' NOT NULL,
	"valor_centavos" integer,
	"descricao" text,
	"proposta_por" uuid NOT NULL,
	"mensagem_id" uuid,
	"respondida_em" timestamp with time zone,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "condicoes_acordadas_mensagemId_unique" UNIQUE("mensagem_id")
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contestacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamado_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"estado" "estado_moderacao" DEFAULT 'ABERTA' NOT NULL,
	"resolucao" text,
	"resolvida_em" timestamp with time zone,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamado_id" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversas_chamadoId_unique" UNIQUE("chamado_id")
);
--> statement-breakpoint
CREATE TABLE "convites_chamado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamado_id" uuid NOT NULL,
	"prestador_id" uuid NOT NULL,
	"etapa" integer NOT NULL,
	"estado" "estado_convite" DEFAULT 'PENDENTE' NOT NULL,
	"distancia_km" double precision,
	"expira_em" timestamp with time zone NOT NULL,
	"respondido_em" timestamp with time zone,
	"respondido_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curtidas" (
	"usuario_id" uuid NOT NULL,
	"publicacao_id" uuid NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curtidas_usuario_id_publicacao_id_pk" PRIMARY KEY("usuario_id","publicacao_id")
);
--> statement-breakpoint
CREATE TABLE "denuncias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"autor_id" uuid NOT NULL,
	"alvo" "alvo_denuncia" NOT NULL,
	"alvo_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"detalhes" text,
	"estado" "estado_moderacao" DEFAULT 'ABERTA' NOT NULL,
	"resolvida_por" uuid,
	"resolvida_em" timestamp with time zone,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destaques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestador_id" uuid NOT NULL,
	"cidade_id" uuid,
	"inicio_em" timestamp with time zone NOT NULL,
	"fim_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispositivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"plataforma" "plataforma" NOT NULL,
	"token" text NOT NULL,
	"inscricao_web" jsonb,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidado_em" timestamp with time zone,
	CONSTRAINT "dispositivos_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "documentos_verificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestador_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"arquivo_url" text NOT NULL,
	"estado" "estado_documento" DEFAULT 'ENVIADO' NOT NULL,
	"observacao" text,
	"analisado_por" uuid,
	"analisado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_chamado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamado_id" uuid NOT NULL,
	"evento" text NOT NULL,
	"de" "estado_chamado",
	"para" "estado_chamado" NOT NULL,
	"ator" "ator" NOT NULL,
	"ator_id" uuid,
	"dados" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membros_prestador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestador_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"funcao" "funcao_membro" NOT NULL,
	"atende" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"disponivel" boolean DEFAULT false NOT NULL,
	"disponivel_ate" timestamp with time zone,
	"chamado_atual_id" uuid,
	"ultima_lat" double precision,
	"ultima_lng" double precision,
	"ultima_posicao_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membro_um_chamado_por_vez" UNIQUE("chamado_atual_id")
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"autor_id" uuid,
	"tipo" "tipo_mensagem" NOT NULL,
	"conteudo" text,
	"midia_url" text,
	"lat" double precision,
	"lng" double precision,
	"removida_em" timestamp with time zone,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publicacao_id" uuid NOT NULL,
	"tipo" "tipo_midia" NOT NULL,
	"url" text NOT NULL,
	"miniatura_url" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"duracao_seg" integer
);
--> statement-breakpoint
CREATE TABLE "notificacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"corpo" text NOT NULL,
	"chamado_id" uuid,
	"dados" jsonb,
	"lida_em" timestamp with time zone,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participantes_conversa" (
	"conversa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"ultima_leitura_em" timestamp with time zone,
	"silenciada_ate" timestamp with time zone,
	CONSTRAINT "participantes_conversa_conversa_id_usuario_id_pk" PRIMARY KEY("conversa_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "planos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"preco_centavos" integer NOT NULL,
	"beneficios" jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posicoes_atuais" (
	"chamado_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"precisao_m" double precision,
	"rumo" double precision,
	"velocidade_ms" double precision,
	"capturada_em" timestamp with time zone NOT NULL,
	"recebida_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posicoes_atuais_chamado_id_usuario_id_pk" PRIMARY KEY("chamado_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "prestador_categorias" (
	"prestador_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"especialidades" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "prestador_categorias_prestador_id_categoria_id_pk" PRIMARY KEY("prestador_id","categoria_id")
);
--> statement-breakpoint
CREATE TABLE "prestadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_prestador" NOT NULL,
	"nome_comercial" text NOT NULL,
	"usuario_nome" text NOT NULL,
	"apresentacao" text,
	"foto_url" text,
	"capa_url" text,
	"cidade_id" uuid NOT NULL,
	"endereco_comercial" text,
	"base_lat" double precision,
	"base_lng" double precision,
	"raio_cobertura_km" double precision DEFAULT 15 NOT NULL,
	"modalidade" "modalidade_atendimento" DEFAULT 'AMBOS' NOT NULL,
	"veiculos_atendidos" "tipo_veiculo"[] DEFAULT '{}' NOT NULL,
	"horarios" jsonb,
	"plantao" boolean DEFAULT false NOT NULL,
	"info_deslocamento" text,
	"verificado_em" timestamp with time zone,
	"nota_media" double precision,
	"total_avaliacoes" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prestadores_usuarioNome_unique" UNIQUE("usuario_nome")
);
--> statement-breakpoint
CREATE TABLE "publicacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestador_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"categoria_id" uuid,
	"descricao" text,
	"removida_em" timestamp with time zone,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recuperacoes_acesso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recuperacoes_acesso_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "registros_admin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"acao" text NOT NULL,
	"alvo" text NOT NULL,
	"alvo_id" text NOT NULL,
	"dados" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salvamentos" (
	"usuario_id" uuid NOT NULL,
	"publicacao_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salvamentos_usuario_id_publicacao_id_pk" PRIMARY KEY("usuario_id","publicacao_id")
);
--> statement-breakpoint
CREATE TABLE "seguidores" (
	"usuario_id" uuid NOT NULL,
	"prestador_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seguidores_usuario_id_prestador_id_pk" PRIMARY KEY("usuario_id","prestador_id")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"telefone" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"telefone_verificado_em" timestamp with time zone,
	"email_verificado_em" timestamp with time zone,
	"foto_url" text,
	"cidade_id" uuid,
	"local_manual_lat" double precision,
	"local_manual_lng" double precision,
	"eh_admin" boolean DEFAULT false NOT NULL,
	"suspenso_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_telefone_unique" UNIQUE("telefone"),
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "veiculos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motorista_id" uuid NOT NULL,
	"tipo" "tipo_veiculo" DEFAULT 'CARRO' NOT NULL,
	"marca" text NOT NULL,
	"modelo" text NOT NULL,
	"ano" integer NOT NULL,
	"versao" text,
	"combustivel" text,
	"cor" text,
	"placa" text,
	"foto_url" text,
	"observacoes" text,
	"principal" boolean DEFAULT false NOT NULL,
	"arquivado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acessos_admin_localizacao" ADD CONSTRAINT "acessos_admin_localizacao_admin_id_usuarios_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acessos_admin_localizacao" ADD CONSTRAINT "acessos_admin_localizacao_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_chamado" ADD CONSTRAINT "anexos_chamado_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_prestador_id_prestadores_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."prestadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_plano_id_planos_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_prestador_id_prestadores_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."prestadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_bloqueador_id_usuarios_id_fk" FOREIGN KEY ("bloqueador_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_bloqueado_id_usuarios_id_fk" FOREIGN KEY ("bloqueado_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_motorista_id_usuarios_id_fk" FOREIGN KEY ("motorista_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_cidade_id_cidades_id_fk" FOREIGN KEY ("cidade_id") REFERENCES "public"."cidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_prestador_escolhido_id_prestadores_id_fk" FOREIGN KEY ("prestador_escolhido_id") REFERENCES "public"."prestadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_prestador_id_prestadores_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."prestadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_responsavel_id_membros_prestador_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."membros_prestador"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartilhamentos_localizacao" ADD CONSTRAINT "compartilhamentos_localizacao_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartilhamentos_localizacao" ADD CONSTRAINT "compartilhamentos_localizacao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condicoes_acordadas" ADD CONSTRAINT "condicoes_acordadas_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condicoes_acordadas" ADD CONSTRAINT "condicoes_acordadas_proposta_por_usuarios_id_fk" FOREIGN KEY ("proposta_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contestacoes" ADD CONSTRAINT "contestacoes_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contestacoes" ADD CONSTRAINT "contestacoes_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_chamado" ADD CONSTRAINT "convites_chamado_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_chamado" ADD CONSTRAINT "convites_chamado_prestador_id_prestadores_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."prestadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_chamado" ADD CONSTRAINT "convites_chamado_respondido_por_usuarios_id_fk" FOREIGN KEY ("respondido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curtidas" ADD CONSTRAINT "curtidas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curtidas" ADD CONSTRAINT "curtidas_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_resolvida_por_usuarios_id_fk" FOREIGN KEY ("resolvida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destaques" ADD CONSTRAINT "destaques_prestador_id_prestadores_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."prestadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destaques" ADD CONSTRAINT "destaques_cidade_id_cidades_id_fk" FOREIGN KEY ("cidade_id") REFERENCES "public"."cidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_verificacao" ADD CONSTRAINT "documentos_verificacao_prestador_id_prestadores_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."prestadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_verificacao" ADD CONSTRAINT "documentos_verificacao_analisado_por_usuarios_id_fk" FOREIGN KEY ("analisado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_chamado" ADD CONSTRAINT "eventos_chamado_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_chamado" ADD CONSTRAINT "eventos_chamado_ator_id_usuarios_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros_prestador" ADD CONSTRAINT "membros_prestador_prestador_id_prestadores_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."prestadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros_prestador" ADD CONSTRAINT "membros_prestador_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros_prestador" ADD CONSTRAINT "membros_prestador_chamado_atual_id_chamados_id_fk" FOREIGN KEY ("chamado_atual_id") REFERENCES "public"."chamados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "midias" ADD CONSTRAINT "midias_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participantes_conversa" ADD CONSTRAINT "participantes_conversa_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participantes_conversa" ADD CONSTRAINT "participantes_conversa_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posicoes_atuais" ADD CONSTRAINT "posicoes_atuais_chamado_id_chamados_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posicoes_atuais" ADD CONSTRAINT "posicoes_atuais_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestador_categorias" ADD CONSTRAINT "prestador_categorias_prestador_id_prestadores_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."prestadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestador_categorias" ADD CONSTRAINT "prestador_categorias_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestadores" ADD CONSTRAINT "prestadores_cidade_id_cidades_id_fk" FOREIGN KEY ("cidade_id") REFERENCES "public"."cidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_prestador_id_prestadores_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."prestadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recuperacoes_acesso" ADD CONSTRAINT "recuperacoes_acesso_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_admin" ADD CONSTRAINT "registros_admin_admin_id_usuarios_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salvamentos" ADD CONSTRAINT "salvamentos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salvamentos" ADD CONSTRAINT "salvamentos_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguidores" ADD CONSTRAINT "seguidores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguidores" ADD CONSTRAINT "seguidores_prestador_id_prestadores_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."prestadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cidade_id_cidades_id_fk" FOREIGN KEY ("cidade_id") REFERENCES "public"."cidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_motorista_id_usuarios_id_fk" FOREIGN KEY ("motorista_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "avaliacoes_chamado_id_autor_id_index" ON "avaliacoes" USING btree ("chamado_id","autor_id");--> statement-breakpoint
CREATE INDEX "avaliacoes_prestador_id_criada_em_index" ON "avaliacoes" USING btree ("prestador_id","criada_em");--> statement-breakpoint
CREATE INDEX "chamados_motorista_id_estado_index" ON "chamados" USING btree ("motorista_id","estado");--> statement-breakpoint
CREATE INDEX "chamados_prestador_id_estado_index" ON "chamados" USING btree ("prestador_id","estado");--> statement-breakpoint
CREATE INDEX "chamados_estado_auto_concluir_em_index" ON "chamados" USING btree ("estado","auto_concluir_em");--> statement-breakpoint
CREATE UNIQUE INDEX "chamado_um_ativo_por_motorista" ON "chamados" USING btree ("motorista_id") WHERE "chamados"."estado" not in ('CONCLUIDO', 'CANCELADO', 'SEM_ATENDIMENTO');--> statement-breakpoint
CREATE UNIQUE INDEX "cidades_nome_uf_index" ON "cidades" USING btree ("nome","uf");--> statement-breakpoint
CREATE INDEX "comentarios_publicacao_id_criado_em_index" ON "comentarios" USING btree ("publicacao_id","criado_em");--> statement-breakpoint
CREATE INDEX "compartilhamentos_localizacao_chamado_id_encerrado_em_index" ON "compartilhamentos_localizacao" USING btree ("chamado_id","encerrado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "compartilhamento_aberto_unico" ON "compartilhamentos_localizacao" USING btree ("chamado_id","usuario_id") WHERE "compartilhamentos_localizacao"."encerrado_em" is null;--> statement-breakpoint
CREATE INDEX "condicoes_acordadas_chamado_id_tipo_estado_index" ON "condicoes_acordadas" USING btree ("chamado_id","tipo","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "convites_chamado_chamado_id_prestador_id_index" ON "convites_chamado" USING btree ("chamado_id","prestador_id");--> statement-breakpoint
CREATE INDEX "convites_chamado_prestador_id_estado_index" ON "convites_chamado" USING btree ("prestador_id","estado");--> statement-breakpoint
CREATE INDEX "convites_chamado_estado_expira_em_index" ON "convites_chamado" USING btree ("estado","expira_em");--> statement-breakpoint
CREATE UNIQUE INDEX "convite_um_aceito_por_chamado" ON "convites_chamado" USING btree ("chamado_id") WHERE "convites_chamado"."estado" = 'ACEITO';--> statement-breakpoint
CREATE INDEX "denuncias_estado_criada_em_index" ON "denuncias" USING btree ("estado","criada_em");--> statement-breakpoint
CREATE INDEX "denuncias_alvo_alvo_id_index" ON "denuncias" USING btree ("alvo","alvo_id");--> statement-breakpoint
CREATE INDEX "eventos_chamado_chamado_id_criado_em_index" ON "eventos_chamado" USING btree ("chamado_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "membros_prestador_prestador_id_usuario_id_index" ON "membros_prestador" USING btree ("prestador_id","usuario_id");--> statement-breakpoint
CREATE INDEX "membros_prestador_disponivel_disponivel_ate_index" ON "membros_prestador" USING btree ("disponivel","disponivel_ate");--> statement-breakpoint
CREATE INDEX "mensagens_conversa_id_criada_em_index" ON "mensagens" USING btree ("conversa_id","criada_em");--> statement-breakpoint
CREATE INDEX "notificacoes_usuario_id_lida_em_criada_em_index" ON "notificacoes" USING btree ("usuario_id","lida_em","criada_em");--> statement-breakpoint
CREATE INDEX "participantes_conversa_usuario_id_index" ON "participantes_conversa" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "prestador_categorias_categoria_id_index" ON "prestador_categorias" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "prestadores_cidade_id_index" ON "prestadores" USING btree ("cidade_id");--> statement-breakpoint
CREATE INDEX "prestadores_base_lat_base_lng_index" ON "prestadores" USING btree ("base_lat","base_lng");--> statement-breakpoint
CREATE INDEX "publicacoes_prestador_id_criada_em_index" ON "publicacoes" USING btree ("prestador_id","criada_em");--> statement-breakpoint
CREATE INDEX "registros_admin_alvo_alvo_id_index" ON "registros_admin" USING btree ("alvo","alvo_id");--> statement-breakpoint
CREATE INDEX "veiculos_motorista_id_index" ON "veiculos" USING btree ("motorista_id");--> statement-breakpoint
CREATE UNIQUE INDEX "veiculo_principal_unico" ON "veiculos" USING btree ("motorista_id") WHERE "veiculos"."principal" = true and "veiculos"."arquivado_em" is null;