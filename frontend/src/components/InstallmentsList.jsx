import { formatBRL } from "../utils.js";

export default function InstallmentsList({ installments }) {
  if (!installments.length) {
    return (
      <div className="empty-state">
        <h2>Nenhum parcelamento encontrado</h2>
        <p>Compras parceladas no cartão vão aparecer aqui automaticamente.</p>
      </div>
    );
  }

  return (
    <div className="installments-grid">
      {installments.map((p, i) => {
        const pct = Math.min(Math.round((p.parcelaAtual / p.totalParcelas) * 100), 100);
        return (
          <div className={`installment-row ${p.finalizado ? "finalizado" : ""}`} key={i}>
            <div className="top">
              <span className="desc">
                {p.descricao}
                {p.banco && <span className="bank-tag">{p.banco}</span>}
              </span>
              <span className="parcela-label">
                {p.finalizado ? "Finalizado" : `${p.parcelaAtual}/${p.totalParcelas}`}
              </span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="bottom">
              <span>{formatBRL(p.valorParcela)}/mês</span>
              <span>
                {p.finalizado
                  ? `total pago ${formatBRL(p.valorTotal)}`
                  : `restam ${formatBRL(p.restante)}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
