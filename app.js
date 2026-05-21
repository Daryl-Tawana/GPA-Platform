/* ============================================================
   ZARIP — Zimbabwe Agricultural Retained Income Platform
   app.js — All client-side logic, calculations, and rendering
   ============================================================ */

'use strict';

// ── State ─────────────────────────────────────────────────────
let DATA = null;
let currentGrower = null;
let sensitivityOverrides = { price: 0, yield: 0, cost: 0 };
let displayCurrency = 'USD';
let zwlExchangeRate = 1.0;

// ── Entry Point ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initNav();
  initMobileToggle();
  initCurrencyControls();
});

// ── Data Loading ──────────────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch('data/grower-data.json');
    if (!res.ok) throw new Error('Network response was not ok');
    DATA = await res.json();
    initGrowerSelect();
    loadGrower(DATA.growers[0]);
  } catch (err) {
    console.error('Failed to load data:', err);
    showLoadError();
  }
}

function showLoadError() {
  document.getElementById('app-loading')?.remove();
  document.getElementById('error-banner').style.display = 'flex';
}

function initGrowerSelect() {
  const sel = document.getElementById('grower-select');
  sel.innerHTML = '';
  DATA.growers.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    const g = DATA.growers.find(x => x.id === sel.value);
    if (g) { sensitivityOverrides = { price: 0, yield: 0, cost: 0 }; loadGrower(g); }
  });
}

function loadGrower(grower) {
  currentGrower = grower;
  const metrics = calculate(grower);
  renderAll(grower, metrics);
}

// ── Calculations ──────────────────────────────────────────────
function calculate(g, overrides = {}) {
  // Allow sensitivity overrides
  const priceShift = overrides.priceShift ?? sensitivityOverrides.price ?? 0;
  const yieldShift = overrides.yieldShift ?? sensitivityOverrides.yield ?? 0;
  const costShift  = overrides.costShift  ?? sensitivityOverrides.cost  ?? 0;

  const contractPrice = g.contract_price_per_kg * (1 + priceShift / 100);
  const auctionPrice  = g.auction_price_per_kg  * (1 + priceShift / 100);
  const kgHarvestedAdj = g.kg_harvested * (1 + yieldShift / 100);
  const kgContractAdj  = Math.min(g.kg_contract * (1 + yieldShift / 100), kgHarvestedAdj);
  const kgAuctionAdj   = Math.max(0, kgHarvestedAdj - kgContractAdj);

  // Revenue
  const contractRevenue = kgContractAdj * contractPrice;
  const auctionRevenue  = kgAuctionAdj  * auctionPrice;
  const grossRevenue    = contractRevenue + auctionRevenue;

  // Costs
  const c = g.costs;
  const costMultiplier = 1 + costShift / 100;
  const costs = {
    seed:           c.seed           * costMultiplier,
    fertilizer:     c.fertilizer     * costMultiplier,
    chemicals:      c.chemicals      * costMultiplier,
    labor:          c.labor          * costMultiplier,
    fuelwood:       c.fuelwood_curing* costMultiplier,
    transport:      c.transport      * costMultiplier,
    packaging:      c.packaging      * costMultiplier,
    auctionCharges: c.auction_charges* costMultiplier,
    levies:         c.levies         * costMultiplier,
  };
  const totalProductionCost = Object.values(costs).reduce((a, b) => a + b, 0);

  // Recovery & Net
  const contractLoanRecovery = g.contract_recovery;
  const contractDeductions = g.contract_deductions ?? {};
  const contractorFee = contractDeductions.contractor_fee ?? 0;
  const transportRecovery = contractDeductions.transport_recovery ?? 0;
  const gradingFee = contractDeductions.grading_fee ?? 0;
  const otherContractDeductions = contractDeductions.other ?? 0;
  const contractRecovery = contractLoanRecovery + contractorFee + transportRecovery + gradingFee + otherContractDeductions;
  const netRetainedIncome = grossRevenue - totalProductionCost - contractRecovery;

  // Per-kg metrics
  const avgSellingPrice = grossRevenue / (kgContractAdj + kgAuctionAdj || 1);
  const costPerKg       = totalProductionCost / (g.kg_harvested || 1);
  const revenuePerKg    = grossRevenue / (kgHarvestedAdj || 1);

  // Break-even
  const totalDeductible     = totalProductionCost + contractRecovery;
  const breakEvenPricePerKg = totalDeductible / (kgHarvestedAdj || 1);
  const breakEvenYieldPerHa = totalDeductible / ((avgSellingPrice * g.hectares_planted) || 1);

  // Ratios
  const profitMargin    = grossRevenue ? (netRetainedIncome / grossRevenue) * 100 : 0;
  const loanRecoveryRatio = g.input_loan_advanced ? (contractRecovery / g.input_loan_advanced) * 100 : 0;
  const contractShare   = grossRevenue ? (contractRevenue / grossRevenue) * 100 : 0;
  const auctionShare    = grossRevenue ? (auctionRevenue  / grossRevenue) * 100 : 0;

  return {
    contractRevenue, auctionRevenue, grossRevenue,
    costs, totalProductionCost, contractRecovery,
    contractLoanRecovery, contractorFee, transportRecovery,
    gradingFee, otherContractDeductions,
    netRetainedIncome,
    avgSellingPrice, costPerKg, revenuePerKg,
    breakEvenPricePerKg, breakEvenYieldPerHa,
    profitMargin, loanRecoveryRatio,
    contractShare, auctionShare,
    kgContractAdj, kgAuctionAdj, kgHarvestedAdj,
    contractPrice, auctionPrice,
    isProfitable: netRetainedIncome >= 0,
    totalDeductible,
  };
}

// ── Rendering Orchestrator ────────────────────────────────────
function renderAll(g, m) {
  renderTopbar(g);
  renderOverview(g, m);
  renderIncomeDashboard(g, m);
  renderBreakdown(g, m);
  renderSensitivity(g, m);
  updateCurrencyHeaders();
  updateExportButton(g, m);
}

// ── Format Helpers ────────────────────────────────────────────
const fmt = (n, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMoney = n => {
  const scaled = Math.abs(n) * (displayCurrency === 'ZWL' ? zwlExchangeRate : 1);
  const symbol = displayCurrency === 'USD' ? '$' : 'ZWL ';
  return `${symbol}${fmt(scaled)}`;
};
const fmtMoneyKg = n => `${fmtMoney(n)}/kg`;
const fmtCurrencyLabel = () => displayCurrency === 'USD' ? 'USD equiv.' : 'ZWL';
const fmtPct = n => `${fmt(n, 1)}%`;
const sign = n => n >= 0 ? '+' : '−';

// ── Topbar ────────────────────────────────────────────────────
function renderTopbar(g) {
  document.getElementById('topbar-grower').textContent = g.name;
  document.getElementById('topbar-season').textContent = g.season;
  document.getElementById('topbar-ha').textContent     = `${g.hectares_planted} ha`;
}

// ── Overview Section ──────────────────────────────────────────
function renderOverview(g, m) {
  // Result card
  const rc = document.getElementById('result-card');
  const rv = document.getElementById('result-value');
  const rd = document.getElementById('result-verdict');
  rv.textContent = `${sign(m.netRetainedIncome)} ${fmtMoney(m.netRetainedIncome)}`;
  rv.className = 'result-value ' + (m.isProfitable ? 'profit' : 'loss');
  rd.textContent = m.isProfitable
    ? `The grower retained a net income above all costs and deductions.`
    : `The grower recorded a net loss after all costs and deductions.`;

  // Result stats
  setText('rs-margin',   fmtPct(m.profitMargin));
  setText('rs-revenue',  fmtMoney(m.grossRevenue));
  setText('rs-costs',    fmtMoney(m.totalProductionCost));
  setText('rs-recovery', fmtMoney(m.contractRecovery));

  // Alert banner
  const alertEl = document.getElementById('viability-alert');
  if (m.isProfitable) {
    alertEl.className = 'alert alert-success';
    alertEl.innerHTML = `<span class="alert-icon">✓</span><span><strong>Viable season.</strong> This grower is above break-even. Net retained income of <strong>${fmtUSD(m.netRetainedIncome)}</strong> represents a margin of <strong>${fmtPct(m.profitMargin)}</strong> on gross revenue.</span>`;
  } else {
    alertEl.className = 'alert alert-danger';
    alertEl.innerHTML = `<span class="alert-icon">⚠</span><span><strong>Loss recorded.</strong> This grower did not recoup full costs and deductions. The shortfall is <strong>${fmtUSD(m.netRetainedIncome)}</strong>. Break-even requires a price of at least <strong>${fmtUSD(m.breakEvenPricePerKg)}/kg</strong> or yield of <strong>${fmt(m.breakEvenYieldPerHa)} kg/ha</strong>.</span>`;
  }

  // Summary KPI cards
  setKPI('kpi-gross-rev',    fmtUSD(m.grossRevenue),           'Total revenue from all tobacco sales');
  setKPI('kpi-total-cost',   fmtUSD(m.totalProductionCost),    'Sum of all variable production costs');
  setKPI('kpi-recovery',     fmtUSD(m.contractRecovery),       'Input loan recovered by contractor');
  setKPI('kpi-net',          `${sign(m.netRetainedIncome)} ${fmtUSD(m.netRetainedIncome)}`, 'What the grower actually keeps', m.isProfitable ? 'profit' : 'loss');
  setKPI('kpi-margin',       fmtPct(m.profitMargin),           'Net income as % of gross revenue', m.profitMargin >= 0 ? 'profit' : 'loss');
  setKPI('kpi-rev-per-kg',   `${fmtUSD(m.revenuePerKg)}/kg`,  'Average revenue earned per kg sold');
  setKPI('kpi-cost-per-kg',  `${fmtUSD(m.costPerKg)}/kg`,     'Average production cost per kg harvested');
  setKPI('kpi-break-price',  `${fmtUSD(m.breakEvenPricePerKg)}/kg`, 'Minimum price needed to break even', 'neutral');
}

// ── Income Dashboard ──────────────────────────────────────────
function renderIncomeDashboard(g, m) {
  // Income statement table
  const tbody = document.getElementById('income-table-body');
  tbody.innerHTML = `
    <tr><td colspan="2" style="padding-top:14px;font-weight:600;color:var(--sage);font-size:0.75rem;text-transform:uppercase;letter-spacing:.06em;">REVENUE</td></tr>
    <tr><td>Contract sales (${fmt(m.kgContractAdj,0)} kg × ${fmtMoneyKg(m.contractPrice)})</td><td class="num">${fmtMoney(m.contractRevenue)}</td></tr>
    <tr><td>Auction sales (${fmt(m.kgAuctionAdj,0)} kg × ${fmtMoneyKg(m.auctionPrice)})</td><td class="num">${fmtMoney(m.auctionRevenue)}</td></tr>
    <tr class="total-row"><td>Gross Revenue</td><td class="num positive">${fmtMoney(m.grossRevenue)}</td></tr>
    <tr><td colspan="2" style="padding-top:14px;font-weight:600;color:var(--amber);font-size:0.75rem;text-transform:uppercase;letter-spacing:.06em;">PRODUCTION COSTS</td></tr>
    ${costRow('Seed', m.costs.seed)}
    ${costRow('Fertiliser', m.costs.fertilizer)}
    ${costRow('Chemicals / pesticides', m.costs.chemicals)}
    ${costRow('Labour', m.costs.labor)}
    ${costRow('Fuelwood / curing', m.costs.fuelwood)}
    ${costRow('Transport', m.costs.transport)}
    ${costRow('Packaging', m.costs.packaging)}
    ${costRow('Auction charges', m.costs.auctionCharges)}
    ${costRow('Levies', m.costs.levies)}
    <tr class="total-row"><td>Total Production Cost</td><td class="num negative">(${fmtUSD(m.totalProductionCost)})</td></tr>
    <tr><td colspan="2" style="padding-top:14px;font-weight:600;color:var(--tobacco);font-size:0.75rem;text-transform:uppercase;letter-spacing:.06em;">CONTRACT RECOVERY</td></tr>
    <tr><td>Input loan recovered by contractor</td><td class="num negative">(${fmtUSD(m.contractRecovery)})</td></tr>
    <tr><td colspan="2"><hr class="divider" style="margin:12px 0;"/></td></tr>
    <tr><td style="font-weight:700;font-size:1rem;font-family:var(--font-display);">Net Retained Income</td><td class="num ${m.isProfitable?'positive':'negative'}" style="font-size:1.1rem;font-weight:700;">${sign(m.netRetainedIncome)} ${fmtUSD(m.netRetainedIncome)}</td></tr>
  `;

  // Waterfall chart
  renderWaterfall(m);

  // Break-even panel
  setText('be-price',    `${fmtUSD(m.breakEvenPricePerKg)}/kg`);
  setText('be-yield',    `${fmt(m.breakEvenYieldPerHa)} kg/ha`);
  setText('be-margin-gap', `${fmtUSD(Math.abs(m.grossRevenue - m.totalDeductible))}`);
  setText('be-lr-ratio', `${fmtPct(m.loanRecoveryRatio)}`);
  setText('be-avg-price', `${fmtUSD(m.avgSellingPrice)}/kg`);

  const beP = document.getElementById('be-price-status');
  if (m.avgSellingPrice >= m.breakEvenPricePerKg) {
    beP.textContent = `✓ Actual avg price (${fmtUSD(m.avgSellingPrice)}/kg) exceeds break-even`;
    beP.style.color = 'var(--profit-green)';
  } else {
    beP.textContent = `✗ Actual avg price (${fmtUSD(m.avgSellingPrice)}/kg) is below break-even`;
    beP.style.color = 'var(--alert-red)';
  }
}

function costRow(label, val) {
  return `<tr><td style="padding-left:16px;">${label}</td><td class="num">(${fmtUSD(val)})</td></tr>`;
}

// ── Waterfall Chart ───────────────────────────────────────────
function renderWaterfall(m) {
  const container = document.getElementById('waterfall-chart');
  const steps = [
    { label: 'Contract\nRevenue',  value: m.contractRevenue,        type: 'revenue'  },
    { label: 'Auction\nRevenue',   value: m.auctionRevenue,          type: 'revenue'  },
    { label: 'Gross\nRevenue',     value: m.grossRevenue,            type: 'revenue', total: true },
    { label: 'Production\nCosts',  value: -m.totalProductionCost,    type: 'cost'     },
    { label: 'Contract\nRecovery', value: -m.contractRecovery,       type: 'recovery' },
    { label: 'Net\nRetained',      value: m.netRetainedIncome,       type: m.isProfitable ? 'net-pos' : 'net-neg', total: true },
  ];

  const maxVal = Math.max(...steps.map(s => Math.abs(s.value)));
  const chartH = 240;

  let html = '';
  steps.forEach(s => {
    const pct = Math.min(Math.abs(s.value) / maxVal, 1);
    const h   = Math.max(pct * chartH, 4);
    const valStr = `${s.value >= 0 ? '' : '−'}${fmtMoney(Math.abs(s.value))}`;
    html += `
      <div class="wf-bar-group" style="min-width:80px;">
        <div style="height:${chartH}px;display:flex;align-items:flex-end;width:100%;">
          <div class="wf-bar ${s.type}" style="height:${h}px;width:100%;position:relative;">
            <span class="wf-value">${valStr}</span>
          </div>
        </div>
        <div class="wf-label">${s.label.replace(/\n/g,'<br>')}</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// ── Breakdown Section ─────────────────────────────────────────
function renderBreakdown(g, m) {
  // Channel share
  document.getElementById('contract-share-bar').style.width = `${m.contractShare}%`;
  document.getElementById('auction-share-bar').style.width  = `${m.auctionShare}%`;
  setText('contract-share-pct', `${fmt(m.contractShare,1)}%`);
  setText('auction-share-pct',  `${fmt(m.auctionShare,1)}%`);
  setText('contract-rev-val',   fmtMoney(m.contractRevenue));
  setText('auction-rev-val',    fmtMoney(m.auctionRevenue));

  // Cost breakdown bar chart
  const costItems = [
    { name: 'Fertiliser',    val: m.costs.fertilizer,     color: '#c8862a' },
    { name: 'Labour',        val: m.costs.labor,           color: '#8d6e3c' },
    { name: 'Fuelwood',      val: m.costs.fuelwood,        color: '#7a6030' },
    { name: 'Chemicals',     val: m.costs.chemicals,       color: '#b07a3a' },
    { name: 'Transport',     val: m.costs.transport,       color: '#6b4c1e' },
    { name: 'Auction charges',val: m.costs.auctionCharges, color: '#a08040' },
    { name: 'Packaging',     val: m.costs.packaging,       color: '#9a7850' },
    { name: 'Levies',        val: m.costs.levies,          color: '#c09060' },
    { name: 'Seed',          val: m.costs.seed,            color: '#d4a870' },
  ].sort((a, b) => b.val - a.val);

  const maxCost = costItems[0].val;
  const bc = document.getElementById('cost-bar-chart');
  bc.innerHTML = costItems.map(ci => `
    <div class="bar-row">
      <div class="bar-name">${ci.name}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(ci.val/maxCost*100).toFixed(1)}%;background:${ci.color};">
          <span class="bar-pct">${fmtPct(ci.val/m.totalProductionCost*100)}</span>
        </div>
      </div>
      <div class="bar-val">${fmtMoney(ci.val)}</div>
    </div>
  `).join('');

  // Deductions table
  const dtb = document.getElementById('deductions-table');
  dtb.innerHTML = `
    <tr><td>Gross Revenue</td><td class="num positive">${fmtUSD(m.grossRevenue)}</td><td class="num">—</td></tr>
    <tr><td>Less: Total Production Cost</td><td class="num negative">(${fmtMoney(m.totalProductionCost)})</td><td class="num">${fmtPct(m.totalProductionCost/m.grossRevenue*100)} of revenue</td></tr>
    <tr><td>Less: Contract loan recovered</td><td class="num negative">(${fmtMoney(m.contractLoanRecovery)})</td><td class="num">${g.input_loan_advanced ? fmtPct(m.loanRecoveryRatio) + ' of loan' : 'N/A'}</td></tr>
    ${m.contractorFee ? `<tr><td>Less: Contractor fee</td><td class="num negative">(${fmtMoney(m.contractorFee)})</td><td class="num">${fmtPct(m.contractorFee/m.grossRevenue*100)} of revenue</td></tr>` : ''}
    ${m.transportRecovery ? `<tr><td>Less: Transport recovery</td><td class="num negative">(${fmtMoney(m.transportRecovery)})</td><td class="num">${fmtPct(m.transportRecovery/m.grossRevenue*100)} of revenue</td></tr>` : ''}
    ${m.gradingFee ? `<tr><td>Less: Grading / inspection fee</td><td class="num negative">(${fmtMoney(m.gradingFee)})</td><td class="num">${fmtPct(m.gradingFee/m.grossRevenue*100)} of revenue</td></tr>` : ''}
    ${m.otherContractDeductions ? `<tr><td>Less: Other contractor deductions</td><td class="num negative">(${fmtMoney(m.otherContractDeductions)})</td><td class="num">${fmtPct(m.otherContractDeductions/m.grossRevenue*100)} of revenue</td></tr>` : ''}
    <tr><td class="total-row">Total Contract Recovery</td><td class="num negative">(${fmtMoney(m.contractRecovery)})</td><td class="num">—</td></tr>
    <tr class="total-row"><td>Net Retained Income</td><td class="num ${m.isProfitable?'positive':'negative'}">${sign(m.netRetainedIncome)} ${fmtMoney(m.netRetainedIncome)}</td><td class="num">${fmtPct(Math.abs(m.profitMargin))} ${m.isProfitable?'margin':'loss rate'}</td></tr>
  `;

  // Grade score
  const gs = g.quality_grade_score;
  const gsEl = document.getElementById('grade-score');
  if (gs) {
    gsEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="font-family:var(--font-display);font-size:2.5rem;font-weight:700;color:${gs>=75?'var(--profit-green)':gs>=60?'var(--amber)':'var(--alert-red)'};">${gs}</div>
        <div>
          <div style="font-size:0.75rem;color:var(--mid);text-transform:uppercase;letter-spacing:.08em;">Quality Grade Score</div>
          <div style="font-size:0.82rem;margin-top:4px;">${gs>=75?'Premium grade — commands higher price premiums.':gs>=60?'Medium grade — average market prices.':'Lower grade — may face price discounts.'}</div>
        </div>
      </div>
    `;
  } else {
    gsEl.textContent = 'No grade data available.';
  }
}

// ── Sensitivity Section ───────────────────────────────────────
function renderSensitivity(g, m) {
  // Scenario cards
  const calcScenario = (priceShift, yieldShift, costShift) =>
    calculate(g, { priceShift, yieldShift, costShift });

  const best  = calcScenario(+20, +20, -10);
  const base  = m;
  const worst = calcScenario(-20, -25, +10);

  const renderScenarioCard = (id, metrics, label, cls) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `scenario-card ${cls}`;
    el.innerHTML = `
      <div class="scenario-title">${label}</div>
      <div class="scenario-val">${sign(metrics.netRetainedIncome)} ${fmtUSD(metrics.netRetainedIncome)}</div>
      <div class="scenario-sub">Margin: ${fmtPct(metrics.profitMargin)}</div>
      <div class="scenario-sub" style="margin-top:4px;font-size:0.7rem;">${fmtUSD(metrics.grossRevenue)} gross revenue</div>
    `;
  };
  renderScenarioCard('scenario-best',  best,  'Best Case',  'best');
  renderScenarioCard('scenario-base',  base,  'Base Case',  'base');
  renderScenarioCard('scenario-worst', worst, 'Worst Case', 'worst');

  // Sensitivity sliders
  initSlider('price-slider', 'price-display', '%', v => {
    sensitivityOverrides.price = v;
    updateSensitivityResult(g);
  }, sensitivityOverrides.price);
  initSlider('yield-slider', 'yield-display', '%', v => {
    sensitivityOverrides.yield = v;
    updateSensitivityResult(g);
  }, sensitivityOverrides.yield);
  initSlider('cost-slider', 'cost-display', '%', v => {
    sensitivityOverrides.cost = v;
    updateSensitivityResult(g);
  }, sensitivityOverrides.cost);

  updateSensitivityResult(g);

  // Price sensitivity table
  renderPriceSensTable(g, m);
}

function initSlider(sliderId, displayId, suffix, onChange, initialVal = 0) {
  const slider  = document.getElementById(sliderId);
  const display = document.getElementById(displayId);
  if (!slider || !display) return;
  slider.value = initialVal;
  const update = () => {
    const v = parseFloat(slider.value);
    display.textContent = `${v >= 0 ? '+' : ''}${v}${suffix}`;
    display.style.color = v > 0 ? 'var(--profit-green)' : v < 0 ? 'var(--alert-red)' : 'var(--soil)';
    onChange(v);
  };
  slider.addEventListener('input', update);
  update();
}

function updateSensitivityResult(g) {
  const m = calculate(g);
  const el = document.getElementById('sensitivity-result');
  if (!el) return;
  el.innerHTML = `
    <div class="kpi-label">Adjusted Net Retained Income</div>
    <div class="kpi-value ${m.isProfitable ? 'positive' : 'negative'}">${sign(m.netRetainedIncome)} ${fmtUSD(m.netRetainedIncome)}</div>
    <div class="kpi-sub">${fmtPct(m.profitMargin)} margin · Break-even price: ${fmtUSD(m.breakEvenPricePerKg)}/kg</div>
  `;
  // Re-render topbar and income dashboard on sensitivity change
  const metrics = m;
  renderIncomeDashboard(g, metrics);
}

function renderPriceSensTable(g, m) {
  const tbody = document.getElementById('price-sens-table');
  if (!tbody) return;
  const shifts = [-30, -20, -10, 0, +10, +20, +30];
  tbody.innerHTML = shifts.map(ps => {
    const sm = calculate(g, { priceShift: ps, yieldShift: 0, costShift: 0 });
    const isBase = ps === 0;
    return `<tr ${isBase ? 'style="background:var(--parchment);font-weight:600;"' : ''}>
      <td>${ps >= 0 ? '+' : ''}${ps}%</td>
      <td class="num">${fmtMoneyKg(sm.avgSellingPrice)}</td>
      <td class="num">${fmtMoney(sm.grossRevenue)}</td>
      <td class="num ${sm.isProfitable ? 'positive' : 'negative'}">${sign(sm.netRetainedIncome)} ${fmtMoney(sm.netRetainedIncome)}</td>
      <td class="num">${fmtPct(sm.profitMargin)}</td>
    </tr>`;
  }).join('');
}

// ── Navigation ────────────────────────────────────────────────
function initNav() {
  const navItems = document.querySelectorAll('.nav-item[data-section]');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.section;
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(target)?.classList.add('active');
      // Close mobile nav
      document.getElementById('sidebar').classList.remove('open');
    });
  });
  // Set first active
  if (navItems.length) navItems[0].classList.add('active');
  const sections = document.querySelectorAll('.section');
  if (sections.length) sections[0].classList.add('active');
}

function initMobileToggle() {
  const btn     = document.getElementById('mobile-toggle');
  const sidebar = document.getElementById('sidebar');
  btn?.addEventListener('click', () => sidebar.classList.toggle('open'));
}

function initCurrencyControls() {
  const select = document.getElementById('currency-select');
  const rateInput = document.getElementById('zwl-rate');
  const rateLabel = document.getElementById('zwl-rate-label');

  if (select) {
    select.value = displayCurrency;
    select.addEventListener('change', () => {
      displayCurrency = select.value;
      if (rateInput) rateInput.style.display = displayCurrency === 'ZWL' ? 'inline-block' : 'none';
      if (rateLabel) rateLabel.style.display = displayCurrency === 'ZWL' ? 'inline-block' : 'none';
      if (currentGrower) renderAll(currentGrower, calculate(currentGrower));
    });
  }

  if (rateInput) {
    rateInput.value = zwlExchangeRate.toFixed(2);
    rateInput.addEventListener('input', () => {
      const val = parseFloat(rateInput.value);
      zwlExchangeRate = Number.isFinite(val) && val > 0 ? val : 1;
      if (currentGrower) renderAll(currentGrower, calculate(currentGrower));
    });
    if (displayCurrency !== 'ZWL' && rateLabel) rateLabel.style.display = 'none';
  }
}

function updateCurrencyHeaders() {
  const incomeHeader = document.getElementById('income-amt-header');
  const deductionsHeader = document.getElementById('deductions-amt-header');
  if (incomeHeader) incomeHeader.textContent = `Amount (${fmtCurrencyLabel()})`;
  if (deductionsHeader) deductionsHeader.textContent = fmtCurrencyLabel();
}

// ── Export ────────────────────────────────────────────────────
function updateExportButton(g, m) {
  const btn = document.getElementById('export-btn');
  if (!btn) return;
  btn.onclick = () => exportSummary(g, m);
}

function exportSummary(g, m) {
  const currency = displayCurrency;
  const exchangeRate = zwlExchangeRate;
  const toExport = value => currency === 'ZWL' ? (value * exchangeRate).toFixed(2) : value.toFixed(2);
  const rows = [
    ['Field', 'Value', 'Currency'],
    ['Grower', g.name, currency], ['Season', g.season, currency], ['Hectares', g.hectares_planted, currency],
    ['Kg Harvested', g.kg_harvested, currency], ['Kg Contract', g.kg_contract, currency], ['Kg Auction', g.kg_auction, currency],
    ['Contract Price/kg', currency === 'ZWL' ? `${toExport(g.contract_price_per_kg)} per kg` : `${g.contract_price_per_kg.toFixed(2)} per kg`, currency],
    ['Auction Price/kg', currency === 'ZWL' ? `${toExport(g.auction_price_per_kg)} per kg` : `${g.auction_price_per_kg.toFixed(2)} per kg`, currency],
    ['Contract Revenue', toExport(m.contractRevenue), currency],
    ['Auction Revenue', toExport(m.auctionRevenue), currency],
    ['Gross Revenue', toExport(m.grossRevenue), currency],
    ['Total Production Cost', toExport(m.totalProductionCost), currency],
    ['Contract Recovery', toExport(m.contractRecovery), currency],
    ['Net Retained Income', toExport(m.netRetainedIncome), currency],
    ['Profit Margin %', m.profitMargin.toFixed(2), '%'],
    ['Revenue per Kg', currency === 'ZWL' ? `${toExport(m.revenuePerKg)} per kg` : `${m.revenuePerKg.toFixed(4)} per kg`, currency],
    ['Cost per Kg', currency === 'ZWL' ? `${toExport(m.costPerKg)} per kg` : `${m.costPerKg.toFixed(4)} per kg`, currency],
    ['Break-even Price/kg', currency === 'ZWL' ? `${toExport(m.breakEvenPricePerKg)} per kg` : `${m.breakEvenPricePerKg.toFixed(4)} per kg`, currency],
    ['Break-even Yield/ha', m.breakEvenYieldPerHa.toFixed(2), 'kg/ha'],
    ['Loan Recovery Ratio %', m.loanRecoveryRatio.toFixed(2), '%'],
    ['Contract Revenue Share %', m.contractShare.toFixed(2), '%'],
    ['Auction Revenue Share %', m.auctionShare.toFixed(2), '%'],
  ];
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `ZARIP_${g.id}_summary.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Utilities ─────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setKPI(id, value, sub, modifier = '') {
  const card = document.getElementById(id);
  if (!card) return;
  card.querySelector('.kpi-value').textContent = value;
  card.querySelector('.kpi-value').className   = 'kpi-value' + (modifier ? ' ' + modifier : '');
  card.querySelector('.kpi-sub').textContent   = sub;
  if (modifier) {
    card.className = `kpi-card ${modifier}`;
  }
}
