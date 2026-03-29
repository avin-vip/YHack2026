// ── SHARED STATE ──
// All modules read/write from this shared state object.

export const state = {
  currentStep: 0,
  autoplay: false,
  autoTimer: null,
  viewMode: 'summary',
  // Set by main.js when drilling into an account — used by report generator
  currentAccountId: null,
  currentAccountName: null,
  /** Last billing payload shown in the dock (for copy JSON). */
  lastBillingPayload: null,
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

// ── MULTI-ACCOUNT FALLBACK DATA ──

export const ACCOUNTS = [
  { id: 'acme-ent-90210', name: 'Acme Enterprises', arr: 2100000, tier: 'Enterprise Plus', region: 'US-WEST' },
  { id: 'nexus-corp-40120', name: 'Nexus Corp', arr: 850000, tier: 'Enterprise', region: 'US-EAST' },
  { id: 'titan-saas-77450', name: 'Titan SaaS', arr: 3400000, tier: 'Enterprise Plus', region: 'US-CENTRAL' },
];

export const ACCOUNT_FALLBACK_DATA = {
  'acme-ent-90210': {
    contract: {
      role: 'Contract Analyst',
      input: 'CTR-12345 · 24-page PDF agreement',
      output: { expected_revenue: '$85,000/mo', pricing_tier: 'Enterprise Plus', discount_schedule: 'Base only (§12.3)', overage_rate: '$0.05/unit' },
      confidence: 0.94, impact: 85000,
      evidence: ['§4.2 Overage rate: $0.05/unit', '§7.1 Base limit: 10,000 units/mo', '§12.3 Discounts on base charges only'],
      reasoning: ['Parsed PDF contract via NLP extraction', 'Identified 3 revenue-critical clauses', 'Cross-referenced pricing appendix A'],
    },
    usage: {
      role: 'Usage Validator',
      input: 'usage-oct.csv · 1,850 rows · API logs',
      output: { total_units: '10,840', contract_limit: '10,000', overage: '840 units', overage_value: '$42,000 gross' },
      confidence: 0.97, impact: 42000,
      evidence: ['CSV: 10,840 API calls in October', 'Contract limit: 10,000/mo', 'Overage: 840 units × $0.05 × 1,000'],
      reasoning: ['Ingested 1,850 log rows', 'Deduplicated retried calls', 'Computed overage against contract limit'],
    },
    billing: {
      role: 'Billing Auditor',
      input: 'INV-2024-456 · $63,750 issued',
      output: { invoice_total: '$63,750', base_charge: '$63,750', overage_line: '$0.00', discount_error: '25% applied to ALL charges' },
      confidence: 0.89, impact: 63750,
      evidence: ['Invoice base charge: $63,750 (discounted)', 'No overage line item present', 'Discount applied to overages (incorrect per §12.3)'],
      reasoning: ['Verified line items against contract structure', 'Detected missing overage line', 'Identified discount over-application'],
    },
    orch: {
      role: 'Orchestrator',
      input: 'All 3 agent outputs · shared context',
      output: { expected: '$85,000', actual_billed: '$63,750', net_leakage: '$21,250', recovery_probability: '0.85', urgency: 'HIGH' },
      confidence: 0.917, impact: 21250,
      evidence: ['Contract: $85K expected', 'Usage: 840 overage units underbilled', 'Billing: discount misapplied to overages'],
      reasoning: ['Aggregated all 3 agent outputs', 'Net leakage: $21,250', 'Recovery probability 85%'],
    },
  },
  'nexus-corp-40120': {
    contract: {
      role: 'Contract Analyst',
      input: 'CTR-67890 · 18-page PDF agreement',
      output: { expected_revenue: '$42,000/mo', pricing_tier: 'Enterprise', discount_schedule: 'Base only (§9.1)', overage_rate: '$0.08/unit' },
      confidence: 0.91, impact: 42000,
      evidence: ['§3.4 Overage rate: $0.08/unit', '§5.2 Base limit: 5,000 units/mo', '§9.1 Discounts on base charges only'],
      reasoning: ['Parsed 18-page contract', 'Identified 3 revenue-critical clauses', 'Extracted overage pricing structure'],
    },
    usage: {
      role: 'Usage Validator',
      input: 'usage-oct-nexus.csv · 1,240 rows · API logs',
      output: { total_units: '6,890', contract_limit: '5,000', overage: '1,890 units', overage_value: '$151,200 gross' },
      confidence: 0.95, impact: 151200,
      evidence: ['CSV: 6,890 API calls in October', 'Contract limit: 5,000/mo', 'Overage: 1,890 units × $0.08 × 1,000'],
      reasoning: ['Ingested 1,240 log rows', 'Deduplicated 32 retry calls', 'Significant overage detected'],
    },
    billing: {
      role: 'Billing Auditor',
      input: 'INV-2024-712 · $35,700 issued',
      output: { invoice_total: '$35,700', base_charge: '$35,700', overage_line: '$0.00', discount_error: '15% applied to ALL charges' },
      confidence: 0.87, impact: 35700,
      evidence: ['Invoice base charge: $35,700 (discounted)', 'No overage line item present', 'Discount applied to all charges (incorrect per §9.1)'],
      reasoning: ['Verified line items against contract', 'Detected missing overage line item', 'Identified discount scope violation'],
    },
    orch: {
      role: 'Orchestrator',
      input: 'All 3 agent outputs · shared context',
      output: { expected: '$42,000', actual_billed: '$35,700', net_leakage: '$15,100', recovery_probability: '0.82', urgency: 'HIGH' },
      confidence: 0.893, impact: 15100,
      evidence: ['Contract: $42K expected', 'Usage: 1,890 overage units underbilled', 'Billing: discount misapplied to overages'],
      reasoning: ['Aggregated all 3 agent outputs', 'Net leakage: $15,100', 'Recovery probability 82%'],
    },
  },
  'titan-saas-77450': {
    contract: {
      role: 'Contract Analyst',
      input: 'CTR-11223 · 32-page PDF agreement',
      output: { expected_revenue: '$125,000/mo', pricing_tier: 'Enterprise Plus', discount_schedule: 'Base only (§11.2)', overage_rate: '$0.04/unit' },
      confidence: 0.92, impact: 125000,
      evidence: ['§4.1 Overage rate: $0.04/unit', '§6.3 Base limit: 25,000 units/mo', '§11.2 Discounts on base charges only'],
      reasoning: ['Parsed 32-page contract', 'Identified 3 revenue-critical clauses', 'Extracted volume discount terms'],
    },
    usage: {
      role: 'Usage Validator',
      input: 'usage-oct-titan.csv · 4,320 rows · API logs',
      output: { total_units: '26,200', contract_limit: '25,000', overage: '1,200 units', overage_value: '$48,000 gross' },
      confidence: 0.96, impact: 48000,
      evidence: ['CSV: 26,200 API calls in October', 'Contract limit: 25,000/mo', 'Overage: 1,200 units × $0.04 × 1,000'],
      reasoning: ['Ingested 4,320 log rows', 'Deduplicated 89 retry calls', 'Moderate overage detected'],
    },
    billing: {
      role: 'Billing Auditor',
      input: 'INV-2024-983 · $100,038 issued',
      output: { invoice_total: '$100,038', base_charge: '$100,000', overage_line: '$38.40', discount_error: '20% applied to overage charges' },
      confidence: 0.88, impact: 100038,
      evidence: ['Invoice total: $100,038', 'Overage line present but discount incorrectly applied', 'Discount on overages violates §11.2'],
      reasoning: ['Verified line items against contract', 'Overage present but undercharged', 'Discount incorrectly applied to overages'],
    },
    orch: {
      role: 'Orchestrator',
      input: 'All 3 agent outputs · shared context',
      output: { expected: '$125,000', actual_billed: '$100,038', net_leakage: '$8,000', recovery_probability: '0.78', urgency: 'MEDIUM' },
      confidence: 0.882, impact: 8000,
      evidence: ['Contract: $125K expected', 'Usage: 1,200 overage units undercharged', 'Billing: discount misapplied to overages'],
      reasoning: ['Aggregated all 3 agent outputs', 'Net leakage: $8,000', 'Recovery probability 78%'],
    },
  },
};
