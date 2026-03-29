// ── MULTI-ACCOUNT OPERATIONS VIEW ──
// Grid of parallel analysis pipelines with aggregate metrics.

import { ACCOUNTS, ACCOUNT_FALLBACK_DATA, getModelSelectionsForAccount } from './state.js';
import { healthCheck, transformAnalysisResult, streamBatchAnalyze } from './api.js';

// Per-card state
let cardStates = {};
let totalLeakage = 0;

// Callback when user clicks a card to drill into single-account view
let onDrillDown = null;

export function setDrillDownHandler(fn) {
  onDrillDown = fn;
}

export function renderOpsView(container) {
  totalLeakage = 0;
  cardStates = {};

  container.innerHTML = `
    <div class="ops-view">
      <div class="ops-header">
        <div class="ops-metrics">
          <div class="ops-metric">
            <div class="ops-metric-label">ACCOUNTS</div>
            <div class="ops-metric-value" id="ops-count">${ACCOUNTS.length}</div>
          </div>
          <div class="ops-metric-sep"></div>
          <div class="ops-metric">
            <div class="ops-metric-label">TOTAL LEAKAGE</div>
            <div class="ops-metric-value hot" id="ops-total-leakage">$0</div>
          </div>
          <div class="ops-metric-sep"></div>
          <div class="ops-metric">
            <div class="ops-metric-label">DETECTION RATE</div>
            <div class="ops-metric-value" id="ops-detection">—</div>
          </div>
          <div class="ops-metric-sep"></div>
          <div class="ops-metric">
            <div class="ops-metric-label">AVG CONFIDENCE</div>
            <div class="ops-metric-value" id="ops-confidence">—</div>
          </div>
        </div>
        <button class="btn primary ops-analyze-btn" id="ops-analyze-btn">▶ ANALYZE ALL</button>
      </div>
      <div class="ops-grid" id="ops-grid">
        ${ACCOUNTS.map(a => renderCard(a)).join('')}
      </div>
      <div class="ops-footer" id="ops-footer">
        <span class="ops-footer-text" id="ops-footer-text">READY — ${ACCOUNTS.length} accounts loaded</span>
      </div>
    </div>
  `;

  document.getElementById('ops-analyze-btn').addEventListener('click', runBatchAnalysis);

  // Click-to-drill-down on cards
  ACCOUNTS.forEach(a => {
    const card = document.getElementById(`card-${a.id}`);
    if (card) {
      card.addEventListener('click', () => {
        if (onDrillDown) {
          onDrillDown(a.id, cardStates[a.id]?.data || null);
        }
      });
    }
  });
}

function renderCard(account) {
  const arrK = (account.arr / 1000).toFixed(0);
  const arrDisplay = account.arr >= 1000000
    ? '$' + (account.arr / 1000000).toFixed(1) + 'M'
    : '$' + arrK + 'K';

  cardStates[account.id] = {
    phase: 'idle',
    data: null,
    stages: {
      contract: 'idle',
      usage: 'idle',
      billing: 'idle',
      orch: 'idle',
    },
  };

  return `
    <div class="ops-card" id="card-${account.id}">
      <div class="ops-card-header">
        <div class="ops-card-name">${account.name.toUpperCase()}</div>
        <div class="ops-card-status" id="card-status-${account.id}">STANDBY</div>
      </div>
      <div class="ops-card-meta">
        <span>${account.id}</span>
        <span class="ops-card-arr">ARR ${arrDisplay}</span>
      </div>
      <div class="ops-card-pipeline" id="card-pipeline-${account.id}">
        <div class="ops-node" id="node-${account.id}-contract">C</div>
        <div class="ops-edge" id="edge-${account.id}-0"></div>
        <div class="ops-node" id="node-${account.id}-usage">U</div>
        <div class="ops-edge" id="edge-${account.id}-1"></div>
        <div class="ops-node" id="node-${account.id}-billing">B</div>
        <div class="ops-edge" id="edge-${account.id}-2"></div>
        <div class="ops-node ops-node-orch" id="node-${account.id}-orch">O</div>
      </div>
      <div class="ops-card-result" id="card-result-${account.id}">
        <div class="ops-result-placeholder">Awaiting analysis...</div>
      </div>
    </div>
  `;
}

// ── BATCH ANALYSIS ORCHESTRATION ──

async function runBatchAnalysis() {
  const btn = document.getElementById('ops-analyze-btn');
  btn.disabled = true;
  btn.textContent = 'ANALYZING...';
  document.getElementById('ops-footer-text').textContent = 'RUNNING — Deploying agents across all accounts...';

  const backendUp = await healthCheck();

  if (backendUp) {
    runWithBackend();
  } else {
    runWithFallback();
  }
}

async function runWithBackend() {
  // Initialize all cards into a running state with Contract stage active.
  ACCOUNTS.forEach(a => startCardLive(a.id));

  const providersByAccount = {};
  ACCOUNTS.forEach(account => {
    providersByAccount[account.id] = getModelSelectionsForAccount(account.id);
  });

  await streamBatchAnalyze(
    { accounts: ACCOUNTS.map(a => a.id), providers_by_account: providersByAccount },
    {
      onEvent: (eventName, data) => handleBatchEvent(eventName, data),
      onError: () => {
        document.getElementById('ops-footer-text').textContent = 'ERROR — Live progress stream interrupted';
        const btn = document.getElementById('ops-analyze-btn');
        btn.textContent = '↻ RUN AGAIN';
        btn.disabled = false;
        btn.className = 'btn ops-analyze-btn done';
      },
      onDone: () => {
        // No-op; finalizeBatch is triggered by card completion checks.
      },
    }
  );
}

function runWithFallback() {
  ACCOUNTS.forEach((a, i) => {
    setTimeout(() => startCardAnimation(a.id), i * 400);
    setTimeout(() => completeCard(a.id, ACCOUNT_FALLBACK_DATA[a.id]), i * 1800 + 2500);
  });
}

function startCardLive(accountId) {
  const card = document.getElementById(`card-${accountId}`);
  if (!card) return;

  card.classList.remove('complete', 'failed');
  card.classList.add('analyzing');

  const status = document.getElementById(`card-status-${accountId}`);
  status.textContent = 'ANALYZING';
  status.className = 'ops-card-status working';

  cardStates[accountId].phase = 'running';
  cardStates[accountId].stages = {
    contract: 'idle',
    usage: 'idle',
    billing: 'idle',
    orch: 'idle',
  };

  ['contract', 'usage', 'billing', 'orch'].forEach(stage => setStageState(accountId, stage, 'idle'));
  [0, 1, 2].forEach(idx => setEdgeState(accountId, idx, false));
  setStageState(accountId, 'contract', 'working');
}

function startCardAnimation(accountId) {
  const card = document.getElementById(`card-${accountId}`);
  if (!card) return;
  card.classList.add('analyzing');

  const status = document.getElementById(`card-status-${accountId}`);
  status.textContent = 'ANALYZING';
  status.className = 'ops-card-status working';

  cardStates[accountId].phase = 'running';

  // Animate pipeline nodes sequentially
  animatePipelineNode(accountId, 'contract', 0);
  animatePipelineNode(accountId, 'usage', 800);
  animatePipelineNode(accountId, 'billing', 800);
  animatePipelineNode(accountId, 'orch', 1800);

  // Animate edges
  animateEdge(accountId, 0, 600);
  animateEdge(accountId, 1, 600);
  animateEdge(accountId, 2, 1500);
}

function animatePipelineNode(accountId, agent, delay) {
  setTimeout(() => {
    const node = document.getElementById(`node-${accountId}-${agent}`);
    if (node) {
      node.classList.add('working');
      // Mark complete after a beat
      setTimeout(() => {
        node.classList.remove('working');
        node.classList.add('complete');
      }, agent === 'orch' ? 800 : 500);
    }
  }, delay);
}

function animateEdge(accountId, idx, delay) {
  setTimeout(() => {
    const edge = document.getElementById(`edge-${accountId}-${idx}`);
    if (edge) edge.classList.add('active');
  }, delay);
}

function setStageState(accountId, stage, state) {
  const node = document.getElementById(`node-${accountId}-${stage}`);
  if (!node) return;
  node.classList.remove('working', 'complete', 'error');
  if (state === 'working' || state === 'complete' || state === 'error') {
    node.classList.add(state);
  }
  if (cardStates[accountId]?.stages) {
    cardStates[accountId].stages[stage] = state;
  }
}

function setEdgeState(accountId, idx, active) {
  const edge = document.getElementById(`edge-${accountId}-${idx}`);
  if (!edge) return;
  edge.classList.toggle('active', !!active);
}

function maybeStartOrch(accountId) {
  const stages = cardStates[accountId]?.stages;
  if (!stages) return;
  if (stages.usage === 'complete' && stages.billing === 'complete' && stages.orch === 'idle') {
    setStageState(accountId, 'orch', 'working');
    setEdgeState(accountId, 2, true);
  }
}

function failCard(accountId, errorMessage) {
  const card = document.getElementById(`card-${accountId}`);
  if (!card || cardStates[accountId]?.phase === 'failed' || cardStates[accountId]?.phase === 'done') return;

  card.classList.remove('analyzing');
  card.classList.add('failed');
  cardStates[accountId].phase = 'failed';

  const status = document.getElementById(`card-status-${accountId}`);
  status.textContent = 'FAILED';
  status.className = 'ops-card-status failed';

  const resultEl = document.getElementById(`card-result-${accountId}`);
  resultEl.innerHTML = `
    <div class="ops-result-placeholder" style="color: var(--hot);">
      Analysis failed${errorMessage ? `: ${String(errorMessage).slice(0, 120)}` : '.'}
    </div>
  `;

  const allFinished = ACCOUNTS.every(a => ['done', 'failed'].includes(cardStates[a.id]?.phase));
  if (allFinished) finalizeBatch();
}

function handleBatchEvent(eventName, data) {
  if (!data) return;
  const accountId = data.account_id;

  if (eventName === 'account_started') {
    if (accountId) startCardLive(accountId);
    return;
  }

  if (eventName === 'stage_update' && accountId) {
    const stage = data.stage;
    const status = data.status;
    if (!stage || !status) return;

    if (stage === 'analysis' && status === 'completed') return;
    if (!cardStates[accountId] || cardStates[accountId].phase !== 'running') return;

    if (status === 'started') {
      if (stage === 'usage' || stage === 'billing') {
        setStageState(accountId, stage, 'working');
      } else if (stage === 'contract' || stage === 'orch') {
        setStageState(accountId, stage, 'working');
      }
      return;
    }

    if (status === 'completed') {
      setStageState(accountId, stage, 'complete');
      if (stage === 'contract') {
        setEdgeState(accountId, 0, true);
        setEdgeState(accountId, 1, true);
      }
      if (stage === 'usage' || stage === 'billing') {
        maybeStartOrch(accountId);
      }
      return;
    }

    if (status === 'failed') {
      setStageState(accountId, stage, 'error');
      failCard(accountId, data.error || 'Stage failed');
    }
    return;
  }

  if (eventName === 'account_completed' && accountId) {
    if (cardStates[accountId]?.phase === 'done' || cardStates[accountId]?.phase === 'failed') return;
    const transformed = transformAnalysisResult(data.result);
    completeCard(accountId, transformed || ACCOUNT_FALLBACK_DATA[accountId]);
    return;
  }

  if (eventName === 'account_failed' && accountId) {
    failCard(accountId, data.error || 'Account analysis failed');
    return;
  }

  if (eventName === 'batch_completed' && data.summary) {
    document.getElementById('ops-footer-text').textContent =
      `COMPLETE — $${(data.summary.total_leakage || 0).toLocaleString()} total leakage detected across ${data.summary.accounts_analyzed || ACCOUNTS.length} accounts`;
  }
}

function completeCard(accountId, data) {
  if (!data) return;

  const card = document.getElementById(`card-${accountId}`);
  if (!card) return;

  card.classList.remove('analyzing');
  card.classList.add('complete');

  cardStates[accountId] = { phase: 'done', data };

  const status = document.getElementById(`card-status-${accountId}`);
  status.textContent = 'COMPLETE';
  status.className = 'ops-card-status done';

  // Extract leakage
  const leakStr = data.orch?.output?.net_leakage || '$0';
  const leakNum = parseInt(leakStr.replace(/[$,]/g, '')) || 0;
  const conf = data.orch?.confidence || 0;
  const urgency = data.orch?.output?.urgency || 'MEDIUM';

  // Render result
  const resultEl = document.getElementById(`card-result-${accountId}`);
  resultEl.innerHTML = `
    <div class="ops-result-leakage">
      <span class="ops-result-label">LEAKAGE</span>
      <span class="ops-result-amount">${leakStr}</span>
    </div>
    <div class="ops-result-row">
      <span class="ops-result-conf">${Math.round(conf * 100)}% CONF</span>
      <span class="ops-result-urgency ${urgency.toLowerCase()}">${urgency}</span>
    </div>
  `;

  // Animate the leakage number slamming in
  const amountEl = resultEl.querySelector('.ops-result-amount');
  if (amountEl) {
    amountEl.classList.add('slam');
    setTimeout(() => amountEl.classList.remove('slam'), 600);
  }

  // Update running total
  totalLeakage += leakNum;
  animateTotalLeakage();

  // Check if all done
  const allFinished = ACCOUNTS.every(a => ['done', 'failed'].includes(cardStates[a.id]?.phase));
  if (allFinished) finalizeBatch();
}

function animateTotalLeakage() {
  const el = document.getElementById('ops-total-leakage');
  if (!el) return;

  // Rapid counter animation
  const target = totalLeakage;
  const start = parseInt(el.textContent.replace(/[$,]/g, '')) || 0;
  const diff = target - start;
  const steps = 30;
  let step = 0;

  const iv = setInterval(() => {
    step++;
    const progress = step / steps;
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + diff * eased);
    el.textContent = '$' + current.toLocaleString();
    if (step >= steps) clearInterval(iv);
  }, 18);
}

function finalizeBatch() {
  const btn = document.getElementById('ops-analyze-btn');
  btn.textContent = '↻ RUN AGAIN';
  btn.disabled = false;
  btn.className = 'btn ops-analyze-btn done';
  btn.onclick = () => {
    // Reset and re-render
    btn.className = 'btn primary ops-analyze-btn';
    btn.textContent = '▶ ANALYZE ALL';
    const grid = document.getElementById('ops-grid');
    totalLeakage = 0;
    document.getElementById('ops-total-leakage').textContent = '$0';
    grid.innerHTML = ACCOUNTS.map(a => renderCard(a)).join('');
    ACCOUNTS.forEach(a => {
      const card = document.getElementById(`card-${a.id}`);
      if (card && onDrillDown) {
        card.addEventListener('click', () => {
          onDrillDown(a.id, cardStates[a.id]?.data || null);
        });
      }
    });
    document.getElementById('ops-footer-text').textContent = `READY — ${ACCOUNTS.length} accounts loaded`;
    document.getElementById('ops-detection').textContent = '—';
    document.getElementById('ops-confidence').textContent = '—';
  };

  // Update aggregate metrics
  const withLeakage = ACCOUNTS.filter(a => {
    const d = cardStates[a.id]?.data;
    const l = parseInt((d?.orch?.output?.net_leakage || '0').replace(/[$,]/g, '')) || 0;
    return l > 0;
  }).length;
  document.getElementById('ops-detection').textContent = `${withLeakage}/${ACCOUNTS.length}`;

  const avgConf = ACCOUNTS.reduce((sum, a) => {
    return sum + (cardStates[a.id]?.data?.orch?.confidence || 0);
  }, 0) / ACCOUNTS.length;
  document.getElementById('ops-confidence').textContent = Math.round(avgConf * 100) + '%';

  document.getElementById('ops-footer-text').textContent =
    `COMPLETE — $${totalLeakage.toLocaleString()} total leakage detected across ${ACCOUNTS.length} accounts`;
}
