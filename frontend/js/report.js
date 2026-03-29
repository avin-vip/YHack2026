// ── REPORT RENDERER ──
// Builds printable HTML reports and opens browser print flow (PDF capable).

import { generateAccountReport, generateDashboardReport } from './api.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function parseCurrency(value) {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '').replace(/[$,]/g, '').trim();
  const num = Number.parseFloat(raw);
  return Number.isFinite(num) ? num : 0;
}

function printHtml(innerHtml, title) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:28px;color:#111}
    h1,h2{margin:0 0 12px}
    .meta{color:#555;font-size:12px;margin-bottom:18px}
    .kpi{display:flex;gap:18px;margin:10px 0 22px}
    .kpi div{border:1px solid #ddd;padding:10px 12px}
    .mono{font-family:Consolas,monospace}
    .hot{color:#b30000}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}
    th{background:#f5f5f5}
    .section{margin-top:24px}
    @media print { @page { margin: 12mm; } }
  </style>
</head>
<body>${innerHtml}</body>
</html>`);
  doc.close();

  const doPrint = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => iframe.remove(), 2000);
    }
  };
  iframe.onload = () => setTimeout(doPrint, 250);
  setTimeout(doPrint, 900);
}

export async function exportDashboardReport(summary, accounts) {
  const generated = new Date().toISOString().split('T')[0];
  const narrativeData = await generateDashboardReport(summary, accounts).catch(() => null);
  const narrative = narrativeData?.narrative || {};
  const generatedAt = narrativeData?.generated_at || generated;

  const rows = (accounts || []).map((a) => {
    const out = a?.orch?.output || {};
    return `<tr>
      <td>${esc(a.name || a.account_id || 'Unknown')}</td>
      <td class="mono">${esc(out.expected || '—')}</td>
      <td class="mono">${esc(out.actual_billed || '—')}</td>
      <td class="mono hot">${esc(out.net_leakage || '$0')}</td>
      <td>${esc(out.urgency || 'MEDIUM')}</td>
    </tr>`;
  }).join('');

  const html = `
    <h1>ARIA Dashboard Revenue Report</h1>
    <div class="meta">Generated ${esc(generatedAt)}</div>
    <div class="kpi">
      <div><strong>Total leakage</strong><br><span class="mono hot">$${(summary.total_leakage || 0).toLocaleString()}</span></div>
      <div><strong>Accounts analyzed</strong><br>${esc(summary.accounts_analyzed || accounts.length)}</div>
      <div><strong>Accounts with leakage</strong><br>${esc(summary.accounts_with_leakage || 0)}</div>
      <div><strong>Avg confidence</strong><br>${Math.round((summary.avg_confidence || 0) * 100)}%</div>
    </div>
    <div class="section">
      <h2>Executive Summary</h2>
      <p>${esc(narrative.executive_summary || 'Narrative unavailable; using structured analysis summary.')}</p>
    </div>
    <div class="section">
      <h2>Account Breakdown</h2>
      <table>
        <thead><tr><th>Account</th><th>Expected</th><th>Billed</th><th>Leakage</th><th>Urgency</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  printHtml(html, 'ARIA Dashboard Report');
}

export async function exportAccountReport(accountName, accountId, analysis) {
  const generated = new Date().toISOString().split('T')[0];
  const narrativeData = await generateAccountReport(accountName, analysis).catch(() => null);
  const narrative = narrativeData?.narrative || {};
  const generatedAt = narrativeData?.generated_at || generated;

  const agents = analysis?.agents || analysis || {};
  const orch = agents.orch || agents.orchestrator || {};
  const out = orch.output || {};

  const recoveryActions = orch.recovery_actions || [];
  const actionRows = recoveryActions.map((a, i) => `<tr>
    <td>${i + 1}</td>
    <td>${esc(a.name || a.action || `Action ${i + 1}`)}</td>
    <td>${esc(a.description || '')}</td>
    <td class="mono">${typeof a.amount === 'number' ? `$${a.amount.toLocaleString()}` : esc(a.amount || '')}</td>
  </tr>`).join('');

  const html = `
    <h1>ARIA Account Leakage Report</h1>
    <div class="meta">Generated ${esc(generatedAt)} · ${esc(accountName)} (${esc(accountId || '')})</div>
    <div class="kpi">
      <div><strong>Expected</strong><br><span class="mono">${esc(out.expected || '—')}</span></div>
      <div><strong>Billed</strong><br><span class="mono">${esc(out.actual_billed || '—')}</span></div>
      <div><strong>Net leakage</strong><br><span class="mono hot">${esc(out.net_leakage || '$0')}</span></div>
      <div><strong>Confidence</strong><br>${Math.round((orch.confidence || 0) * 100)}%</div>
    </div>
    <div class="section">
      <h2>Narrative</h2>
      <p>${esc(narrative.summary || 'Narrative unavailable; using structured analysis output.')}</p>
      <p>${esc(narrative.finding_narrative || '')}</p>
      <p><strong>Recommendation:</strong> ${esc(narrative.recovery_recommendation || '')}</p>
    </div>
    <div class="section">
      <h2>Recovery Actions</h2>
      <table>
        <thead><tr><th>Rank</th><th>Action</th><th>Description</th><th>Amount</th></tr></thead>
        <tbody>${actionRows || '<tr><td colspan="4">No recovery actions returned.</td></tr>'}</tbody>
      </table>
    </div>
  `;

  printHtml(html, `ARIA Account Report - ${accountName}`);
}

export function buildDashboardSummaryFromCards(accounts, cardStates) {
  const totalLeakage = accounts.reduce((sum, a) => {
    const value = cardStates?.[a.id]?.data?.orch?.output?.net_leakage || 0;
    return sum + parseCurrency(value);
  }, 0);

  const withLeakage = accounts.filter((a) => parseCurrency(cardStates?.[a.id]?.data?.orch?.output?.net_leakage || 0) > 0).length;
  const analyzed = accounts.filter((a) => cardStates?.[a.id]?.data);
  const avgConf = analyzed.length
    ? analyzed.reduce((sum, a) => sum + (cardStates[a.id]?.data?.orch?.confidence || 0), 0) / analyzed.length
    : 0;

  return {
    total_leakage: totalLeakage,
    accounts_analyzed: accounts.length,
    accounts_with_leakage: withLeakage,
    avg_confidence: avgConf,
  };
}
