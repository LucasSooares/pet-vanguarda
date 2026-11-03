// Tipos do schema do Supabase (projeto Pets).
// Regere após mudar o banco:  npm run gen:types   (requer `npx supabase login`)
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Tabela<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Admin = { user_id: string; nome: string; papel: "admin" | "atendente"; created_at: string }

export type Agendamento = {
  id: string
  user_id: string | null
  servico: string
  pet: string | null
  data: string
  hora: string
  preco: number | null
  status: string
  created_at: string | null
  servico_id: string | null
  pet_id: string | null
  porte: string | null
  observacoes: string | null
  motivo_cancelamento: string | null
  origem: string
  cliente_nome: string | null
  cliente_telefone: string | null
  criado_por: string | null
  updated_at: string | null
}

export type Pet = {
  id: string
  user_id: string
  pet_key: string
  nome: string
  especie: string
  raca: string | null
  porte: string
  sexo: string
  nascimento: string
  foto: string
  observacoes: string
  created_at: string
}

export type Profile = {
  id: string
  nome: string | null
  telefone: string | null
  email: string | null
  created_at: string | null
  updated_at: string | null
}

export type Endereco = {
  id: string
  user_id: string
  apelido: string | null
  cep: string | null
  rua: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  principal: boolean | null
  created_at: string | null
}

export type Servico = {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  duracao_min: number
  created_at: string
  updated_at: string
}

export type Porte = "Pequeno" | "Médio" | "Grande"

export type ServicoPreco = { servico_id: string; porte: Porte; preco: number }

export type HorarioFuncionamento = {
  dia_semana: number
  abre: string
  fecha: string
  intervalo_min: number
  capacidade_por_slot: number
  pausa_inicio: string | null
  pausa_fim: string | null
  ativo: boolean
}

export type BloqueioAgenda = {
  id: string
  data: string
  hora_inicio: string | null
  hora_fim: string | null
  motivo: string
  tipo: "bloqueio" | "liberacao"
  capacidade: number | null
  criado_por: string | null
  created_at: string
}

export type Categoria = { id: string; nome: string; ativo: boolean; ordem: number; created_at: string }

export type Produto = {
  id: string
  nome: string
  descricao: string | null
  preco: number
  sku: string | null
  categoria_id: string | null
  imagem_url: string | null
  ativo: boolean
  estoque_atual: number
  estoque_minimo: number
  created_at: string
  updated_at: string
}

export type TipoMovimentacao = "entrada" | "saida" | "ajuste"

export type MovimentacaoEstoque = {
  id: number
  produto_id: string
  tipo: TipoMovimentacao
  quantidade: number
  saldo_anterior: number | null
  saldo_posterior: number | null
  motivo: string
  pedido_id: string | null
  user_id: string | null
  created_at: string
}

export type StatusPedido =
  | "Novo"
  | "Confirmado"
  | "Em separação"
  | "Pronto"
  | "Saiu para entrega"
  | "Entregue"
  | "Cancelado"

export type Pedido = {
  id: string
  numero: number
  user_id: string | null
  status: StatusPedido
  total: number
  forma_pagamento: string | null
  tipo_entrega: "retirada" | "entrega"
  endereco: string | null
  observacoes: string | null
  motivo_cancelamento: string | null
  cliente_nome: string | null
  cliente_telefone: string | null
  estoque_baixado: boolean
  created_at: string
  updated_at: string
}

export type PedidoItem = {
  id: string
  pedido_id: string
  produto_id: string | null
  nome: string
  preco_unit: number
  quantidade: number
}

export type PedidoStatusHistorico = {
  id: number
  pedido_id: string
  status_anterior: string | null
  status_novo: string
  observacao: string | null
  user_id: string | null
  created_at: string
}

export type AuditLog = {
  id: number
  user_id: string | null
  acao: string
  entidade: string
  entidade_id: string | null
  dados: Json | null
  created_at: string
}

export type Configuracoes = {
  id: number
  nome: string
  telefone: string | null
  whatsapp: string | null
  email: string | null
  endereco: string | null
  cnpj: string | null
  instagram: string | null
  mensagens: Record<string, string>
  updated_at: string
}

export type DashboardResumo = {
  agendamentos_hoje: number
  agendamentos_amanha: number
  pendentes: number
  pedidos_novos: number
  estoque_baixo: number
  fat_dia: number
  fat_semana: number
  fat_mes: number
}

export type SerieDiaria = {
  dia: string
  agendamentos: number
  cancelados: number
  faturamento_servicos: number
  pedidos: number
  faturamento_produtos: number
}

export type ClienteLinha = {
  user_id: string
  nome: string | null
  email: string | null
  telefone: string | null
  criado_em: string
  pets: number
  agendamentos: number
  pedidos: number
  ultimo_agendamento: string | null
}

export type ClienteResumo = { user_id: string; nome: string | null; email: string | null; telefone: string | null }

export type MembroEquipe = {
  user_id: string
  nome: string
  papel: "admin" | "atendente"
  email: string
  created_at: string
  ultimo_login: string | null
}

export type HorarioLivre = { hora: string; capacidade: number; ocupados: number; vagas: number }

export type GiroEstoque = {
  produto_id: string
  nome: string
  sku: string | null
  estoque_atual: number
  estoque_minimo: number
  entradas: number
  saidas: number
  giro: number | null
  dias_cobertura: number | null
}

export type Database = {
  public: {
    Tables: {
      admins: Tabela<Admin, Omit<Admin, "created_at"> & { created_at?: string }>
      agendamentos: Tabela<Agendamento, Partial<Agendamento> & Pick<Agendamento, "servico" | "data" | "hora">>
      pets: Tabela<Pet>
      profiles: Tabela<Profile>
      enderecos: Tabela<Endereco>
      servicos: Tabela<Servico, Partial<Servico> & Pick<Servico, "nome">>
      servicos_precos: Tabela<ServicoPreco, ServicoPreco>
      horarios_funcionamento: Tabela<HorarioFuncionamento, Partial<HorarioFuncionamento> & Pick<HorarioFuncionamento, "dia_semana">>
      bloqueios_agenda: Tabela<BloqueioAgenda, Partial<BloqueioAgenda> & Pick<BloqueioAgenda, "data">>
      categorias: Tabela<Categoria, Partial<Categoria> & Pick<Categoria, "nome">>
      produtos: Tabela<Produto, Partial<Produto> & Pick<Produto, "nome">>
      movimentacoes_estoque: Tabela<
        MovimentacaoEstoque,
        Pick<MovimentacaoEstoque, "produto_id" | "tipo" | "quantidade"> & Partial<MovimentacaoEstoque>
      >
      pedidos: Tabela<Pedido>
      pedido_itens: Tabela<PedidoItem, Omit<PedidoItem, "id"> & { id?: string }>
      pedido_status_historico: Tabela<PedidoStatusHistorico>
      audit_log: Tabela<AuditLog>
      configuracoes: Tabela<Configuracoes>
    }
    Views: Record<string, never>
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      is_staff: { Args: Record<string, never>; Returns: boolean }
      meu_papel: { Args: Record<string, never>; Returns: string | null }
      horarios_livres: { Args: { p_data: string; p_servico_id?: string }; Returns: HorarioLivre[] }
      dashboard_resumo: { Args: Record<string, never>; Returns: DashboardResumo }
      serie_diaria: { Args: { p_inicio: string; p_fim: string }; Returns: SerieDiaria[] }
      relatorio_servicos: {
        Args: { p_inicio: string; p_fim: string }
        Returns: { servico: string; quantidade: number; concluidos: number; cancelados: number; faltas: number; faturamento: number }[]
      }
      relatorio_produtos: {
        Args: { p_inicio: string; p_fim: string }
        Returns: { produto_id: string | null; nome: string; quantidade: number; faturamento: number }[]
      }
      relatorio_giro_estoque: { Args: { p_inicio: string; p_fim: string }; Returns: GiroEstoque[] }
      listar_clientes: { Args: { p_busca?: string | null }; Returns: ClienteLinha[] }
      clientes_resumo: { Args: { p_ids: string[] }; Returns: ClienteResumo[] }
      listar_equipe: { Args: Record<string, never>; Returns: MembroEquipe[] }
      adicionar_membro_equipe: { Args: { p_email: string; p_nome: string; p_papel: string }; Returns: string }
      criar_pedido: {
        Args: { p_itens: Json; p_forma_pagamento?: string; p_tipo_entrega?: string; p_endereco?: string; p_observacoes?: string }
        Returns: string
      }
      cancelar_meu_pedido: { Args: { p_pedido_id: string; p_motivo?: string }; Returns: undefined }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
