/**
 * Tokens da identidade visual do VRUM.
 * O verde é reservado para ações principais; alertas, erros e
 * cancelamentos têm cores próprias para não serem confundidos com ele.
 */
export const cores = {
  primaria: '#C6FF00', // verde elétrico — ações principais
  primariaTexto: '#101114', // texto sobre o verde
  fundo: '#101114', // preto grafite
  card: '#1C1E24', // cinza escuro
  cardElevado: '#262932',
  borda: '#2E313A',
  texto: '#F5F7FA', // branco gelo
  textoSecundario: '#A3A8B4',
  alerta: '#FFB020', // atenção (ex.: localização desatualizada)
  erro: '#FF4D4F',
  cancelado: '#FF6B6B',
  info: '#4DA3FF',
  sucesso: '#3DDC97', // conclusão — distinto do verde de ação
} as const;

export const raios = {
  pequeno: 10,
  medio: 16,
  grande: 24,
  pilula: 999,
} as const;

export const espacos = [0, 4, 8, 12, 16, 24, 32, 48] as const;

export type CorVrum = keyof typeof cores;
