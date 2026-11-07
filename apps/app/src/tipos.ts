import type { EstadoChamado } from '@vrum/shared';

export interface Categoria { id: string; slug: string; nome: string; fluxo: 'IMEDIATO' | 'AGENDADO' | 'TRIAGEM'; exemplos: string[]; exigeDadosGuincho: boolean }

export interface Vinculo {
  membroId: string; funcao: 'DONO' | 'GESTOR' | 'PROFISSIONAL'; atende: boolean; disponivel: boolean;
  disponivelAte: string | null; chamadoAtualId: string | null;
  prestador: { id: string; nomeComercial: string; usuarioNome: string; tipo: 'AUTONOMO' | 'EMPRESA'; fotoUrl: string | null; verificado: boolean };
}

export interface Eu {
  id: string; nome: string; email: string; telefone: string; fotoUrl: string | null; cidadeId: string | null; ehAdmin: boolean;
  localManualLat: number | null; localManualLng: number | null; vinculos: Vinculo[];
}

export interface Veiculo {
  id: string; tipo: string; marca: string; modelo: string; ano: number; versao: string | null; combustivel: string | null;
  cor: string | null; placa: string | null; fotoUrl: string | null; observacoes: string | null; principal: boolean;
}

export interface PrestadorProximo {
  id: string; nomeComercial: string; usuarioNome: string; fotoUrl: string | null; modalidade: string;
  notaMedia: number | null; totalAvaliacoes: number; verificado: boolean; disponivel: boolean;
  posicao: { lat: number; lng: number }; distanciaKm: number;
}

export interface Publicacao {
  id: string; descricao: string | null; criadaEm: string; categoriaId: string | null;
  prestador: { id: string; nomeComercial: string; usuarioNome: string; fotoUrl: string | null; verificado: boolean };
  curtidas: number; comentarios: number; curti: boolean; salvei: boolean; segue: boolean; patrocinado: boolean;
  midias: { id: string; tipo: 'IMAGEM' | 'VIDEO'; url: string; miniaturaUrl: string | null }[];
}

export interface Chamado {
  id: string; estado: EstadoChamado; versao: number; motoristaId: string; prestadorId: string | null; responsavelId: string | null;
  modalidade: 'ESCOLHER_PROFISSIONAL' | 'BUSCAR_DISPONIVEIS'; descricao: string | null; categoriaId: string;
  pontoLat: number; pontoLng: number; pontoReferencia: string | null; etapaBusca: number;
  destinoEndereco: string | null; condicoesAcesso: string | null; veiculoSeMove: boolean | null;
  chegadaPrevistaEm: string | null; autoConcluirEm: string | null; criadoEm: string; motivoCancelamento: string | null;
}

export interface Condicao {
  id: string; tipo: 'VALOR_SERVICO' | 'TAXA_DESLOCAMENTO' | 'AVALIACAO_PRESENCIAL' | 'OUTRA';
  estado: 'PROPOSTA' | 'ACEITA' | 'RECUSADA' | 'SUBSTITUIDA'; valorCentavos: number | null; descricao: string | null; mensagemId: string | null;
}

export interface VisaoChamado {
  chamado: Chamado; papel: 'MOTORISTA' | 'PRESTADOR';
  veiculo: Veiculo | null; condicoes: Condicao[]; anexos: { id: string; tipo: string; url: string }[];
  historico: { id: string; evento: string; para: EstadoChamado; criadoEm: string }[];
}

export interface Mensagem {
  id: string; conversaId: string; autorId: string | null; tipo: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'LOCALIZACAO' | 'PROPOSTA' | 'SISTEMA';
  conteudo: string | null; midiaUrl?: string | null; lat?: number | null; lng?: number | null; criadaEm: string;
}

export interface ItemChamado {
  id: string; estado: EstadoChamado; criadoEm: string; descricao: string | null; pontoReferencia: string | null;
  categoria: { nome: string; slug: string }; veiculo: { marca: string; modelo: string; ano: number };
  prestador: { id: string; nomeComercial: string; fotoUrl: string | null } | null; responsavel?: string | null;
}
