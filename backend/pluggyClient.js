import fetch from "node-fetch";

const PLUGGY_BASE = "https://api.pluggy.ai";

let cachedApiKey = null;
let cachedApiKeyExpiresAt = 0;

/**
 * Troca client_id + client_secret por uma API Key da Pluggy.
 * A API Key dura ~2h, então guardamos em memória e renovamos só quando expira.
 */
async function getApiKey() {
  const now = Date.now();
  if (cachedApiKey && now < cachedApiKeyExpiresAt) {
    return cachedApiKey;
  }

  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET não configurados. Copie backend/.env.example para backend/.env e preencha."
    );
  }

  const res = await fetch(`${PLUGGY_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao autenticar na Pluggy (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedApiKey = data.apiKey;
  // renova 5 min antes de expirar de verdade
  cachedApiKeyExpiresAt = now + 1000 * 60 * 110;
  return cachedApiKey;
}

async function pluggyRequest(path, { method = "GET", body } = {}) {
  const apiKey = await getApiKey();
  const res = await fetch(`${PLUGGY_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pluggy ${method} ${path} falhou (${res.status}): ${text}`);
  }

  return res.json();
}

/** Gera um connect_token de uso único pro widget de conexão bancária no frontend. */
export async function createConnectToken(itemId) {
  const apiKey = await getApiKey();
  const res = await fetch(`${PLUGGY_BASE}/connect_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify(itemId ? { itemId } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao criar connect_token (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * A Pluggy retorna 401 em GET /items (confirmado em testes manuais).
 * O acesso a um Item específico (GET /items/{itemId}) funciona normalmente,
 * então guardamos os IDs conhecidos em PLUGGY_ITEM_IDS (.env) e consultamos
 * cada um individualmente, em vez de tentar listar todos pela API.
 */
export function getConfiguredItemIds() {
  const raw = process.env.PLUGGY_ITEM_IDS || "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** Substitui o antigo listItems(): busca cada item configurado individualmente. */
export async function listItems() {
  const itemIds = getConfiguredItemIds();
  if (!itemIds.length) {
    throw new Error(
      "Nenhum PLUGGY_ITEM_IDS configurado no .env. Adicione os itemIds separados por vírgula."
    );
  }
  const results = await Promise.all(itemIds.map((id) => getItem(id)));
  return { results };
}

export function getItem(itemId) {
  return pluggyRequest(`/items/${itemId}`);
}

export function listAccounts(itemId) {
  const query = itemId ? `?itemId=${itemId}` : "";
  return pluggyRequest(`/accounts${query}`);
}

/**
 * O endpoint antigo GET /transactions foi descontinuado (410 ENDPOINT_DEPRECATED).
 * Usa GET /v2/transactions com paginação por cursor, percorrendo "next" até acabar.
 * A API atual não aceita mais "pageSize"/"limit" NEM "from"/"to" como parâmetro
 * (testado em produção: retorna 400 "property X should not exist") — então
 * sempre busca tudo (até maxPages) e quem chama filtra por data no próprio código.
 */
export async function listTransactions(accountId, { maxPages = 10 } = {}) {
  let allResults = [];
  const cursorParams = new URLSearchParams({ accountId });

  let nextPath = `/v2/transactions?${cursorParams.toString()}`;
  let pages = 0;

  while (nextPath && pages < maxPages) {
    const data = await pluggyRequest(nextPath);
    allResults = allResults.concat(data.results || []);
    pages++;

    if (data.next) {
      // "next" pode vir como querystring solta ou URL completa; normaliza pra path relativo.
      nextPath = data.next.startsWith("http")
        ? data.next.replace(PLUGGY_BASE, "")
        : data.next.startsWith("/v2/transactions")
        ? data.next
        : `/v2/transactions${data.next}`;
    } else {
      nextPath = null;
    }
  }

  return { results: allResults };
}

export function listBills(accountId) {
  return pluggyRequest(`/bills?accountId=${accountId}`);
}

/**
 * Calcula a fatura "em aberto" (ainda fechando) de um cartão: soma das compras
 * feitas desde o fechamento da última fatura já fechada até hoje. A Pluggy só
 * expõe faturas já FECHADAS via /bills (todas aparecem como já pagas), então
 * o valor que ainda está "em formação" precisa ser somado a partir das
 * transações — e tem que ignorar transações com data futura (parcelas futuras
 * que a Pluggy já lista adiantado com a data de cobrança prevista).
 */
export async function getCurrentInvoice(accountId) {
  const billsData = await listBills(accountId);
  const bills = (billsData.results || [])
    .slice()
    .sort((a, b) => new Date(b.billClosingDate) - new Date(a.billClosingDate));
  const ultimaFechada = bills[0] || null;

  let cicloInicio = null;
  if (ultimaFechada?.billClosingDate) {
    cicloInicio = new Date(ultimaFechada.billClosingDate);
    cicloInicio.setDate(cicloInicio.getDate() + 1);
  }

  const txData = await listTransactions(accountId);
  const hoje = new Date();
  const transacoesCiclo = (txData.results || []).filter((t) => {
    const d = new Date(t.date);
    if (d > hoje) return false; // parcela futura, ainda não entrou na fatura
    if (cicloInicio && d < cicloInicio) return false;
    return true;
  });

  let valor = 0;
  for (const t of transacoesCiclo) {
    if (t.type === "CREDIT") continue; // pagamento de fatura, não é compra
    valor += Math.abs(t.amount);
  }

  return {
    valor: Math.round(valor * 100) / 100,
    ultimaFaturaFechamento: ultimaFechada?.billClosingDate || null,
    ultimaFaturaVencimento: ultimaFechada?.dueDate || null,
  };
}
