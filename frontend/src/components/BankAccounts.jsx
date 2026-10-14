import { formatBRL, bankColor, initials } from "../utils.js";

function CreditCardVisual({ card }) {
  const used = Math.abs(card.balance || 0);
  const limit = card.creditData?.creditLimit ?? card.creditData?.creditLimitAmount ?? null;
  const pct = limit ? Math.min(Math.round((used / limit) * 100), 100) : null;

  return (
    <div className="credit-card-visual">
      <div className="cc-name">{card.marketingName || card.name}</div>
      {card.number && <div className="cc-number">•••• {card.number.slice(-4)}</div>}
      <div className="cc-used-label">Fatura atual</div>
      <div className="cc-used-value">{formatBRL(used)}</div>
      {limit != null && (
        <>
          <div className="cc-limit-row">
            <span>Limite {formatBRL(limit)}</span>
            <span>{pct}% usado</span>
          </div>
          <div className="cc-bar-track">
            <div className="cc-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

export default function BankAccounts({ bancos }) {
  if (!bancos.length) {
    return (
      <div className="empty-state">
        <h2>Nenhum banco conectado ainda</h2>
        <p>Toque em "+ Conectar banco" acima e autorize o acesso via Open Finance.</p>
      </div>
    );
  }

  return (
    <div className="bank-groups">
      {bancos.map((grupo) => {
        const color = bankColor(grupo.banco);
        return (
          <div className="bank-group" key={grupo.itemId}>
            <div className="bank-group-head">
              <div className="bank-avatar" style={{ background: color }}>
                {initials(grupo.banco)}
              </div>
              <h3>{grupo.banco}</h3>
              <span className={`status-pill ${grupo.status === "UPDATED" ? "ok" : "warn"}`}>
                {grupo.status || "—"}
              </span>
            </div>

            {grupo.contas.length > 0 && (
              <>
                <div className="subgroup-label">Contas</div>
                <div className="account-row-group">
                  {grupo.contas.map((c) => (
                    <div className="account-line" key={c.id}>
                      <span className="name">
                        {c.marketingName || c.name}
                        {c.number ? ` •••• ${c.number.slice(-4)}` : ""}
                      </span>
                      <span className={`balance ${(c.balance ?? 0) < 0 ? "negative" : "positive"}`}>
                        {formatBRL(c.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {grupo.cartoes.length > 0 && (
              <>
                <div className="subgroup-label">Cartões</div>
                <div className="account-row-group">
                  {grupo.cartoes.map((c) => (
                    <CreditCardVisual card={c} key={c.id} />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
