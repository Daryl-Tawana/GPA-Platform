# ZARIP — Zimbabwe Agricultural Retained Income Platform

> **"How much income does the tobacco grower actually retain after all costs and deductions?"**

A static, client-side dashboard modelling net retained income for Zimbabwe smallholder tobacco growers. Built as an academic research tool for the IPEC climate risk and agricultural income research programme.

---

## Live Demo

Deploy to GitHub Pages — no server required.

---

## Project Structure

```
zarip-dashboard/
├── index.html              Main dashboard (all sections)
├── style.css               Stylesheet — earth-toned agricultural theme
├── app.js                  All calculation and rendering logic
├── data/
│   └── grower-data.json    Static sample data (6 grower/scenario records)
└── README.md
```

---

## Features

- **Income statement** — Gross revenue → production costs → contract recovery → net retained income
- **Waterfall chart** — Visual income flow from revenue to net retained
- **Cost breakdown** — Bar chart disaggregating all variable costs
- **Break-even analysis** — Minimum price per kg and yield per hectare
- **Scenario comparison** — Best, base, and worst case
- **Interactive sensitivity sliders** — Adjust price, yield, and cost shocks in real time
- **Price sensitivity table** — Net retained income at ±30% price shifts
- **CSV export** — Download summary for any selected grower
- **Full documentation** — Formulas, variable definitions, assumptions, limitations
- **Responsive** — Works on desktop and mobile

---

## Deploying to GitHub Pages

1. Fork or clone this repository.
2. Go to **Settings → Pages** in your GitHub repository.
3. Set source to `main` branch, root folder `/`.
4. GitHub will publish the site at `https://<username>.github.io/<repo-name>/`.

> **Important:** The dashboard must be served over HTTP/HTTPS (not opened as a local `file://` URL) for the `fetch()` call to load `data/grower-data.json`. GitHub Pages handles this automatically.

---

## Adding or Editing Grower Data

Edit `data/grower-data.json`. Each grower record follows this schema:

```json
{
  "id": "GRW-XXX",
  "name": "Display name",
  "season": "2023/2024",
  "hectares_planted": 2.5,
  "kg_harvested": 3750,
  "kg_contract": 2500,
  "kg_auction": 1250,
  "contract_price_per_kg": 2.80,
  "auction_price_per_kg": 2.45,
  "costs": {
    "seed": 85,
    "fertilizer": 1200,
    "chemicals": 420,
    "labor": 950,
    "fuelwood_curing": 380,
    "transport": 210,
    "packaging": 95,
    "auction_charges": 112,
    "levies": 87
  },
  "input_loan_advanced": 2800,
  "contract_recovery": 2800,
  "quality_grade_score": 72,
  "notes": "Optional notes"
}
```

All monetary values in USD. Add as many records as needed — the dropdown populates automatically.

---

## Core Formulas

| Metric | Formula |
|---|---|
| Gross Revenue | (Contract kg × Contract Price) + (Auction kg × Auction Price) |
| Total Production Cost | Sum of all cost line items |
| Net Retained Income | Gross Revenue − Total Production Cost − Contract Recovery |
| Profit Margin | (Net Retained Income / Gross Revenue) × 100 |
| Break-even Price/kg | (Total Production Cost + Contract Recovery) / kg Harvested |
| Break-even Yield/ha | (Total Production Cost + Contract Recovery) / (Avg Price × Hectares) |
| Loan Recovery Ratio | (Contract Recovery / Input Loan Advanced) × 100 |

---

## Methodology

The model uses a **farm income and gross margin approach**:

1. Calculate gross revenue from contract and auction channels
2. Subtract all variable production costs (cash-based)
3. Subtract contract loan recovery
4. Reveal net retained income — what the grower actually keeps

The model is **cash-cost based**. Family labour and own-supply fuelwood are included where values are provided. Non-cash opportunity costs (land, own capital) are not modelled.

---

## Limitations

- Illustrative scenarios only — not a statistically representative sample
- Single-season, point-in-time estimates
- Does not model non-cash opportunity costs, debt rollover, or side-marketing
- Prices are averages; real auction prices vary by grade and date

---

## Research Context

This dashboard is part of the **IPEC** (Institute for Policy Engagement and Collaboration) research programme on agricultural retained income and index-based insurance design for Zimbabwe smallholder farmers. It complements the ZARIP dashboard's VaR/CVaR analytics and Index-Based Insurance (IBI) premium modelling work.

---

## Licence

MIT — free to use, adapt, and share with attribution.
