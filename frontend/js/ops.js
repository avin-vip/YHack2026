// ── MULTI-ACCOUNT OPERATIONS VIEW ──
// Grid of parallel analysis pipelines with aggregate metrics.

import { ACCOUNTS, ACCOUNT_FALLBACK_DATA, getModelSelectionsForAccount } from './state.js';
import { healthCheck, analyzeAccount, listAccounts, transformAnalysisResult } from './api.js';

const AGENT_KEYS = ['contract', 'usage', 'billing', 'orch'];
const AGENT_LABELS = { contract: 'C', usage: 'U', billing: 'B', orch: 'O' };

// Per-card state
let cardStates = {};
let totalLeakage = 0;
let animatingTotal = false;

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

  cardStates[account.id] = { phase: 'idle', data: null };

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
  // Start all cards immediately and dispatch all account analyses in parallel.
  ACCOUNTS.forEach(a => startCardAnimation(a.id));

  const analysisPromises = ACCOUNTS.map(async (account) => {
    const providers = getModelSelectionsForAccount(account.id);
    const backendResult = await analyzeAccount(account.id, providers);
    const transformed = transformAnalysisResult(backendResult);
    completeCard(account.id, transformed || ACCOUNT_FALLBACK_DATA[account.id]);
  });

  await Promise.allSettled(analysisPromises);
}

function runWithFallback() {
  ACCOUNTS.forEach((a, i) => {
    setTimeout(() => startCardAnimation(a.id), i * 400);
    setTimeout(() => completeCard(a.id, ACCOUNT_FALLBACK_DATA[a.id]), i * 1800 + 2500);
  });
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
  const allDone = ACCOUNTS.every(a => cardStates[a.id]?.phase === 'done');
  if (allDone) finalizeBatch();
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
