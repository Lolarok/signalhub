# 📡 SignalHub — Live Crypto Intelligence Dashboard

Dashboard React per monitorare e analizzare crypto in tempo reale. Score 0-100 su ogni token, filtri per settore, analisi AI.

## 🚀 Come farlo partire

### Prerequisiti

- **Node.js** >= 18 ([download](https://nodejs.org/))
- **Git**

### Passo 1: Clona e installa

```bash
git clone https://github.com/Lolarok/signalhub.git
cd signalhub
npm install
```

### Passo 2: Avvia in development

```bash
npm run dev
```

Vedrai:
```
  VITE v6.x.x  ready in XXX ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://0.0.0.0:3000/
```

Apri **http://localhost:3000** nel browser.

### Passo 3: Build per produzione

```bash
npm run build
```

I file compilati saranno in `dist/`. Per testarli:

```bash
npm run preview
```

## ✨ Funzionalità

- **Live crypto ticker** — prezzi in tempo reale da CoinGecko
- **Score 0-100** — valutazione multi-fattore per ogni token
- **Filtri per settore** — DeFi, AI, L1, L2, RWA, Perps
- **Analisi AI** — pannello di analisi integrato
- **Auto-refresh** — aggiornamento automatico dei dati
- **Responsive** — funziona su mobile e desktop

## 📦 Dati

- Legge `curated.json` generato da [moltstreet-intelligence](https://github.com/Lolarok/moltstreet-intelligence)
- Fetch live da CoinGecko e DeFiLlama API
- Nessun backend necessario — tutto client-side

## 📦 Stack

- **React 18** + **TypeScript**
- **Vite 6** — build tool ultra-rapido
- **CSS** — dark mode nativo
- Deploy su **GitHub Pages**

## Struttura

```
signalhub/
├── src/
│   ├── App.tsx         ← componente principale
│   └── ...             ← moduli dashboard
├── public/
├── index.html
├── vite.config.ts
├── package.json
└── README.md
```

## Integrazione con MoltStreet Intelligence

Il flusso completo:

1. **moltstreet-intelligence** genera `curated.json` (dati analizzati)
2. **SignalHub** legge i dati e mostra la dashboard
3. GitHub Actions esegue lo scanner ogni giorno

Per generare i dati:
```bash
cd moltstreet-intelligence
python3 src/main.py --dashboard
# Copia dashboard/data.json in signalhub/public/curated.json
```
