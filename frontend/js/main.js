// ── MAIN ENTRY POINT ──
// Orchestrates all modules, step functions, keyboard, init.


import { state, STEPS, agentData, setAgentData, setAccounts, ACCOUNTS, ACCOUNT_FALLBACK_DATA, AVAILABLE_MODELS, modelSelections, loadModelSelectionsForAccount } from './state.js';
import { healthCheck, analyzeAccount, listAccounts, transformAnalysisResult } from './api.js';
import { log, logWithTimestamp, setTermState, setTermOut, setConfidence, setStatus, setSB } from './terminals.js';
import { drawEdges, activateEdge, setNode, resetEdges } from './graph.js';
import { updateEmail, updateBillingPayload, updateRankedActions, showReport, giveFeedback, exportReport, copyJSON, resetDock, sendRecoveryEmail } from './dock.js';
import { openReasoning, closeReasoning, closeModelSelector, showActionDetail } from './reasoning.js';
import { startResize } from './resize.js';
import { renderOpsView, setDrillDownHandler } from './ops.js';
import { showToast } from './toast.js';

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
window.sendRecoveryEmail = sendRecoveryEmail;
window.startResize = startResize;
window.switchMode = switchMode;

// ── BACKEND PRE-FETCH ──
let backendPromise = null;
let currentAccountId = 'acme-ent-90210';

// ── CURRENT MODE ──
// 'ops' = multi-account grid view, 'detail' = single-account step-through
let currentMode = 'ops';

function parseCurrency(value) {
  if (typeof value === 'number') return value;
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const normalized = raw.startsWith('-$')
    ? `-${raw.slice(2)}`
    : raw.replace('$', '');
  const parsed = Number.parseFloat(normalized.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency2(value) {
  const amount = parseCurrency(value);
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatLogTimestamp(rawTs) {
  if (typeof rawTs === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(rawTs.trim())) {
    return rawTs.trim();
  }
  if (typeof rawTs === 'string' && rawTs.trim()) {
    const parsed = new Date(rawTs);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function hydrateTerminalLogs(agentId, logs, fallbackLogs = []) {
  const validLogs = Array.isArray(logs)
    ? logs.filter(l => l && typeof l.msg === 'string' && l.msg.trim())
    : [];

  if (validLogs.length > 0) {
    validLogs.forEach(entry => {
      const ts = formatLogTimestamp(entry.ts || entry.timestamp || '');
      const level = typeof entry.level === 'string' ? entry.level : '';
      logWithTimestamp(agentId, ts, entry.msg, level);
    });
    return;
  }

  fallbackLogs.forEach(entry => {
    if (!entry || typeof entry.msg !== 'string' || !entry.msg.trim()) return;
    log(agentId, entry.msg, entry.cls || '');
  });
}

function renderNodeModelLabels() {
  ['contract', 'usage', 'billing', 'orch'].forEach(id => {
    const nmEl = document.getElementById('nm-' + id);
    if (nmEl) {
      const modelName = AVAILABLE_MODELS.find(m => m.id === modelSelections[id])?.name || '';
      nmEl.textContent = modelName;
    }
  });
}

// ── VIEW TOGGLE (summary/raw) ──
function setView(mode) {
  state.viewMode = mode;
  document.getElementById('vt-summary').className = 'vt-btn' + (mode === 'summary' ? ' active' : '');
  document.getElementById('vt-raw').className = 'vt-btn' + (mode === 'raw' ? ' active' : '');
  document.querySelectorAll('.log-msg.dim').forEach(el => {
    el.closest('.log-line').style.display = mode === 'raw' ? '' : 'none';
  });
}

// ── MODE SWITCH (ops/detail) ──
function switchMode(mode, accountId, accountData) {
  currentMode = mode;
  const body = document.getElementById('mainBody');
  const detailView = document.getElementById('detailView');
  const opsContainer = document.getElementById('opsContainer');
  const modeOps = document.getElementById('mode-ops');
  const modeDetail = document.getElementById('mode-detail');

  // Update mode toggle
  modeOps.className = 'vt-btn' + (mode === 'ops' ? ' active' : '');
  modeDetail.className = 'vt-btn' + (mode === 'detail' ? ' active' : '');

  // Detail-only header elements
  const detailOnlyEls = [
    'detail-controls', 'detail-controls-right',
    'stepPill', 'autoplayToggle',
  ];

  if (mode === 'ops') {
    opsContainer.style.display = '';
    detailView.style.display = 'none';
    detailOnlyEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.getElementById('back-btn').style.display = 'none';
    // Show ops-specific controls
    document.getElementById('advBtn').style.display = 'none';
    document.getElementById('resetBtn').style.display = 'none';
  } else {
    opsContainer.style.display = 'none';
    detailView.style.display = 'flex';
    detailOnlyEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = '';
    });
    document.getElementById('back-btn').style.display = '';
    document.getElementById('advBtn').style.display = '';

    if (accountId) {
      currentAccountId = accountId;
      state.currentAccountId = accountId;
      const selected = ACCOUNTS.find(a => a.id === accountId);
      state.currentAccountName = selected?.name || accountId;
      loadModelSelectionsForAccount(accountId);
    }

    if (accountId && accountData) {
      setAgentData(accountData);
      resetAll();
      updateDetailHeader(accountId);
      hydrateDetailFromCompletedData();
    } else if (accountId) {
      // Pre-run drill-down from OPS: open selected account in clean idle state.
      resetAll();
      updateDetailHeader(accountId);
    }

    // Redraw edges after layout change
    setTimeout(() => drawEdges(), 50);
  }
}

function hydrateDetailFromCompletedData() {
  const netLeakage = formatCurrency2(agentData.orch?.output?.net_leakage || 0);
  const expectedRevenue = agentData.contract?.output?.expected_revenue || '$0/mo';
  const usageOverage = agentData.usage?.output?.overage || '0 units';
  const invoiceTotal = agentData.billing?.output?.invoice_total || '$0';

  document.getElementById('idle-overlay').classList.add('hidden');
  document.getElementById('leakage-overlay').classList.remove('show');
  document.getElementById('leakageNum').textContent = formatCurrency2(0);

  state.currentStep = 5;
  state.modelsLocked = true;
  updateStepUI();

  ['contract', 'usage', 'billing', 'orch'].forEach(id => {
    const nmEl = document.getElementById('nm-' + id);
    if (nmEl) nmEl.classList.add('locked');
  });

  setTermState('contract', 'done', 'COMPLETE');
  setTermState('usage', 'done', 'COMPLETE');
  setTermState('billing', 'done', 'COMPLETE');
  setTermState('orch', 'done', 'COMPLETE');

  setTermOut('contract', `EXPECTED ${expectedRevenue.replace(/\/mo$/i, '').trim()} / MO`, 'ready');
  setTermOut('usage', `OVERAGE: ${usageOverage.toUpperCase()}`, 'hot');
  setTermOut('billing', `BILLED ${invoiceTotal} — REVIEWED`, 'hot');
  setTermOut('orch', `LEAKAGE: ${netLeakage} CONFIRMED`, 'hot');

  hydrateTerminalLogs('contract', agentData.contract?.logs, [
    { msg: 'Initializing Contract Analyst...', cls: 'dim' },
    { msg: 'Parsing contract agreement...', cls: 'dim' },
    { msg: 'Analysis complete', cls: 'acid' },
  ]);
  hydrateTerminalLogs('usage', agentData.usage?.logs, [
    { msg: 'Context received from Contract ─▶', cls: 'acid' },
    { msg: `Total consumption: ${agentData.usage?.output?.total_units || '0'} units`, cls: 'ok' },
    { msg: `Contract limit: ${agentData.usage?.output?.contract_limit || '0'} units`, cls: 'ok' },
    { msg: `OVERAGE DETECTED: ${usageOverage}`, cls: 'hot' },
  ]);
  hydrateTerminalLogs('billing', agentData.billing?.logs, [
    { msg: 'Context received from Contract ─▶', cls: 'acid' },
    { msg: `Line items: Base ${agentData.billing?.output?.base_charge || invoiceTotal}`, cls: 'dim' },
    { msg: `Overage line item: ${agentData.billing?.output?.overage_line || '$0.00'} ⚠`, cls: 'hot' },
    { msg: `Discount: ${agentData.billing?.output?.discount_error || 'Review required'}`, cls: 'warn' },
  ]);
  hydrateTerminalLogs('orch', agentData.orch?.logs, [
    { msg: 'All agent contexts received ─▶', cls: 'acid' },
    { msg: 'Computing net leakage...', cls: 'warn' },
    { msg: `NET LEAKAGE: ${netLeakage}`, cls: 'hot' },
  ]);

  setNode('contract', 'complete', (expectedRevenue.replace(/\/mo$/i, '').trim()) + ' expected');
  setNode('usage', 'complete', usageOverage.replace(' units', '') + ' overage');
  setNode('billing', 'complete', invoiceTotal + ' billed');
  setNode('orch', 'orch-done', netLeakage + ' recovered');

  activateEdge('contract', 'usage', '#3ecfaa');
  activateEdge('contract', 'billing', '#3ecfaa');
  activateEdge('usage', 'orch', '#3ecfaa');
  activateEdge('billing', 'orch', '#3ecfaa');

  setConfidence('contract', agentData.contract?.confidence || 0);
  setConfidence('usage', agentData.usage?.confidence || 0);
  setConfidence('billing', agentData.billing?.confidence || 0);
  setConfidence('orch', agentData.orch?.confidence || 0, '#e84040');

  setStatus('RECOVERY COMPLETE', 'done');
  setSB('sb-case', `CASE ${currentAccountId.toUpperCase()} CLOSED ✓`, 'cool');
  setSB('sb-agents', 'AGENTS 4/4', 'cool');
  setSB('sb-ev', 'EVIDENCE 3/3', 'cool');
  setSB('sb-leak', `${netLeakage} RECOVERED`, 'cool');
  const orchImpact = Math.round((agentData.orch?.confidence || 0) * (agentData.orch?.impact || 0));
  setSB('sb-score', `SCORE ${orchImpact.toLocaleString()}`, 'cool');

  const emailData = agentData.orch?.email || {};
  const billingPayload = agentData.orch?.billing_payload || {};
  const recoveryActions = agentData.orch?.recovery_actions;
  const dockActions = (Array.isArray(recoveryActions) && recoveryActions.length > 0)
    ? recoveryActions.map((a, i) => ({
      rank: i + 1,
      name: a.name || a.action || ('Action ' + (i + 1)),
      score: a.score || a.confidence_score || 0,
      description: a.description || '',
      amount: a.amount != null ? a.amount : '',
      amountClass: i === 0 ? 'hot' : '',
    }))
    : null;
  updateEmail(emailData);
  updateBillingPayload(billingPayload);
  updateRankedActions(dockActions);
  showReport();
}

function updateDetailHeader(accountId) {
  const account = ACCOUNTS.find(a => a.id === accountId);
  if (!account) return;
  currentAccountId = accountId;
  state.currentAccountId = accountId;
  state.currentAccountName = account.name || accountId;
  const arrDisplay = account.arr >= 1000000
    ? '$' + (account.arr / 1000000).toFixed(1) + 'M'
    : '$' + (account.arr / 1000).toFixed(0) + 'K';
  const contractId = account.contract_id
    ? account.contract_id.toUpperCase()
    : accountId.toUpperCase();
  document.getElementById('hd-account-id').textContent = account.id.toUpperCase();
  document.getElementById('hd-arr').textContent = arrDisplay;
  document.getElementById('hd-contract').textContent = contractId;
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
    setSB('sb-case', 'CASE ' + (document.getElementById('hd-account-id')?.textContent || 'ACME-ENT-90210') + ' OPENED', 'live');
    setSB('sb-agents', 'AGENTS 1/4', 'live');

    const ev = agentData.contract.evidence || [];
    const expectedRev = (agentData.contract.output && agentData.contract.output.expected_revenue) || '$85,000/mo';

    setTermState('contract', 'working', 'WORKING');
    setNode('contract', 'working');
    log('contract', 'Initializing Contract Analyst...', 'dim');
    setTimeout(() => log('contract', 'Fetching contract from vault...', 'dim'), 300);
    setTimeout(() => log('contract', 'Parsing PDF agreement...', 'dim'), 700);
    setTimeout(() => { if (ev[0]) log('contract', ev[0], 'ok'); }, 1200);
    setTimeout(() => { if (ev[1]) log('contract', ev[1], 'ok'); }, 1600);
    setTimeout(() => { if (ev[2]) log('contract', ev[2], 'warn'); }, 2100);
    setTimeout(() => {
      setTermState('contract', 'done', 'COMPLETE');
      const revDisplay = expectedRev.replace(/\/mo$/i, '').trim();
      setTermOut('contract', 'EXPECTED ' + revDisplay + ' / MO', 'ready');
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
    setTimeout(() => log('usage', 'Loading usage data...', 'dim'), 200);
    setTimeout(() => log('usage', 'Deduplicating retried calls...', 'dim'), 600);
    setTimeout(() => log('usage', 'Total consumption: ' + (agentData.usage.output?.total_units || '10,840') + ' units', 'ok'), 1100);
    setTimeout(() => log('usage', 'Contract limit: ' + (agentData.usage.output?.contract_limit || '10,000') + ' units', 'ok'), 1400);
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
    setTimeout(() => log('billing', 'Loading invoice...', 'dim'), 400);
    setTimeout(() => log('billing', 'Line items: Base ' + billingTotal, 'dim'), 900);
    setTimeout(() => log('billing', 'Overage line item: ' + (agentData.billing.output?.overage_line || '$0.00') + ' ⚠', 'hot'), 1500);
    setTimeout(() => log('billing', 'Discount: ' + (agentData.billing.output?.discount_error || '25% applied to ALL charges'), 'warn'), 2000);
    setTimeout(() => {
      setTermState('billing', 'done', 'COMPLETE');
      setTermOut('billing', 'BILLED ' + billingTotal + ' — UNDERBILLED', 'hot');
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

    const cConf = agentData.contract.confidence;
    const uConf = agentData.usage.confidence;
    const bConf = agentData.billing.confidence;
    const cImpact = agentData.contract.impact;
    const uImpact = agentData.usage.impact;
    const bImpact = agentData.billing.impact;
    const avgConf = ((cConf + uConf + bConf) / 3 * 100).toFixed(1);

    const netLeakageStr = (agentData.orch.output && agentData.orch.output.net_leakage) || '$21,250.00';
    const netLeakageNum = parseCurrency(netLeakageStr) || 21250;
    const leakageFormatted = formatCurrency2(netLeakageNum);
    const impactScore = Math.round(agentData.orch.confidence * netLeakageNum);

    setTermState('orch', 'active', 'CALCULATING');
    setNode('orch', 'orch-active');
    log('orch', 'All agent contexts received ─▶', 'acid');
    setTimeout(() => log('orch', `Contract conf: ${cConf} · impact: $${(cImpact/1000).toFixed(0)}K`, 'blue'), 300);
    setTimeout(() => log('orch', `Usage conf: ${uConf} · impact: $${(uImpact/1000).toFixed(0)}K`, 'blue'), 600);
    setTimeout(() => log('orch', `Billing conf: ${bConf} · impact: $${(bImpact/1000).toFixed(1)}K`, 'blue'), 900);
    setTimeout(() => log('orch', 'Computing net leakage...', 'warn'), 1300);
    setTimeout(() => log('orch', 'Discount correction applied', 'hot'), 1700);
    setTimeout(() => {
      log('orch', `NET LEAKAGE: ${leakageFormatted} | avg conf: ${avgConf}%`, 'hot');
      setSB('sb-leak', `LEAKAGE ${leakageFormatted}`, 'hot');
      setSB('sb-score', `SCORE ${impactScore.toLocaleString()}`, 'hot');
      setConfidence('orch', agentData.orch.confidence, '#e84040');

      const overlay = document.getElementById('leakage-overlay');
      overlay.classList.add('show');

      // Update subtitle with account-specific data
      const overageUnits = agentData.usage.output?.overage || '840 units';
      const overageRate = agentData.contract.output?.overage_rate || '$0.05/unit';
      document.getElementById('leakageSub').textContent =
        overageUnits.toUpperCase() + ' OVERAGE × ' + overageRate.toUpperCase();

      let cur = 0; const target = netLeakageNum;
      const inc = target / 50;
      const iv = setInterval(() => {
        cur = Math.min(cur + inc, target);
        document.getElementById('leakageNum').textContent = formatCurrency2(cur);
        if (cur >= target) clearInterval(iv);
      }, 22);

      showToast(`⚡ LEAKAGE DETECTED — ${leakageFormatted} · ${state.currentAccountName}`, 'alert', 5000);
    }, 2500);
  },

  // Step 4: Execute recovery
  function step4() {
    const netLeakageStr = (agentData.orch.output && agentData.orch.output.net_leakage) || '$21,250.00';
    const netLeakageNum = parseCurrency(netLeakageStr) || 21250;
    const leakageFormatted = formatCurrency2(netLeakageNum);

    document.getElementById('leakage-overlay').classList.remove('show');
    setTermOut('orch', 'LEAKAGE: ' + leakageFormatted + ' CONFIRMED', 'hot');
    setNode('orch', 'orch-active');
    log('orch', 'Generating ranked action list...', 'warn');
    setTimeout(() => log('orch', 'Correction invoice created: ' + leakageFormatted, 'ok'), 400);
    setTimeout(() => log('orch', 'Discount correction queued', 'ok'), 800);
    setTimeout(() => log('orch', 'CRM ticket opened', 'ok'), 1000);
    setTimeout(() => {
      log('orch', '#finance-ops Slack notification sent', 'ok');
      showToast('Slack · #finance-ops notified of revenue discrepancy', 'success');
    }, 1200);
    setTimeout(() => log('orch', 'Recovery package dispatched ─▶', 'acid'), 1600);

    const emailData = agentData.orch.email || {};
    const billingPayload = agentData.orch.billing_payload || {};
    const recoveryActions = agentData.orch.recovery_actions;

    setTimeout(() => updateEmail(emailData), 500);
    setTimeout(() => updateBillingPayload(billingPayload), 900);

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
    const netLeakageStr = (agentData.orch.output && agentData.orch.output.net_leakage) || '$21,250.00';
    const netLeakageNum = parseCurrency(netLeakageStr) || 21250;
    const leakageFormatted = formatCurrency2(netLeakageNum);
    const leakageK = '$' + (netLeakageNum / 1000).toFixed(0) + 'K';

    setStatus('RECOVERY COMPLETE', 'done');
    setNode('orch', 'orch-done', leakageK + ' recovered');
    setSB('sb-leak', leakageFormatted + ' RECOVERED', 'cool');
    setSB('sb-case', 'CASE CLOSED ✓', 'cool');

    const flash = document.getElementById('recovery-flash');
    flash.classList.add('flash');
    setTimeout(() => flash.classList.remove('flash'), 400);

    log('orch', '─────────────────────────────────', 'dim');
    log('orch', 'CASE CLOSED — ' + leakageFormatted + ' RECOVERED', 'acid');
    showToast(`✓ CASE CLOSED — ${leakageFormatted} queued for recovery`, 'success', 6000);

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

  // On step 1: lock model selections and kick off backend fetch (non-blocking)
  if (state.currentStep === 1) {
    state.modelsLocked = true;
    closeModelSelector();
    // Update node model labels to show locked state
    ['contract', 'usage', 'billing', 'orch'].forEach(id => {
      const nmEl = document.getElementById('nm-' + id);
      if (nmEl) nmEl.classList.add('locked');
    });

    // Start backend fetch in background — don't block the UI animation
    if (state.backendUp) {
      backendPromise = analyzeAccount(currentAccountId, { ...modelSelections });
      backendPromise.then(result => {
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
      }).catch(err => {
        console.warn('[ARIA] Backend fetch failed — keeping fallback data', err);
      });
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
  state.modelsLocked = false;
  backendPromise = null;
  updateStepUI();
  setStatus('STANDBY', '');
  closeReasoning();
  closeModelSelector();

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
    // Reset model label to unlocked state
    const nmEl = document.getElementById('nm-' + id);
    if (nmEl) {
      nmEl.classList.remove('locked');
      const modelName = AVAILABLE_MODELS.find(m => m.id === modelSelections[id])?.name || '';
      nmEl.textContent = modelName;
    }
  });

  document.getElementById('idle-overlay').classList.remove('hidden');
  document.getElementById('leakage-overlay').classList.remove('show');
  document.getElementById('leakageNum').textContent = formatCurrency2(0);
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
    if (currentMode === 'detail' && state.currentStep < 5) advance();
  }
  if (e.code === 'Escape') {
    if (currentMode === 'detail') {
      closeReasoning();
    }
  }
  if (e.code === 'Escape') { closeReasoning(); closeModelSelector(); }
});

// ── CLICK GRAPH NODES ──
['contract', 'usage', 'billing', 'orch'].forEach(id => {
  const el = document.getElementById('node-' + id);
  if (el) el.addEventListener('click', () => openReasoning(id));
});

// ── DRILL-DOWN HANDLER ──
setDrillDownHandler((accountId, data) => {
  switchMode('detail', accountId, data);
});

// ── INIT ──
window.addEventListener('load', async () => {
  loadModelSelectionsForAccount(state.currentAccountId);

  drawEdges();
  window.addEventListener('resize', drawEdges);
  updateStepUI();

  // Render the ops view into the container
  const opsContainer = document.getElementById('opsContainer');
  renderOpsView(opsContainer);

  // Start in ops mode
  switchMode('ops');

  // Check backend availability
  const backendUp = await healthCheck();
  state.backendUp = backendUp;
  if (backendUp) {
    console.log('[ARIA] Backend connected at localhost:8000');

    // Fetch real account list and re-render the ops grid
    listAccounts().then(accounts => {
      if (accounts && accounts.length > 0) {
        setAccounts(accounts);
        renderOpsView(opsContainer);
        console.log(`[ARIA] Loaded ${accounts.length} accounts from backend`);
      }
    }).catch(err => {
      console.warn('[ARIA] Failed to fetch accounts — using hardcoded list', err);
    });
  } else {
    console.log('[ARIA] Backend offline — using fallback data');
  }

  // Initialize model labels on nodes
  renderNodeModelLabels();
});
