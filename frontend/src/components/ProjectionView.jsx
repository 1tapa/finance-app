import { useState } from "react";
import { formatBRL } from "../utils.js";

const TIPO_LABEL = {
  "conta-fixa": "Fixa",
  carne: "Carnê",
  cartao: "Cartão",
};

export default function ProjectionView({ meses }) {
  const [aberto, setAberto] = useState(null);

  if (!meses.length) {
    return (
      <div className="empty-state small">
        <p>Sem dados suficientes para projetar ainda.</p>
      </div>
    );
  }

  return (
    <div className="projection-months">
      {meses.map((m) => (
        <div className="projection-month" key={m.mes}>
          <div
            className="projection-month-head"
            onClick={() => setAberto(aberto === m.mes ? null : m.mes)}
          >
            <span className="label">{m.label}</span>
            <span className="total">{formatBRL(m.total)}</span>
          </div>
          {aberto === m.mes &&
            (m.itens.length > 0 ? (
              <ul className="projection-items">
                {m.itens.map((it, i) => (
                  <li key={i}>
                    <span>
                      <span className={`tag tag-${it.tipo}`}>{TIPO_LABEL[it.tipo] || it.tipo}</span>
                      {it.descricao}
                      {it.banco ? ` · ${it.banco}` : ""}
                    </span>
                    <span>{formatBRL(it.valor)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint" style={{ padding: "0 15px 13px", margin: 0 }}>
                Nenhum compromisso previsto.
              </p>
            ))}
        </div>
      ))}
    </div>
  );
}
