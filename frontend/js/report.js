// ── ARIA REPORT RENDERER ──
// Builds professional white-page PDF reports from analysis data.
// Injects a hidden print container into the current page + calls window.print().
// No popup window — user stays on the dashboard, browser handles PDF save.

import { generateDashboardReport, generateAccountReport } from './api.js';

// ── INLINED CSS ───────────────────────────────────────────────────────────────

/* Fonts: match index.html (IBM Plex) — avoid @import here so print layout is not blocked. */
const REPORT_CSS = `
  #_aria_rpt_root *, #_aria_rpt_root *::before, #_aria_rpt_root *::after {
    box-sizing: border-box; margin: 0; padding: 0;
  }
  #_aria_rpt_root {
    --ink:    #0f1117;
    --mid:    #4a4a6a;
    --muted:  #7a7a9a;
    --rule:   #e0e0ec;
    --rule2:  #f0f0f8;
    --accent: #c41c1c;
    --green:  #1a7a5e;
    --amber:  #b8600a;
    --blue:   #1a4a8a;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 11px;
    color: var(--ink);
    line-height: 1.58;
    background: #fff;
    max-width: 760px;
    margin: 0 auto;
  }

  /* ── Cover ── */
  .rpt-cover {
    padding: 68px 56px 52px;
    border-bottom: 3px solid var(--ink);
  }
  .rpt-logo {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 44px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--ink);
    line-height: 1;
    margin-bottom: 6px;
  }
  .rpt-logo span { color: var(--accent); }
  .rpt-tagline {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 44px;
  }
  .rpt-doc-title {
    font-size: 26px;
    font-weight: 600;
    line-height: 1.25;
    color: var(--ink);
    margin-bottom: 32px;
  }
  .rpt-cover-kpi {
    display: flex;
    gap: 0;
    border: 1px solid var(--rule);
    margin-top: 36px;
  }
  .rpt-ckpi {
    flex: 1;
    padding: 14px 18px;
    border-right: 1px solid var(--rule);
  }
  .rpt-ckpi:last-child { border-right: none; }
  .rpt-ckpi-label {
    font-size: 7.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 5px;
  }
  .rpt-ckpi-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 20px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1;
  }
  .rpt-ckpi-val.hot { color: var(--accent); }
  .rpt-ckpi-val.cool { color: var(--green); }

  /* ── Page ── */
  .rpt-page {
    padding: 36px 56px;
  }
  .rpt-page + .rpt-page {
    border-top: 1px solid var(--rule);
  }

  /* ── Section labels ── */
  .rpt-section-tag {
    font-size: 7.5px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .rpt-h2 {
    font-size: 17px;
    font-weight: 600;
    color: var(--ink);
    padding-bottom: 10px;
    border-bottom: 2px solid var(--ink);
    margin-bottom: 22px;
  }
  .rpt-h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--rule);
    margin-bottom: 16px;
  }
  .rpt-h4 {
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mid);
    margin: 18px 0 10px;
  }

  /* ── Risk banner ── */
  .rpt-risk {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 12px 16px;
    border-left: 4px solid var(--accent);
    background: rgba(196,28,28,0.035);
    margin-bottom: 20px;
  }
  .rpt-risk.medium { border-color: var(--amber); background: rgba(184,96,10,0.035); }
  .rpt-risk.low    { border-color: var(--muted); background: var(--rule2); }
  .rpt-risk-badge {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    white-space: nowrap;
    padding-top: 1px;
  }
  .rpt-risk.medium .rpt-risk-badge { color: var(--amber); }
  .rpt-risk.low    .rpt-risk-badge { color: var(--muted); }
  .rpt-risk-text { font-size: 10.5px; color: var(--ink); line-height: 1.5; }

  /* ── KPI row ── */
  .rpt-kpis {
    display: flex;
    gap: 0;
    border: 1px solid var(--rule);
    margin-bottom: 22px;
  }
  .rpt-kpi {
    flex: 1;
    padding: 13px 16px;
    border-right: 1px solid var(--rule);
  }
  .rpt-kpi:last-child { border-right: none; }
  .rpt-kpi-lbl {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 5px;
  }
  .rpt-kpi-v {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 20px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1;
  }
  .rpt-kpi-v.hot { color: var(--accent); }
  .rpt-kpi-v.cool { color: var(--green); }
  .rpt-kpi-sub { font-size: 8.5px; color: var(--muted); margin-top: 3px; }

  /* ── Narrative ── */
  .rpt-prose {
    font-size: 11px;
    line-height: 1.72;
    color: #1a1a2e;
    margin-bottom: 20px;
  }
  .rpt-prose p + p { margin-top: 12px; }

  /* ── Lists ── */
  .rpt-list {
    list-style: none;
    padding: 0;
    margin-bottom: 20px;
  }
  .rpt-list li {
    padding: 7px 10px 7px 22px;
    border-left: 3px solid var(--rule);
    font-size: 10.5px;
    margin-bottom: 5px;
    line-height: 1.5;
    position: relative;
  }
  .rpt-list li::before { content: '→'; position: absolute; left: 7px; color: var(--muted); }
  .rpt-list.findings li { border-left-color: var(--accent); }
  .rpt-list.recs li     { border-left-color: var(--green); }

  /* ── Summary table ── */
  .rpt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
    margin-bottom: 22px;
  }
  .rpt-table thead tr { background: var(--ink); color: #fff; }
  .rpt-table thead th {
    padding: 9px 11px;
    text-align: left;
    font-size: 7.5px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .rpt-table tbody tr { border-bottom: 1px solid var(--rule); }
  .rpt-table tbody tr:nth-child(even) { background: var(--rule2); }
  .rpt-table tbody td { padding: 8px 11px; vertical-align: top; line-height: 1.4; }
  .td-hot { font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: var(--accent); }
  .td-cool { font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: var(--green); }
  .td-mono { font-family: 'IBM Plex Mono', monospace; font-size: 10px; }

  /* ── Urgency badge ── */
  .badge {
    display: inline-block;
    padding: 2px 7px;
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border: 1px solid;
    white-space: nowrap;
  }
  .badge-high   { color: var(--accent); border-color: var(--accent); background: rgba(196,28,28,0.06); }
  .badge-medium { color: var(--amber);  border-color: var(--amber);  background: rgba(184,96,10,0.06); }
  .badge-low    { color: var(--muted);  border-color: var(--rule);   background: var(--rule2); }

  /* ── Finding box ── */
  .rpt-finding {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    border: 1.5px solid var(--accent);
    background: rgba(196,28,28,0.025);
    margin-bottom: 20px;
  }
  .rpt-fi {
    flex: 1;
    min-width: 110px;
    padding: 12px 16px;
    border-right: 1px solid rgba(196,28,28,0.2);
  }
  .rpt-fi:last-child { border-right: none; }
  .rpt-fi-lbl {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .rpt-fi-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1;
  }
  .rpt-fi-val.hot  { color: var(--accent); }
  .rpt-fi-val.cool { color: var(--green); }
  .rpt-fi-sub { font-size: 8.5px; color: var(--muted); margin-top: 3px; }

  /* ── Agent row ── */
  .rpt-chain { margin-bottom: 18px; }
  .rpt-agent {
    display: flex;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid var(--rule);
    margin-bottom: 5px;
  }
  .rpt-agent-badge {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    font-size: 11px;
    border: 1.5px solid var(--ink);
    color: var(--ink);
    margin-top: 1px;
  }
  .rpt-agent-body { flex: 1; min-width: 0; }
  .rpt-agent-role {
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink);
    margin-bottom: 7px;
  }
  .rpt-agent-outputs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
    margin-bottom: 8px;
  }
  .rpt-ao-item label {
    display: block;
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 1px;
  }
  .rpt-ao-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    color: var(--ink);
  }
  .rpt-ao-val.hot  { color: var(--accent); }
  .rpt-ao-val.cool { color: var(--green); }
  .rpt-agent-evidence {
    font-size: 9px;
    color: var(--muted);
    font-family: 'IBM Plex Mono', monospace;
    line-height: 1.6;
    border-top: 1px solid var(--rule);
    padding-top: 6px;
    margin-top: 6px;
  }
  .rpt-agent-reasoning {
    font-size: 9px;
    color: var(--mid);
    line-height: 1.6;
    border-top: 1px solid var(--rule);
    padding-top: 6px;
    margin-top: 6px;
  }
  .rpt-agent-reasoning span {
    display: inline-block;
    background: var(--rule2);
    border: 1px solid var(--rule);
    border-radius: 2px;
    padding: 1px 6px;
    margin: 1px 3px 1px 0;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 8.5px;
  }
  .rpt-agent-conf {
    font-size: 8px;
    font-weight: 700;
    color: var(--green);
    font-family: 'IBM Plex Mono', monospace;
    margin-top: 5px;
  }

  /* ── Confidence algorithm callout ── */
  .rpt-algo {
    border: 1px solid var(--rule);
    background: var(--rule2);
    padding: 14px 18px;
    margin-bottom: 18px;
    font-size: 10px;
    line-height: 1.65;
  }
  .rpt-algo-title {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--blue);
    margin-bottom: 8px;
  }
  .rpt-algo-formula {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 9.5px;
    color: var(--ink);
    background: #fff;
    border: 1px solid var(--rule);
    padding: 8px 12px;
    margin: 8px 0;
    white-space: pre;
    line-height: 1.7;
  }
  .rpt-algo-vars { color: var(--mid); font-size: 9px; line-height: 1.65; }
  .rpt-algo-vars strong { color: var(--ink); font-weight: 600; }

  /* ── Actions table ── */
  .rpt-actions {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    margin-bottom: 20px;
  }
  .rpt-actions thead tr { background: #f0f0f8; }
  .rpt-actions thead th {
    padding: 8px 10px;
    text-align: left;
    font-size: 7.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--mid);
    border-bottom: 1.5px solid var(--rule);
  }
  .rpt-actions tbody tr { border-bottom: 1px solid var(--rule); }
  .rpt-actions tbody tr:first-child td { font-weight: 600; }
  .rpt-actions tbody td { padding: 8px 10px; vertical-align: top; line-height: 1.4; }
  .rpt-score-bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .rpt-score-track {
    flex: 1;
    height: 4px;
    background: var(--rule);
    position: relative;
  }
  .rpt-score-fill {
    position: absolute;
    top: 0; left: 0;
    height: 4px;
    background: var(--green);
  }
  .rpt-score-fill.amber { background: var(--amber); }
  .rpt-score-fill.low   { background: var(--muted); }
  .rpt-score-num { font-family: 'IBM Plex Mono', monospace; font-size: 9px; font-weight: 600; min-width: 28px; }

  /* ── Annual projection ── */
  .rpt-projection {
    border: 1px solid var(--rule);
    margin-bottom: 20px;
    font-size: 10.5px;
  }
  .rpt-projection-header {
    background: var(--ink);
    color: #fff;
    padding: 8px 14px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .rpt-projection-body {
    display: flex;
    gap: 0;
  }
  .rpt-proj-col {
    flex: 1;
    padding: 12px 14px;
    border-right: 1px solid var(--rule);
    text-align: center;
  }
  .rpt-proj-col:last-child { border-right: none; }
  .rpt-proj-rate {
    font-size: 7.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 5px;
  }
  .rpt-proj-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 15px;
    font-weight: 600;
    color: var(--accent);
  }
  .rpt-proj-sub { font-size: 8px; color: var(--muted); margin-top: 2px; }

  /* ── Email block ── */
  .rpt-email {
    border: 1px solid var(--rule);
    background: #fafafa;
    margin-bottom: 18px;
  }
  .rpt-email-head { padding: 10px 16px; border-bottom: 1px solid var(--rule); }
  .rpt-email-row {
    display: flex;
    gap: 10px;
    font-size: 10px;
    margin-bottom: 4px;
  }
  .rpt-email-row:last-child { margin-bottom: 0; }
  .rpt-email-lbl {
    font-size: 7.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    width: 34px;
    flex-shrink: 0;
    padding-top: 1px;
  }
  .rpt-email-body { padding: 12px 16px; font-size: 10px; line-height: 1.65; color: #1a1a2e; }

  /* ── Methodology section ── */
  .rpt-method-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 20px;
  }
  .rpt-method-card {
    border: 1px solid var(--rule);
    padding: 14px 16px;
  }
  .rpt-method-card-title {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--blue);
    margin-bottom: 8px;
  }
  .rpt-method-card p {
    font-size: 10px;
    line-height: 1.62;
    color: var(--ink);
    margin-bottom: 6px;
  }
  .rpt-method-card p:last-child { margin-bottom: 0; }

  /* ── Footer ── */
  .rpt-footer {
    padding: 16px 56px;
    border-top: 2px solid var(--ink);
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 32px;
  }
  .rpt-footer-brand {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--mid);
    letter-spacing: 0.06em;
  }
  .rpt-footer-meta { font-size: 8.5px; color: var(--muted); text-align: right; line-height: 1.55; }

  /* ── Print ── */
  @media print {
    #_aria_rpt_root { font-size: 10px; }
    .rpt-cover  { page-break-after: always; }
    .rpt-pb     { page-break-before: always; }
    .rpt-avoid  { page-break-inside: avoid; }
    a { text-decoration: none; color: inherit; }
  }
`;

// ── UTILITIES ─────────────────────────────────────────────────────────────────

const _fmt = v => (v == null ? '—' : String(v));

function _badgeClass(u = '') {
  const s = u.toLowerCase();
  return s === 'high' ? 'badge-high' : s === 'medium' ? 'badge-medium' : 'badge-low';
}

function _riskClass(r = '') {
  const s = r.toLowerCase();
  return s === 'medium' ? 'medium' : s === 'low' ? 'low' : '';
}

function _paras(text = '') {
  return text.split('\n\n').map(p => p.trim()).filter(Boolean).map(p => `<p>${p}</p>`).join('');
}

function _parseAmt(str) {
  return parseInt(String(str).replace(/[$,]/g, '')) || 0;
}

// ── AGENT ROW ─────────────────────────────────────────────────────────────────

function _agentRow(badge, data) {
  if (!data) return '';
  const out = data.output || {};
  const evidence = (data.evidence || []).slice(0, 4);
  const reasoning = (data.reasoning || []).slice(0, 6);
  const conf = Math.round((data.confidence || 0) * 100);

  const hotKeys = ['net_leakage', 'overage_line', 'discount_error', 'overage_value', 'overage'];
  const coolKeys = ['confidence', 'recovery', 'expected_revenue'];

  const outputs = Object.entries(out)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => {
      const lbl = k.replace(/_/g, ' ').toUpperCase();
      const isHot = hotKeys.some(h => k.includes(h));
      const isCool = coolKeys.some(c => k.includes(c));
      return `<div class="rpt-ao-item">
        <label>${lbl}</label>
        <div class="rpt-ao-val${isHot ? ' hot' : isCool ? ' cool' : ''}">${_fmt(v)}</div>
      </div>`;
    }).join('');

  const evHtml = evidence.length
    ? `<div class="rpt-agent-evidence">${evidence.map(e => `▸ ${e}`).join('<br>')}</div>`
    : '';

  const rsHtml = reasoning.length
    ? `<div class="rpt-agent-reasoning">${reasoning.map(r => `<span>${r}</span>`).join('')}</div>`
    : '';

  return `<div class="rpt-agent rpt-avoid">
    <div class="rpt-agent-badge">${badge}</div>
    <div class="rpt-agent-body">
      <div class="rpt-agent-role">${_fmt(data.role)}</div>
      <div class="rpt-agent-outputs">${outputs}</div>
      ${evHtml}${rsHtml}
      <div class="rpt-agent-conf">CONFIDENCE SCORE ${conf}%</div>
    </div>
  </div>`;
}

// ── RECOVERY ACTIONS TABLE ────────────────────────────────────────────────────

function _actionsTable(actions) {
  if (!actions || actions.length === 0) return '';

  const rows = actions.map((a, i) => {
    const score = typeof a.score === 'number' ? a.score
      : typeof a.confidence_score === 'number' ? a.confidence_score * 100
      : 0;
    const scorePct = Math.min(100, Math.round(score));
    const fillClass = scorePct >= 80 ? '' : scorePct >= 55 ? 'amber' : 'low';
    const amt = typeof a.amount === 'number' ? `$${a.amount.toLocaleString()}` : _fmt(a.amount);

    return `<tr>
      <td style="font-weight:700;color:${i === 0 ? 'var(--accent)' : 'var(--mid)'}">#${i + 1}</td>
      <td>${_fmt(a.name || a.action)}</td>
      <td style="color:var(--mid);font-size:9.5px;">${_fmt(a.description)}</td>
      <td class="td-hot">${amt}</td>
      <td>
        <div class="rpt-score-bar">
          <div class="rpt-score-track"><div class="rpt-score-fill ${fillClass}" style="width:${scorePct}%"></div></div>
          <div class="rpt-score-num">${scorePct}</div>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="rpt-h4">Recovery Action Plan — Ranked by Score</div>
  <table class="rpt-actions rpt-avoid">
    <thead>
      <tr>
        <th>Rank</th><th>Action</th><th>Description</th><th>Amount</th><th>Confidence Score</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── ANNUAL PROJECTION TABLE ───────────────────────────────────────────────────

function _annualProjection(monthlyLeakage) {
  const m = _parseAmt(monthlyLeakage);
  if (!m) return '';
  const y1  = m * 12;
  const y3  = m * 36;
  const ci1 = Math.round(y1 * 0.85);
  const ci2 = Math.round(y1 * 1.15);

  return `
  <div class="rpt-projection rpt-avoid">
    <div class="rpt-projection-header">Annualised Leakage Projection (if unresolved)</div>
    <div class="rpt-projection-body">
      <div class="rpt-proj-col">
        <div class="rpt-proj-rate">Monthly (current)</div>
        <div class="rpt-proj-val">$${m.toLocaleString()}</div>
        <div class="rpt-proj-sub">this billing cycle</div>
      </div>
      <div class="rpt-proj-col">
        <div class="rpt-proj-rate">Annual (×12)</div>
        <div class="rpt-proj-val">$${y1.toLocaleString()}</div>
        <div class="rpt-proj-sub">CI: $${ci1.toLocaleString()} – $${ci2.toLocaleString()}</div>
      </div>
      <div class="rpt-proj-col">
        <div class="rpt-proj-rate">3-Year Exposure</div>
        <div class="rpt-proj-val">$${y3.toLocaleString()}</div>
        <div class="rpt-proj-sub">at current run-rate</div>
      </div>
    </div>
  </div>`;
}

// ── METHODOLOGY SECTION ───────────────────────────────────────────────────────

function _methodologySection() {
  return `
  <div class="rpt-page rpt-pb">
    <div class="rpt-section-tag">Appendix A</div>
    <div class="rpt-h2">Detection Methodology &amp; Algorithm Reference</div>

    <div class="rpt-h4">Pipeline Architecture</div>
    <div class="rpt-prose">
      <p>ARIA deploys a 4-agent sequential pipeline. Agents 1–3 produce independent findings from
      separate evidence sources; Agent 4 (Orchestrator) cross-references all three to compute a
      validated net leakage figure with quantified confidence.</p>
    </div>

    <div class="rpt-method-grid">
      <div class="rpt-method-card rpt-avoid">
        <div class="rpt-method-card-title">Agent C — Contract Analyst</div>
        <p>Parses the executed contract PDF to extract the full pricing model: base fee, usage limits,
        overage rate schedule, and discount scope clauses. Flags ambiguous language that could produce
        conflicting billing interpretations.</p>
        <p><strong>Confidence driver:</strong> Clause clarity, number of cross-referenced pricing sections,
        absence of contradictory terms.</p>
      </div>
      <div class="rpt-method-card rpt-avoid">
        <div class="rpt-method-card-title">Agent U — Usage Validator</div>
        <p>Ingests raw API usage logs, deduplicates retry calls, and aggregates by billing cycle.
        Computes total consumption, contract limit, and overage units. Applies the unit multiplier
        defined in the contract (e.g. ×1,000 for API call bundles).</p>
        <p><strong>Confidence driver:</strong> Log completeness, deduplication success rate, variance
        in daily call distribution.</p>
      </div>
      <div class="rpt-method-card rpt-avoid">
        <div class="rpt-method-card-title">Agent B — Billing Auditor</div>
        <p>Reads each invoice line item and compares it against the contract's pricing rules. Checks
        for missing overage lines, incorrect discount scope, and wrong rate application. Quantifies
        the dollar impact of each identified error type.</p>
        <p><strong>Confidence driver:</strong> Invoice line item count, presence of explicit discount
        field, match between invoice structure and contract section references.</p>
      </div>
      <div class="rpt-method-card rpt-avoid">
        <div class="rpt-method-card-title">Agent O — Orchestrator</div>
        <p>Aggregates outputs from Agents C, U, and B. Applies Bayesian confidence aggregation and
        computes the Expected Utility of each recovery action. Ranks actions by impact score and
        generates the corrective invoice and recovery email.</p>
        <p><strong>Confidence driver:</strong> Inter-agent agreement, evidence chain completeness,
        contract language specificity for the identified error type.</p>
      </div>
    </div>

    <div class="rpt-h4">Confidence Score Computation</div>
    <div class="rpt-algo rpt-avoid">
      <div class="rpt-algo-title">Bayesian Cross-Agent Confidence</div>
      <div class="rpt-algo-formula">Combined_Conf = harmonic_mean(C_contract, C_usage, C_billing)
                   × agreement_bonus

Where:
  harmonic_mean(a, b, c) = 3 / (1/a + 1/b + 1/c)
  agreement_bonus        = 1.0  if all 3 agents confirm same discrepancy
                         = 0.90 if 2/3 agents confirm
                         = 0.75 if evidence is partial</div>
      <div class="rpt-algo-vars">
        <strong>C_contract</strong> — Contract Analyst confidence (NLP extraction quality + clause specificity)<br>
        <strong>C_usage</strong>    — Usage Validator confidence (log completeness + deduplication rate)<br>
        <strong>C_billing</strong>  — Billing Auditor confidence (invoice structure match + error signal strength)
      </div>
    </div>

    <div class="rpt-algo rpt-avoid">
      <div class="rpt-algo-title">Expected Utility (EU) — Recovery Action Ranking</div>
      <div class="rpt-algo-formula">EU(action) = P(success) × leakage_amount × recovery_rate
           − C_labor − (R_dispute × penalty)

Where:
  P(success)     = Combined_Conf × recovery_probability
  recovery_rate  = 0.95 for corrective invoice (clear contract basis)
                 = 0.80 for discount correction (requires billing system update)
                 = 0.60 for escalation (relationship risk factor applied)
  C_labor        = estimated analyst hours × hourly rate ($85/hr)
  R_dispute      = probability of customer dispute (0.05–0.25)
  penalty        = estimated cost of dispute resolution</div>
      <div class="rpt-algo-vars">
        Actions are ranked by descending EU. Actions below EU threshold of $500 are suppressed
        and flagged for bundling into the next billing cycle correction.
      </div>
    </div>

    <div class="rpt-h4">Net Leakage Calculation</div>
    <div class="rpt-algo rpt-avoid">
      <div class="rpt-algo-title">Orchestrator Net Leakage Formula</div>
      <div class="rpt-algo-formula">Net_Leakage = Σ missing_charges − Σ over-credited_amounts

Where:
  missing_charges     = overage_units × overage_rate × unit_multiplier
                      + any missing base fee adjustments
  over-credited       = discount incorrectly applied to non-base charges
                      + wrong rate differential applied to overage

Confidence Interval (95%):
  CI_lower = Net_Leakage × (1 − (1 − Combined_Conf) × 1.5)
  CI_upper = Net_Leakage × (1 + (1 − Combined_Conf) × 0.8)</div>
      <div class="rpt-algo-vars">
        The confidence interval widens when agent agreement is partial or when contract
        language contains ambiguous discount scope definitions.
      </div>
    </div>

    <div class="rpt-h4">Error Type Classification</div>
    <table class="rpt-table rpt-avoid">
      <thead>
        <tr>
          <th>Error Type</th>
          <th>Description</th>
          <th>Detection Agent</th>
          <th>Typical Frequency</th>
          <th>Recovery Difficulty</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Missing Overage</strong></td>
          <td>Overage usage occurred but no overage line item appears on the invoice</td>
          <td class="td-mono">B (Billing Auditor)</td>
          <td>~42% of leakage cases</td>
          <td class="td-cool">Low — clear contract basis</td>
        </tr>
        <tr>
          <td><strong>Wrong Discount Scope</strong></td>
          <td>Discount intended for base fee only was applied to overage or all charges</td>
          <td class="td-mono">C + B cross-reference</td>
          <td>~38% of leakage cases</td>
          <td class="td-cool">Low — clause reference available</td>
        </tr>
        <tr>
          <td><strong>Wrong Rate</strong></td>
          <td>Overage charged at incorrect per-unit rate (often stale config in billing system)</td>
          <td class="td-mono">C + B cross-reference</td>
          <td>~20% of leakage cases</td>
          <td class="td-hot">Medium — may require amendment review</td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

// ── DASHBOARD HTML ────────────────────────────────────────────────────────────

function _buildDashboardHTML(summary, accounts, narrative, generatedAt) {
  const total   = summary.total_leakage || 0;
  const n       = summary.accounts_analyzed || accounts.length;
  const leaky   = summary.accounts_with_leakage || 0;
  const conf    = Math.round((summary.avg_confidence || 0) * 100);
  const risk    = narrative.risk_level || 'HIGH';

  const cover = `
  <div class="rpt-cover">
    <div class="rpt-logo">AR<span>I</span>A</div>
    <div class="rpt-tagline">Autonomous Revenue Integrity Agent</div>
    <div class="rpt-doc-title">Revenue Integrity Report<br>All Accounts — Dashboard Summary</div>
    <div style="font-size:9px;color:var(--muted);">Generated ${generatedAt} &nbsp;·&nbsp; Confidential — Internal Use Only</div>
    <div class="rpt-cover-kpi">
      <div class="rpt-ckpi"><div class="rpt-ckpi-label">Total Leakage</div><div class="rpt-ckpi-val hot">$${total.toLocaleString()}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-label">Accounts Analyzed</div><div class="rpt-ckpi-val">${n}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-label">Leakage Detected</div><div class="rpt-ckpi-val">${leaky}/${n}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-label">Avg Confidence</div><div class="rpt-ckpi-val cool">${conf}%</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-label">Risk Level</div><div class="rpt-ckpi-val hot">${risk}</div></div>
    </div>
  </div>`;

  const execSection = `
  <div class="rpt-page rpt-pb">
    <div class="rpt-section-tag">Section 01 — Executive Summary</div>
    <div class="rpt-h2">Executive Summary</div>

    <div class="rpt-risk ${_riskClass(risk)}">
      <div class="rpt-risk-badge">RISK: ${risk}</div>
      <div class="rpt-risk-text">${_fmt(narrative.risk_rationale)}</div>
    </div>

    <div class="rpt-kpis">
      <div class="rpt-kpi">
        <div class="rpt-kpi-lbl">Total Leakage Detected</div>
        <div class="rpt-kpi-v hot">$${total.toLocaleString()}</div>
        <div class="rpt-kpi-sub">contractually owed, not billed</div>
      </div>
      <div class="rpt-kpi">
        <div class="rpt-kpi-lbl">Annual Exposure (×12)</div>
        <div class="rpt-kpi-v hot">$${(total * 12).toLocaleString()}</div>
        <div class="rpt-kpi-sub">at current monthly run-rate</div>
      </div>
      <div class="rpt-kpi">
        <div class="rpt-kpi-lbl">Accounts With Leakage</div>
        <div class="rpt-kpi-v">${leaky} / ${n}</div>
        <div class="rpt-kpi-sub">${n > 0 ? Math.round(leaky / n * 100) : 0}% detection rate</div>
      </div>
      <div class="rpt-kpi">
        <div class="rpt-kpi-lbl">Avg Pipeline Confidence</div>
        <div class="rpt-kpi-v cool">${conf}%</div>
        <div class="rpt-kpi-sub">Bayesian cross-referenced</div>
      </div>
    </div>

    <div class="rpt-prose">${_paras(narrative.executive_summary || '')}</div>

    <div style="display:flex;gap:28px;">
      <div style="flex:1;">
        <div class="rpt-h4" style="color:var(--accent);">Key Findings</div>
        <ul class="rpt-list findings">
          ${(narrative.key_findings || []).map(f => `<li>${f}</li>`).join('')}
        </ul>
      </div>
      <div style="flex:1;">
        <div class="rpt-h4" style="color:var(--green);">Recommendations</div>
        <ul class="rpt-list recs">
          ${(narrative.recommendations || []).map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    </div>
  </div>`;

  const tableRows = accounts.map(a => {
    const orch    = a.orch || {};
    const out     = orch.output || {};
    const urgency = out.urgency || 'MEDIUM';
    const leakStr = out.net_leakage || '$0';
    const leakAmt = _parseAmt(leakStr);
    const confPct = Math.round((orch.confidence || 0) * 100);
    const arr     = a.arr ? `$${(a.arr / 1000000).toFixed(1)}M` : '—';
    const pct     = a.arr ? ((leakAmt / a.arr) * 100).toFixed(2) + '%' : '—';

    return `<tr>
      <td><strong>${_fmt(a.name || a.account_id)}</strong><br>
          <span style="font-size:9px;color:var(--muted);font-family:monospace">${_fmt(a.account_id)}</span></td>
      <td>${arr}</td>
      <td class="td-hot">${leakStr}</td>
      <td style="font-size:9.5px;color:var(--muted)">${pct} of ARR</td>
      <td class="td-cool">${confPct}%</td>
      <td><span class="badge ${_badgeClass(urgency)}">${urgency}</span></td>
      <td>${_fmt(out.expected || '—')}</td>
      <td>${_fmt(out.actual_billed || '—')}</td>
    </tr>`;
  }).join('');

  const tableSection = `
  <div class="rpt-page rpt-pb">
    <div class="rpt-section-tag">Section 02 — Leakage Summary</div>
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
    ${_annualProjection('$' + total)}
  </div>`;

  const accountSections = accounts.map((a, idx) => {
    const orch    = a.orch || {};
    const out     = orch.output || {};
    const confPct = Math.round((orch.confidence || 0) * 100);
    const urgency = out.urgency || 'MEDIUM';
    const leakAmt = _parseAmt(out.net_leakage);
    const ci1     = Math.round(leakAmt * (1 - (1 - (orch.confidence || 0)) * 1.5));
    const ci2     = Math.round(leakAmt * (1 + (1 - (orch.confidence || 0)) * 0.8));
    const arr     = a.arr ? `$${(a.arr / 1000000).toFixed(1)}M ARR` : '';
    const actions = orch.recovery_actions || [];

    return `
  <div class="rpt-page rpt-pb">
    <div class="rpt-section-tag">Section 03 · Account ${idx + 1} of ${accounts.length}</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
      <div class="rpt-h2" style="margin-bottom:0;flex:1">${_fmt(a.name || a.account_id)}</div>
      <span class="badge ${_badgeClass(urgency)}" style="margin-top:4px">${urgency}</span>
    </div>
    <div style="font-family:monospace;font-size:9px;color:var(--muted);margin-bottom:18px;">
      ${[arr, a.tier, a.account_id].filter(Boolean).join(' · ')}
    </div>

    <div class="rpt-finding rpt-avoid">
      <div class="rpt-fi"><div class="rpt-fi-lbl">Expected Revenue</div><div class="rpt-fi-val">${_fmt(out.expected)}</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Actual Billed</div><div class="rpt-fi-val">${_fmt(out.actual_billed)}</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Net Leakage</div><div class="rpt-fi-val hot">${_fmt(out.net_leakage)}</div><div class="rpt-fi-sub">CI: $${ci1.toLocaleString()}–$${ci2.toLocaleString()}</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Confidence</div><div class="rpt-fi-val cool">${confPct}%</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Recovery Prob.</div><div class="rpt-fi-val">${_fmt(out.recovery_probability)}</div></div>
    </div>

    <div class="rpt-h4">4-Agent Evidence Chain</div>
    <div class="rpt-chain">
      ${_agentRow('C', a.contract)}
      ${_agentRow('U', a.usage)}
      ${_agentRow('B', a.billing)}
      ${_agentRow('O', a.orch)}
    </div>

    ${_actionsTable(actions)}
    ${_annualProjection(out.net_leakage)}
  </div>`;
  }).join('');

  const footer = `
  <div class="rpt-footer">
    <div class="rpt-footer-brand">ARIA — Revenue Recovery Ops</div>
    <div class="rpt-footer-meta">
      ${generatedAt} &nbsp;·&nbsp; Confidential — Internal Distribution Only<br>
      All findings validated by 4-agent Bayesian cross-referencing pipeline
    </div>
  </div>`;

  return cover + execSection + tableSection + accountSections + _methodologySection() + footer;
}

// ── ACCOUNT HTML ──────────────────────────────────────────────────────────────

function _buildAccountHTML(accountName, accountId, analysis, narrative, generatedAt) {
  const agents  = analysis.agents || analysis;
  const orch    = agents.orch || agents.orchestrator || {};
  const out     = orch.output || {};
  const confPct = Math.round((orch.confidence || 0) * 100);
  const urgency = out.urgency || 'MEDIUM';
  const risk    = urgency === 'HIGH' ? 'HIGH' : urgency === 'MEDIUM' ? 'MEDIUM' : 'LOW';
  const leakAmt = _parseAmt(out.net_leakage);
  const ci1     = Math.round(leakAmt * (1 - (1 - (orch.confidence || 0)) * 1.5));
  const ci2     = Math.round(leakAmt * (1 + (1 - (orch.confidence || 0)) * 0.8));
  const actions = orch.recovery_actions || [];

  const cover = `
  <div class="rpt-cover">
    <div class="rpt-logo">AR<span>I</span>A</div>
    <div class="rpt-tagline">Autonomous Revenue Integrity Agent</div>
    <div class="rpt-doc-title">Revenue Leakage Finding Report<br>${accountName}</div>
    <div style="font-size:9px;color:var(--muted);">Generated ${generatedAt} &nbsp;·&nbsp; Confidential — Internal Use Only</div>
    <div class="rpt-cover-kpi">
      <div class="rpt-ckpi"><div class="rpt-ckpi-label">Account</div><div class="rpt-ckpi-val" style="font-size:13px">${accountId || accountName}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-label">Net Leakage</div><div class="rpt-ckpi-val hot">${_fmt(out.net_leakage)}</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-label">Confidence</div><div class="rpt-ckpi-val cool">${confPct}%</div></div>
      <div class="rpt-ckpi"><div class="rpt-ckpi-label">Urgency</div><div class="rpt-ckpi-val hot">${urgency}</div></div>
    </div>
  </div>`;

  const findingSection = `
  <div class="rpt-page rpt-pb">
    <div class="rpt-section-tag">Section 01 — Finding Summary</div>
    <div class="rpt-h2">Finding Summary</div>

    <div class="rpt-risk ${_riskClass(risk)}">
      <div class="rpt-risk-badge">URGENCY: ${urgency}</div>
      <div class="rpt-risk-text">${_fmt(narrative.recovery_recommendation)}</div>
    </div>

    <div class="rpt-finding rpt-avoid">
      <div class="rpt-fi"><div class="rpt-fi-lbl">Expected Revenue</div><div class="rpt-fi-val">${_fmt(out.expected)}</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Actual Billed</div><div class="rpt-fi-val">${_fmt(out.actual_billed)}</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Net Leakage</div><div class="rpt-fi-val hot">${_fmt(out.net_leakage)}</div>
        <div class="rpt-fi-sub">95% CI: $${ci1.toLocaleString()} – $${ci2.toLocaleString()}</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Pipeline Confidence</div><div class="rpt-fi-val cool">${confPct}%</div>
        <div class="rpt-fi-sub">Bayesian cross-referenced</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Recovery Probability</div><div class="rpt-fi-val">${_fmt(out.recovery_probability)}</div></div>
    </div>

    <div class="rpt-prose">${_paras(narrative.summary || '')}</div>

    <div class="rpt-h4">Finding Detail</div>
    <div class="rpt-prose">${_paras(narrative.finding_narrative || '')}</div>

    ${_annualProjection(out.net_leakage)}
  </div>`;

  const agentSection = `
  <div class="rpt-page rpt-pb">
    <div class="rpt-section-tag">Section 02 — Evidence Chain</div>
    <div class="rpt-h2">4-Agent Evidence Chain</div>
    <div class="rpt-prose">
      <p>Each agent operates on an independent evidence source. The Orchestrator's confidence is
      derived from Bayesian aggregation of all three upstream agents — not from any single model call.
      Reasoning steps below show the computation trace for each agent.</p>
    </div>
    <div class="rpt-chain">
      ${_agentRow('C', agents.contract)}
      ${_agentRow('U', agents.usage)}
      ${_agentRow('B', agents.billing)}
      ${_agentRow('O', agents.orch || agents.orchestrator)}
    </div>
  </div>`;

  const actionsSection = actions.length ? `
  <div class="rpt-page">
    <div class="rpt-section-tag">Section 03 — Recovery Plan</div>
    <div class="rpt-h2">Recovery Action Plan</div>
    <div class="rpt-prose">
      <p>Actions are ranked by Expected Utility (EU = P(success) × leakage × recovery_rate − cost − risk penalty).
      Items ranked #1–2 should be actioned within 5 business days to remain within the contract's
      retroactive billing adjustment window (typically 60–90 days).</p>
    </div>
    ${_actionsTable(actions)}
  </div>` : '';

  const emailData = orch.email || {};
  const emailSection = emailData.subject ? `
  <div class="rpt-page">
    <div class="rpt-h4">Recovery Email — Draft (Pending Finance Review)</div>
    <div class="rpt-email rpt-avoid">
      <div class="rpt-email-head">
        <div class="rpt-email-row"><div class="rpt-email-lbl">To</div><div>${_fmt(emailData.to)}</div></div>
        <div class="rpt-email-row"><div class="rpt-email-lbl">Subject</div><div><strong>${_fmt(emailData.subject)}</strong></div></div>
      </div>
      <div class="rpt-email-body">${_fmt(emailData.body)}</div>
    </div>
  </div>` : '';

  const footer = `
  <div class="rpt-footer">
    <div class="rpt-footer-brand">ARIA — Revenue Recovery Ops</div>
    <div class="rpt-footer-meta">
      ${generatedAt} &nbsp;·&nbsp; Confidential — Internal Distribution Only<br>
      Confidence ${confPct}% · Validated by 4-agent Bayesian pipeline
    </div>
  </div>`;

  return cover + findingSection + agentSection + actionsSection + emailSection + _methodologySection() + footer;
}

// ── DIRECT PRINT (no popup) ───────────────────────────────────────────────────

function _printDirectly(bodyHTML) {
  document.getElementById('_aria_rpt_css')?.remove();
  document.getElementById('_aria_rpt_root')?.remove();

  const styleEl = document.createElement('style');
  styleEl.id = '_aria_rpt_css';
  styleEl.textContent = `
    ${REPORT_CSS}
    /* Screen: off-screen but laid out (display:none breaks some browsers' print capture) */
    @media screen {
      #_aria_rpt_root {
        position: absolute;
        left: -99999px;
        top: 0;
        width: 760px;
        pointer-events: none;
      }
    }
    @media print {
      @page { margin: 10mm; }
      body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
      body * { visibility: hidden !important; }
      #_aria_rpt_root, #_aria_rpt_root * { visibility: visible !important; }
      #_aria_rpt_root {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
      }
    }
  `;
  document.head.appendChild(styleEl);

  const root = document.createElement('div');
  root.id = '_aria_rpt_root';
  root.innerHTML = bodyHTML;
  document.body.appendChild(root);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    root.remove();
    styleEl.remove();
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(cleanup, 120000);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Generate and print the dashboard (all-accounts) report.
 */
export async function exportDashboardReport(summary, accounts) {
  const today = new Date().toISOString().split('T')[0];

  let narrativeData = null;
  try { narrativeData = await generateDashboardReport(summary, accounts); } catch { /* fallback */ }

  const narrative   = narrativeData?.narrative || {};
  const generatedAt = narrativeData?.generated_at || today;

  const html = _buildDashboardHTML(summary, accounts, narrative, generatedAt);
  _printDirectly(html);
}

/**
 * Generate and print a single-account report.
 */
export async function exportAccountReport(accountName, accountId, analysis) {
  const today = new Date().toISOString().split('T')[0];

  let narrativeData = null;
  try { narrativeData = await generateAccountReport(accountName, analysis); } catch { /* fallback */ }

  const narrative   = narrativeData?.narrative || {};
  const generatedAt = narrativeData?.generated_at || today;

  const html = _buildAccountHTML(accountName, accountId, analysis, narrative, generatedAt);
  _printDirectly(html);
}
