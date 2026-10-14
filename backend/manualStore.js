import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "manual-data.json");

const COLECOES_PADRAO = {
  salario: [],
  contasFixas: [],
  receber: [],
  carne: [],
};

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(COLECOES_PADRAO, null, 2), "utf-8");
  }
}

function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return { ...COLECOES_PADRAO, ...JSON.parse(raw) };
  } catch {
    return { ...COLECOES_PADRAO };
  }
}

function writeAll(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function list(colecao) {
  const data = readAll();
  return data[colecao] || [];
}

export function create(colecao, item) {
  const data = readAll();
  if (!data[colecao]) data[colecao] = [];
  const novo = { id: randomUUID(), ...item };
  data[colecao].push(novo);
  writeAll(data);
  return novo;
}

export function update(colecao, id, patch) {
  const data = readAll();
  if (!data[colecao]) return null;
  const idx = data[colecao].findIndex((i) => i.id === id);
  if (idx === -1) return null;
  data[colecao][idx] = { ...data[colecao][idx], ...patch, id };
  writeAll(data);
  return data[colecao][idx];
}

export function remove(colecao, id) {
  const data = readAll();
  if (!data[colecao]) return;
  data[colecao] = data[colecao].filter((i) => i.id !== id);
  writeAll(data);
}
