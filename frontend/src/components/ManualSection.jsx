import { useEffect, useState, useCallback } from "react";
import { formatBRL } from "../utils.js";

const API = "/api";

function emptyForm(fields) {
  const obj = {};
  for (const f of fields) obj[f.key] = f.type === "checkbox" ? true : "";
  return obj;
}

function isMoneyField(key) {
  return key.toLowerCase().startsWith("valor");
}

export default function ManualSection({ title, hint, route, fields, valueKey, valueSuffix }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm(fields));
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/${route}`);
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }, [route]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      setLoading(true);
      const method = editingId ? "PUT" : "POST";
      const url = editingId ? `${API}/${route}/${editingId}` : `${API}/${route}`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Falha ao salvar registro");
      setForm(emptyForm(fields));
      setEditingId(null);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const editar = (item) => {
    setEditingId(item.id);
    setForm(
      Object.fromEntries(fields.map((f) => [f.key, item[f.key] ?? (f.type === "checkbox" ? true : "")]))
    );
    setShowForm(true);
  };

  const cancelar = () => {
    setEditingId(null);
    setForm(emptyForm(fields));
    setShowForm(false);
  };

  const remover = async (id) => {
    try {
      await fetch(`${API}/${route}/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const total = valueKey ? items.reduce((soma, i) => soma + (Number(i[valueKey]) || 0), 0) : null;
  const tituloField = fields.find((f) => f.key === "descricao") || fields[0];

  return (
    <div className="manual-section">
      <div className="section-head">
        <h2>{title}</h2>
        {total !== null && (
          <span className="total-tag">
            {formatBRL(total)}
            {valueSuffix ? ` ${valueSuffix}` : ""}
          </span>
        )}
      </div>
      {hint && <p className="hint">{hint}</p>}
      {error && <div className="error-banner">{error}</div>}

      {showForm ? (
        <form className="manual-form" onSubmit={submit}>
          {fields.map((f) => (
            <label key={f.key} className={`field ${f.type === "checkbox" ? "field-checkbox" : ""}`}>
              <span>{f.label}</span>
              {f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={!!form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
                />
              ) : (
                <input
                  type={f.type || "text"}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  step={f.type === "number" ? "0.01" : undefined}
                  value={form[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
            </label>
          ))}
          <div className="form-actions">
            <button className="primary" type="submit" disabled={loading}>
              {editingId ? "Salvar" : "Adicionar"}
            </button>
            <button type="button" className="ghost" onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button className="primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(true)}>
          + Adicionar
        </button>
      )}

      {items.length === 0 ? (
        <div className="empty-state small">
          <p>Nada cadastrado ainda.</p>
        </div>
      ) : (
        <div className="manual-list">
          {items.map((item) => (
            <div className="manual-item" key={item.id}>
              <div className="manual-item-top">
                <span className="title">{item[tituloField.key] || "—"}</span>
                {valueKey && <span className="value">{formatBRL(item[valueKey])}</span>}
              </div>
              <div className="manual-item-meta">
                {fields
                  .filter((f) => f.key !== tituloField.key && f.key !== valueKey)
                  .map((f) => (
                    <span key={f.key}>
                      {f.type === "checkbox"
                        ? `${f.label}: ${item[f.key] ? "Sim" : "Não"}`
                        : isMoneyField(f.key)
                        ? formatBRL(item[f.key])
                        : item[f.key]
                        ? `${f.label}: ${item[f.key]}`
                        : null}
                    </span>
                  ))}
              </div>
              <div className="row-actions">
                <button className="ghost" onClick={() => editar(item)}>
                  Editar
                </button>
                <button className="ghost" onClick={() => remover(item.id)}>
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
