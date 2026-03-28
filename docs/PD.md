# ARIA — Project Description

## What is ARIA?

ARIA (Autonomous Revenue Integrity Agent) is a multi-agent AI system that detects and recovers revenue leakage in enterprise SaaS billing. Enterprise companies lose 3–5% of ARR annually from billing errors — mispriced overages, misapplied discounts, missing invoice line items. ARIA scans contracts, usage data, and invoices to find these discrepancies, quantify the dollar impact, and generate ranked recovery actions automatically.

## The Problem

Enterprise SaaS billing is broken at scale. Common failure modes:

- **Unbilled overage**: Customer exceeds usage limits but the invoice never captures the overage charge
- **Discount drift**: Discounts meant for base fees get applied to overages or add-ons
- **Missing line items**: Invoice omits charges that the contract clearly defines
- **Wrong pricing tier**: Customer is billed at a lower tier than their actual usage warrants

CFOs know this leakage exists but cannot find it systematically. Manual audits are slow, expensive, and miss edge cases. ARIA replaces that with 4 specialized AI agents working in parallel.

## How It Works

ARIA runs a 4-agent pipeline on each customer account:

```
┌─────────────────────────────────────────────────┐
│              ARIA Analysis Pipeline              │
│                                                  │
│   INPUT                                          │
│   ├── Contract PDF (pricing, clauses, terms)     │
│   ├── Usage records (API call logs, daily data)  │
│   └── Invoice (line items, discounts, totals)    │
│                                                  │
│   STEP 1: Contract Analyst                       │
│   ├── Extracts base fee, overage rate, limits    │
│   ├── Identifies discount scope (base only?)     │
│   └── Flags ambiguous or critical clauses        │
│                                                  │
│   STEP 2: Usage Validator + Billing Auditor      │
│   │  (run in parallel)                           │
│   ├── Usage: Deduplicates logs, calculates       │
│   │   overage against contract limits            │
│   └── Billing: Audits invoice line items         │
│       against contract terms, finds mismatches   │
│                                                  │
│   STEP 3: Orchestrator                           │
│   ├── Aggregates all 3 agent findings            │
│   ├── Calculates net leakage amount              │
│   ├── Assigns confidence scores and urgency      │
│   ├── Ranks recovery actions by impact × conf    │
│   ├── Drafts a recovery email to the customer    │
│   └── Generates a corrective billing payload     │
│                                                  │
│   OUTPUT                                         │
│   ├── Net leakage: $X detected                   │
│   ├── Ranked recovery actions with scores        │
│   ├── Ready-to-send recovery email               │
│   ├── Corrective invoice JSON payload            │
│   └── Full audit trail with timestamps           │
└─────────────────────────────────────────────────┘
```

## Agent Roles

| Agent | Job | Example Output |
|-------|-----|----------------|
| **Contract Analyst** | Parse contract terms, extract pricing structure, flag clauses | "§12.3: Discounts apply to base charges only" |
| **Usage Validator** | Validate usage data against contract limits, detect overages | "840 units over limit = $42,000 gross exposure" |
| **Billing Auditor** | Audit invoices for missing charges and discount errors | "Overage line item missing; discount applied to all charges" |
| **Orchestrator** | Aggregate findings, calculate net leakage, rank recovery actions | "Net leakage: $21,250 — Issue corrective invoice (92% confidence)" |

## Multi-Account Analysis

ARIA analyzes multiple accounts in parallel. The Operations view shows a grid of account cards, each with a mini-pipeline visualization. Agents run simultaneously across all accounts, and results populate in real time with animated leakage counters and aggregate metrics.

**Batch workflow:**
1. Load all enterprise accounts
2. Deploy 4-agent pipelines in parallel per account
3. Aggregate total leakage, detection rate, and average confidence
4. Click any account card to drill into the full agent reasoning trace

## Tech Stack

- **Frontend**: Vanilla JavaScript ES modules + Vite
- **Backend**: Python FastAPI + Pydantic
- **AI**: K2 Think V2 agents (swappable — Gemini, Hermes, K2v2)
- **Data**: JSON files (accounts, contracts, invoices, usage)
- **Design**: IBM Plex Mono, Bebas Neue, custom dark terminal UI

## Demo Data

Three enterprise accounts with distinct leakage patterns:

| Account | ARR | Leakage | Issue |
|---------|-----|---------|-------|
| Acme Enterprises | $2.1M | $21,250 | Missing overage + discount misapplied |
| Nexus Corp | $850K | $15,100 | Missing overage line item |
| Titan SaaS | $3.4M | $8,000 | Discount applied to overage charges |
| **Total** | **$6.35M** | **$44,350** | |

## Key Differentiators

- **Not a single LLM call** — 4 specialized agents with distinct roles, evidence, and confidence scores
- **Transparent reasoning** — every agent shows its evidence trail, clause references, and reasoning steps
- **Actionable output** — generates corrective invoices, recovery emails, and ranked actions, not just a report
- **Parallel execution** — multiple accounts analyzed simultaneously with real-time visualization
- **Production architecture** — FastAPI backend, structured schemas, audit trail, swappable LLM providers
