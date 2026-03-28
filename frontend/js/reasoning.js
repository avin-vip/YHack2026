// ── REASONING OVERLAY PANEL ──
import { agentData } from './state.js';

export function openReasoning(id) {
  const d = agentData[id];
  if (!d || !d.confidence) return;

  const panel = document.getElementById('reasoningPanel');
  document.getElementById('rp-title').textContent = d.role.toUpperCase() + ' — REASONING TRACE';

  const score = (d.confidence * (d.impact / 1000)).toFixed(1);
  const confColor = d.confidence > 0.9 ? '#3ecfaa' : d.confidence > 0.8 ? '#d9870f' : '#e84040';

  let html = `
    <div class="rp-section">
      <div class="rp-section-title">AGENT IDENTITY</div>
      <div class="rp-row"><span class="rp-key">ROLE</span><span class="rp-val acid">${d.role}</span></div>
      <div class="rp-row"><span class="rp-key">INPUT</span><span class="rp-val">${d.input}</span></div>
    </div>
    <div class="rp-section">
      <div class="rp-section-title">CONFIDENCE & IMPACT</div>
      <div class="confidence-meter">
        <span class="cm-label">CONFIDENCE</span>
        <div class="cm-track"><div class="cm-fill" style="width:${d.confidence * 100}%;background:${confColor}"></div></div>
        <span class="cm-num" style="color:${confColor}">${Math.round(d.confidence * 100)}%</span>
      </div>
      <div style="margin-top:8px">
        <div class="impact-score">
          <span class="is-label">IMPACT SCORE</span>
          <span class="is-val">${score}</span>
        </div>
        <div style="font-size:8px;color:var(--dim);margin-top:4px">score = conf (${d.confidence}) × impact ($${(d.impact / 1000).toFixed(0)}K)</div>
      </div>
    </div>
    <div class="rp-section">
      <div class="rp-section-title">OUTPUT FIELDS</div>
      ${Object.entries(d.output).map(([k, v]) => `<div class="rp-row"><span class="rp-key">${k.replace(/_/g, ' ')}</span><span class="rp-val">${v}</span></div>`).join('')}
    </div>
    <div class="rp-section">
      <div class="rp-section-title">EVIDENCE COLLECTED (${d.evidence.length})</div>
      ${d.evidence.map(e => `<div class="rp-row"><span style="color:var(--cool);margin-right:6px;flex-shrink:0">›</span><span class="rp-val" style="font-size:8px;color:var(--mid)">${e}</span></div>`).join('')}
    </div>
    <div class="rp-section">
      <div class="rp-section-title">REASONING STEPS</div>
      ${d.reasoning.map((r, i) => `<div class="rp-row"><span style="color:var(--dim);width:18px;flex-shrink:0">${i + 1}.</span><span class="rp-val" style="font-size:8px;color:var(--text)">${r}</span></div>`).join('')}
    </div>`;

  document.getElementById('rp-body').innerHTML = html;
  panel.classList.add('open');
}

export function closeReasoning() {
  document.getElementById('reasoningPanel').classList.remove('open');
}

export function showActionDetail(n) {
  const details = [
    null,
    { title: 'Issue Correction Invoice', score: '92.3', amount: '$21,250', basis: '§4.2 + §12.3 violation', deadline: '30 days', probability: '85%', agent: 'Orchestrator' },
    { title: 'Fix Discount Schedule', score: '76.4', amount: '$8,000 exposure', basis: '§12.3 scope ambiguity', deadline: 'Next cycle', probability: '72%', agent: 'Contract Analyst' },
    { title: 'Escalate to Finance', score: '45.2', amount: '$3,200', basis: 'Repeat discrepancy risk', deadline: '14 days', probability: '55%', agent: 'Orchestrator' },
  ];
  const d = details[n];
  if (!d) return;

  document.getElementById('rp-title').textContent = 'ACTION DETAIL — ' + d.title.toUpperCase();
  document.getElementById('rp-body').innerHTML = `
    <div class="rp-section">
      <div class="rp-section-title">ACTION DETAILS</div>
      <div class="rp-row"><span class="rp-key">TITLE</span><span class="rp-val acid">${d.title}</span></div>
      <div class="rp-row"><span class="rp-key">AGENT</span><span class="rp-val">${d.agent}</span></div>
      <div class="rp-row"><span class="rp-key">AMOUNT</span><span class="rp-val hot">${d.amount}</span></div>
      <div class="rp-row"><span class="rp-key">BASIS</span><span class="rp-val">${d.basis}</span></div>
      <div class="rp-row"><span class="rp-key">DEADLINE</span><span class="rp-val amber">${d.deadline}</span></div>
      <div class="rp-row"><span class="rp-key">RECOVERY %</span><span class="rp-val cool">${d.probability}</span></div>
    </div>
    <div class="rp-section">
      <div class="rp-section-title">IMPACT SCORE</div>
      <div class="impact-score"><span class="is-label">SCORE</span><span class="is-val">${d.score}</span></div>
      <div style="font-size:8px;color:var(--dim);margin-top:6px">Higher score = higher confidence × impact. Top-ranked action is highlighted in the action center.</div>
    </div>`;

  document.getElementById('reasoningPanel').classList.add('open');
}
