/**
 * VRUM — modelo de dados (seção 17 do documento).
 *
 * PostgreSQL via Drizzle ORM. Colunas em snake_case no banco.
 * Coordenadas ficam em lat/lng (double); a busca por proximidade usa caixa
 * delimitadora + haversine. Ao crescer, dá para migrar para PostGIS.
 *
 * Regras críticas garantidas pelo próprio banco (índices únicos parciais):
 *  - um motorista tem no máximo um chamado em andamento;
 *  - um chamado tem no máximo um convite aceito (impede aceite simultâneo);
 *  - um profissional atende no máximo um chamado por vez;
 *  - um veículo principal por motorista;
 *  - um compartilhamento de localização aberto por participante e chamado.
 */
import { sql } from 'drizzle-orm';
import {
  boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey,
  text, timestamp, uniqueIndex, uuid, char, type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { ESTADOS_CHAMADO } from '@vrum/shared';

const id = () => uuid().primaryKey().defaultRandom();
const criadoEm = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const quando = () => timestamp({ withTimezone: true });

// ───────────────────────────── Enums ─────────────────────────────

export const estadoChamado = pgEnum('estado_chamado', ESTADOS_CHAMADO);
export const modalidadeBusca = pgEnum('modalidade_busca', ['ESCOLHER_PROFISSIONAL', 'BUSCAR_DISPONIVEIS']);
export const estadoConvite = pgEnum('estado_convite', ['PENDENTE', 'ACEITO', 'RECUSADO', 'EXPIRADO', 'CANCELADO']);
export const ator = pgEnum('ator', ['MOTORISTA', 'PRESTADOR', 'SISTEMA', 'ADMIN']);
export const tipoPrestador = pgEnum('tipo_prestador', ['AUTONOMO', 'EMPRESA']);
export const funcaoMembro = pgEnum('funcao_membro', ['DONO', 'GESTOR', 'PROFISSIONAL']);
export const modalidadeAtendimento = pgEnum('modalidade_atendimento', ['NO_LOCAL', 'NA_OFICINA', 'AMBOS']);
export const tipoVeiculo = pgEnum('tipo_veiculo', ['CARRO', 'MOTO', 'CAMINHONETE', 'CAMINHAO', 'ONIBUS', 'MAQUINA_AGRICOLA']);
export const tipoFluxo = pgEnum('tipo_fluxo', ['IMEDIATO', 'AGENDADO', 'TRIAGEM']);
export const tipoMidia = pgEnum('tipo_midia', ['IMAGEM', 'VIDEO', 'AUDIO', 'DOCUMENTO']);
export const tipoMensagem = pgEnum('tipo_mensagem', ['TEXTO', 'IMAGEM', 'AUDIO', 'LOCALIZACAO', 'PROPOSTA', 'SISTEMA']);
export const tipoCondicao = pgEnum('tipo_condicao', ['VALOR_SERVICO', 'TAXA_DESLOCAMENTO', 'AVALIACAO_PRESENCIAL', 'OUTRA']);
export const estadoCondicao = pgEnum('estado_condicao', ['PROPOSTA', 'ACEITA', 'RECUSADA', 'SUBSTITUIDA']);
export const papelRastreamento = pgEnum('papel_rastreamento', ['MOTORISTA', 'PRESTADOR']);
export const estadoModeracao = pgEnum('estado_moderacao', ['ABERTA', 'EM_ANALISE', 'PROCEDENTE', 'IMPROCEDENTE']);
export const alvoDenuncia = pgEnum('alvo_denuncia', ['USUARIO', 'PRESTADOR', 'PUBLICACAO', 'COMENTARIO', 'MENSAGEM', 'AVALIACAO']);
export const estadoDocumento = pgEnum('estado_documento', ['ENVIADO', 'APROVADO', 'REPROVADO']);
export const plataforma = pgEnum('plataforma', ['ANDROID', 'IOS', 'WEB']);
export const estadoAssinatura = pgEnum('estado_assinatura', ['ATIVA', 'SUSPENSA', 'CANCELADA', 'EXPIRADA']);

// ───────────────────────────── Contas ─────────────────────────────

export const cidades = pgTable('cidades', {
  id: id(),
  nome: text().notNull(),
  uf: char({ length: 2 }).notNull(),
  slug: text().notNull().unique(),
  ativa: boolean().notNull().default(false), // lançamento: Sorriso–MT
  lat: doublePrecision().notNull(),
  lng: doublePrecision().notNull(),
}, (t) => [uniqueIndex().on(t.nome, t.uf)]);

export const usuarios = pgTable('usuarios', {
  id: id(),
  nome: text().notNull(),
  telefone: text().notNull().unique(),
  email: text().notNull().unique(),
  senhaHash: text().notNull(),
  telefoneVerificadoEm: quando(),
  emailVerificadoEm: quando(),
  fotoUrl: text(),
  cidadeId: uuid().references(() => cidades.id),
  /** Localização informada manualmente quando o GPS não for autorizado. */
  localManualLat: doublePrecision(),
  localManualLng: doublePrecision(),
  ehAdmin: boolean().notNull().default(false),
  suspensoEm: quando(),
  criadoEm: criadoEm(),
  atualizadoEm: criadoEm().$onUpdate(() => new Date()),
});

export const recuperacoesAcesso = pgTable('recuperacoes_acesso', {
  id: id(),
  usuarioId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  tokenHash: text().notNull().unique(),
  expiraEm: quando().notNull(),
  usadoEm: quando(),
  criadoEm: criadoEm(),
});

// ───────────────────────────── Veículos ─────────────────────────────

export const veiculos = pgTable('veiculos', {
  id: id(),
  motoristaId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  tipo: tipoVeiculo().notNull().default('CARRO'),
  marca: text().notNull(),
  modelo: text().notNull(),
  ano: integer().notNull(),
  versao: text(),
  combustivel: text(),
  cor: text(),
  /** Privada: nunca exibida em perfis/publicações; só ao prestador do chamado confirmado. */
  placa: text(),
  fotoUrl: text(),
  observacoes: text(),
  principal: boolean().notNull().default(false),
  arquivadoEm: quando(),
  criadoEm: criadoEm(),
}, (t) => [
  index().on(t.motoristaId),
  uniqueIndex('veiculo_principal_unico').on(t.motoristaId)
    .where(sql`${t.principal} = true and ${t.arquivadoEm} is null`),
]);

// ───────────────────────────── Prestadores ─────────────────────────────

export const prestadores = pgTable('prestadores', {
  id: id(),
  tipo: tipoPrestador().notNull(),
  nomeComercial: text().notNull(),
  usuarioNome: text().notNull().unique(), // @usuário
  apresentacao: text(),
  fotoUrl: text(),
  capaUrl: text(),
  cidadeId: uuid().notNull().references(() => cidades.id),
  enderecoComercial: text(),
  /** Base comercial — o que aparece no mapa público. */
  baseLat: doublePrecision(),
  baseLng: doublePrecision(),
  raioCoberturaKm: doublePrecision().notNull().default(15),
  modalidade: modalidadeAtendimento().notNull().default('AMBOS'),
  veiculosAtendidos: tipoVeiculo().array().notNull().default(sql`'{}'`),
  /** { "seg": [["07:00","18:00"]], ... } */
  horarios: jsonb(),
  plantao: boolean().notNull().default(false),
  infoDeslocamento: text(),
  verificadoEm: quando(), // só por aprovação de documentos — nunca por plano pago
  notaMedia: doublePrecision(),
  totalAvaliacoes: integer().notNull().default(0),
  criadoEm: criadoEm(),
  atualizadoEm: criadoEm().$onUpdate(() => new Date()),
}, (t) => [index().on(t.cidadeId), index().on(t.baseLat, t.baseLng)]);

/** Pessoas que atuam por um prestador. Autônomo = um único DONO que também atende. */
export const membrosPrestador = pgTable('membros_prestador', {
  id: id(),
  prestadorId: uuid().notNull().references(() => prestadores.id, { onDelete: 'cascade' }),
  usuarioId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  funcao: funcaoMembro().notNull(),
  atende: boolean().notNull().default(true),
  ativo: boolean().notNull().default(true),
  /** Disponibilidade tem validade; sem renovação, deixa de aparecer como disponível. */
  disponivel: boolean().notNull().default(false),
  disponivelAte: quando(),
  /** Ocupação individual: o chamado que ele está atendendo agora (no máx. um). */
  chamadoAtualId: uuid().unique('membro_um_chamado_por_vez')
    .references((): AnyPgColumn => chamados.id, { onDelete: 'set null' }),
  /** Última posição do profissional móvel — só exposta de forma aproximada fora do atendimento. */
  ultimaLat: doublePrecision(),
  ultimaLng: doublePrecision(),
  ultimaPosicaoEm: quando(),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex().on(t.prestadorId, t.usuarioId), index().on(t.disponivel, t.disponivelAte)]);

export const documentosVerificacao = pgTable('documentos_verificacao', {
  id: id(),
  prestadorId: uuid().notNull().references(() => prestadores.id, { onDelete: 'cascade' }),
  tipo: text().notNull(), // CNPJ, CPF, CNH, alvará…
  arquivoUrl: text().notNull(),
  estado: estadoDocumento().notNull().default('ENVIADO'),
  observacao: text(),
  analisadoPor: uuid().references(() => usuarios.id),
  analisadoEm: quando(),
  criadoEm: criadoEm(),
});

// ───────────────────────────── Serviços ─────────────────────────────

export const categorias = pgTable('categorias', {
  id: id(),
  slug: text().notNull().unique(),
  nome: text().notNull(),
  fluxo: tipoFluxo().notNull(),
  exemplos: text().array().notNull().default(sql`'{}'`),
  exigeDadosGuincho: boolean().notNull().default(false),
  ordem: integer().notNull().default(0),
  ativa: boolean().notNull().default(true),
});

export const prestadorCategorias = pgTable('prestador_categorias', {
  prestadorId: uuid().notNull().references(() => prestadores.id, { onDelete: 'cascade' }),
  categoriaId: uuid().notNull().references(() => categorias.id, { onDelete: 'cascade' }),
  especialidades: text().array().notNull().default(sql`'{}'`),
}, (t) => [primaryKey({ columns: [t.prestadorId, t.categoriaId] }), index().on(t.categoriaId)]);

// ───────────────────────────── Conteúdo ─────────────────────────────

export const publicacoes = pgTable('publicacoes', {
  id: id(),
  prestadorId: uuid().notNull().references(() => prestadores.id, { onDelete: 'cascade' }),
  autorId: uuid().notNull().references(() => usuarios.id),
  categoriaId: uuid().references(() => categorias.id),
  descricao: text(),
  removidaEm: quando(),
  criadaEm: criadoEm(),
}, (t) => [index().on(t.prestadorId, t.criadaEm)]);

export const midias = pgTable('midias', {
  id: id(),
  publicacaoId: uuid().notNull().references(() => publicacoes.id, { onDelete: 'cascade' }),
  tipo: tipoMidia().notNull(),
  url: text().notNull(),
  miniaturaUrl: text(),
  ordem: integer().notNull().default(0),
  duracaoSeg: integer(),
});

export const curtidas = pgTable('curtidas', {
  usuarioId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  publicacaoId: uuid().notNull().references(() => publicacoes.id, { onDelete: 'cascade' }),
  criadaEm: criadoEm(),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.publicacaoId] })]);

export const salvamentos = pgTable('salvamentos', {
  usuarioId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  publicacaoId: uuid().notNull().references(() => publicacoes.id, { onDelete: 'cascade' }),
  criadoEm: criadoEm(),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.publicacaoId] })]);

export const comentarios = pgTable('comentarios', {
  id: id(),
  publicacaoId: uuid().notNull().references(() => publicacoes.id, { onDelete: 'cascade' }),
  autorId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  texto: text().notNull(),
  removidoEm: quando(),
  criadoEm: criadoEm(),
}, (t) => [index().on(t.publicacaoId, t.criadoEm)]);

export const seguidores = pgTable('seguidores', {
  usuarioId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  prestadorId: uuid().notNull().references(() => prestadores.id, { onDelete: 'cascade' }),
  criadoEm: criadoEm(),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.prestadorId] })]);

// ───────────────────────────── Atendimento ─────────────────────────────

export const chamados = pgTable('chamados', {
  id: id(),
  motoristaId: uuid().notNull().references(() => usuarios.id),
  veiculoId: uuid().notNull().references(() => veiculos.id),
  categoriaId: uuid().notNull().references(() => categorias.id),
  cidadeId: uuid().notNull().references(() => cidades.id),
  estado: estadoChamado().notNull().default('BUSCANDO_PROFISSIONAL'),
  /** Controle otimista: toda transição confere a versão lida e a incrementa. */
  versao: integer().notNull().default(0),
  modalidade: modalidadeBusca().notNull(),
  descricao: text(),

  /** Ponto de atendimento confirmado — separado da posição atual do motorista,
   *  para que um movimento do celular não altere o destino do prestador. */
  pontoLat: doublePrecision().notNull(),
  pontoLng: doublePrecision().notNull(),
  pontoReferencia: text(),

  // Guincho
  destinoEndereco: text(),
  destinoLat: doublePrecision(),
  destinoLng: doublePrecision(),
  condicoesAcesso: text(),
  veiculoSeMove: boolean(),

  // Busca em etapas
  etapaBusca: integer().notNull().default(0),
  /** Prestador escolhido diretamente pelo motorista (modalidade ESCOLHER_PROFISSIONAL). */
  prestadorEscolhidoId: uuid().references(() => prestadores.id),

  // Atendimento
  prestadorId: uuid().references(() => prestadores.id),
  responsavelId: uuid().references(() => membrosPrestador.id),
  aceitoEm: quando(),
  confirmadoEm: quando(),
  chegadaPrevistaEm: quando(),

  // Encerramento
  conclusaoSolicitadaEm: quando(),
  /** Sem resposta do motorista até aqui, o chamado é concluído por prazo. */
  autoConcluirEm: quando(),
  /** Limite para um chamado abandonado (encerra rastreamento). */
  abandonoEm: quando(),
  concluidoEm: quando(),
  canceladoEm: quando(),
  canceladoPor: ator(),
  motivoCancelamento: text(),

  criadoEm: criadoEm(),
  atualizadoEm: criadoEm().$onUpdate(() => new Date()),
}, (t) => [
  index().on(t.motoristaId, t.estado),
  index().on(t.prestadorId, t.estado),
  index().on(t.estado, t.autoConcluirEm),
  uniqueIndex('chamado_um_ativo_por_motorista').on(t.motoristaId)
    .where(sql`${t.estado} not in ('CONCLUIDO', 'CANCELADO', 'SEM_ATENDIMENTO')`),
]);

export const anexosChamado = pgTable('anexos_chamado', {
  id: id(),
  chamadoId: uuid().notNull().references(() => chamados.id, { onDelete: 'cascade' }),
  tipo: tipoMidia().notNull(),
  url: text().notNull(),
  criadoEm: criadoEm(),
});

export const convitesChamado = pgTable('convites_chamado', {
  id: id(),
  chamadoId: uuid().notNull().references(() => chamados.id, { onDelete: 'cascade' }),
  prestadorId: uuid().notNull().references(() => prestadores.id),
  etapa: integer().notNull(),
  estado: estadoConvite().notNull().default('PENDENTE'),
  distanciaKm: doublePrecision(),
  expiraEm: quando().notNull(),
  respondidoEm: quando(),
  respondidoPor: uuid().references(() => usuarios.id),
  criadoEm: criadoEm(),
}, (t) => [
  uniqueIndex().on(t.chamadoId, t.prestadorId),
  index().on(t.prestadorId, t.estado),
  index().on(t.estado, t.expiraEm),
  // Segunda barreira contra aceite simultâneo: um único convite aceito por chamado.
  uniqueIndex('convite_um_aceito_por_chamado').on(t.chamadoId).where(sql`${t.estado} = 'ACEITO'`),
]);

/** Histórico imutável de transições (auditoria e linha do tempo). */
export const eventosChamado = pgTable('eventos_chamado', {
  id: id(),
  chamadoId: uuid().notNull().references(() => chamados.id, { onDelete: 'cascade' }),
  evento: text().notNull(),
  de: estadoChamado(),
  para: estadoChamado().notNull(),
  ator: ator().notNull(),
  atorId: uuid().references(() => usuarios.id),
  dados: jsonb(),
  criadoEm: criadoEm(),
}, (t) => [index().on(t.chamadoId, t.criadoEm)]);

export const condicoesAcordadas = pgTable('condicoes_acordadas', {
  id: id(),
  chamadoId: uuid().notNull().references(() => chamados.id, { onDelete: 'cascade' }),
  tipo: tipoCondicao().notNull(),
  estado: estadoCondicao().notNull().default('PROPOSTA'),
  valorCentavos: integer(),
  descricao: text(),
  propostaPor: uuid().notNull().references(() => usuarios.id),
  mensagemId: uuid().unique(),
  respondidaEm: quando(),
  criadaEm: criadoEm(),
}, (t) => [index().on(t.chamadoId, t.tipo, t.estado)]);

// ───────────────────────────── Conversas ─────────────────────────────

export const conversas = pgTable('conversas', {
  id: id(),
  /** Conversa do atendimento; nula para mensagens pelo perfil antes do chamado. */
  chamadoId: uuid().unique().references(() => chamados.id, { onDelete: 'cascade' }),
  criadaEm: criadoEm(),
});

export const participantesConversa = pgTable('participantes_conversa', {
  conversaId: uuid().notNull().references(() => conversas.id, { onDelete: 'cascade' }),
  usuarioId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  ultimaLeituraEm: quando(),
  silenciadaAte: quando(),
}, (t) => [primaryKey({ columns: [t.conversaId, t.usuarioId] }), index().on(t.usuarioId)]);

export const mensagens = pgTable('mensagens', {
  id: id(),
  conversaId: uuid().notNull().references(() => conversas.id, { onDelete: 'cascade' }),
  autorId: uuid().references(() => usuarios.id), // nulo = mensagem automática
  tipo: tipoMensagem().notNull(),
  conteudo: text(),
  midiaUrl: text(),
  lat: doublePrecision(),
  lng: doublePrecision(),
  removidaEm: quando(),
  criadaEm: criadoEm(),
}, (t) => [index().on(t.conversaId, t.criadaEm)]);

// ───────────────────────────── Localização ─────────────────────────────

/** Período de compartilhamento por participante. Encerrado ao concluir, cancelar,
 *  interromper ou por abandono. */
export const compartilhamentosLocalizacao = pgTable('compartilhamentos_localizacao', {
  id: id(),
  chamadoId: uuid().notNull().references(() => chamados.id, { onDelete: 'cascade' }),
  usuarioId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  papel: papelRastreamento().notNull(),
  iniciadoEm: criadoEm(),
  pausadoEm: quando(),
  encerradoEm: quando(),
  motivoEncerramento: text(),
}, (t) => [
  index().on(t.chamadoId, t.encerradoEm),
  uniqueIndex('compartilhamento_aberto_unico').on(t.chamadoId, t.usuarioId).where(sql`${t.encerradoEm} is null`),
]);

/** Última posição por participante (sobrescrita a cada envio). Retenção limitada. */
export const posicoesAtuais = pgTable('posicoes_atuais', {
  chamadoId: uuid().notNull().references(() => chamados.id, { onDelete: 'cascade' }),
  usuarioId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  lat: doublePrecision().notNull(),
  lng: doublePrecision().notNull(),
  precisaoM: doublePrecision(),
  rumo: doublePrecision(),
  velocidadeMs: doublePrecision(),
  capturadaEm: quando().notNull(),
  recebidaEm: criadoEm(),
}, (t) => [primaryKey({ columns: [t.chamadoId, t.usuarioId] })]);

/** Todo acesso de administrador a localização é justificado e registrado. */
export const acessosAdminLocalizacao = pgTable('acessos_admin_localizacao', {
  id: id(),
  adminId: uuid().notNull().references(() => usuarios.id),
  chamadoId: uuid().notNull().references(() => chamados.id),
  justificativa: text().notNull(),
  criadoEm: criadoEm(),
});

// ───────────────────────────── Qualidade ─────────────────────────────

/** Só para chamado concluído; uma por autor por chamado. */
export const avaliacoes = pgTable('avaliacoes', {
  id: id(),
  chamadoId: uuid().notNull().references(() => chamados.id),
  autorId: uuid().notNull().references(() => usuarios.id),
  prestadorId: uuid().references(() => prestadores.id),
  nota: integer().notNull(), // 1 a 5
  comentario: text(),
  resposta: text(),
  ocultadaEm: quando(),
  criadaEm: criadoEm(),
}, (t) => [uniqueIndex().on(t.chamadoId, t.autorId), index().on(t.prestadorId, t.criadaEm)]);

export const denuncias = pgTable('denuncias', {
  id: id(),
  autorId: uuid().notNull().references(() => usuarios.id),
  alvo: alvoDenuncia().notNull(),
  alvoId: uuid().notNull(),
  motivo: text().notNull(),
  detalhes: text(),
  estado: estadoModeracao().notNull().default('ABERTA'),
  resolvidaPor: uuid().references(() => usuarios.id),
  resolvidaEm: quando(),
  criadaEm: criadoEm(),
}, (t) => [index().on(t.estado, t.criadaEm), index().on(t.alvo, t.alvoId)]);

export const bloqueios = pgTable('bloqueios', {
  bloqueadorId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  bloqueadoId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  criadoEm: criadoEm(),
}, (t) => [primaryKey({ columns: [t.bloqueadorId, t.bloqueadoId] })]);

export const contestacoes = pgTable('contestacoes', {
  id: id(),
  chamadoId: uuid().notNull().references(() => chamados.id),
  autorId: uuid().notNull().references(() => usuarios.id),
  motivo: text().notNull(),
  estado: estadoModeracao().notNull().default('ABERTA'),
  resolucao: text(),
  resolvidaEm: quando(),
  criadaEm: criadoEm(),
});

// ───────────────────────────── Notificações ─────────────────────────────

export const dispositivos = pgTable('dispositivos', {
  id: id(),
  usuarioId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  plataforma: plataforma().notNull(),
  /** Token FCM/APNs ou endpoint Web Push. */
  token: text().notNull().unique(),
  /** Chaves p256dh/auth da inscrição Web Push. */
  inscricaoWeb: jsonb(),
  ultimoUsoEm: criadoEm(),
  invalidadoEm: quando(),
});

/** Central de notificações. O push é só um aviso; o registro fica aqui. */
export const notificacoes = pgTable('notificacoes', {
  id: id(),
  usuarioId: uuid().notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  tipo: text().notNull(),
  titulo: text().notNull(),
  corpo: text().notNull(),
  chamadoId: uuid().references(() => chamados.id, { onDelete: 'set null' }),
  dados: jsonb(),
  lidaEm: quando(),
  criadaEm: criadoEm(),
}, (t) => [index().on(t.usuarioId, t.lidaEm, t.criadaEm)]);

// ───────────────────────────── Comercial ─────────────────────────────

export const planos = pgTable('planos', {
  id: id(),
  nome: text().notNull(),
  precoCentavos: integer().notNull(),
  beneficios: jsonb().notNull(),
  ativo: boolean().notNull().default(true),
});

/** Contratar plano não gera avaliação positiva nem selo de verificação. */
export const assinaturas = pgTable('assinaturas', {
  id: id(),
  prestadorId: uuid().notNull().references(() => prestadores.id),
  planoId: uuid().notNull().references(() => planos.id),
  estado: estadoAssinatura().notNull().default('ATIVA'),
  inicioEm: criadoEm(),
  fimEm: quando(),
});

/** Destaque pago — sempre exibido com identificação de publicidade. */
export const destaques = pgTable('destaques', {
  id: id(),
  prestadorId: uuid().notNull().references(() => prestadores.id),
  cidadeId: uuid().references(() => cidades.id),
  inicioEm: quando().notNull(),
  fimEm: quando().notNull(),
});

// ───────────────────────────── Administração ─────────────────────────────

/** Prazos e regras configuráveis pelo painel administrativo. */
export const configuracoes = pgTable('configuracoes', {
  chave: text().primaryKey(),
  valor: jsonb().notNull(),
  atualizadoEm: criadoEm().$onUpdate(() => new Date()),
});

export const registrosAdmin = pgTable('registros_admin', {
  id: id(),
  adminId: uuid().notNull().references(() => usuarios.id),
  acao: text().notNull(),
  alvo: text().notNull(),
  alvoId: text().notNull(),
  dados: jsonb(),
  criadoEm: criadoEm(),
}, (t) => [index().on(t.alvo, t.alvoId)]);
