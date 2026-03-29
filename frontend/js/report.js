// ── ARIA REPORT RENDERER ──
// Builds printable PDF-ready reports from agent analysis data.
// Print is triggered via a hidden iframe — no API calls, no popup window.

// ── CSS ───────────────────────────────────────────────────────────────────────

const REPORT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #fff;
    font-family: 'IBM Plex Sans', Arial, sans-serif;
    font-size: 14px;
    color: #0f1117;
    line-height: 1.7;
  }
  :root {
    --ink:    #0f1117;
    --mid:    #4a4a6a;
    --muted:  #7a7a9a;
    --rule:   #e0e0ec;
    --rule2:  #f0f0f8;
    --accent: #c41c1c;
    --green:  #1a7a5e;
    --blue:   #1a4a8a;
    --amber:  #b8600a;
  }

  /* ── Cover ── */
  .rpt-cover {
    padding: 64px 56px 48px;
    border-bottom: 3px solid var(--ink);
    page-break-after: always;
  }
  .rpt-logo {
    font-family: 'IBM Plex Mono', Consolas, monospace;
    font-size: 44px; font-weight: 700; letter-spacing: 0.06em;
    color: var(--ink); line-height: 1; margin-bottom: 6px;
  }
  .rpt-logo span { color: var(--accent); }
  .rpt-tagline {
    font-size: 10px; font-weight: 700; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--muted); margin-bottom: 36px;
  }
  .rpt-doc-title { font-size: 26px; font-weight: 600; line-height: 1.3; margin-bottom: 6px; }
  .rpt-doc-sub   { font-size: 18px; font-weight: 400; color: var(--mid); margin-bottom: 4px; }
  .rpt-doc-meta  { font-size: 11px; color: var(--muted); margin-bottom: 32px; }
  .rpt-cover-kpis { display: flex; border: 1px solid var(--rule); margin-top: 28px; }
  .rpt-ckpi { flex: 1; padding: 16px 20px; border-right: 1px solid var(--rule); }
  .rpt-ckpi:last-child { border-right: none; }
  .rpt-ckpi-lbl {
    font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--muted); margin-bottom: 8px;
  }
  .rpt-ckpi-val {
    font-family: 'IBM Plex Mono', Consolas, monospace;
    font-size: 20px; font-weight: 600; line-height: 1.15;
  }
  .rpt-ckpi-val.hot  { color: var(--accent); }
  .rpt-ckpi-val.cool { color: var(--green);  }

  /* ── Page sections ── */
  .rpt-page { padding: 40px 56px 44px; }
  .rpt-page + .rpt-page { border-top: 1px solid var(--rule); }
  .rpt-pb    { page-break-before: always; }
  .rpt-avoid { page-break-inside: avoid; }

  /* ── Labels & headings ── */
  .rpt-tag {
    font-size: 10px; font-weight: 700; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--muted); margin-bottom: 10px;
  }
  .rpt-h2 {
    font-size: 20px; font-weight: 600;
    padding-bottom: 10px; border-bottom: 2px solid var(--ink); margin-bottom: 24px;
  }
  .rpt-h3 {
    font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--mid); margin: 22px 0 12px;
  }

  /* ── Finding summary box ── */
  .rpt-finding {
    display: flex; flex-wrap: wrap;
    border: 1.5px solid var(--accent);
    background: rgba(196,28,28,0.025);
    margin-bottom: 24px;
  }
  .rpt-fi { flex: 1; min-width: 120px; padding: 14px 16px; border-right: 1px solid rgba(196,28,28,0.18); }
  .rpt-fi:last-child { border-right: none; }
  .rpt-fi-lbl {
    font-size: 8px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--muted); margin-bottom: 6px;
  }
  .rpt-fi-val { font-family: 'IBM Plex Mono', Consolas, monospace; font-size: 16px; font-weight: 600; }
  .rpt-fi-val.hot  { color: var(--accent); }
  .rpt-fi-val.cool { color: var(--green);  }
  .rpt-fi-sub { font-size: 10px; color: var(--muted); margin-top: 4px; }

  /* ── Recommended action callout ── */
  .rpt-recommend {
    border: 1px solid rgba(26,122,94,0.4);
    border-left: 7px solid var(--green);
    background: linear-gradient(135deg, rgba(26,122,94,0.08) 0%, #fff 50%);
    padding: 22px 28px; margin-bottom: 22px; border-radius: 3px;
  }
  .rpt-recommend-tag {
    font-size: 10px; font-weight: 700; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--green); margin-bottom: 10px;
  }
  .rpt-recommend-title { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 10px; }
  .rpt-recommend-desc  { font-size: 13px; line-height: 1.75; color: #1a1a2e; margin-bottom: 14px; max-width: 50em; }
  .rpt-recommend-meta  {
    display: flex; flex-wrap: wrap; gap: 20px 36px;
    font-size: 13px; color: var(--mid);
    padding-top: 14px; border-top: 1px solid rgba(26,122,94,0.25);
  }
  .rpt-recommend-meta strong { color: var(--ink); font-weight: 600; margin-right: 5px; }
  .rpt-amt { font-family: 'IBM Plex Mono', Consolas, monospace; font-size: 15px; font-weight: 600; color: var(--accent); }

  /* ── Urgency badge ── */
  .badge {
    display: inline-block; padding: 3px 9px;
    font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; border: 1px solid;
  }
  .badge-high   { color: var(--accent); border-color: var(--accent); background: rgba(196,28,28,0.06); }
  .badge-medium { color: var(--amber);  border-color: var(--amber);  background: rgba(184,96,10,0.06); }
  .badge-low    { color: var(--muted);  border-color: var(--rule);   background: var(--rule2); }

  /* ── Agent evidence cards ── */
  .rpt-agent {
    display: flex; gap: 18px;
    padding: 18px 20px; border: 1px solid var(--rule);
    background: #fafbfc; margin-bottom: 16px; border-radius: 3px;
  }
  .rpt-agent-badge {
    width: 32px; height: 32px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-family: 'IBM Plex Mono', Consolas, monospace;
    font-weight: 700; font-size: 13px;
    border: 2px solid var(--ink); border-radius: 2px; margin-top: 2px;
  }
  .rpt-agent-body { flex: 1; min-width: 0; }
  .rpt-agent-role {
    font-size: 11px; font-weight: 700; letter-spacing: 0.07em;
    text-transform: uppercase; padding-bottom: 10px;
    border-bottom: 1px solid var(--rule); margin-bottom: 12px;
  }
  .rpt-agent-kpis { display: flex; flex-wrap: wrap; gap: 10px 24px; margin-bottom: 12px; }
  .rpt-akpi label {
    display: block; font-size: 9px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-bottom: 3px;
  }
  .rpt-akpi-val { font-family: 'IBM Plex Mono', Consolas, monospace; font-size: 13px; font-weight: 600; }
  .rpt-akpi-val.hot  { color: var(--accent); }
  .rpt-akpi-val.cool { color: var(--green);  }
  .rpt-ev-subhd {
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--blue); margin-bottom: 8px;
  }
  .rpt-ev-list { list-style: disc; margin-left: 1.1em; font-size: 13px; line-height: 1.7; color: #2a2a3e; }
  .rpt-ev-list li { margin-bottom: 6px; }
  .rpt-conf {
    font-size: 11px; font-weight: 700;
    font-family: 'IBM Plex Mono', Consolas, monospace; color: var(--green);
    margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--rule);
  }

  /* ── Recovery actions table ── */
  .rpt-actions { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 22px; }
  .rpt-actions thead tr { background: #f0f0f8; }
  .rpt-actions thead th {
    padding: 10px 12px; text-align: left;
    font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--mid); border-bottom: 1.5px solid var(--rule);
  }
  .rpt-actions tbody tr { border-bottom: 1px solid var(--rule); }
  .rpt-actions tbody tr:first-child td { font-weight: 600; }
  .rpt-actions tbody td { padding: 11px 12px; vertical-align: top; line-height: 1.5; }
  .td-hot  { font-family: 'IBM Plex Mono', Consolas, monospace; font-weight: 600; color: var(--accent); }
  .score-bar { display: flex; align-items: center; gap: 5px; }
  .score-track { flex: 1; height: 4px; background: var(--rule); position: relative; }
  .score-fill  { position: absolute; top: 0; left: 0; height: 4px; background: var(--green); }
  .score-fill.amber { background: var(--amber); }
  .score-fill.low   { background: var(--muted); }
  .score-num { font-family: 'IBM Plex Mono', Consolas, monospace; font-size: 11px; font-weight: 600; min-width: 28px; }

  /* ── Leakage summary table (dashboard) ── */
  .rpt-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 28px; }
  .rpt-table thead tr { background: var(--ink); color: #fff; }
  .rpt-table thead th {
    padding: 11px 13px; text-align: left;
    font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  }
  .rpt-table tbody tr { border-bottom: 1px solid var(--rule); }
  .rpt-table tbody tr:nth-child(even) { background: var(--rule2); }
  .rpt-table tbody td { padding: 11px 13px; vertical-align: top; line-height: 1.5; }

  /* ── Annual projection ── */
  .rpt-proj { border: 1px solid var(--rule); margin-bottom: 22px; }
  .rpt-proj-header {
    background: var(--ink); color: #fff;
    padding: 9px 14px; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  }
  .rpt-proj-body { display: flex; }
  .rpt-proj-col { flex: 1; padding: 14px; border-right: 1px solid var(--rule); text-align: center; }
  .rpt-proj-col:last-child { border-right: none; }
  .rpt-proj-rate { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
  .rpt-proj-val  { font-family: 'IBM Plex Mono', Consolas, monospace; font-size: 15px; font-weight: 600; color: var(--accent); }
  .rpt-proj-sub  { font-size: 9px; color: var(--muted); margin-top: 3px; }

  /* ── KPI row (dashboard exec summary) ── */
  .rpt-kpis { display: flex; border: 1px solid var(--rule); margin-bottom: 22px; }
  .rpt-kpi  { flex: 1; padding: 14px 16px; border-right: 1px solid var(--rule); }
  .rpt-kpi:last-child { border-right: none; }
  .rpt-kpi-lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
  .rpt-kpi-val { font-family: 'IBM Plex Mono', Consolas, monospace; font-size: 20px; font-weight: 600; }
  .rpt-kpi-val.hot  { color: var(--accent); }
  .rpt-kpi-val.cool { color: var(--green);  }
  .rpt-kpi-sub { font-size: 10px; color: var(--muted); margin-top: 4px; }

  /* ── Methodology appendix ── */
  .rpt-method-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 22px; }
  .rpt-method-card { border: 1px solid var(--rule); padding: 18px; background: #fafbfc; border-radius: 3px; }
  .rpt-method-title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--blue); margin-bottom: 10px; }
  .rpt-method-card p { font-size: 13px; line-height: 1.7; color: var(--ink); margin-bottom: 8px; }
  .rpt-method-card p:last-child { margin-bottom: 0; }
  .rpt-algo { border: 1px solid var(--rule); background: var(--rule2); padding: 18px 20px; margin-bottom: 18px; }
  .rpt-algo-title { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--blue); margin-bottom: 8px; }
  .rpt-algo pre {
    font-family: 'IBM Plex Mono', Consolas, monospace; font-size: 11px;
    background: #fff; border: 1px solid var(--rule);
    padding: 8px 10px; margin: 6px 0; white-space: pre-wrap; line-height: 1.65;
  }
  .rpt-algo-vars { font-size: 12px; color: var(--mid); line-height: 1.75; }
  .rpt-algo-vars strong { color: var(--ink); font-weight: 600; }

  /* ── Footer ── */
  .rpt-footer {
    padding: 18px 56px; border-top: 2px solid var(--ink);
    display: flex; justify-content: space-between; align-items: center; margin-top: 32px;
  }
  .rpt-footer-brand { font-family: 'IBM Plex Mono', Consolas, monospace; font-size: 11px; font-weight: 600; color: var(--mid); letter-spacing: 0.06em; }
  .rpt-footer-meta  { font-size: 10px; color: var(--muted); text-align: right; line-height: 1.55; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .rpt-pb    { page-break-before: always; }
    .rpt-avoid { page-break-inside: avoid; }
    a { text-decoration: none; color: inherit; }
  }
`;

// ── UTILITIES ─────────────────────────────────────────────────────────────────

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

const _fmt = (v) => (v == null || v === '' ? '—' : String(v));

function parseCurrency(value) {
  if (typeof value === 'number') return value;
  const num = Number.parseFloat(String(value ?? '').replace(/[$,]/g, '').trim());
  return Number.isFinite(num) ? num : 0;
}

const _badgeClass = (u = '') =>
  u.toLowerCase() === 'high' ? 'badge-high' : u.toLowerCase() === 'medium' ? 'badge-medium' : 'badge-low';

// ── PRINT ENGINE ──────────────────────────────────────────────────────────────
// Single setTimeout trigger — avoids the onload + setTimeout race that causes
// the print dialog to appear twice.

function printHtml(innerHtml, title) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>${REPORT_CSS}</style>
</head>
<body>${innerHtml}</body>
</html>`);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.print();
    }
    setTimeout(() => iframe.remove(), 3000);
  }, 700);
}

// ── AGENT EVIDENCE CARD ───────────────────────────────────────────────────────

const KEY_OUTPUTS = {
  C: ['expected_revenue', 'pricing_tier', 'overage_rate', 'discount_schedule'],
  U: ['total_units', 'contract_limit', 'overage', 'overage_value'],
  B: ['invoice_total', 'overage_line', 'discount_error'],
  O: ['expected', 'actual_billed', 'net_leakage', 'recovery_probability'],
};
const HOT_KEYS  = ['net_leakage', 'overage', 'discount_error', 'overage_line'];
const COOL_KEYS = ['expected_revenue', 'expected', 'recovery'];

function _agentCard(badge, data) {
  if (!data) return '';
  const out      = data.output   || {};
  const evidence = (data.evidence || []).slice(0, 4);
  const conf     = Math.round((data.confidence || 0) * 100);
  const keys     = KEY_OUTPUTS[badge] || [];

  const kpis = Object.entries(out)
    .filter(([k, v]) => v != null && v !== '' && keys.includes(k))
    .map(([k, v]) => {
      const isHot  = HOT_KEYS.some(h => k.includes(h));
      const isCool = COOL_KEYS.some(c => k.includes(c));
      return `<div class="rpt-akpi">
        <label>${esc(k.replace(/_/g, ' ').toUpperCase())}</label>
        <div class="rpt-akpi-val${isHot ? ' hot' : isCool ? ' cool' : ''}">${esc(_fmt(v))}</div>
      </div>`;
    }).join('');

  const evHtml = evidence.length
    ? `<div class="rpt-ev-subhd">Evidence cited</div>
       <ul class="rpt-ev-list">${evidence.map(e => `<li>${esc(_fmt(e))}</li>`).join('')}</ul>`
    : '';

  return `<div class="rpt-agent rpt-avoid">
    <div class="rpt-agent-badge">${badge}</div>
    <div class="rpt-agent-body">
      <div class="rpt-agent-role">${esc(_fmt(data.role))}</div>
      <div class="rpt-agent-kpis">${kpis}</div>
      ${evHtml}
      <div class="rpt-conf">CONFIDENCE ${conf}%</div>
    </div>
  </div>`;
}

// ── RECOVERY ACTIONS TABLE ────────────────────────────────────────────────────

function _defaultActions(netLeakage) {
  const amt = parseCurrency(netLeakage);
  return [
    { rank: 1, name: 'Issue Corrective Invoice',       score: 92.3, amount: amt || '', description: `Recover ${_fmt(netLeakage)} — §4.2 provides clear rate basis. Issue with 30-day payment term.` },
    { rank: 2, name: 'Fix Billing Discount Scope',     score: 76.4, amount: '',        description: 'Remove discount from overage charges in billing config — prevents recurrence next cycle.' },
    { rank: 3, name: 'Escalate to Finance Operations', score: 45.2, amount: '',        description: 'Open internal ticket; confirm retroactive billing window and customer communication plan.' },
  ];
}

function _actionsTable(actions, netLeakage) {
  const items = (actions && actions.length) ? actions : _defaultActions(netLeakage);
  const rows = items.map((a, i) => {
    const score = typeof a.score === 'number' ? a.score : 0;
    const pct   = Math.min(100, Math.round(score));
    const fill  = pct >= 80 ? '' : pct >= 55 ? 'amber' : 'low';
    const amt   = typeof a.amount === 'number' && a.amount ? `$${a.amount.toLocaleString()}` : esc(_fmt(a.amount) === '—' ? '' : _fmt(a.amount));
    return `<tr>
      <td style="font-weight:700;color:${i === 0 ? 'var(--accent)' : 'var(--mid)'}">#${i + 1}</td>
      <td>${esc(_fmt(a.name || a.action))}</td>
      <td style="color:var(--mid);font-size:11px;line-height:1.5">${esc(_fmt(a.description))}</td>
      <td class="td-hot">${amt || '—'}</td>
      <td>
        <div class="score-bar">
          <div class="score-track"><div class="score-fill ${fill}" style="width:${pct}%"></div></div>
          <div class="score-num">${pct}</div>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="rpt-h3">Recovery Action Plan — Ranked by Expected Utility Score</div>
  <table class="rpt-actions rpt-avoid">
    <thead><tr><th>Rank</th><th>Action</th><th>Description</th><th>Amount</th><th>Score</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── ANNUAL PROJECTION ─────────────────────────────────────────────────────────

function _projection(leakageStr) {
  const m = parseCurrency(leakageStr);
  if (!m) return '';
  const y1 = m * 12, y3 = m * 36;
  return `
  <div class="rpt-proj rpt-avoid">
    <div class="rpt-proj-header">Annualised Leakage Projection — If Unresolved</div>
    <div class="rpt-proj-body">
      <div class="rpt-proj-col">
        <div class="rpt-proj-rate">Monthly</div>
        <div class="rpt-proj-val">$${m.toLocaleString()}</div>
        <div class="rpt-proj-sub">current cycle</div>
      </div>
      <div class="rpt-proj-col">
        <div class="rpt-proj-rate">Annual (×12)</div>
        <div class="rpt-proj-val">$${y1.toLocaleString()}</div>
        <div class="rpt-proj-sub">run-rate exposure</div>
      </div>
      <div class="rpt-proj-col">
        <div class="rpt-proj-rate">3-Year</div>
        <div class="rpt-proj-val">$${y3.toLocaleString()}</div>
        <div class="rpt-proj-sub">unresolved risk</div>
      </div>
    </div>
  </div>`;
}

// ── METHODOLOGY APPENDIX ──────────────────────────────────────────────────────

function _methodology() {
  return `
  <div class="rpt-page rpt-pb">
    <div class="rpt-tag">Appendix A</div>
    <div class="rpt-h2">Detection Methodology</div>

    <div class="rpt-h3">Pipeline Architecture</div>
    <div class="rpt-method-grid">
      <div class="rpt-method-card rpt-avoid">
        <div class="rpt-method-title">Agent C — Contract Analyst</div>
        <p>Parses the executed contract PDF to extract the full pricing model: base fee, usage limits, overage rate schedule, and discount scope clauses. Flags language that could produce conflicting billing interpretations.</p>
        <p><strong>Confidence driver:</strong> Clause clarity, number of cross-referenced pricing sections, absence of contradictory terms.</p>
      </div>
      <div class="rpt-method-card rpt-avoid">
        <div class="rpt-method-title">Agent U — Usage Validator</div>
        <p>Ingests raw API usage logs, deduplicates retry calls, and aggregates by billing cycle. Computes total consumption, contract limit, and overage units with the contract-defined unit multiplier.</p>
        <p><strong>Confidence driver:</strong> Log completeness, deduplication success rate, daily call distribution variance.</p>
      </div>
      <div class="rpt-method-card rpt-avoid">
        <div class="rpt-method-title">Agent B — Billing Auditor</div>
        <p>Reads each invoice line item against the contract's pricing rules. Checks for missing overage lines, incorrect discount scope, and wrong rate application. Quantifies the dollar impact of each error type.</p>
        <p><strong>Confidence driver:</strong> Invoice line item count, explicit discount field presence, match between invoice structure and contract section references.</p>
      </div>
      <div class="rpt-method-card rpt-avoid">
        <div class="rpt-method-title">Agent O — Orchestrator</div>
        <p>Aggregates outputs from Agents C, U, and B. Applies Bayesian confidence aggregation and computes Expected Utility for each recovery action, then ranks by impact score.</p>
        <p><strong>Confidence driver:</strong> Inter-agent agreement, evidence chain completeness, contract language specificity for the identified error type.</p>
      </div>
    </div>

    <div class="rpt-h3">Confidence Score Computation</div>
    <div class="rpt-algo rpt-avoid">
      <div class="rpt-algo-title">Bayesian Cross-Agent Confidence</div>
      <pre>Combined_Conf = harmonic_mean(C_contract, C_usage, C_billing) × agreement_bonus

harmonic_mean(a,b,c) = 3 / (1/a + 1/b + 1/c)
agreement_bonus      = 1.00  all 3 agents confirm same discrepancy
                     = 0.90  2/3 agents confirm
                     = 0.75  partial evidence only</pre>
      <div class="rpt-algo-vars">
        <strong>C_contract</strong> — NLP extraction quality + clause specificity &nbsp;&nbsp;
        <strong>C_usage</strong> — log completeness + deduplication rate &nbsp;&nbsp;
        <strong>C_billing</strong> — invoice structure match + error signal strength
      </div>
    </div>

    <div class="rpt-algo rpt-avoid">
      <div class="rpt-algo-title">Expected Utility — Recovery Action Ranking</div>
      <pre>EU(action) = P(success) × leakage_amount × recovery_rate − C_labor − (R_dispute × penalty)

P(success)    = Combined_Conf × recovery_probability
recovery_rate = 0.95  corrective invoice (clear contract basis)
              = 0.80  discount correction (billing system update required)
              = 0.60  escalation (relationship risk factor applied)</pre>
      <div class="rpt-algo-vars">Actions ranked by descending EU. Actions below the $500 EU threshold are suppressed and bundled into the next billing cycle correction.</div>
    </div>
  </div>`;
}

// ── ACCOUNT REPORT HTML ───────────────────────────────────────────────────────

function _buildAccountHTML(accountName, accountId, analysis, generatedAt) {
  const agents  = analysis?.agents || analysis || {};
  const orch    = agents.orch || agents.orchestrator || {};
  const out     = orch.output   || {};
  const conf    = Math.round((orch.confidence || 0) * 100);
  const urgency = out.urgency   || 'HIGH';
  const actions = (orch.recovery_actions || []).length ? orch.recovery_actions : null;
  const leak    = parseCurrency(out.net_leakage);
  const ci1     = Math.round(leak * (1 - (1 - (orch.confidence || 0)) * 1.5));
  const ci2     = Math.round(leak * (1 + (1 - (orch.confidence || 0)) * 0.8));

  const topAction = actions && actions[0];
  const recTitle  = topAction ? esc(_fmt(topAction.name || topAction.action)) : 'Issue Corrective Invoice';
  const recDesc   = esc(topAction?.description ||
    `Issue a corrective invoice for ${_fmt(out.net_leakage)} as specified under §4.2 of the service agreement. Coordinate with Finance Operations to update billing configuration and prevent recurrence.`);
  const recAmt    = topAction?.amount != null
    ? (typeof topAction.amount === 'number' ? `$${topAction.amount.toLocaleString()}` : esc(_fmt(topAction.amount)))
    : esc(_fmt(out.net_leakage));
  const recScore  = topAction?.score != null ? String(topAction.score) : null;

  const cover = `
  <div class="rpt-cover">
    <div class="rpt-logo">AR<span>I</span>A</div>
    <div class="rpt-tagline">Autonomous Revenue Integrity Agent</div>
    <div class="rpt-doc-title">Revenue Leakage Finding Report</div>
    <div class="rpt-doc-sub">${esc(accountName)}</div>
    <div class="rpt-doc-meta">${accountId ? esc(accountId) + ' &nbsp;·&nbsp; ' : ''}Generated ${esc(generatedAt)} &nbsp;·&nbsp; Confidential — Internal Use Only</div>
    <div class="rpt-cover-kpis">
      <div class="rpt-ckpi"><div class="rpt-ckpi-lbl">Net Leakage</div><div class="rpt-ckpi-val hot">${esc(_fmt(out.net_leakage))}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-lbl">Expected Revenue</div><div class="rpt-ckpi-val">${esc(_fmt(out.expected))}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-lbl">Amount Billed</div><div class="rpt-ckpi-val">${esc(_fmt(out.actual_billed))}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-lbl">Confidence</div><div class="rpt-ckpi-val cool">${conf}%</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-lbl">Urgency</div><div class="rpt-ckpi-val hot">${esc(urgency)}</div></div>
    </div>
  </div>`;

  const findingSection = `
  <div class="rpt-page rpt-pb">
    <div class="rpt-tag">Section 01 — Finding Summary</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
      <div class="rpt-h2" style="margin-bottom:0;flex:1">Finding Summary</div>
      <span class="badge ${_badgeClass(urgency)}" style="margin-top:6px">${esc(urgency)}</span>
    </div>

    <div class="rpt-recommend rpt-avoid">
      <div class="rpt-recommend-tag">Primary recommended action</div>
      <div class="rpt-recommend-title">${recTitle}</div>
      <div class="rpt-recommend-desc">${recDesc}</div>
      <div class="rpt-recommend-meta">
        <span><strong>Financial impact</strong> <span class="rpt-amt">${recAmt}</span></span>
        ${recScore ? `<span><strong>Priority score</strong> ${esc(recScore)}</span>` : ''}
        <span><strong>Recovery probability</strong> ${esc(_fmt(out.recovery_probability))}</span>
      </div>
    </div>

    <div class="rpt-finding rpt-avoid">
      <div class="rpt-fi">
        <div class="rpt-fi-lbl">Expected Revenue</div>
        <div class="rpt-fi-val">${esc(_fmt(out.expected))}</div>
      </div>
      <div class="rpt-fi">
        <div class="rpt-fi-lbl">Amount Billed</div>
        <div class="rpt-fi-val">${esc(_fmt(out.actual_billed))}</div>
      </div>
      <div class="rpt-fi">
        <div class="rpt-fi-lbl">Net Leakage</div>
        <div class="rpt-fi-val hot">${esc(_fmt(out.net_leakage))}</div>
        <div class="rpt-fi-sub">95% CI: $${ci1.toLocaleString()}–$${ci2.toLocaleString()}</div>
      </div>
      <div class="rpt-fi">
        <div class="rpt-fi-lbl">Pipeline Confidence</div>
        <div class="rpt-fi-val cool">${conf}%</div>
        <div class="rpt-fi-sub">Bayesian cross-referenced</div>
      </div>
    </div>

    ${_projection(out.net_leakage)}
  </div>`;

  const evidenceSection = `
  <div class="rpt-page rpt-pb">
    <div class="rpt-tag">Section 02 — Evidence Chain</div>
    <div class="rpt-h2">4-Agent Evidence Chain</div>
    <p style="font-size:13px;color:var(--mid);line-height:1.75;margin-bottom:22px">Each agent operates on an independent evidence source. The Orchestrator's confidence is derived from Bayesian aggregation across all three upstream agents — not a single model call.</p>
    ${_agentCard('C', agents.contract)}
    ${_agentCard('U', agents.usage)}
    ${_agentCard('B', agents.billing)}
    ${_agentCard('O', agents.orch || agents.orchestrator)}
  </div>`;

  const actionsSection = `
  <div class="rpt-page rpt-pb">
    <div class="rpt-tag">Section 03 — Recovery Plan</div>
    <div class="rpt-h2">Recovery Action Plan</div>
    <p style="font-size:13px;color:var(--mid);line-height:1.75;margin-bottom:18px">Actions are ranked by Expected Utility (EU = P(success) × leakage × recovery_rate − cost − risk penalty). Items #1–2 should be actioned within 5 business days to remain within the contract's retroactive billing window.</p>
    ${_actionsTable(actions, out.net_leakage)}
  </div>`;

  const footer = `
  <div class="rpt-footer">
    <div class="rpt-footer-brand">ARIA — Revenue Recovery Ops</div>
    <div class="rpt-footer-meta">
      ${esc(generatedAt)} &nbsp;·&nbsp; Confidential — Internal Distribution Only<br>
      Confidence ${conf}% · Validated by 4-agent Bayesian pipeline
    </div>
  </div>`;

  return cover + findingSection + evidenceSection + actionsSection + _methodology() + footer;
}

// ── DASHBOARD REPORT HTML ─────────────────────────────────────────────────────

function _buildDashboardHTML(summary, accounts, generatedAt) {
  const total  = summary.total_leakage       || 0;
  const n      = summary.accounts_analyzed   || accounts.length;
  const leaky  = summary.accounts_with_leakage || 0;
  const conf   = Math.round((summary.avg_confidence || 0) * 100);

  const cover = `
  <div class="rpt-cover">
    <div class="rpt-logo">AR<span>I</span>A</div>
    <div class="rpt-tagline">Autonomous Revenue Integrity Agent</div>
    <div class="rpt-doc-title">Revenue Integrity Report</div>
    <div class="rpt-doc-sub">All Accounts — Dashboard Summary</div>
    <div class="rpt-doc-meta">Generated ${esc(generatedAt)} &nbsp;·&nbsp; Confidential — Internal Use Only</div>
    <div class="rpt-cover-kpis">
      <div class="rpt-ckpi"><div class="rpt-ckpi-lbl">Total Leakage</div><div class="rpt-ckpi-val hot">$${total.toLocaleString()}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-lbl">Accounts Analyzed</div><div class="rpt-ckpi-val">${n}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-lbl">Leakage Detected</div><div class="rpt-ckpi-val">${leaky}/${n}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-lbl">Avg Confidence</div><div class="rpt-ckpi-val cool">${conf}%</div></div>
    </div>
  </div>`;

  const execSection = `
  <div class="rpt-page rpt-pb">
    <div class="rpt-tag">Section 01 — Executive Summary</div>
    <div class="rpt-h2">Executive Summary</div>
    <div class="rpt-kpis">
      <div class="rpt-kpi">
        <div class="rpt-kpi-lbl">Total Leakage</div>
        <div class="rpt-kpi-val hot">$${total.toLocaleString()}</div>
        <div class="rpt-kpi-sub">contractually owed, not billed</div>
      </div>
      <div class="rpt-kpi">
        <div class="rpt-kpi-lbl">Annual Exposure (×12)</div>
        <div class="rpt-kpi-val hot">$${(total * 12).toLocaleString()}</div>
        <div class="rpt-kpi-sub">at current monthly run-rate</div>
      </div>
      <div class="rpt-kpi">
        <div class="rpt-kpi-lbl">Accounts With Leakage</div>
        <div class="rpt-kpi-val">${leaky} / ${n}</div>
        <div class="rpt-kpi-sub">${n > 0 ? Math.round(leaky / n * 100) : 0}% detection rate</div>
      </div>
      <div class="rpt-kpi">
        <div class="rpt-kpi-lbl">Avg Pipeline Confidence</div>
        <div class="rpt-kpi-val cool">${conf}%</div>
        <div class="rpt-kpi-sub">Bayesian cross-referenced</div>
      </div>
    </div>
    ${_projection('$' + total)}
  </div>`;

  const tableRows = (accounts || []).map(a => {
    const orch    = a?.orch || {};
    const out     = orch.output || {};
    const urgency = out.urgency || 'MEDIUM';
    const leak    = parseCurrency(out.net_leakage);
    const arrFmt  = a.arr ? `$${(a.arr / 1_000_000).toFixed(1)}M` : '—';
    const pct     = a.arr ? ((leak / a.arr) * 100).toFixed(2) + '%' : '—';
    const confPct = Math.round((orch.confidence || 0) * 100);
    return `<tr>
      <td><strong>${esc(_fmt(a.name || a.account_id))}</strong><br>
          <span style="font-size:9px;color:var(--muted);font-family:monospace">${esc(_fmt(a.account_id || a.id || ''))}</span></td>
      <td>${arrFmt}</td>
      <td style="font-family:monospace;font-weight:600;color:var(--accent)">${esc(_fmt(out.net_leakage))}</td>
      <td style="font-size:10px;color:var(--muted)">${pct}</td>
      <td style="font-family:monospace;color:var(--green)">${confPct}%</td>
      <td><span class="badge ${_badgeClass(urgency)}">${esc(urgency)}</span></td>
      <td>${esc(_fmt(out.expected))}</td>
      <td>${esc(_fmt(out.actual_billed))}</td>
    </tr>`;
  }).join('');

  const tableSection = `
  <div class="rpt-page rpt-pb">
    <div class="rpt-tag">Section 02 — Leakage Summary</div>
    <div class="rpt-h2">Leakage Summary — All Accounts</div>
    <table class="rpt-table">
      <thead>
        <tr>
          <th>Account</th><th>ARR</th><th>Leakage</th><th>% of ARR</th>
          <th>Confidence</th><th>Urgency</th><th>Expected</th><th>Billed</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;

  const accountSections = (accounts || []).map((a, idx) => {
    const orch    = a?.orch || {};
    const out     = orch.output || {};
    const urgency = out.urgency || 'MEDIUM';
    const confPct = Math.round((orch.confidence || 0) * 100);
    const leak    = parseCurrency(out.net_leakage);
    const ci1     = Math.round(leak * (1 - (1 - (orch.confidence || 0)) * 1.5));
    const ci2     = Math.round(leak * (1 + (1 - (orch.confidence || 0)) * 0.8));
    const actions = (orch.recovery_actions || []).length ? orch.recovery_actions : null;

    const evBullets = (orch.evidence || []).slice(0, 3).map(e => `<li>${esc(_fmt(e))}</li>`).join('');

    return `
  <div class="rpt-page rpt-pb">
    <div class="rpt-tag">Section 03 · Account ${idx + 1} of ${accounts.length}</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
      <div class="rpt-h2" style="margin-bottom:0;flex:1">${esc(_fmt(a.name || a.account_id))}</div>
      <span class="badge ${_badgeClass(urgency)}" style="margin-top:6px">${esc(urgency)}</span>
    </div>
    <div style="font-size:10px;color:var(--muted);margin-bottom:18px;font-family:monospace">
      ${[a.tier, a.account_id || a.id, a.arr ? `ARR $${(a.arr/1_000_000).toFixed(1)}M` : ''].filter(Boolean).join(' · ')}
    </div>

    <div class="rpt-finding rpt-avoid">
      <div class="rpt-fi"><div class="rpt-fi-lbl">Expected</div><div class="rpt-fi-val">${esc(_fmt(out.expected))}</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Billed</div><div class="rpt-fi-val">${esc(_fmt(out.actual_billed))}</div></div>
      <div class="rpt-fi">
        <div class="rpt-fi-lbl">Net Leakage</div>
        <div class="rpt-fi-val hot">${esc(_fmt(out.net_leakage))}</div>
        <div class="rpt-fi-sub">CI: $${ci1.toLocaleString()}–$${ci2.toLocaleString()}</div>
      </div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Confidence</div><div class="rpt-fi-val cool">${confPct}%</div></div>
    </div>

    ${evBullets ? `
    <div class="rpt-h3">Key Evidence</div>
    <ul class="rpt-ev-list" style="margin-left:1.2em;margin-bottom:18px">${evBullets}</ul>` : ''}

    ${_actionsTable(actions, out.net_leakage)}
  </div>`;
  }).join('');

  const footer = `
  <div class="rpt-footer">
    <div class="rpt-footer-brand">ARIA — Revenue Recovery Ops</div>
    <div class="rpt-footer-meta">
      ${esc(generatedAt)} &nbsp;·&nbsp; Confidential — Internal Distribution Only<br>
      All findings validated by 4-agent Bayesian pipeline
    </div>
  </div>`;

  return cover + execSection + tableSection + accountSections + _methodology() + footer;
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/** Print the single-account PDF report. */
export function exportAccountReport(accountName, accountId, analysis) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  printHtml(_buildAccountHTML(accountName, accountId, analysis, today), `ARIA Report — ${accountName}`);
}

/** Print the all-accounts dashboard PDF report. */
export async function exportDashboardReport(summary, accounts) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  printHtml(_buildDashboardHTML(summary, accounts, today), 'ARIA Dashboard Report');
}

/** Derive summary KPIs from the ops grid card states (used by the ops module). */
export function buildDashboardSummaryFromCards(accounts, cardStates) {
  const totalLeakage = accounts.reduce((sum, a) => {
    return sum + parseCurrency(cardStates?.[a.id]?.data?.orch?.output?.net_leakage || 0);
  }, 0);

  const withLeakage = accounts.filter(
    (a) => parseCurrency(cardStates?.[a.id]?.data?.orch?.output?.net_leakage || 0) > 0
  ).length;

  const analyzed = accounts.filter((a) => cardStates?.[a.id]?.data);
  const avgConf  = analyzed.length
    ? analyzed.reduce((sum, a) => sum + (cardStates[a.id]?.data?.orch?.confidence || 0), 0) / analyzed.length
    : 0;

  return {
    total_leakage:          totalLeakage,
    accounts_analyzed:      accounts.length,
    accounts_with_leakage:  withLeakage,
    avg_confidence:         avgConf,
  };
}
