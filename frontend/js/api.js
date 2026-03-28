// ── BACKEND API CLIENT ──
// This is THE integration point between frontend and backend.
// When the backend is not running, functions return null and the UI uses fallback data from state.js.

const API_BASE = 'http://localhost:8000/api';

/**
 * Check if the backend is reachable.
 */
export async function healthCheck() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get account details.
 */
export async function getAccount(accountId) {
  try {
    const res = await fetch(`${API_BASE}/accounts/${accountId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Run the full 4-agent analysis pipeline.
 * Returns the complete analysis result, or null if backend is unavailable.
 *
 * Response shape:
 * {
 *   account_id, agents: { contract, usage, billing, orchestrator },
 *   leakage, recovery_actions, email, billing_payload, audit_trail
 * }
 */
export async function analyzeAccount(accountId, providers = null) {
  try {
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providers }),
    };
    const res = await fetch(`${API_BASE}/accounts/${accountId}/analyze`, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Execute a recovery action.
 */
export async function executeRecovery({ accountId, actionName, amount, invoiceId }) {
  try {
    const res = await fetch(`${API_BASE}/actions/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: accountId,
        action_name: actionName,
        amount,
        invoice_id: invoiceId,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * List all accounts.
 */
export async function listAccounts() {
  try {
    const res = await fetch(`${API_BASE}/accounts`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.accounts || [];
  } catch {
    return null;
  }
}

/**
 * Run batch analysis on all accounts in parallel.
 */
export async function batchAnalyze() {
  try {
    const res = await fetch(`${API_BASE}/batch-analyze`, { method: 'POST' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Get audit trail for an account.
 */
export async function getAuditTrail(accountId) {
  try {
    const res = await fetch(`${API_BASE}/audit/${accountId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Transform a backend analysis response into the frontend agentData format.
 *
 * Backend shape:
 *   { agents: { contract, usage, billing, orchestrator }, leakage, recovery_actions, email, billing_payload }
 *   Each agent: { role, input_description, output, confidence, evidence, reasoning, logs, impact }
 *
 * Frontend shape (per agent):
 *   { role, input (string), output (dict), confidence, impact (number), evidence (array), reasoning (array) }
 *
 * Mapping:
 *   - input_description → input
 *   - agents.orchestrator → orch
 *   - recovery_actions, email, billing_payload stored on orch
 */
export function transformAnalysisResult(backendResult) {
  if (!backendResult || !backendResult.agents) return null;

  function transformAgent(agent) {
    if (!agent) return null;
    return {
      role: agent.role,
      input: agent.input_description,
      output: agent.output,
      confidence: agent.confidence,
      impact: agent.impact,
      evidence: agent.evidence,
      reasoning: agent.reasoning,
      model: agent.model || null,
    };
  }

  const result = {};

  // Transform standard agents (contract, usage, billing)
  for (const key of ['contract', 'usage', 'billing']) {
    if (backendResult.agents[key]) {
      result[key] = transformAgent(backendResult.agents[key]);
    }
  }

  // Map orchestrator → orch, and attach top-level recovery fields
  if (backendResult.agents.orchestrator) {
    result.orch = transformAgent(backendResult.agents.orchestrator);
  }

  // Store recovery-related data on the orch agent
  if (result.orch) {
    result.orch.recovery_actions = backendResult.recovery_actions || [];
    result.orch.email = backendResult.email || {};
    result.orch.billing_payload = backendResult.billing_payload || {};
  }

  return result;
}
