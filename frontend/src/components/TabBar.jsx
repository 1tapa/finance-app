import { LayoutGrid, Landmark, CreditCard, TrendingUp, Wallet } from "lucide-react";

export const TABS = [
  { id: "resumo", label: "Resumo", icon: LayoutGrid },
  { id: "contas", label: "Contas", icon: Landmark },
  { id: "parcelamentos", label: "Parcelas", icon: CreditCard },
  { id: "projecao", label: "Previsão", icon: TrendingUp },
  { id: "renda", label: "Receitas", icon: Wallet },
];

export default function TabBar({ tab, setTab }) {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <Icon size={20} strokeWidth={tab === t.id ? 2.4 : 1.8} />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
