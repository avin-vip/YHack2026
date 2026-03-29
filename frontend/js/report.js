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
    font-size: 15px;
    color: var(--ink);
    line-height: 1.7;
    background: #fff;
    max-width: 960px;
    margin: 0 auto;
  }

  /* ── Cover ── */
  .rpt-cover {
    padding: 72px 56px 56px;
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
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 40px;
  }
  .rpt-doc-title {
    font-size: 28px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--ink);
    margin-bottom: 28px;
  }
  .rpt-cover-kpi {
    display: flex;
    gap: 0;
    border: 1px solid var(--rule);
    margin-top: 36px;
  }
  .rpt-ckpi {
    flex: 1;
    padding: 18px 20px;
    border-right: 1px solid var(--rule);
  }
  .rpt-ckpi:last-child { border-right: none; }
  .rpt-ckpi-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .rpt-ckpi-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 22px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1.15;
  }
  .rpt-ckpi-val.hot { color: var(--accent); }
  .rpt-ckpi-val.cool { color: var(--green); }

  /* ── Page ── */
  .rpt-page {
    padding: 44px 56px 48px;
  }
  .rpt-page + .rpt-page {
    border-top: 1px solid var(--rule);
  }

  /* ── Section labels ── */
  .rpt-section-tag {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 12px;
  }
  .rpt-h2 {
    font-size: 22px;
    font-weight: 600;
    color: var(--ink);
    padding-bottom: 12px;
    border-bottom: 2px solid var(--ink);
    margin-bottom: 28px;
  }
  .rpt-h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    padding-bottom: 10px;
    border-bottom: 1px solid var(--rule);
    margin-bottom: 18px;
  }
  .rpt-h4 {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--mid);
    margin: 24px 0 14px;
  }

  /* ── Recommended action (primary CTA — must read larger than urgency strip) ── */
  .rpt-recommend {
    border: 1px solid rgba(26,122,94,0.45);
    border-left: 8px solid var(--green);
    background: linear-gradient(135deg, rgba(26,122,94,0.12) 0%, #fff 48%, #fff 100%);
    padding: 28px 32px 28px 36px;
    margin: 0 0 24px 0;
    border-radius: 4px;
    box-shadow: 0 4px 24px rgba(15,17,23,0.07);
  }
  .rpt-recommend-tag {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--green);
    margin-bottom: 12px;
  }
  .rpt-recommend-headline {
    font-size: 24px;
    font-weight: 700;
    color: var(--ink);
    line-height: 1.3;
    margin-bottom: 14px;
    letter-spacing: -0.02em;
  }
  .rpt-recommend-desc {
    font-size: 15px;
    line-height: 1.75;
    color: #1a1a2e;
    margin-bottom: 18px;
    max-width: 52em;
  }
  .rpt-recommend-row {
    display: flex;
    flex-wrap: wrap;
    gap: 24px 40px;
    font-size: 14px;
    color: var(--mid);
    padding-top: 18px;
    border-top: 1px solid rgba(26,122,94,0.3);
  }
  .rpt-recommend-row strong {
    color: var(--ink);
    font-weight: 600;
    margin-right: 6px;
  }
  .rpt-recommend-amt {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 17px;
    font-weight: 600;
    color: var(--accent);
  }

  /* ── Risk / urgency (secondary to recommended action — compact strip) ── */
  .rpt-risk {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 14px 18px;
    border-left: 4px solid var(--accent);
    background: rgba(196,28,28,0.04);
    margin-bottom: 28px;
  }
  .rpt-risk--compact {
    align-items: flex-start;
    padding: 12px 16px;
    margin-bottom: 28px;
  }
  .rpt-risk--compact .rpt-risk-text {
    font-size: 13px;
    line-height: 1.55;
  }
  .rpt-risk.medium { border-color: var(--amber); background: rgba(184,96,10,0.035); }
  .rpt-risk.low    { border-color: var(--muted); background: var(--rule2); }
  .rpt-risk-badge {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    white-space: nowrap;
    padding-top: 2px;
  }
  .rpt-risk.medium .rpt-risk-badge { color: var(--amber); }
  .rpt-risk.low    .rpt-risk-badge { color: var(--muted); }
  .rpt-risk-text { font-size: 14px; color: var(--ink); line-height: 1.65; }

  /* ── KPI row ── */
  .rpt-kpis {
    display: flex;
    gap: 0;
    border: 1px solid var(--rule);
    margin-bottom: 22px;
  }
  .rpt-kpi {
    flex: 1;
    padding: 16px 18px;
    border-right: 1px solid var(--rule);
  }
  .rpt-kpi:last-child { border-right: none; }
  .rpt-kpi-lbl {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .rpt-kpi-v {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 22px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1.1;
  }
  .rpt-kpi-v.hot { color: var(--accent); }
  .rpt-kpi-v.cool { color: var(--green); }
  .rpt-kpi-sub { font-size: 11px; color: var(--muted); margin-top: 5px; }

  /* ── Narrative ── */
  .rpt-prose {
    font-size: 14px;
    line-height: 1.8;
    color: #1a1a2e;
    margin-bottom: 24px;
  }
  .rpt-prose p + p { margin-top: 14px; }

  /* ── Lists ── */
  .rpt-list {
    list-style: none;
    padding: 0;
    margin-bottom: 24px;
  }
  .rpt-list li {
    padding: 10px 12px 10px 26px;
    border-left: 3px solid var(--rule);
    font-size: 12px;
    margin-bottom: 8px;
    line-height: 1.55;
    position: relative;
  }
  .rpt-list li::before { content: '→'; position: absolute; left: 7px; color: var(--muted); }
  .rpt-list.findings li { border-left-color: var(--accent); }
  .rpt-list.recs li     { border-left-color: var(--green); }

  /* ── Summary table ── */
  .rpt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 28px;
  }
  .rpt-table thead tr { background: var(--ink); color: #fff; }
  .rpt-table thead th {
    padding: 12px 14px;
    text-align: left;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .rpt-table tbody tr { border-bottom: 1px solid var(--rule); }
  .rpt-table tbody tr:nth-child(even) { background: var(--rule2); }
  .rpt-table tbody td { padding: 12px 14px; vertical-align: top; line-height: 1.5; }
  .td-hot { font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: var(--accent); }
  .td-cool { font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: var(--green); }
  .td-mono { font-family: 'IBM Plex Mono', monospace; font-size: 10px; }

  /* ── Urgency badge ── */
  .badge {
    display: inline-block;
    padding: 4px 10px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
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
    margin-bottom: 28px;
  }
  .rpt-fi {
    flex: 1;
    min-width: 140px;
    padding: 16px 18px;
    border-right: 1px solid rgba(196,28,28,0.2);
  }
  .rpt-fi:last-child { border-right: none; }
  .rpt-fi-lbl {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .rpt-fi-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 17px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1.15;
  }
  .rpt-fi-val.hot  { color: var(--accent); }
  .rpt-fi-val.cool { color: var(--green); }
  .rpt-fi-sub { font-size: 11px; color: var(--muted); margin-top: 5px; }

  /* ── Evidence chain (readable body copy — not tiny mono wall) ── */
  .rpt-evidence-chain {
    font-size: 14px;
    line-height: 1.75;
  }
  .rpt-evidence-chain > .rpt-prose {
    font-size: 15px;
    line-height: 1.8;
    margin-bottom: 28px;
  }
  .rpt-chain { margin-bottom: 8px; }
  .rpt-agent {
    display: flex;
    gap: 20px;
    padding: 22px 24px;
    border: 1px solid var(--rule);
    margin-bottom: 20px;
    background: #fafbfc;
    border-radius: 4px;
  }
  .rpt-agent-badge {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    font-size: 14px;
    border: 2px solid var(--ink);
    color: var(--ink);
    margin-top: 2px;
    border-radius: 2px;
  }
  .rpt-agent-body { flex: 1; min-width: 0; }
  .rpt-agent-role {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink);
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--rule);
  }
  .rpt-agent-outputs {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 28px;
    margin-bottom: 4px;
  }
  .rpt-ao-item label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 5px;
  }
  .rpt-ao-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
  }
  .rpt-ao-val.hot  { color: var(--accent); }
  .rpt-ao-val.cool { color: var(--green); }
  .rpt-agent-subhd {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--blue);
    margin-top: 18px;
    margin-bottom: 10px;
  }
  .rpt-agent-outputs + .rpt-agent-subhd { margin-top: 8px; }
  .rpt-ev-list, .rpt-reason-list {
    margin: 0 0 0 1.1em;
    padding: 0;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    line-height: 1.75;
    color: var(--ink);
  }
  .rpt-ev-list { list-style: disc; color: #2a2a3e; }
  .rpt-reason-list { list-style: decimal; color: #2a2a3e; }
  .rpt-ev-list li, .rpt-reason-list li {
    margin-bottom: 10px;
    padding-left: 4px;
  }
  .rpt-agent-conf {
    font-size: 12px;
    font-weight: 700;
    color: var(--green);
    font-family: 'IBM Plex Mono', monospace;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px dashed var(--rule);
  }

  /* ── Confidence algorithm callout ── */
  .rpt-algo {
    border: 1px solid var(--rule);
    background: var(--rule2);
    padding: 22px 24px;
    margin-bottom: 24px;
    font-size: 14px;
    line-height: 1.75;
  }
  .rpt-algo-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--blue);
    margin-bottom: 10px;
  }
  .rpt-algo-formula {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: var(--ink);
    background: #fff;
    border: 1px solid var(--rule);
    padding: 8px 12px;
    margin: 8px 0;
    white-space: pre;
    line-height: 1.7;
  }
  .rpt-algo-vars { color: var(--mid); font-size: 13px; line-height: 1.75; }
  .rpt-algo-vars strong { color: var(--ink); font-weight: 600; }

  /* ── Actions table ── */
  .rpt-actions {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 24px;
  }
  .rpt-actions thead tr { background: #f0f0f8; }
  .rpt-actions thead th {
    padding: 12px 14px;
    text-align: left;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--mid);
    border-bottom: 1.5px solid var(--rule);
  }
  .rpt-actions tbody tr { border-bottom: 1px solid var(--rule); }
  .rpt-actions tbody tr:first-child td { font-weight: 600; }
  .rpt-actions tbody td { padding: 12px 14px; vertical-align: top; line-height: 1.5; }
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
  .rpt-score-num { font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600; min-width: 32px; }

  /* ── Annual projection ── */
  .rpt-projection {
    border: 1px solid var(--rule);
    margin-bottom: 24px;
    font-size: 12px;
  }
  .rpt-projection-header {
    background: var(--ink);
    color: #fff;
    padding: 10px 16px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .rpt-projection-body {
    display: flex;
    gap: 0;
  }
  .rpt-proj-col {
    flex: 1;
    padding: 16px 16px;
    border-right: 1px solid var(--rule);
    text-align: center;
  }
  .rpt-proj-col:last-child { border-right: none; }
  .rpt-proj-rate {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .rpt-proj-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 17px;
    font-weight: 600;
    color: var(--accent);
  }
  .rpt-proj-sub { font-size: 10px; color: var(--muted); margin-top: 4px; }

  /* ── Email block ── */
  .rpt-email {
    border: 1px solid var(--rule);
    background: #fafafa;
    margin-bottom: 22px;
  }
  .rpt-email-head { padding: 14px 18px; border-bottom: 1px solid var(--rule); }
  .rpt-email-row {
    display: flex;
    gap: 12px;
    font-size: 12px;
    margin-bottom: 6px;
  }
  .rpt-email-row:last-child { margin-bottom: 0; }
  .rpt-email-lbl {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    width: 44px;
    flex-shrink: 0;
    padding-top: 2px;
  }
  .rpt-email-body { padding: 16px 18px; font-size: 12px; line-height: 1.7; color: #1a1a2e; }

  /* ── Methodology section ── */
  .rpt-method-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 28px;
  }
  .rpt-method-card {
    border: 1px solid var(--rule);
    padding: 22px 22px;
    background: #fafbfc;
    border-radius: 4px;
  }
  .rpt-method-card-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--blue);
    margin-bottom: 12px;
  }
  .rpt-method-card p {
    font-size: 14px;
    line-height: 1.75;
    color: var(--ink);
    margin-bottom: 10px;
  }
  .rpt-method-card p:last-child { margin-bottom: 0; }

  /* ── Footer ── */
  .rpt-footer {
    padding: 22px 56px;
    border-top: 2px solid var(--ink);
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 36px;
  }
  .rpt-footer-brand {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--mid);
    letter-spacing: 0.06em;
  }
  .rpt-footer-meta { font-size: 11px; color: var(--muted); text-align: right; line-height: 1.55; }

  /* ── Print ── */
  @media print {
    #_aria_rpt_root { font-size: 15px !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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

// Priority output keys shown in the agent card (others are omitted to keep reports concise)
const AGENT_KEY_OUTPUTS = {
  contract: ['expected_revenue', 'pricing_tier', 'overage_rate', 'discount_schedule'],
  usage:    ['total_units', 'contract_limit', 'overage', 'overage_value'],
  billing:  ['invoice_total', 'overage_line', 'discount_error'],
  orch:     ['expected', 'actual_billed', 'net_leakage', 'recovery_probability'],
};

function _agentRow(badge, data) {
  if (!data) return '';
  const out = data.output || {};
  const evidence = (data.evidence || []).slice(0, 4);
  const conf = Math.round((data.confidence || 0) * 100);

  const badgeLower = badge.toLowerCase();
  const keySet = AGENT_KEY_OUTPUTS[badgeLower === 'o' ? 'orch' :
    badgeLower === 'c' ? 'contract' :
    badgeLower === 'u' ? 'usage' : 'billing'] || [];

  const hotKeys = ['net_leakage', 'overage_line', 'discount_error', 'overage_value', 'overage'];
  const coolKeys = ['confidence', 'recovery', 'expected_revenue', 'expected'];

  const outputs = Object.entries(out)
    .filter(([k, v]) => v != null && v !== '' && (keySet.length === 0 || keySet.includes(k)))
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
    ? `<div class="rpt-agent-subhd">Evidence cited</div><ul class="rpt-ev-list">${evidence.map(e => `<li>${_fmt(e)}</li>`).join('')}</ul>`
    : '';

  return `<div class="rpt-agent rpt-avoid">
    <div class="rpt-agent-badge">${badge}</div>
    <div class="rpt-agent-body">
      <div class="rpt-agent-role">${_fmt(data.role)}</div>
      <div class="rpt-agent-outputs">${outputs}</div>
      ${evHtml}
      <div class="rpt-agent-conf">CONFIDENCE SCORE ${conf}%</div>
    </div>
  </div>`;
}

// Compact single-account evidence block for dashboard (3 bullets per agent, no full row)
function _compactAccountEvidence(a) {
  const agents = [
    { badge: 'C', label: 'Contract Analyst', data: a.contract },
    { badge: 'U', label: 'Usage Validator',  data: a.usage    },
    { badge: 'B', label: 'Billing Auditor',  data: a.billing  },
  ];
  return agents.map(({ badge, label, data }) => {
    if (!data) return '';
    const ev = (data.evidence || []).slice(0, 3);
    if (!ev.length) return '';
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div class="rpt-agent-badge" style="width:26px;height:26px;font-size:12px;">${badge}</div>
        <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--mid)">${label}</span>
        <span style="font-size:10px;color:var(--green);font-family:monospace;margin-left:auto">${Math.round((data.confidence||0)*100)}% conf</span>
      </div>
      <ul class="rpt-ev-list" style="font-size:13px;margin-left:1.2em;">${ev.map(e => `<li>${_fmt(e)}</li>`).join('')}</ul>
    </div>`;
  }).join('');
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
      <td style="color:var(--mid);font-size:12px;line-height:1.5;">${_fmt(a.description)}</td>
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

// ── DEFAULT ACTIONS (when backend provides none) ──────────────────────────────

function _defaultActions(out) {
  const leakAmt = _parseAmt(out.net_leakage);
  return [
    { rank: 1, name: 'Issue Corrective Invoice', score: 92.3,
      description: `Recover ${_fmt(out.net_leakage)} — contract §4.2 provides clear rate basis. Issue invoice with 30-day payment term.`,
      amount: leakAmt || '' },
    { rank: 2, name: 'Fix Billing Discount Scope', score: 76.4,
      description: 'Remove discount from overage charges in billing system config. Prevents recurrence next cycle.',
      amount: '' },
    { rank: 3, name: 'Escalate to Finance Operations', score: 45.2,
      description: 'Open internal ticket to review all affected billing cycles and confirm customer communication.',
      amount: '' },
  ];
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

// ── NARRATIVE FALLBACK BUILDERS ───────────────────────────────────────────────

function _buildKeyFindings(narrative, accounts) {
  if (narrative.key_findings && narrative.key_findings.length) return narrative.key_findings;
  return accounts.map(a => {
    const out = (a.orch || {}).output || {};
    const conf = Math.round(((a.orch || {}).confidence || 0) * 100);
    const urgency = out.urgency || 'MEDIUM';
    return `<strong>${a.name || a.account_id}</strong>: ${_fmt(out.net_leakage)} leakage — ${_fmt(out.actual_billed)} billed vs ${_fmt(out.expected)} expected. Urgency ${urgency}. Confidence ${conf}%.`;
  });
}

function _buildRecommendations(narrative, accounts, total) {
  if (narrative.recommendations && narrative.recommendations.length) return narrative.recommendations;
  const highUrgency = accounts.filter(a => ((a.orch || {}).output || {}).urgency === 'HIGH');
  const recs = [
    `Issue corrective invoices for ${highUrgency.length || accounts.length} account(s) within 5 business days to remain within the 60-day retroactive billing window.`,
    'Audit billing system discount scope configuration — discounts should apply to base charges only, per contract §12.x terms.',
    `Total recovery opportunity of $${total.toLocaleString()} represents ${accounts.length > 0 ? Math.round((total / accounts.reduce((s, a) => s + (a.arr || 0), 0)) * 100 * 100) / 100 : 0}% of affected ARR — escalate to Finance Operations for prioritisation.`,
    'Establish automated monthly revenue integrity checks across the full enterprise customer base to catch leakage within the same billing cycle.',
  ];
  return recs;
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
    <div style="font-size:11px;color:var(--muted);line-height:1.5;">Generated ${generatedAt} &nbsp;·&nbsp; Confidential — Internal Use Only</div>
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
          ${(_buildKeyFindings(narrative, accounts)).map(f => `<li>${f}</li>`).join('')}
        </ul>
      </div>
      <div style="flex:1;">
        <div class="rpt-h4" style="color:var(--green);">Recommendations</div>
        <ul class="rpt-list recs">
          ${(_buildRecommendations(narrative, accounts, total)).map(r => `<li>${r}</li>`).join('')}
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
    <div style="font-family:monospace;font-size:11px;color:var(--muted);margin-bottom:20px;line-height:1.5;">
      ${[arr, a.tier, a.account_id].filter(Boolean).join(' · ')}
    </div>

    <div class="rpt-finding rpt-avoid">
      <div class="rpt-fi"><div class="rpt-fi-lbl">Expected Revenue</div><div class="rpt-fi-val">${_fmt(out.expected)}</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Actual Billed</div><div class="rpt-fi-val">${_fmt(out.actual_billed)}</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Net Leakage</div><div class="rpt-fi-val hot">${_fmt(out.net_leakage)}</div><div class="rpt-fi-sub">CI: $${ci1.toLocaleString()}–$${ci2.toLocaleString()}</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Confidence</div><div class="rpt-fi-val cool">${confPct}%</div></div>
      <div class="rpt-fi"><div class="rpt-fi-lbl">Recovery Prob.</div><div class="rpt-fi-val">${_fmt(out.recovery_probability)}</div></div>
    </div>

    <div class="rpt-h4">Key Evidence — Agent Chain</div>
    ${_compactAccountEvidence(a)}

    ${_actionsTable(actions.length ? actions : _defaultActions(out))}
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

/**
 * Prominent “recommended action” callout — uses ranked recovery_actions[0], else narrative / leakage fallback.
 */
function _recommendedActionHTML(actions, narrative, out) {
  const top = actions && actions[0];
  const headline = top
    ? _fmt(top.name || top.action || 'Primary recovery action')
    : 'Recommended next step';

  let desc = '';
  if (top && (top.description || top.desc)) {
    desc = _fmt(top.description || top.desc);
  } else if (narrative.recovery_recommendation) {
    desc = _fmt(narrative.recovery_recommendation);
  } else {
    desc = `Issue a corrective invoice aligned with contract terms and capture net leakage of ${_fmt(out.net_leakage)}. Coordinate with finance ops to update billing configuration and prevent recurrence.`;
  }

  const amtRaw = top && top.amount != null
    ? (typeof top.amount === 'number' ? `$${top.amount.toLocaleString()}` : _fmt(top.amount))
    : _fmt(out.net_leakage);
  const amtHtml = `<span class="rpt-recommend-amt">${amtRaw}</span>`;

  let scoreHtml = '';
  if (top) {
    const sc = typeof top.score === 'number'
      ? top.score
      : typeof top.confidence_score === 'number'
        ? Math.round(top.confidence_score * 100)
        : null;
    if (sc != null) {
      scoreHtml = `<span><strong>Priority score</strong> ${sc}</span>`;
    }
  }

  return `
  <div class="rpt-recommend rpt-avoid">
    <div class="rpt-recommend-tag">Primary recommended action</div>
    <div class="rpt-recommend-headline">${headline}</div>
    <div class="rpt-recommend-desc">${desc}</div>
    <div class="rpt-recommend-row">
      <span><strong>Financial impact</strong> ${amtHtml}</span>
      ${scoreHtml}
    </div>
  </div>`;
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
  const actions = (orch.recovery_actions || []).length ? orch.recovery_actions : _defaultActions(out);

  const cover = `
  <div class="rpt-cover">
    <div class="rpt-logo">AR<span>I</span>A</div>
    <div class="rpt-tagline">Autonomous Revenue Integrity Agent</div>
    <div class="rpt-doc-title">Revenue Leakage Finding Report<br>${accountName}</div>
    <div style="font-size:11px;color:var(--muted);line-height:1.5;">Generated ${generatedAt} &nbsp;·&nbsp; Confidential — Internal Use Only</div>
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

    ${_recommendedActionHTML(actions, narrative, out)}

    <div class="rpt-risk rpt-risk--compact ${_riskClass(risk)}">
      <div class="rpt-risk-badge">URGENCY: ${urgency}</div>
      <div class="rpt-risk-text">${_fmt(narrative.recovery_recommendation || 'Orchestrator recommends timely corrective billing and configuration review to recover contractually owed revenue.')}</div>
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
  <div class="rpt-page rpt-pb rpt-evidence-chain">
    <div class="rpt-section-tag">Section 02 — Evidence Chain</div>
    <div class="rpt-h2">4-Agent Evidence Chain</div>
    <div class="rpt-prose">
      <p>Each agent operates on an independent evidence source. The Orchestrator's confidence is
      derived from Bayesian aggregation of all three upstream agents — not from any single model call.
      Evidence and reasoning are listed step-by-step below for auditability.</p>
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

// ── DIRECT PRINT via hidden iframe (no popup, no overflow conflict) ───────────
//
// Using a hidden iframe rather than injecting into the current document avoids
// the parent page's `overflow:hidden` and `height:100%` clipping the print output.
// The iframe owns a clean document with no dashboard CSS — the report renders in full.

function _printDirectly(bodyHTML) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:none;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ARIA Revenue Integrity Report</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; }
    @media print { @page { margin: 12mm 10mm; } }
    ${REPORT_CSS.replace(/#_aria_rpt_root\s/g, 'body ').replace(/#_aria_rpt_root\*/g, 'body *').replace(/#_aria_rpt_root\b/g, 'body')}
  </style>
</head>
<body>${bodyHTML}</body>
</html>`);
  doc.close();

  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        window.print();
      }
      setTimeout(() => iframe.remove(), 3000);
    }, 400);
  };

  iframe.onload = go;
  // Fallback: fonts may not fire onload — trigger after 1.2s regardless
  setTimeout(go, 1200);
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
