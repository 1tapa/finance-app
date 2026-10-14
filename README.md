# Painel Financeiro — Open Finance

App pessoal mobile, conectado via **Pluggy** (Open Finance, regulado pelo Banco Central), que mostra saldos, cartões, parcelamentos e projeção dos próximos meses. Roda como um único link — sem instalar nada no computador.

## Como funciona

Um único servidor Node/Express serve tanto a API (que fala com a Pluggy) quanto o app React já compilado. Isso significa: um deploy, um link, aberto direto no navegador do celular (dá pra "Adicionar à tela de início" e vira um ícone de app).

As credenciais da Pluggy (`PLUGGY_CLIENT_SECRET`) ficam só nas variáveis de ambiente do servidor — nunca aparecem no código nem no navegador.

## Deploy no Render (gratuito, sem cartão)

1. **Crie uma conta em [render.com](https://render.com)** — pode entrar com GitHub.
2. Clique em **New +** → **Web Service**.
3. Conecte o repositório `finance-app` (o GitHub dele já está linkado nesse processo).
4. Preencha:
   - **Build Command**: `cd frontend && npm install && npm run build && cd ../backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: Free
5. Em **Environment**, adicione estas variáveis (copie os valores do seu `backend/.env` local, ou do Dashboard da Pluggy):
   - `PLUGGY_CLIENT_ID`
   - `PLUGGY_CLIENT_SECRET`
   - `PLUGGY_ITEM_IDS`
6. Clique em **Create Web Service**. Em ~2 minutos o Render te dá um link tipo `https://finance-app-xxxx.onrender.com`.
7. Abra esse link no celular → menu do navegador → **Adicionar à tela de início**. Fica com ícone igual um app.

No plano gratuito do Render, o servidor "dorme" depois de ~15 min sem uso e demora uns 30s pra acordar no primeiro acesso do dia — normal, sem custo.

## Rodando localmente (opcional, pra testar antes de publicar)

```
cd backend && npm install && cd ../frontend && npm install && npm run build
cd ../backend && npm start
```

Abra `http://localhost:3001`.

## O que o app faz

- Conecta qualquer banco brasileiro via widget oficial da Pluggy (botão "+" no topo)
- Resumo: patrimônio líquido, saldo em contas, fatura de cartões, salário, contas fixas, a receber
- Contas & Cartões: agrupados por banco, com visual de cartão de crédito (fatura, limite, % usado)
- Parcelamentos: detecta automaticamente parcelas de cartão via Open Finance + permite cadastrar parcelas de carnê/boleto manualmente
- Previsão: comprometimento dos próximos 6 meses (contas fixas + parcelas de cartão + carnê), com detalhe por mês
- Receitas & Contas: cadastro manual de salário, contas fixas e valores a receber

## Sobre custos

Pra uso pessoal (só suas contas), a Pluggy é **gratuita e sem prazo de expiração** — plano "Meu Pluggy". O Render gratuito também não tem custo. Total: R$ 0.
