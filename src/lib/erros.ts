// Traduz erros do Postgres/Supabase para mensagens amigáveis.
// As funções/trigger do banco lançam mensagens com um CÓDIGO no início ("HORARIO_LOTADO: ...").
const CODIGOS: Record<string, string> = {
  HORARIO_LOTADO: "Esse horário já está lotado.",
  HORARIO_INDISPONIVEL: "Esse horário não está disponível (fechado, pausa ou bloqueado).",
  ESTOQUE_INSUFICIENTE: "Estoque insuficiente.",
  ESTOQUE_DIRETO: "O saldo só pode ser alterado por uma movimentação de estoque.",
  TRANSICAO_INVALIDA: "Essa mudança de status não é permitida.",
  PEDIDO_TRAVADO: "Os itens só podem ser alterados enquanto o pedido está como Novo.",
  ULTIMO_ADMIN: "Não é possível remover ou rebaixar o último admin.",
  USUARIO_NAO_ENCONTRADO: "Nenhum usuário com esse e-mail. Convide-o primeiro.",
  ACESSO_NEGADO: "Você não tem permissão para essa ação.",
}

type ErroLike = { message?: string; code?: string; details?: string } | null | undefined

export function mensagemErro(erro: unknown): string {
  const e = erro as ErroLike
  const msg = e?.message ?? (typeof erro === "string" ? erro : "")
  const codigo = msg.match(/^([A-Z_]{5,}):?/)?.[1]
  if (codigo && CODIGOS[codigo]) {
    const detalhe = msg.slice(codigo.length + 1).trim()
    return detalhe ? `${CODIGOS[codigo]} ${detalhe}` : CODIGOS[codigo]
  }
  if (e?.code === "42501" || /row-level security/i.test(msg)) return CODIGOS.ACESSO_NEGADO
  if (e?.code === "23505") return "Já existe um registro com esses dados (valor duplicado)."
  if (e?.code === "23514") return "Algum valor está fora do permitido."
  if (/Invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos."
  if (/Email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar."
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Sem conexão com o servidor. Tente novamente."
  return msg || "Ocorreu um erro inesperado."
}

/** Lança o erro do Supabase (para usar dentro de queryFn/mutationFn). */
export function ok<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}
