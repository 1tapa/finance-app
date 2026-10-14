import { useEffect, useState, useCallback } from "react";
import { PluggyConnect } from "pluggy-connect-sdk";
import { Plus, RefreshCw } from "lucide-react";
import TabBar from "./components/TabBar.jsx";
import SummaryCards from "./components/SummaryCards.jsx";
import BankAccounts from "./components/BankAccounts.jsx";
import InstallmentsList from "./components/InstallmentsList.jsx";
import ManualSection from "./components/ManualSection.jsx";
import ProjectionView from "./components/ProjectionView.jsx";

const API = "/api";

export default function App() {
  const [tab, setTab] = useState("resumo");
  const [bancos, setBancos] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [parcelamentosCartao, setParcelamentosCartao] = useState([]);
  const [projecao, setProjecao] = useState([]);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const loadTudo = useCallback(async () => {
    try {
      setError(null);
      const [bancosRes, resumoRes, parcRes, projRes] = await Promise.all([
        fetch(`${API}/bancos`),
        fetch(`${API}/resumo`),
        fetch(`${API}/parcelamentos`),
        fetch(`${API}/projecao?meses=6`),
      ]);
      const [bancosData, resumoData, parcData, projData] = await Promise.all([
        bancosRes.json(),
        resumoRes.json(),
        parcRes.json(),
        projRes.json(),
      ]);

      if (bancosData?.error) throw new Error(bancosData.error);
      setBancos(Array.isArray(bancosData) ? bancosData : []);
      setResumo(resumoData?.error ? null : resumoData);
      setParcelamentosCartao(Array.isArray(parcData) ? parcData : []);
      setProjecao(projData?.meses || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    loadTudo();
  }, [loadTudo]);

  const openConnectWidget = async () => {
    try {
      setConnecting(true);
      setError(null);
      const res = await fetch(`${API}/connect-token`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const pluggyConnect = new PluggyConnect({
        connectToken: data.accessToken,
        includeSandbox: false,
        onSuccess: () => {
          setConnecting(false);
          loadTudo();
        },
        onError: (err) => {
          setConnecting(false);
          setError(err?.message || "Erro ao conectar banco");
        },
        onClose: () => setConnecting(false),
      });
      pluggyConnect.init();
    } catch (err) {
      setConnecting(false);
      setError(err.message);
    }
  };

  const titulos = {
    resumo: "Resumo",
    contas: "Contas & Cartões",
    parcelamentos: "Parcelamentos",
    projecao: "Previsão",
    renda: "Receitas & Contas",
  };

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div>
          <p className="subtitle">Open Finance</p>
          <h1 className="title">{titulos[tab]}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="icon-btn" onClick={loadTudo} disabled={carregando}>
            <RefreshCw size={16} className={carregando ? "spin" : ""} />
          </button>
          <button className="icon-btn" onClick={openConnectWidget} disabled={connecting}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="content">
        {error && <div className="error-banner">{error}</div>}

        {tab === "resumo" && resumo && (
          <div className="section">
            <SummaryCards resumo={resumo} />
            <div className="section" style={{ marginTop: 22 }}>
              <div className="section-head">
                <h2>Próximo mês previsto</h2>
              </div>
              <ProjectionView meses={projecao.slice(0, 1)} />
            </div>
          </div>
        )}

        {tab === "contas" && <BankAccounts bancos={bancos} />}

        {tab === "parcelamentos" && (
          <>
            <div className="section">
              <p className="hint">Detectadas automaticamente via Open Finance, agrupadas por compra.</p>
              <InstallmentsList installments={parcelamentosCartao} />
            </div>
            <div className="section">
              <ManualSection
                title="Carnê / boleto"
                hint="Parcelas fora do cartão não vêm pelo Open Finance — cadastre aqui."
                route="carne"
                valueKey="valorParcela"
                valueSuffix="/mês"
                fields={[
                  { key: "descricao", label: "Descrição" },
                  { key: "valorParcela", label: "Valor da parcela", type: "number" },
                  { key: "totalParcelas", label: "Total de parcelas", type: "number" },
                  { key: "parcelaAtual", label: "Parcela atual", type: "number" },
                  { key: "categoria", label: "Categoria" },
                ]}
              />
            </div>
          </>
        )}

        {tab === "projecao" && (
          <div className="section">
            <p className="hint">
              Contas fixas + parcelamentos de cartão + carnê, mês a mês. Toque num mês para ver o detalhe.
            </p>
            <ProjectionView meses={projecao} />
          </div>
        )}

        {tab === "renda" && (
          <>
            <div className="section">
              <ManualSection
                title="Salário"
                hint="Sua(s) fonte(s) de renda fixa mensal."
                route="salario"
                valueKey="valor"
                valueSuffix="/mês"
                fields={[
                  { key: "descricao", label: "Descrição" },
                  { key: "valor", label: "Valor", type: "number" },
                  { key: "diaRecebimento", label: "Dia do recebimento", type: "number" },
                ]}
              />
            </div>
            <div className="section">
              <ManualSection
                title="Contas fixas"
                hint="Despesas recorrentes: aluguel, internet, streaming, etc."
                route="contas-fixas"
                valueKey="valor"
                valueSuffix="/mês"
                fields={[
                  { key: "descricao", label: "Descrição" },
                  { key: "valor", label: "Valor", type: "number" },
                  { key: "diaVencimento", label: "Dia do vencimento", type: "number" },
                  { key: "categoria", label: "Categoria" },
                ]}
              />
            </div>
            <div className="section">
              <ManualSection
                title="Extras a receber"
                hint="Valores avulsos esperados: freelance, reembolso, 13º, etc."
                route="receber"
                valueKey="valor"
                fields={[
                  { key: "descricao", label: "Descrição" },
                  { key: "valor", label: "Valor", type: "number" },
                  { key: "dataPrevista", label: "Data prevista", type: "date" },
                  { key: "recebido", label: "Recebido", type: "checkbox" },
                ]}
              />
            </div>
          </>
        )}
      </div>

      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}
