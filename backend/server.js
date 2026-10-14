import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import {
  createConnectToken,
  getConfiguredItemIds,
  getItem,
  listAccounts,
  listTransactions,
  listBills,
  getCurrentInvoice,
} from "./pluggyClient.js";
import * as manualStore from "./manualStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

// ---- Conexão bancária (widget Pluggy Connect) ----

app.post("/api/connect-token", async (req, res) => {
  try {
    const { itemId } = req.body || {};
    const data = await createConnectToken(itemId);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/items", async (req, res) => {
  try {
    const itemIds = getConfiguredItemIds();
    const results = await Promise.all(itemIds.map((id) => getItem(id)));
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/items/:itemId", async (req, res) => {
  try {
    const data = await getItem(req.params.itemId);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Contas ----

app.get("/api/accounts", async (req, res) => {
  try {
    const { itemId } = req.query;
    const data = await listAccounts(itemId);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Bancos com suas contas e cartões agrupados.
 * A Pluggy identifica todo Item do Meu Pluggy com connector genérico
 * ("MeuPluggy"), então o nome do banco de cada grupo vem do nome da conta
 * corrente/poupança daquele item (ou, na falta dela, da primeira conta).
 *
 * IMPORTANTE: às vezes o mesmo banco acaba conectado mais de uma vez no Meu
 * Pluggy (dois "items" diferentes apontando pras mesmas contas/cartões —
 * mesmos IDs). Se não filtrarmos isso, saldo, fatura e parcelas aparecem
 * contados em dobro (ou divergentes, já que cada conexão duplicada pode ter
 * lido as transações em momentos diferentes). getBankGroups() dedupe por
 * accountId global, mantendo só a primeira ocorrência de cada conta.
 */
let bankGroupsCache = null;
let bankGroupsCacheAt = 0;

async function getBankGroups({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && bankGroupsCache && now - bankGroupsCacheAt < 30_000) {
    return bankGroupsCache;
  }

  const itemIds = getConfiguredItemIds();
  const seenAccountIds = new Set();
  const grupos = [];

  for (const itemId of itemIds) {
    const [item, accountsData] = await Promise.all([getItem(itemId), listAccounts(itemId)]);
    const accounts = (accountsData.results || []).filter((a) => {
      if (seenAccountIds.has(a.id)) return false;
      seenAccountIds.add(a.id);
      return true;
    });

    // Se todas as contas desse item já tinham aparecido num item anterior,
    // essa conexão inteira é uma duplicata — pula o grupo.
    if (!accounts.length) continue;

    const contas = accounts.filter((a) => a.type === "BANK");
    const cartoesBrutos = accounts.filter((a) => a.type === "CREDIT");

    // Para cada cartão, calcula a fatura "em aberto" (ainda fechando) de verdade —
    // ver getCurrentInvoice(). Se der erro num cartão isolado, não derruba o resto.
    const cartoes = await Promise.all(
      cartoesBrutos.map(async (c) => {
        try {
          const atual = await getCurrentInvoice(c.id);
          return { ...c, faturaAtual: atual.valor, faturaAtualInfo: atual };
        } catch (err) {
          console.error("Falha ao calcular fatura atual de", c.id, err.message);
          return { ...c, faturaAtual: null, faturaAtualInfo: null };
        }
      })
    );

    const nomeBanco =
      contas[0]?.name || cartoes[0]?.name || item?.connector?.name || "Banco";

    grupos.push({
      itemId,
      banco: nomeBanco,
      status: item.status,
      executionStatus: item.executionStatus,
      lastUpdatedAt: item.lastUpdatedAt,
      contas,
      cartoes,
    });
  }

  bankGroupsCache = grupos;
  bankGroupsCacheAt = now;
  return grupos;
}

app.get("/api/bancos", async (req, res) => {
  try {
    const grupos = await getBankGroups({ fresh: req.query.fresh === "1" });
    res.json(grupos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** Soma saldos de contas/cartões + totais de renda e contas fixas, pro topo do dashboard. */
app.get("/api/resumo", async (req, res) => {
  try {
    const grupos = await getBankGroups();
    let saldoContas = 0;
    let saldoCartoes = 0; // total comprometido no cartão (inclui parcelas futuras) — usado só pro patrimônio líquido
    let faturaAtualTotal = 0; // soma das faturas "em formação" de cada cartão — o que mostra pro usuário

    for (const grupo of grupos) {
      for (const acc of grupo.contas) saldoContas += acc.balance || 0;
      for (const acc of grupo.cartoes) {
        saldoCartoes += acc.balance || 0;
        faturaAtualTotal += acc.faturaAtual ?? Math.abs(acc.balance || 0);
      }
    }

    const salario = manualStore
      .list("salario")
      .reduce((soma, i) => soma + (Number(i.valor) || 0), 0);

    const contasFixas = manualStore
      .list("contasFixas")
      .filter((f) => f.ativa !== false)
      .reduce((soma, i) => soma + (Number(i.valor) || 0), 0);

    const receberPendente = manualStore
      .list("receber")
      .filter((r) => !r.recebido)
      .reduce((soma, i) => soma + (Number(i.valor) || 0), 0);

    res.json({
      saldoContas: round2(saldoContas),
      saldoCartoes: round2(saldoCartoes),
      faturaAtualTotal: round2(faturaAtualTotal),
      patrimonio: round2(saldoContas - saldoCartoes),
      salario: round2(salario),
      contasFixas: round2(contasFixas),
      receberPendente: round2(receberPendente),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Transações ----

app.get("/api/accounts/:accountId/transactions", async (req, res) => {
  try {
    // A API da Pluggy não aceita mais "from"/"to" como query param — filtra aqui.
    const { from, to } = req.query;
    const data = await listTransactions(req.params.accountId);
    let results = data.results || [];
    if (from) results = results.filter((t) => new Date(t.date) >= new Date(from));
    if (to) results = results.filter((t) => new Date(t.date) <= new Date(to));
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// ---- Parcelamentos de cartão (derivados de transações via Open Finance) ----

/**
 * A Nubank (e outros bancos) colocam o número da parcela dentro da própria
 * descrição da transação (ex: "JIM.COM* 123 9/10"). Isso muda a cada parcela,
 * então remover esse sufixo é essencial pra conseguir juntar as 10 parcelas
 * de uma mesma compra num grupo só — sem isso, cada parcela vira "uma compra"
 * diferente.
 */
function stripInstallmentSuffix(desc) {
  return (desc || "").replace(/\s*\d{1,2}\/\d{1,2}\s*$/, "").trim();
}

async function computeInstallmentsForAccount(accountId) {
  const data = await listTransactions(accountId);
  const transactions = data.results || [];

  const parceladas = transactions.filter(
    (t) =>
      t.creditCardMetadata &&
      t.creditCardMetadata.totalInstallments &&
      t.creditCardMetadata.totalInstallments > 1 &&
      t.type !== "CREDIT"
  );

  const grupos = {};
  for (const t of parceladas) {
    const meta = t.creditCardMetadata;
    const descricaoLimpa = stripInstallmentSuffix(t.description);
    // NÃO inclui billId na chave: cada parcela pertence a uma fatura/mês
    // diferente por natureza, então usar billId quebraria o agrupamento.
    const key = [descricaoLimpa, meta.purchaseDate, meta.totalInstallments].join("|");

    if (!grupos[key]) {
      grupos[key] = {
        descricao: descricaoLimpa,
        categoria: t.category,
        totalParcelas: meta.totalInstallments,
        valorParcela: Math.abs(t.amount),
        purchaseDate: meta.purchaseDate,
        parcelasVistas: [],
      };
    }
    grupos[key].parcelasVistas.push({
      numero: meta.installmentNumber,
      data: t.date,
    });
  }

  const hoje = new Date();

  return Object.values(grupos).map((g) => {
    // A Pluggy lista TODAS as parcelas de uma vez, incluindo as futuras (com
    // data prevista de cobrança). "Parcela atual" é a última que já venceu —
    // nunca uma parcela com data futura, senão a compra apareceria como
    // "quitada" no dia em que foi feita.
    const jaFaturadas = g.parcelasVistas
      .filter((p) => new Date(p.data) <= hoje)
      .map((p) => p.numero);
    const parcelaAtual = jaFaturadas.length ? Math.max(...jaFaturadas) : 0;
    const restantes = Math.max(g.totalParcelas - parcelaAtual, 0);
    return {
      descricao: g.descricao,
      categoria: g.categoria,
      valorParcela: round2(g.valorParcela),
      parcelaAtual,
      totalParcelas: g.totalParcelas,
      parcelasRestantes: restantes,
      restante: round2(restantes * g.valorParcela),
      valorTotal: round2(g.totalParcelas * g.valorParcela),
      purchaseDate: g.purchaseDate,
      finalizado: parcelaAtual >= g.totalParcelas,
    };
  });
}

app.get("/api/accounts/:accountId/installments", async (req, res) => {
  try {
    const resultado = await computeInstallmentsForAccount(req.params.accountId);
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Parcelamentos de cartão de TODOS os bancos/cartões conectados, já identificados
 * por banco. Usa getBankGroups() (já deduplicado por conta) — sem isso, um banco
 * conectado duas vezes faz cada parcela aparecer repetida na lista.
 */
app.get("/api/parcelamentos", async (req, res) => {
  try {
    const grupos = await getBankGroups();
    const resultado = [];

    for (const grupo of grupos) {
      for (const cartao of grupo.cartoes) {
        const parcelas = await computeInstallmentsForAccount(cartao.id);
        for (const g of parcelas) {
          resultado.push({
            ...g,
            banco: cartao.marketingName || cartao.name,
            contaId: cartao.id,
          });
        }
      }
    }

    resultado.sort((a, b) => (a.finalizado === b.finalizado ? 0 : a.finalizado ? 1 : -1));
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Faturas de cartão ----

app.get("/api/accounts/:accountId/bills", async (req, res) => {
  try {
    const data = await listBills(req.params.accountId);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Dados manuais (não vêm do Open Finance) ----

const COLECOES = {
  salario: "salario",
  "contas-fixas": "contasFixas",
  receber: "receber",
  carne: "carne",
};

for (const [rota, chave] of Object.entries(COLECOES)) {
  app.get(`/api/${rota}`, (req, res) => {
    res.json(manualStore.list(chave));
  });

  app.post(`/api/${rota}`, (req, res) => {
    const novo = manualStore.create(chave, req.body || {});
    res.status(201).json(novo);
  });

  app.put(`/api/${rota}/:id`, (req, res) => {
    const atualizado = manualStore.update(chave, req.params.id, req.body || {});
    if (!atualizado) return res.status(404).json({ error: "Registro não encontrado" });
    res.json(atualizado);
  });

  app.delete(`/api/${rota}/:id`, (req, res) => {
    manualStore.remove(chave, req.params.id);
    res.status(204).end();
  });
}

// ---- Projeção futura (comprometimento dos próximos meses) ----

function proximosMeses(n) {
  const meses = [];
  const agora = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    meses.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return meses;
}

app.get("/api/projecao", async (req, res) => {
  try {
    const numMeses = Math.min(Math.max(Number(req.query.meses) || 6, 1), 12);
    const meses = proximosMeses(numMeses);
    const acumulado = Object.fromEntries(meses.map((m) => [m.key, { total: 0, itens: [] }]));

    const adicionar = (mesIndex, valor, item) => {
      if (mesIndex < 0 || mesIndex >= meses.length) return;
      const key = meses[mesIndex].key;
      acumulado[key].total += valor;
      acumulado[key].itens.push(item);
    };

    for (const f of manualStore.list("contasFixas")) {
      if (f.ativa === false) continue;
      const valor = Number(f.valor) || 0;
      for (let i = 0; i < meses.length; i++) {
        adicionar(i, valor, { tipo: "conta-fixa", descricao: f.descricao, valor });
      }
    }

    for (const c of manualStore.list("carne")) {
      const restantes = Math.max((Number(c.totalParcelas) || 0) - (Number(c.parcelaAtual) || 0), 0);
      const valor = Number(c.valorParcela) || 0;
      for (let i = 0; i < restantes; i++) {
        adicionar(i, valor, { tipo: "carne", descricao: c.descricao, valor });
      }
    }

    const grupos = await getBankGroups();
    for (const grupo of grupos) {
      for (const cartao of grupo.cartoes) {
        const parcelas = await computeInstallmentsForAccount(cartao.id);
        for (const g of parcelas) {
          for (let i = 0; i < g.parcelasRestantes; i++) {
            adicionar(i, g.valorParcela, {
              tipo: "cartao",
              banco: cartao.marketingName || cartao.name,
              descricao: g.descricao,
              valor: g.valorParcela,
            });
          }
        }
      }
    }

    res.json({
      meses: meses.map((m) => ({
        mes: m.key,
        label: m.label,
        total: round2(acumulado[m.key].total),
        itens: acumulado[m.key].itens,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Serve o frontend já compilado (um único serviço = um único link) ----
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
