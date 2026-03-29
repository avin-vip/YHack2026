// ── RIGHT DOCK PANEL: email, billing payload, ranked actions, report, feedback ──
import { agentData, state } from './state.js';

/** Opens default mail client with drafted recovery message (mailto). For SMTP/API sending, use a backend relay. */
export function sendRecoveryEmail() {
  const email = agentData.orch?.email || {};
  const rawTo = (email.to || 'finance-ops@acme.com').split(/[;,]/)[0].trim();
  const subject = email.subject || 'Billing correction';
  const body = typeof email.body === 'string'
    ? email.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  const q = `mailto:${encodeURIComponent(rawTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body || '(see ARIA dock for full text)')}`;
  window.location.href = q;
}
import { exportAccountReport } from './report.js';

export function updateEmail(emailData) {
  document.getElementById('tag-email').textContent = 'READY';
  document.getElementById('tag-email').className = 'dock-tag live';
  const el = document.getElementById('db-email');
  el.className = 'dock-body ready';
  el.innerHTML = `
    <div class="field"><span class="field-key">TO</span><span class="field-val">${emailData.to || 'finance-ops@acme.com'}</span></div>
    <div class="field"><span class="field-key">SUBJ</span><span class="field-val acid">${emailData.subject || 'Billing Correction — Oct Overage'}</span></div>
    <div style="margin-top:5px;font-size:8px;color:var(--mid);line-height:1.65">${emailData.body || 'Corrective invoice <span style="color:var(--hot);font-weight:600">INV-2024-889</span> for <span style="color:var(--hot);font-weight:600">$21,250</span> has been issued. 840 overage units uncaptured. Payment due within 30 days per §4.2.'}</div>
    <div style="margin-top:10px"><button type="button" class="report-btn" style="font-size:9px;padding:6px 12px" onclick="sendRecoveryEmail()">OPEN IN EMAIL CLIENT</button></div>`;
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
  document.getElementById('reportBlock').classList.remove('show');
  document.getElementById('feedbackBar').classList.remove('show');
  document.getElementById('fb-result').classList.remove('show');
  document.getElementById('fb-result').textContent = '';
}
