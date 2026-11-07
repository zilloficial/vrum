/**
 * Catálogo inicial de serviços (seção 6). O administrador pode alterar
 * as categorias depois; esta lista alimenta apenas o seed do banco.
 */
export type TipoFluxo = 'IMEDIATO' | 'AGENDADO' | 'TRIAGEM';

export interface CategoriaInicial {
  slug: string;
  nome: string;
  fluxo: TipoFluxo;
  exemplos: string[];
  /** Exige destino, condições de acesso e se o veículo se movimenta. */
  exigeDadosGuincho?: boolean;
}

export const categoriasIniciais: CategoriaInicial[] = [
  { slug: 'guincho', nome: 'Guincho e remoção', fluxo: 'IMEDIATO', exigeDadosGuincho: true,
    exemplos: ['Pane', 'Acidente', 'Transporte', 'Veículo atolado', 'Sem condições de circular'] },
  { slug: 'pneus-rodas', nome: 'Pneus e rodas', fluxo: 'IMEDIATO',
    exemplos: ['Pneu furado', 'Troca de estepe', 'Pneu estourado', 'Roda danificada'] },
  { slug: 'bateria-partida', nome: 'Bateria e partida', fluxo: 'IMEDIATO',
    exemplos: ['Carga auxiliar', 'Troca de bateria', 'Carro não liga'] },
  { slug: 'mecanica', nome: 'Mecânica', fluxo: 'IMEDIATO',
    exemplos: ['Motor falhando', 'Veículo apagando', 'Barulho', 'Perda de potência'] },
  { slug: 'arrefecimento', nome: 'Arrefecimento', fluxo: 'IMEDIATO',
    exemplos: ['Superaquecimento', 'Vazamentos'] },
  { slug: 'autoeletrica', nome: 'Autoelétrica', fluxo: 'IMEDIATO',
    exemplos: ['Falhas elétricas', 'Alternador', 'Iluminação', 'Fusíveis'] },
  { slug: 'chaveiro', nome: 'Chaveiro automotivo', fluxo: 'IMEDIATO',
    exemplos: ['Chave perdida', 'Chave quebrada', 'Chave trancada dentro do veículo'] },
  { slug: 'combustivel', nome: 'Combustível', fluxo: 'IMEDIATO',
    exemplos: ['Pane seca', 'Suspeita de abastecimento incorreto'] },
  { slug: 'freios-direcao-suspensao', nome: 'Freios, direção e suspensão', fluxo: 'IMEDIATO',
    exemplos: ['Falhas', 'Direção pesada', 'Danos que impedem seguir viagem'] },
  { slug: 'cambio-embreagem', nome: 'Câmbio e embreagem', fluxo: 'IMEDIATO',
    exemplos: ['Marcha que não entra', 'Dificuldade para movimentar o carro'] },
  { slug: 'vidros-visibilidade', nome: 'Vidros e visibilidade', fluxo: 'IMEDIATO',
    exemplos: ['Vidro quebrado', 'Limpador com defeito'] },
  { slug: 'agendados', nome: 'Serviços agendados', fluxo: 'AGENDADO',
    exemplos: ['Revisão', 'Troca de óleo', 'Alinhamento', 'Ar-condicionado', 'Estética'] },
  { slug: 'nao-sei', nome: 'Não sei o problema', fluxo: 'TRIAGEM',
    exemplos: ['Descrição, fotos e áudio para orientar o encaminhamento'] },
];
