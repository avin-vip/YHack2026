// ── RIGHT DOCK PANEL: email, billing payload, ranked actions, report, feedback ──
import { agentData } from './state.js';

export function updateEmail(emailData) {
  document.getElementById('tag-email').textContent = 'READY';
  document.getElementById('tag-email').className = 'dock-tag live';
  const el = document.getElementById('db-email');
  el.className = 'dock-body ready';
  el.innerHTML = `
    <div class="field"><span class="field-key">TO</span><span class="field-val">${emailData.to || 'finance-ops@acme.com'}</span></div>
    <div class="field"><span class="field-key">SUBJ</span><span class="field-val acid">${emailData.subject || 'Billing Correction — Oct Overage'}</span></div>
    <div style="margin-top:5px;font-size:8px;color:var(--mid);line-height:1.65">${emailData.body || 'Corrective invoice <span style="color:var(--hot);font-weight:600">INV-2024-889</span> for <span style="color:var(--hot);font-weight:600">$21,250</span> has been issued. 840 overage units uncaptured. Payment due within 30 days per §4.2.'}</div>`;
}

export function updateBillingPayload(payload) {
  document.getElementById('tag-json').textContent = 'READY';
  document.getElementById('tag-json').className = 'dock-tag ready';
  const el = document.getElementById('db-json');
  el.className = 'dock-body ready';

  const id = payload.invoice_id || 'INV-2024-889';
  const amount = payload.amount || 21250;
  const units = payload.overage_units || 840;
  const rate = payload.rate_per_unit || 0.05;
  const conf = payload.confidence || 0.917;
  const due = payload.due_days || 30;

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

export function exportReport() {
  const report = {
    case_id: 'ACME-ENT-90210',
    generated: new Date().toISOString(),
    agents: {
      contract: { confidence: agentData.contract.confidence, output: agentData.contract.output },
      usage: { confidence: agentData.usage.confidence, output: agentData.usage.output },
      billing: { confidence: agentData.billing.confidence, output: agentData.billing.output },
      orchestrator: { confidence: agentData.orch.confidence, output: agentData.orch.output },
    },
    issues: ['Overage not captured (840 units)', 'Discount misapplied to overages', 'Missing overage line item on invoice'],
    estimated_recovery: 21250,
    top_action: { id: 'INV-2024-889', amount: 21250, score: 92.3 },
    avg_confidence: 0.917,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = 'aria-report-ACME-ENT-90210.json'; a.click();
  URL.revokeObjectURL(url);
}

export function copyJSON() {
  const j = `{"invoice":{"id":"INV-2024-889","amount":21250,"overage_units":840,"rate_per_unit":0.05,"confidence":0.917,"due_days":30}}`;
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

  document.getElementById('reportBlock').classList.remove('show');
  document.getElementById('feedbackBar').classList.remove('show');
  document.getElementById('fb-result').classList.remove('show');
  document.getElementById('fb-result').textContent = '';
}
