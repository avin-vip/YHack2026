// ── MAIN ENTRY POINT ──
// Orchestrates all modules, step functions, keyboard, init.

import { state, STEPS, agentData, setAgentData } from './state.js';
import { healthCheck, analyzeAccount, transformAnalysisResult } from './api.js';
import { log, setTermState, setTermOut, setConfidence, setStatus, setSB } from './terminals.js';
import { drawEdges, activateEdge, setNode, resetEdges } from './graph.js';
import { updateEmail, updateBillingPayload, updateRankedActions, showReport, giveFeedback, exportReport, copyJSON, resetDock } from './dock.js';
import { openReasoning, closeReasoning, showActionDetail } from './reasoning.js';
import { startResize } from './resize.js';

// ── Expose to HTML onclick handlers ──
window.advance = advance;
window.resetAll = resetAll;
window.toggleAutoplay = toggleAutoplay;
window.setView = setView;
window.openReasoning = openReasoning;
window.closeReasoning = closeReasoning;
window.showActionDetail = showActionDetail;
window.giveFeedback = giveFeedback;
window.exportReport = exportReport;
window.copyJSON = copyJSON;
window.startResize = startResize;

// ── BACKEND PRE-FETCH ──
let backendPromise = null;

// ── VIEW TOGGLE ──
function setView(mode) {
  state.viewMode = mode;
  document.getElementById('vt-summary').className = 'vt-btn' + (mode === 'summary' ? ' active' : '');
  document.getElementById('vt-raw').className = 'vt-btn' + (mode === 'raw' ? ' active' : '');
  document.querySelectorAll('.log-msg.dim').forEach(el => {
    el.closest('.log-line').style.display = mode === 'raw' ? '' : 'none';
  });
}

// ── STEP UI ──
function updateStepUI() {
  const n = state.currentStep;
  document.getElementById('stepN').textContent = n;
  document.getElementById('stepHint').textContent = STEPS[n]?.hint || '';
  document.getElementById('stepPill').style.opacity = n > 0 ? '1' : '0';

  const btn = document.getElementById('advBtn');
  if (n === 0) { btn.textContent = '▶ BEGIN'; btn.disabled = false; }
  else if (n < 5) { btn.textContent = 'NEXT STEP →'; btn.disabled = false; }
  else { btn.textContent = '✓ COMPLETE'; btn.disabled = true; document.getElementById('resetBtn').style.display = ''; }

  document.getElementById('navHint').style.display = n >= 5 ? 'none' : '';
  for (let i = 0; i <= 5; i++) {
    const dot = document.getElementById('sd' + i);
    if (dot) dot.className = 'step-dot' + (i < n ? ' past' : i === n ? ' current' : '');
  }
}

// ── STEP SCRIPTS ──
const stepFns = [
  // Step 1: Contract Analyst
  function step1() {
    document.getElementById('idle-overlay').classList.add('hidden');
    setStatus('ANALYZING', 'live');
    setSB('sb-case', 'CASE ACME-ENT-90210 OPENED', 'live');
    setSB('sb-agents', 'AGENTS 1/4', 'live');

    const ev = agentData.contract.evidence || [];
    const expectedRev = (agentData.contract.output && agentData.contract.output.expected_revenue) || '$85,000/mo';

    setTermState('contract', 'working', 'WORKING');
    setNode('contract', 'working');
    log('contract', 'Initializing Contract Analyst...', 'dim');
    setTimeout(() => log('contract', 'Fetching CTR-12345 from vault...', 'dim'), 300);
    setTimeout(() => log('contract', 'Parsing 24-page PDF agreement...', 'dim'), 700);
    setTimeout(() => { if (ev[0]) log('contract', ev[0], 'ok'); }, 1200);
    setTimeout(() => { if (ev[1]) log('contract', ev[1], 'ok'); }, 1600);
    setTimeout(() => { if (ev[2]) log('contract', ev[2], 'warn'); }, 2100);
    setTimeout(() => {
      setTermState('contract', 'done', 'COMPLETE');
      // Format expected revenue for terminal output (e.g. "$85,000/mo" -> "EXPECTED $85,000 / MO")
      const revDisplay = expectedRev.replace(/\/mo$/i, '').trim();
      setTermOut('contract', 'EXPECTED ' + revDisplay + ' / MO', 'ready');
      // Abbreviate for node label (e.g. "$85,000/mo" -> "$85K expected")
      const revNum = parseFloat(revDisplay.replace(/[$,]/g, ''));
      const revLabel = isNaN(revNum) ? revDisplay : ('$' + (revNum / 1000).toFixed(0) + 'K');
      setNode('contract', 'complete', revLabel + ' expected');
      setConfidence('contract', agentData.contract.confidence);
      log('contract', 'Analysis complete — score: 80.75', 'acid');
      setSB('sb-ev', 'EVIDENCE 1/3', 'live');
      setSB('sb-score', 'SCORE 80.75', 'live');
    }, 2600);
  },

  // Step 2: Usage + Billing parallel
  function step2() {
    setSB('sb-agents', 'AGENTS 3/4', 'live');
    activateEdge('contract', 'usage', '#c8f040');
    activateEdge('contract', 'billing', '#c8f040');

    const usageOverage = (agentData.usage.output && agentData.usage.output.overage) || '840 units';
    const billingTotal = (agentData.billing.output && agentData.billing.output.invoice_total) || '$63,750';

    // USAGE
    setTermState('usage', 'working', 'WORKING');
    setNode('usage', 'working');
    log('usage', 'Context received from Contract ─▶', 'acid');
    setTimeout(() => log('usage', 'Loading usage-oct.csv (1,850 rows)...', 'dim'), 200);
    setTimeout(() => log('usage', 'Deduplicating retried calls...', 'dim'), 600);
    setTimeout(() => log('usage', 'Total consumption: 10,840 units', 'ok'), 1100);
    setTimeout(() => log('usage', 'Contract limit: 10,000 units', 'ok'), 1400);
    setTimeout(() => log('usage', 'OVERAGE DETECTED: ' + usageOverage, 'hot'), 1800);
    setTimeout(() => {
      setTermState('usage', 'done', 'COMPLETE');
      setTermOut('usage', 'OVERAGE: ' + usageOverage.toUpperCase(), 'hot');
      setNode('usage', 'complete', usageOverage.replace(' units', '') + ' overage');
      setConfidence('usage', agentData.usage.confidence);
      setSB('sb-ev', 'EVIDENCE 2/3', 'live');
    }, 2300);

    // BILLING (parallel)
    setTermState('billing', 'active', 'WORKING');
    setNode('billing', 'working');
    log('billing', 'Context received from Contract ─▶', 'acid');
    setTimeout(() => log('billing', 'Loading INV-2024-456...', 'dim'), 400);
    setTimeout(() => log('billing', 'Line items: Base ' + billingTotal, 'dim'), 900);
    setTimeout(() => log('billing', 'Overage line item: $0.00 ⚠', 'hot'), 1500);
    setTimeout(() => log('billing', 'Discount applied to ALL charges', 'warn'), 2000);
    setTimeout(() => {
      setTermState('billing', 'done', 'COMPLETE');
      setTermOut('billing', 'BILLED ' + billingTotal + ' — UNDERBILLED', 'hot');
      // Abbreviate dollar amount for node label (e.g. "$63,750" -> "$63.7K")
      const billingNum = parseFloat(billingTotal.replace(/[$,]/g, ''));
      const billingLabel = isNaN(billingNum) ? billingTotal : ('$' + (billingNum / 1000).toFixed(1) + 'K');
      setNode('billing', 'complete', billingLabel + ' billed');
      setConfidence('billing', agentData.billing.confidence);
      setSB('sb-ev', 'EVIDENCE 3/3', 'live');
    }, 2700);
  },

  // Step 3: Orchestrator calculates
  function step3() {
    setSB('sb-agents', 'AGENTS 4/4', 'live');
    activateEdge('usage', 'orch', '#e84040');
    activateEdge('billing', 'orch', '#e84040');
    setStatus('LEAKAGE FOUND', 'alert');

    // Extract real confidence and leakage values
    const cConf = agentData.contract.confidence;
    const uConf = agentData.usage.confidence;
    const bConf = agentData.billing.confidence;
    const cImpact = agentData.contract.impact;
    const uImpact = agentData.usage.impact;
    const bImpact = agentData.billing.impact;
    const avgConf = ((cConf + uConf + bConf) / 3 * 100).toFixed(1);

    // Parse net leakage from orch output (strip $ and , to get number)
    const netLeakageStr = (agentData.orch.output && agentData.orch.output.net_leakage) || '$21,250';
    const netLeakageNum = parseFloat(netLeakageStr.replace(/[$,]/g, '')) || 21250;
    const leakageFormatted = '$' + netLeakageNum.toLocaleString();
    const impactScore = Math.round(agentData.orch.confidence * netLeakageNum);

    setTermState('orch', 'active', 'CALCULATING');
    setNode('orch', 'orch-active');
    log('orch', 'All agent contexts received ─▶', 'acid');
    setTimeout(() => log('orch', `Contract conf: ${cConf} · impact: $${(cImpact/1000).toFixed(0)}K`, 'blue'), 300);
    setTimeout(() => log('orch', `Usage conf: ${uConf} · impact: $${(uImpact/1000).toFixed(0)}K`, 'blue'), 600);
    setTimeout(() => log('orch', `Billing conf: ${bConf} · impact: $${(bImpact/1000).toFixed(1)}K`, 'blue'), 900);
    setTimeout(() => log('orch', 'Overage: 840 × $0.05 × 1,000 = $42,000', 'warn'), 1300);
    setTimeout(() => log('orch', 'Discount correction: −$20,750', 'hot'), 1700);
    setTimeout(() => {
      log('orch', `NET LEAKAGE: ${leakageFormatted} | avg conf: ${avgConf}%`, 'hot');
      setSB('sb-leak', `LEAKAGE ${leakageFormatted}`, 'hot');
      setSB('sb-score', `SCORE ${impactScore.toLocaleString()}`, 'hot');
      setConfidence('orch', agentData.orch.confidence, '#e84040');

      const overlay = document.getElementById('leakage-overlay');
      overlay.classList.add('show');
      let cur = 0; const target = netLeakageNum;
      const inc = target / 50;
      const iv = setInterval(() => {
        cur = Math.min(cur + inc, target);
        document.getElementById('leakageNum').textContent = '$' + Math.round(cur).toLocaleString();
        if (cur >= target) clearInterval(iv);
      }, 22);
    }, 2500);
  },

  // Step 4: Execute recovery
  function step4() {
    const netLeakageStr = (agentData.orch.output && agentData.orch.output.net_leakage) || '$21,250';
    const netLeakageNum = parseFloat(netLeakageStr.replace(/[$,]/g, '')) || 21250;
    const leakageFormatted = '$' + netLeakageNum.toLocaleString();

    document.getElementById('leakage-overlay').classList.remove('show');
    setTermOut('orch', 'LEAKAGE: ' + leakageFormatted + ' CONFIRMED', 'hot');
    setNode('orch', 'orch-active');
    log('orch', 'Generating ranked action list...', 'warn');
    setTimeout(() => log('orch', 'INV-2024-889 created: ' + leakageFormatted + ' (score 92.3)', 'ok'), 400);
    setTimeout(() => log('orch', 'Discount correction queued (score 76.4)', 'ok'), 800);
    setTimeout(() => log('orch', 'CRM ticket TKT-789 opened', 'ok'), 1000);
    setTimeout(() => log('orch', '#finance-ops Slack notification sent', 'ok'), 1200);
    setTimeout(() => log('orch', 'Recovery package dispatched ─▶', 'acid'), 1600);

    // Pass real data to dock panels
    const emailData = agentData.orch.email || {};
    const billingPayload = agentData.orch.billing_payload || {};
    const recoveryActions = agentData.orch.recovery_actions;

    setTimeout(() => updateEmail(emailData), 500);
    setTimeout(() => updateBillingPayload(billingPayload), 900);

    // Transform recovery_actions to the format dock.js expects
    if (recoveryActions && Array.isArray(recoveryActions) && recoveryActions.length > 0) {
      const dockActions = recoveryActions.map((a, i) => ({
        rank: i + 1,
        name: a.name || a.action || ('Action ' + (i + 1)),
        score: a.score || a.confidence_score || 0,
        description: a.description || '',
        amount: a.amount != null ? a.amount : '',
        amountClass: i === 0 ? 'hot' : '',
      }));
      setTimeout(() => updateRankedActions(dockActions), 1400);
    } else {
      setTimeout(() => updateRankedActions(null), 1400);
    }
  },

  // Step 5: Complete
  function step5() {
    const netLeakageStr = (agentData.orch.output && agentData.orch.output.net_leakage) || '$21,250';
    const netLeakageNum = parseFloat(netLeakageStr.replace(/[$,]/g, '')) || 21250;
    const leakageFormatted = '$' + netLeakageNum.toLocaleString();
    const leakageK = '$' + (netLeakageNum / 1000).toFixed(0) + 'K';

    setStatus('RECOVERY COMPLETE', 'done');
    setNode('orch', 'orch-done', leakageK + ' recovered');
    setSB('sb-leak', leakageFormatted + ' RECOVERED', 'cool');
    setSB('sb-case', 'CASE ACME-ENT-90210 CLOSED ✓', 'cool');

    const flash = document.getElementById('recovery-flash');
    flash.classList.add('flash');
    setTimeout(() => flash.classList.remove('flash'), 400);

    log('orch', '─────────────────────────────────', 'dim');
    log('orch', 'CASE CLOSED — ' + leakageFormatted + ' RECOVERED', 'acid');

    activateEdge('contract', 'usage', '#3ecfaa');
    activateEdge('contract', 'billing', '#3ecfaa');
    activateEdge('usage', 'orch', '#3ecfaa');
    activateEdge('billing', 'orch', '#3ecfaa');

    showReport();
  },
];

// ── ADVANCE ──
async function advance() {
  if (state.currentStep >= 5) return;
  state.currentStep++;
  updateStepUI();

  // On step 1: try to resolve backend data before running the step
  if (state.currentStep === 1 && backendPromise) {
    try {
      const result = await backendPromise;
      if (result) {
        const transformed = transformAnalysisResult(result);
        if (transformed) {
          setAgentData(transformed);
          console.log('[ARIA] Using real backend data');
        } else {
          console.warn('[ARIA] Transform returned null — keeping fallback data');
        }
      } else {
        console.warn('[ARIA] Backend returned null — keeping fallback data');
      }
    } catch (err) {
      console.warn('[ARIA] Backend fetch failed — keeping fallback data', err);
    }
  }

  stepFns[state.currentStep - 1]();

  if (state.autoplay && state.currentStep < 5) {
    clearTimeout(state.autoTimer);
    const delays = [3500, 3800, 3500, 2800, 0];
    state.autoTimer = setTimeout(advance, delays[state.currentStep - 1] || 3000);
  }
}

// ── AUTOPLAY ──
function toggleAutoplay() {
  state.autoplay = !state.autoplay;
  document.getElementById('autoTrack').className = 'toggle-track' + (state.autoplay ? ' on' : '');
  if (state.autoplay && state.currentStep > 0 && state.currentStep < 5) {
    state.autoTimer = setTimeout(advance, 2000);
  } else {
    clearTimeout(state.autoTimer);
  }
}

// ── RESET ──
function resetAll() {
  clearTimeout(state.autoTimer);
  state.currentStep = 0;
  updateStepUI();
  setStatus('STANDBY', '');
  closeReasoning();

  ['contract', 'usage', 'billing', 'orch'].forEach(id => {
    setTermState(id, 'idle', 'IDLE');
    setTermOut(id, '—', '');
    document.getElementById('tb-' + id).innerHTML = '';
    document.getElementById('node-' + id).className = 'node-label';
    document.getElementById('nv-' + id).textContent = '';
    const cb = document.getElementById('cb-' + id);
    if (cb) cb.classList.remove('show');
    const cf = document.getElementById('cf-' + id);
    if (cf) cf.style.width = '0';
    const cv = document.getElementById('cv-' + id);
    if (cv) cv.textContent = '0%';
  });

  document.getElementById('idle-overlay').classList.remove('hidden');
  document.getElementById('leakage-overlay').classList.remove('show');
  document.getElementById('leakageNum').textContent = '$0';
  resetEdges();
  resetDock();

  setSB('sb-case', 'CASE —', '');
  setSB('sb-agents', 'AGENTS 0/4', '');
  setSB('sb-ev', 'EVIDENCE 0/3', '');
  setSB('sb-leak', 'LEAKAGE —', '');
  setSB('sb-score', 'SCORE —', '');

  document.getElementById('advBtn').textContent = '▶ BEGIN';
  document.getElementById('advBtn').disabled = false;
  document.getElementById('resetBtn').style.display = 'none';
  document.getElementById('stepPill').style.opacity = '0';
}

// ── KEYBOARD ──
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !e.target.matches('input,textarea')) {
    e.preventDefault();
    if (state.currentStep < 5) advance();
  }
  if (e.code === 'Escape') closeReasoning();
});

// ── CLICK GRAPH NODES ──
['contract', 'usage', 'billing', 'orch'].forEach(id => {
  const el = document.getElementById('node-' + id);
  if (el) el.addEventListener('click', () => openReasoning(id));
});

// ── INIT ──
window.addEventListener('load', async () => {
  drawEdges();
  window.addEventListener('resize', drawEdges);
  updateStepUI();

  // Check if backend is available
  const backendUp = await healthCheck();
  if (backendUp) {
    console.log('[ARIA] Backend connected at localhost:8000');
    // Start pre-fetching analysis in the background (don't await)
    backendPromise = analyzeAccount('acme-ent-90210');
  } else {
    console.log('[ARIA] Backend offline — using fallback data');
  }
});
