import { Wallet, CreditCard, PiggyBank, TrendingDown, Banknote, Clock } from "lucide-react";
import { formatBRL } from "../utils.js";

export default function SummaryCards({ resumo }) {
  const cards = [
    {
      icon: PiggyBank,
      tone: resumo.patrimonio < 0 ? "red" : "green",
      label: "Patrimônio líquido",
      value: resumo.patrimonio,
      wide: true,
    },
    { icon: Wallet, tone: "brand", label: "Saldo em contas", value: resumo.saldoContas },
    { icon: CreditCard, tone: "red", label: "Fatura atual", value: resumo.saldoCartoes },
    { icon: Banknote, tone: "green", label: "Salário mensal", value: resumo.salario },
    { icon: TrendingDown, tone: "amber", label: "Contas fixas/mês", value: resumo.contasFixas },
    { icon: Clock, tone: "brand", label: "A receber", value: resumo.receberPendente, wide: true },
  ];

  return (
    <div className="summary-grid">
      {cards.map((c, i) => {
        const Icon = c.icon;
        const cls = c.value < 0 ? "negative" : c.value > 0 ? "positive" : "neutral";
        return (
          <div className={`kpi-card ${c.wide ? "wide" : ""}`} key={i}>
            <div className={`icon-badge ${c.tone}`}>
              <Icon size={15} />
            </div>
            <span className="label">{c.label}</span>
            <span className={`value ${cls}`}>{formatBRL(c.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
