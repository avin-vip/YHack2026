// ── SHARED STATE ──
// All modules read/write from this shared state object.

export const state = {
  currentStep: 0,
  autoplay: false,
  autoTimer: null,
  viewMode: 'summary',
};

export const STEPS = [
  { hint: 'Deploy Contract Analyst' },
  { hint: 'Validate usage data' },
  { hint: 'Run parallel audit' },
  { hint: 'Orchestrate recovery' },
  { hint: 'Execute recovery' },
  { hint: 'Complete' },
];

// Default/fallback agent data — used when backend is unavailable.
// When the backend IS available, api.js replaces this with real LLM results.
export let agentData = {
  contract: {
    role: 'Contract Analyst',
    input: 'CTR-12345 · 24-page PDF agreement',
    output: { expected_revenue: '$85,000/mo', pricing_tier: 'Enterprise Plus', discount_schedule: 'Base only (§12.3)', overage_rate: '$0.05/unit' },
    confidence: 0.94,
    impact: 85000,
    evidence: ['§4.2 Overage rate: $0.05/unit', '§7.1 Base limit: 10,000 units/mo', '§12.3 Discounts on base charges only'],
    reasoning: ['Parsed PDF contract via NLP extraction', 'Identified 3 revenue-critical clauses', 'Cross-referenced pricing appendix A', 'Calculated expected monthly run-rate', 'Flagged discount scope ambiguity in §12.3'],
  },
  usage: {
    role: 'Usage Validator',
    input: 'usage-oct.csv · 1,850 rows · API logs',
    output: { total_units: '10,840', contract_limit: '10,000', overage: '840 units', overage_value: '$42,000 gross' },
    confidence: 0.97,
    impact: 42000,
    evidence: ['CSV: 10,840 API calls in October', 'Contract limit: 10,000/mo', 'Overage: 840 units × $0.05 × 1,000'],
    reasoning: ['Ingested 1,850 log rows from S3', 'Deduplicated retried calls', 'Aggregated by billing cycle (Oct 1–31)', 'Computed overage against contract limit', 'Verified unit conversion multiplier (×1000)'],
  },
  billing: {
    role: 'Billing Auditor',
    input: 'INV-2024-456 · $63,750 issued',
    output: { invoice_total: '$63,750', base_charge: '$63,750', overage_line: '$0.00', discount_error: '25% applied to ALL charges' },
    confidence: 0.89,
    impact: 63750,
    evidence: ['Invoice base charge: $63,750 (discounted)', 'No overage line item present', 'Discount applied to overages (incorrect per §12.3)'],
    reasoning: ['Pulled invoice from billing system API', 'Verified line items against contract structure', 'Detected missing overage line (§4.2 violation)', 'Identified discount applied to non-base charges', 'Quantified discount over-application: ~$20,750'],
  },
  orch: {
    role: 'Orchestrator',
    input: 'All 3 agent outputs · shared context',
    output: { expected: '$85,000', actual_billed: '$63,750', net_leakage: '$21,250', recovery_probability: '0.85', urgency: 'HIGH' },
    confidence: 0.917,
    impact: 21250,
    evidence: ['Contract: $85K expected', 'Usage: 840 overage units underbilled', 'Billing: discount misapplied to overages'],
    reasoning: ['Aggregated all 3 agent outputs', 'Computed weighted confidence: 0.94×0.97×0.89 = 0.81', 'Overage leakage: 840×$0.05×1000 = $42,000', 'Discount correction: −$20,750', 'Net leakage: $21,250', 'Recovery probability 85% (clear contract language)', 'Impact score: 0.917 × $21,250 = 19,486'],
  },
};

/**
 * Replace agentData with real results from the backend.
 * Called by api.js after a successful analysis.
 */
export function setAgentData(data) {
  agentData = data;
}
