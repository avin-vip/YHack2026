// ── MULTI-ACCOUNT OPERATIONS VIEW ──
// Grid of parallel analysis pipelines with aggregate metrics.

import { ACCOUNTS, ACCOUNT_FALLBACK_DATA } from './state.js';
import { healthCheck, batchAnalyze, listAccounts, transformAnalysisResult, uploadContract } from './api.js';
import { exportDashboardReport } from './report.js';

const AGENT_KEYS = ['contract', 'usage', 'billing', 'orch'];
const AGENT_LABELS = { contract: 'C', usage: 'U', billing: 'B', orch: 'O' };

// Per-card state
let cardStates = {};
let totalLeakage = 0;
let animatingTotal = false;

// Runtime accounts added via PDF upload (not in the static ACCOUNTS list)
let runtimeAccounts = [];

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
        <div class="ops-header-actions">
          <button class="btn ops-upload-btn" id="ops-upload-btn">↑ UPLOAD</button>
          <input type="file" id="ops-upload-input" accept=".pdf" style="display:none">
          <button class="btn ops-export-btn" id="ops-export-btn" style="display:none">↓ EXPORT REPORT</button>
          <button class="btn primary ops-analyze-btn" id="ops-analyze-btn">▶ ANALYZE ALL</button>
        </div>
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
  document.getElementById('ops-upload-btn').addEventListener('click', () => {
    document.getElementById('ops-upload-input').click();
  });
  document.getElementById('ops-upload-input').addEventListener('change', handleUpload);

  // Click-to-drill-down on cards
  _wireCardClicks(ACCOUNTS);
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

// ── HELPERS ──

function _allAccounts() {
  return [...ACCOUNTS, ...runtimeAccounts];
}

function _wireCardClicks(accounts) {
  accounts.forEach(a => {
    const card = document.getElementById(`card-${a.id}`);
    if (card) {
      card.addEventListener('click', () => {
        if (onDrillDown && cardStates[a.id]?.phase === 'done') {
          onDrillDown(a.id, cardStates[a.id].data);
        }
      });
    }
  });
}

function _updateAccountCount() {
  const countEl = document.getElementById('ops-count');
  if (countEl) countEl.textContent = _allAccounts().length;
}

// ── PDF UPLOAD ──

async function handleUpload(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;

  // Reset input so the same file can be re-uploaded if needed
  evt.target.value = '';

  const uploadBtn = document.getElementById('ops-upload-btn');
  uploadBtn.disabled = true;
  uploadBtn.textContent = '↑ UPLOADING…';

  const footer = document.getElementById('ops-footer-text');
  footer.textContent = `UPLOADING — ${file.name}…`;

  let result;
  try {
    result = await uploadContract(file);
  } catch (err) {
    uploadBtn.disabled = false;
    uploadBtn.textContent = '↑ UPLOAD';
    footer.textContent = `UPLOAD FAILED — ${err.message}`;
    return;
  }

  uploadBtn.disabled = false;
  uploadBtn.textContent = '↑ UPLOAD';

  const account = result.account;

  // Avoid duplicates if user uploads the same file twice
  if (runtimeAccounts.find(a => a.id === account.id) || ACCOUNTS.find(a => a.id === account.id)) {
    footer.textContent = `ALREADY LOADED — ${account.name} (${account.id})`;
    return;
  }

  runtimeAccounts.push(account);
  _updateAccountCount();

  // Append a new card to the grid
  const grid = document.getElementById('ops-grid');
  grid.insertAdjacentHTML('beforeend', renderCard(account));
  _wireCardClicks([account]);

  footer.textContent = `UPLOADED — ${account.name} added. Click ANALYZE ALL to run.`;
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
  const allAccounts = _allAccounts();
  // Start all cards in "working" state with staggered animation
  allAccounts.forEach((a, i) => {
    setTimeout(() => startCardAnimation(a.id), i * 400);
  });

  const result = await batchAnalyze();

  if (result && result.results) {
    result.results.forEach((r, i) => {
      const accountId = r.account_id;
      const transformed = transformAnalysisResult(r);
      const data = transformed || ACCOUNT_FALLBACK_DATA[accountId];
      setTimeout(() => completeCard(accountId, data), i * 1200 + 2000);
    });
  } else {
    // Fall back if batch call failed
    runWithFallback();
  }
}

function runWithFallback() {
  // Only animate accounts that have static fallback data.
  // Uploaded (runtime) accounts require the backend — skip them in offline mode.
  const eligible = _allAccounts().filter(a => ACCOUNT_FALLBACK_DATA[a.id]);
  eligible.forEach((a, i) => {
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

  // Finalize when every account that was started (non-idle) is done
  const started = _allAccounts().filter(a => cardStates[a.id]?.phase !== 'idle');
  const allDone = started.length > 0 && started.every(a => cardStates[a.id]?.phase === 'done');
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
  btn.textContent = '✓ COMPLETE';
  btn.disabled = false;
  btn.className = 'btn ops-analyze-btn done';
  btn.onclick = () => {
    // Reset and re-render (keep runtime accounts)
    btn.className = 'btn primary ops-analyze-btn';
    btn.textContent = '▶ ANALYZE ALL';
    document.getElementById('ops-export-btn').style.display = 'none';
    const grid = document.getElementById('ops-grid');
    totalLeakage = 0;
    document.getElementById('ops-total-leakage').textContent = '$0';
    grid.innerHTML = _allAccounts().map(a => renderCard(a)).join('');
    _wireCardClicks(_allAccounts());
    const total = _allAccounts().length;
    document.getElementById('ops-footer-text').textContent = `READY — ${total} accounts loaded`;
    document.getElementById('ops-detection').textContent = '—';
    document.getElementById('ops-confidence').textContent = '—';
  };

  const allAccounts = _allAccounts();

  // Update aggregate metrics
  const withLeakage = allAccounts.filter(a => {
    const d = cardStates[a.id]?.data;
    const l = parseInt((d?.orch?.output?.net_leakage || '0').replace(/[$,]/g, '')) || 0;
    return l > 0;
  }).length;
  document.getElementById('ops-detection').textContent = `${withLeakage}/${allAccounts.length}`;

  const analyzed = allAccounts.filter(a => cardStates[a.id]?.data);
  const avgConf = analyzed.length > 0
    ? analyzed.reduce((sum, a) => sum + (cardStates[a.id]?.data?.orch?.confidence || 0), 0) / analyzed.length
    : 0;
  document.getElementById('ops-confidence').textContent = Math.round(avgConf * 100) + '%';

  document.getElementById('ops-footer-text').textContent =
    `COMPLETE — $${totalLeakage.toLocaleString()} total leakage detected across ${allAccounts.length} accounts`;

  // Show export button and wire it with current analysis snapshot
  const exportBtn = document.getElementById('ops-export-btn');
  exportBtn.style.display = '';
  exportBtn.onclick = () => _handleExportDashboard(allAccounts);
}

function _handleExportDashboard(allAccounts) {
  const exportBtn = document.getElementById('ops-export-btn');
  exportBtn.disabled = true;
  exportBtn.textContent = '↓ GENERATING…';

  const avgConf = allAccounts.filter(a => cardStates[a.id]?.data)
    .reduce((s, a) => s + (cardStates[a.id]?.data?.orch?.confidence || 0), 0)
    / Math.max(allAccounts.filter(a => cardStates[a.id]?.data).length, 1);

  const withLeakage = allAccounts.filter(a => {
    const l = parseInt((cardStates[a.id]?.data?.orch?.output?.net_leakage || '0').replace(/[$,]/g, '')) || 0;
    return l > 0;
  }).length;

  const summary = {
    total_leakage: totalLeakage,
    accounts_analyzed: allAccounts.length,
    accounts_with_leakage: withLeakage,
    avg_confidence: avgConf,
  };

  // Build per-account payload: merge account meta with analysis data
  const accountsPayload = allAccounts
    .filter(a => cardStates[a.id]?.data)
    .map(a => ({
      account_id: a.id,
      name: a.name,
      arr: a.arr,
      tier: a.tier,
      ...cardStates[a.id].data,
    }));

  exportDashboardReport(summary, accountsPayload).finally(() => {
    exportBtn.disabled = false;
    exportBtn.textContent = '↓ EXPORT REPORT';
  });
}
