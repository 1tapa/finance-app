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
 * A API atual não aceita mais "pageSize"/"limit" como parâmetro — cada página vem
 * com um tamanho fixo definido pela Pluggy (~500) e o "next" já traz o cursor pronto.
 */
export async function listTransactions(accountId, { from, to, maxPages = 10 } = {}) {
  let allResults = [];
  let cursorParams = new URLSearchParams({ accountId });
  if (from) cursorParams.set("from", from);
  if (to) cursorParams.set("to", to);

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
