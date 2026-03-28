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
export async function analyzeAccount(accountId) {
  try {
    const res = await fetch(`${API_BASE}/accounts/${accountId}/analyze`, {
      method: 'POST',
    });
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
