export type AlunoStatus = "ativo" | "inativo";
export type AulaStatus = "pendente" | "paga";
export type AulaOrigem = "checkin" | "manual" | "credito";
export type FormaPagamento = "pix" | "dinheiro" | "cartao" | "outro";

export interface Academia {
  id: string;
  nome: string;
  owner_id: string;
  valor_aula: number;
  mensagem_cobranca: string;
  limite_alerta_devedor: number;
  pin_checkin: string;
  created_at: string;
}

export interface Aluno {
  id: string;
  academia_id: string;
  nome: string;
  telefone: string | null;
  foto_url: string | null;
  observacoes: string | null;
  status: AlunoStatus;
  data_cadastro: string;
  aulas_credito: number;
  created_at: string;
  updated_at: string;
}

export interface Aula {
  id: string;
  aluno_id: string;
  academia_id: string;
  data_aula: string;
  hora_aula: string;
  valor: number;
  status: AulaStatus;
  pagamento_id: string | null;
  origem: AulaOrigem;
  created_at: string;
}

export interface Pagamento {
  id: string;
  aluno_id: string;
  academia_id: string;
  valor_recebido: number;
  qtd_aulas_pagas: number;
  qtd_aulas_credito: number;
  forma_pagamento: FormaPagamento;
  data_pagamento: string;
  observacao: string | null;
  created_at: string;
}

export interface AlunoComSaldo extends Aluno {
  aulas_pendentes: number;
  valor_aberto: number;
  ultimo_checkin: string | null;
  ultimo_pagamento: string | null;
}

export interface DashboardStats {
  total_a_receber: number;
  total_credito_passivo: number;
  alunos_devedores: number;
  checkins_hoje: number;
  checkins_semana: number;
  checkins_mes: number;
  recebido_hoje: number;
  recebido_semana: number;
  recebido_mes: number;
}
