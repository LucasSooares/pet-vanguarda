import {
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Package,
  Scissors,
  Settings,
  ShoppingBag,
  Users,
  type LucideIcon,
} from "lucide-react"

export type ItemNav = { href: string; rotulo: string; icone: LucideIcon; somenteAdmin?: boolean }

export const NAVEGACAO: ItemNav[] = [
  { href: "/", rotulo: "Dashboard", icone: LayoutDashboard },
  { href: "/agenda", rotulo: "Agenda", icone: CalendarDays },
  { href: "/agendamentos", rotulo: "Agendamentos", icone: ClipboardList },
  { href: "/pedidos", rotulo: "Pedidos", icone: ShoppingBag },
  { href: "/clientes", rotulo: "Clientes e pets", icone: Users },
  { href: "/produtos", rotulo: "Produtos", icone: Package, somenteAdmin: true },
  { href: "/estoque", rotulo: "Estoque", icone: Boxes, somenteAdmin: true },
  { href: "/servicos", rotulo: "Serviços e preços", icone: Scissors, somenteAdmin: true },
  { href: "/relatorios", rotulo: "Relatórios", icone: BarChart3, somenteAdmin: true },
  { href: "/configuracoes", rotulo: "Configurações", icone: Settings, somenteAdmin: true },
]
