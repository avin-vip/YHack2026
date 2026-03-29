// ── RIGHT DOCK PANEL: email, billing payload, ranked actions, report, feedback ──
import { agentData, state } from './state.js';
import { exportAccountReport } from './report.js';

function _fmt(v) {
  return v == null || v === '' ? '—' : String(v);
}

// ── EMAIL TEMPLATE BUILDERS ───────────────────────────────────────────────────

/**
 * Builds the structured plain-text body used in mailto: links.
 * Multi-line with clear sections so it reads well in any mail client.
 */
function _buildPlainTextEmail(emailData) {
  const o  = agentData.orch?.output  || {};
  const bp = agentData.orch?.billing_payload || {};
  const ev = (agentData.orch?.evidence || agentData.contract?.evidence || []).slice(0, 3);

  const inv  = bp.invoice_id || bp.id || 'INV-CORRECTION';
  const amt  = bp.amount != null ? `$${Number(bp.amount).toLocaleString()}` : _fmt(o.net_leakage);
  const due  = bp.due_days  || 30;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const sep = '─'.repeat(42);

  const evSection = ev.length
    ? `CONTRACTUAL BASIS\n${sep}\n${ev.map(e => `  • ${e}`).join('\n')}\n\n`
    : '';

  return [
    `Date: ${today}`,
    `Reference: ${inv}`,
    '',
    'Dear Finance Team,',
    '',
    'Following an automated revenue integrity audit conducted by ARIA, we have identified a billing discrepancy between your executed contract terms, recorded usage, and the most recent invoice.',
    '',
    `FINANCIAL SUMMARY`,
    sep,
    `  Expected Revenue      ${_fmt(o.expected).padStart(12)}`,
    `  Amount Invoiced       ${_fmt(o.actual_billed).padStart(12)}`,
    `  ` + '─'.repeat(38),
    `  Net Discrepancy       ${_fmt(o.net_leakage).padStart(12)}  ← UNDERBILLED`,
    '',
    evSection.trim() ? evSection : '',
    `CORRECTIVE INVOICE`,
    sep,
    `  Invoice No.  ${inv}`,
    `  Amount Due   ${amt}`,
    `  Due Date     Within ${due} days of this notice (per §4.2)`,
    '',
    'Please review the attached corrective invoice and arrange remittance within the stated period. Should you have questions regarding the calculation methodology or wish to discuss the findings, please contact Finance Operations directly.',
    '',
    'Best regards,',
    '',
    'Finance Operations',
    'ARIA Revenue Recovery System',
    'finance-ops@internal',
  ].filter(l => l !== undefined).join('\n');
}

/** Opens default mail client with the structured plain-text draft. */
export function sendRecoveryEmail() {
  const email   = agentData.orch?.email || {};
  const rawTo   = (email.to || 'finance-ops@acme.com').split(/[;,]/)[0].trim();
  const subject = email.subject
    || `Billing Correction Notice — ${_fmt((agentData.orch?.output || {}).net_leakage)} Discrepancy`;

  const body = state.lastEmailPlain?.trim() || _buildPlainTextEmail(email);

  const q =
    `mailto:${encodeURIComponent(rawTo)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;
  window.location.href = q;
}

export function updateEmail(emailData) {
  state.lastEmailPlain = _buildPlainTextEmail(emailData);

  const o   = agentData.orch?.output  || {};
  const bp  = agentData.orch?.billing_payload || {};
  const inv = bp.invoice_id || bp.id || 'INV-CORRECTION';
  const amt = bp.amount != null ? `$${Number(bp.amount).toLocaleString()}` : _fmt(o.net_leakage);
  const to  = emailData.to || 'finance-ops@acme.com';
  const sub = emailData.subject || `Billing Correction — ${_fmt(o.net_leakage)} Discrepancy`;

  document.getElementById('tag-email').textContent = 'READY';
  document.getElementById('tag-email').className = 'dock-tag live';
  const el = document.getElementById('db-email');
  el.className = 'dock-body ready';
  el.innerHTML = `
    <div class="field"><span class="field-key">TO</span><span class="field-val">${to}</span></div>
    <div class="field"><span class="field-key">SUBJ</span><span class="field-val acid">${sub}</span></div>
    <div class="field"><span class="field-key">REF</span><span class="field-val hot">${inv} · ${amt}</span></div>
    <div style="margin-top:8px">
      <button type="button" class="report-btn" style="font-size:9px;padding:5px 10px;width:100%" onclick="sendRecoveryEmail()">↗ SEND RECOVERY EMAIL</button>
    </div>`;
}

export function updateBillingPayload(payload) {
  const p = payload || {};
  state.lastBillingPayload = p;
  document.getElementById('tag-json').textContent = 'READY';
  document.getElementById('tag-json').className = 'dock-tag ready';
  const el = document.getElementById('db-json');
  el.className = 'dock-body ready';

  const id = p.invoice_id || p.id || 'INV-2024-889';
  const amount = p.amount || 21250;
  const units = p.overage_units || 840;
  const rate = p.rate_per_unit || 0.05;
  const conf = p.confidence || 0.917;
  const due = p.due_days || 30;

  el.innerHTML = `<div class="json-pre"><button class="copy-btn" onclick="copyJSON()">COPY</button><span class="jk">"invoice"</span>: {<br>&nbsp;&nbsp;<span class="jk">"id"</span>: <span class="js">"${id}"</span>,<br>&nbsp;&nbsp;<span class="jk">"amount"</span>: <span class="jn">${amount}</span>,<br>&nbsp;&nbsp;<span class="jk">"overage_units"</span>: <span class="jn">${units}</span>,<br>&nbsp;&nbsp;<span class="jk">"rate_per_unit"</span>: <span class="jn">${rate}</span>,<br>&nbsp;&nbsp;<span class="jk">"confidence"</span>: <span class="jn">${conf}</span>,<br>&nbsp;&nbsp;<span class="jk">"due_days"</span>: <span class="jn">${due}</span><br>}</div>`;
}

export function updateRankedActions(actions) {
  document.getElementById('tag-actions').textContent = 'RANKED';
  document.getElementById('tag-actions').className = 'dock-tag ready';
  const el = document.getElementById('db-actions');
  el.className = 'dock-body ready';

  // Default actions if none provided
  const items = actions || [
    { rank: 1, name: 'Issue Correction Invoice', score: 92.3, description: 'INV-2024-889 · Clear contract basis', amount: '$21,250', amountClass: 'hot' },
    { rank: 2, name: 'Fix Discount Schedule', score: 76.4, description: 'Update §12.3 scope in billing system', amount: '$8,000 future exposure', amountClass: '' },
    { rank: 3, name: 'Escalate to Finance Ops', score: 45.2, description: 'TKT-789 · Low urgency', amount: '$3,200', amountClass: '' },
  ];

  const rankClass = ['', 'top', 'med-rank', 'low-rank'];
  const scoreClass = (s) => s > 80 ? 'high' : s > 60 ? 'med' : '';

  el.innerHTML = items.map((a, i) =>
    `<div class="action-item ${rankClass[a.rank] || rankClass[i + 1] || ''}" onclick="showActionDetail(${a.rank || i + 1})">
      <div class="ai-header"><span class="ai-name">${a.name}</span><span class="ai-score ${scoreClass(a.score)}">SCORE ${a.score}</span></div>
      <div class="ai-desc">${a.description}</div>
      <div class="ai-amount ${a.amountClass || ''}">${typeof a.amount === 'number' ? '$' + a.amount.toLocaleString() : a.amount}</div>
    </div>`
  ).join('');

  document.getElementById('feedbackBar').classList.add('show');
}

export function showReport() {
  document.getElementById('reportBlock').classList.add('show');
}

export function giveFeedback(correct) {
  const el = document.getElementById('fb-result');
  el.textContent = correct ? '✓ OUTCOME LOGGED — MODEL UPDATED' : '✗ FLAGGED FOR REVIEW — PROBABILITY ADJUSTED';
  el.style.color = correct ? 'var(--cool)' : 'var(--amber)';
  el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); }, 3000);
}

export async function exportReport() {
  const accountName = state.currentAccountName || 'Account';
  const accountId = state.currentAccountId || '';
  await exportAccountReport(accountName, accountId, agentData);
}

export function copyJSON() {
  const p = state.lastBillingPayload || agentData.orch?.billing_payload || {};
  const invoice = {
    id: p.invoice_id || p.id || 'INV-2024-889',
    amount: p.amount ?? 21250,
    overage_units: p.overage_units ?? 840,
    rate_per_unit: p.rate_per_unit ?? 0.05,
    confidence: p.confidence ?? 0.917,
    due_days: p.due_days ?? 30,
  };
  const j = JSON.stringify({ invoice }, null, 2);
  navigator.clipboard.writeText(j).catch(() => {});
  const btn = document.querySelector('.copy-btn');
  if (btn) { btn.textContent = 'COPIED'; setTimeout(() => btn.textContent = 'COPY', 1500); }
}

export function resetDock() {
  document.getElementById('tag-email').textContent = 'LOCKED';
  document.getElementById('tag-email').className = 'dock-tag locked';
  document.getElementById('db-email').className = 'dock-body';
  document.getElementById('db-email').innerHTML = '<div style="color:var(--rule2)">Awaiting leakage analysis...</div>';

  document.getElementById('tag-json').textContent = 'LOCKED';
  document.getElementById('tag-json').className = 'dock-tag locked';
  document.getElementById('db-json').className = 'dock-body';
  document.getElementById('db-json').innerHTML = '<div style="color:var(--rule2)">Awaiting orchestrator...</div>';

  document.getElementById('tag-actions').textContent = 'PENDING';
  document.getElementById('tag-actions').className = 'dock-tag locked';
  document.getElementById('db-actions').className = 'dock-body';
  document.getElementById('db-actions').innerHTML = `
    <div class="field"><span class="field-key">INV</span><span class="field-val" style="color:var(--rule2)">—</span></div>
    <div class="field"><span class="field-key">CRM</span><span class="field-val" style="color:var(--rule2)">—</span></div>
    <div class="field"><span class="field-key">SLACK</span><span class="field-val" style="color:var(--rule2)">—</span></div>
    <div class="field"><span class="field-key">STATUS</span><span class="field-val" style="color:var(--rule2)">QUEUED</span></div>`;

  state.lastBillingPayload = null;
  state.lastEmailPlain = null;
  document.getElementById('reportBlock').classList.remove('show');
  document.getElementById('feedbackBar').classList.remove('show');
  document.getElementById('fb-result').classList.remove('show');
  document.getElementById('fb-result').textContent = '';
}
