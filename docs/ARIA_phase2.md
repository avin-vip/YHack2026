# ARIA Phase 2 — Roadmap & Implementation Plan

## Executive Summary

Phase 1 delivered a working MVP: a 4-agent pipeline that detects revenue leakage on a single account with pre-structured JSON data and generates recovery actions. Phase 2 transforms ARIA from a demo into a production-grade autonomous revenue recovery platform — multi-account, multi-contract, integrated with real enterprise systems, and powered by intelligent agent orchestration.

---

## Phase 2 Architecture (Target State)

```
┌──────────────────────────────────────────────────────────────────────┐
│                       FRONTEND (Vite + WebSocket)                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │ Portfolio   │ │ Risk       │ │ Recovery   │ │ What-If          │  │
│  │ Dashboard   │ │ Heatmap    │ │ Workflow   │ │ Simulator        │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │ Terminals  │ │ Agent Graph│ │ Dock Panel │ │ Reasoning Overlay│  │
│  │ (existing) │ │ (existing) │ │ (existing) │ │ (existing)       │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘  │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ REST + WebSocket (streaming)
┌──────────────────────┼───────────────────────────────────────────────┐
│               BACKEND (FastAPI)                                      │
│  ┌───────────────────▼──────────────────────────────────────┐        │
│  │                   API Routes (expanded)                   │        │
│  │  /accounts  /analyze  /batch-analyze  /simulate           │        │
│  │  /actions   /audit    /alerts         /approvals          │        │
│  └───────────────────┬──────────────────────────────────────┘        │
│                      │                                               │
│  ┌───────────────────▼──────────────────────────────────────┐        │
│  │              Expanded Agent Pipeline                      │        │
│  │                                                           │        │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                 │        │
│  │  │Contract  │ │ Usage    │ │ Billing  │  (existing)      │        │
│  │  │Analyst   │ │Validator │ │ Auditor  │                  │        │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘                 │        │
│  │       │             │            │                        │        │
│  │  ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐                 │        │
│  │  │Compliance│ │ Anomaly  │ │ Customer │  (new agents)    │        │
│  │  │ Agent    │ │ Detector │ │Risk Agent│                  │        │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘                 │        │
│  │       └─────────────┼────────────┘                        │        │
│  │                     ▼                                     │        │
│  │            ┌──────────────┐                               │        │
│  │            │ Orchestrator │ (enhanced)                    │        │
│  │            └──────┬───────┘                               │        │
│  │                   ▼                                       │        │
│  │            ┌──────────────┐                               │        │
│  │            │   Dispute    │ (post-recovery)               │        │
│  │            │  Resolution  │                               │        │
│  │            └──────────────┘                               │        │
│  └───────────────────────────────────────────────────────────┘        │
│                      │                                               │
│  ┌───────────────────▼──────────────────────────────────────┐        │
│  │        Multi-LLM Router (llm.py expanded)                │        │
│  │  Gemini (fast) | K2v2 (reasoning) | Hermes (NLP/contracts)│       │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │              Integration Layer (new)                      │        │
│  │  Slack API  |  SendGrid  |  Stripe  |  Salesforce CRM    │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │         Data Layer (PostgreSQL + JSON fallback)           │        │
│  │  accounts | contracts | invoices | usage | audit | alerts │        │
│  └──────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## P0 — Core Features (Must Ship)

### 1. Multi-Contract Batch Analysis

**What**: Analyze all accounts in the system in a single run. Detect cross-contract patterns — e.g., the same discount misconfiguration affecting 50 accounts simultaneously.

**Why**: A CFO doesn't care about one account. They need "total leakage across my portfolio is $2.3M" in one click.

**Implementation**:
- New endpoint: `POST /api/batch-analyze` — accepts optional filters (tier, ARR range, date range)
- Pipeline runs per-account in parallel with `asyncio.gather()`
- Orchestrator aggregates cross-account findings into a portfolio summary
- Detects systemic patterns: "Discount scope misconfigured in 12/47 enterprise contracts"

**New API**:
```
POST /api/batch-analyze
Body: { filters: { tier: "enterprise", min_arr: 500000 } }
Response: { accounts_analyzed, total_leakage, systemic_issues[], per_account_results[] }
```

### 2. Slack & Email Alert System

**What**: Real-time notifications when leakage is detected above configurable thresholds.

**Why**: Revenue leakage compounds daily. A $50K misapplied discount costs ~$1,370/day. Zero-delay alerting is table stakes.

**Implementation**:
- Alert rules engine: threshold-based (amount, % of ARR, urgency level)
- Slack integration via Slack Web API (`chat.postMessage`)
- Email via SendGrid API (transactional alerts)
- Alert payload includes: account name, leakage amount, confidence, top recovery action, one-click link to ARIA dashboard

**New API**:
```
POST /api/alerts/configure
Body: { channel: "#revenue-ops", threshold: 10000, notify: ["slack", "email"] }

GET  /api/alerts/history
```

### 3. Recovery Workflow with Approval Chain

**What**: Convert generated recovery actions into executable workflows with human-in-the-loop approval.

**Why**: No CFO will let an AI send a $200K corrective invoice without sign-off. The approval chain is what makes ARIA enterprise-ready.

**Implementation**:
- Recovery actions get a lifecycle: `draft → pending_approval → approved → executed → confirmed`
- Approval routing: actions above $X require manager approval, above $Y require VP approval
- Execution engine: approved actions trigger real integrations (send email, create Stripe invoice, log CRM task)
- Full audit trail on every state transition

**New API**:
```
POST /api/actions/{action_id}/approve
POST /api/actions/{action_id}/reject   { reason: "..." }
POST /api/actions/{action_id}/execute
GET  /api/actions/pending
```

---

## P1 — High-Impact Features

### 4. Portfolio Dashboard

**What**: A CFO-grade overview screen showing total leakage detected, recovery pipeline value, aging of unrecovered revenue, and trend lines.

**Key Metrics**:
- Total leakage detected (current month / quarter / YTD)
- Recovery rate (% of detected leakage successfully recovered)
- Pipeline value (pending approvals + in-progress recoveries)
- Leakage by category (overage, discount, missing line items)
- Top 10 accounts by leakage amount
- Revenue at Risk heatmap (leakage severity × recovery probability matrix)

**Implementation**:
- New frontend view: `/dashboard`
- Backend aggregation endpoint: `GET /api/dashboard/summary`
- SVG/Canvas charts (keep it dependency-light, consistent with existing approach)

### 5. New Agent Roles

#### Compliance Agent
- **Role**: Validate that proposed recovery actions comply with contract terms, regional regulations, and internal policies
- **Input**: Recovery action + contract + account jurisdiction
- **Output**: Compliance score, flagged issues, required modifications
- **Example**: "Cannot charge retroactive overage — §14.2 requires 30-day notice before billing adjustment"

#### Customer Risk Agent
- **Role**: Assess churn risk before sending recovery notices
- **Input**: Account profile + recovery amount + account health signals
- **Output**: Churn probability, recommended approach (aggressive / diplomatic / waive), suggested messaging tone
- **Example**: "Acme is in renewal negotiation. Recommend diplomatic approach — bundle recovery into renewal terms"

#### Dispute Resolution Agent
- **Role**: Handle customer pushback with evidence-backed counter-arguments
- **Input**: Customer dispute + original evidence + contract terms
- **Output**: Counter-evidence package, suggested resolution, escalation recommendation
- **Example**: Customer says "We never agreed to overage charges." Agent responds with §4.2 clause reference + signed addendum date.

### 6. RAG Pipeline for Real Contracts

**What**: Upload actual PDF contracts. ARIA extracts, chunks, embeds, and retrieves relevant clauses during analysis.

**Pipeline**:
```
PDF Upload → OCR (Tesseract/pdf2image) → Text Extraction
    → Chunking (by section/clause, ~500 tokens)
    → Embedding (sentence-transformers or Gemini embeddings)
    → Vector Store (ChromaDB or FAISS, local)
    → Retrieval at analysis time (top-k relevant clauses per agent query)
```

**New API**:
```
POST /api/contracts/upload        (multipart/form-data, PDF)
GET  /api/contracts/{id}/clauses  (extracted + embedded clauses)
```

---

## P2 — Differentiators

### 7. What-If Simulation Engine

**What**: Model the financial impact of contract changes before renegotiation.

**Examples**:
- "What if we switch Acme to flat-rate pricing at $95K/month?"
- "What if we reduce the overage rate from $0.05 to $0.03 but remove the discount?"
- "What if usage grows 20% next quarter?"

**Implementation**:
- Monte Carlo simulation on historical usage distributions
- Generates expected revenue under N scenarios with confidence intervals
- Comparison table: current terms vs. proposed terms vs. optimal terms

**New API**:
```
POST /api/accounts/{id}/simulate
Body: { scenarios: [{ base_fee: 95000, overage_rate: 0, discount: 0 }, ...] }
Response: { scenarios: [{ expected_revenue, variance, risk_score }] }
```

### 8. Multi-LLM Intelligent Routing

**What**: Route each agent's task to the optimal model based on task characteristics.

**Routing Logic**:
| Agent | Best Model | Why |
|-------|-----------|-----|
| Contract Analyst | Hermes | Strong NLP, clause extraction, legal language |
| Usage Validator | Gemini Flash | Fast, structured data, simple math |
| Billing Auditor | K2v2 | Deep reasoning, cross-referencing |
| Orchestrator | K2v2 | Complex aggregation, ranked decision-making |
| Compliance Agent | Hermes | Regulatory language understanding |
| Customer Risk Agent | Gemini Flash | Pattern matching on account signals |
| Dispute Resolution | K2v2 | Adversarial reasoning, evidence synthesis |

**Implementation**:
- Extend `LLMClient` with routing config per agent role
- Fallback chain: if primary model fails, fall back to Gemini
- Track latency + accuracy per model per agent for continuous optimization

### 9. Database & Auth

**What**: Replace JSON files with PostgreSQL. Add authentication and role-based access control.

**Schema** (core tables):
- `accounts`, `contracts`, `invoices`, `usage_records`
- `analysis_runs`, `recovery_actions`, `approvals`
- `audit_events`, `alert_rules`, `alert_history`
- `users`, `roles`, `permissions`

**Auth**:
- API key auth for programmatic access
- Session-based auth for dashboard
- Roles: `analyst` (read + run analysis), `manager` (approve recoveries), `admin` (configure alerts, manage users)

---

## Recommended Future Implementations

> Features designed to maximize impact at **YHack 2026** across the **AI Agent track** and **K2v2/Hermes Research API track**.

### For the AI Agent Track — "Wow Factor" Features

#### A. Live Agent Debate Mode

Have agents **debate each other** in real time when findings conflict. Instead of silently aggregating outputs, show the Billing Auditor and Contract Analyst arguing about whether a discount applies, citing competing clause references — with the Orchestrator acting as judge.

**Why it wins**: Judges see multi-agent collaboration that isn't just a pipeline — it's adversarial reasoning with resolution. This is the frontier of agentic AI.

**Implementation**:
- When agent confidence scores diverge by >20%, trigger a "debate round"
- Each agent generates a counter-argument to the other's finding
- Orchestrator evaluates both positions and renders a verdict with weighted evidence
- Frontend shows the debate as a live back-and-forth in terminal panels

#### B. Self-Healing Agent Pipeline

When an agent fails or returns low-confidence output, the pipeline **autonomously recovers** — re-prompts with additional context, spawns a specialist sub-agent, or escalates to a human with a pre-formatted question.

**Why it wins**: Demonstrates production-grade agent reliability, not just happy-path demos.

**Implementation**:
- Retry with enriched context (feed the low-confidence output back as "here's what went wrong")
- If retry fails, spawn a "Clarification Agent" that generates a specific question for the human
- Track recovery success rates to improve retry strategies over time

#### C. Agent Memory & Learning Loop

Agents remember outcomes from previous analyses. If ARIA recovered $21K from Acme last month, the Contract Analyst starts future Acme analyses knowing the historical discount misconfiguration pattern.

**Why it wins**: Moves beyond stateless agents into persistent, learning agents — the next evolution.

**Implementation**:
- Per-account agent memory store (key findings, past recoveries, customer behavior patterns)
- Memory injected into agent system prompts as context
- Feedback loop: human confirms/rejects recovery → outcome stored → future confidence calibration

#### D. Natural Language Command Interface

Let users interact with ARIA conversationally:
- *"Run analysis on all enterprise accounts with ARR over $1M"*
- *"What's our total unrecovered leakage from Q4?"*
- *"Draft a recovery email for Acme but make it friendlier"*
- *"Why did the Billing Auditor flag invoice INV-2024-456?"*

**Why it wins**: Turns ARIA from a dashboard into an autonomous assistant. Judges can ask it questions live during the demo.

**Implementation**:
- Intent classifier routes natural language to the correct API endpoint
- Query agent translates questions into data lookups
- Response synthesizer formats results as conversational answers

#### E. Real-Time Agent Telemetry & Observability

Live metrics during analysis: token usage per agent, latency per model call, confidence drift over time, cost per analysis. Show it on a dedicated "Ops" panel.

**Why it wins**: Shows engineering maturity. Judges see you've thought about production cost, performance, and monitoring — not just the happy path.

### For the K2v2/Hermes Research API Track

#### F. Head-to-Head Model Benchmarking (Live)

Run the **same analysis** through Gemini, K2v2, and Hermes **simultaneously** and display results side-by-side. Show where each model excels and where it falls short on real financial data.

**Why it wins**: Directly demonstrates the research API's strengths. Judges from the K2v2/Hermes track see their models in action on a real use case with quantifiable metrics.

**Metrics to compare**:
- Accuracy (does the model find the correct leakage amount?)
- Confidence calibration (are high-confidence findings actually correct?)
- Latency (time to complete each agent's task)
- Cost (tokens consumed per analysis)
- Edge case handling (what does each model do with ambiguous contract language?)

#### G. Specialized Model Fine-Tuning Demonstrations

Show that K2v2/Hermes handles domain-specific financial reasoning better than general-purpose models on specific sub-tasks:
- **Contract clause extraction**: Hermes on legal/financial NLP vs. Gemini
- **Multi-step financial reasoning**: K2v2 on "calculate net leakage given discount scope, overage rate, and retroactive billing rules" vs. Gemini
- **Adversarial edge cases**: Feed intentionally ambiguous contracts and see which model asks for clarification vs. hallucinating

#### H. Agentic Tool Use with K2v2

Give agents access to **tools** (calculator, SQL query builder, contract search) and let K2v2 decide when to invoke them autonomously during analysis.

**Why it wins**: Demonstrates K2v2's function-calling and agentic reasoning capabilities in a high-stakes financial domain — exactly what the research track wants to see.

**Tool palette**:
- `calculate(expression)` — verified arithmetic (no LLM math errors)
- `search_clauses(query)` — RAG retrieval over contract embeddings
- `lookup_account(field, value)` — structured data lookup
- `compare_invoices(invoice_a, invoice_b)` — diff two invoices

#### I. Confidence-Weighted Model Ensemble

Instead of picking one model per agent, run multiple models and **ensemble their outputs** weighted by historical accuracy per task type.

**Why it wins**: Novel approach that maximizes the value of having access to multiple research models. Shows sophisticated ML thinking, not just "call the API."

**Implementation**:
- Each agent runs on 2-3 models in parallel
- Outputs are merged using confidence-weighted voting
- Disagreements are flagged for human review
- Historical accuracy tracked per model per agent per task type

#### J. Model Capability Profiling

Auto-generate a "capability card" for each model based on ARIA's workload:

```
┌─────────────────────────────────────────┐
│  K2v2 — Capability Profile (ARIA)       │
│                                         │
│  Contract Parsing:     ████████░░  82%  │
│  Financial Reasoning:  █████████░  93%  │
│  Discount Calculation: █████████░  91%  │
│  Evidence Citation:    ███████░░░  74%  │
│  Latency (avg):        1.2s             │
│  Cost per analysis:    $0.003           │
└─────────────────────────────────────────┘
```

**Why it wins**: Gives the K2v2/Hermes team actionable feedback on their model's strengths — they'll love seeing this in a hackathon submission.

---

## Implementation Priority & Sequencing

```
Phase 2a (Demo Day MVP)          Phase 2b (Post-Hackathon)
─────────────────────────        ─────────────────────────
P0: Multi-Contract Analysis      P2: What-If Simulation
P0: Slack/Email Alerts           P2: Database + Auth
P0: Recovery Workflow            P2: RAG Pipeline (full)
P1: Portfolio Dashboard
P1: New Agent Roles (2-3)

Wow Factor (Demo Day)            Research Track (Demo Day)
─────────────────────────        ─────────────────────────
A: Agent Debate Mode             F: Head-to-Head Benchmarking
B: Self-Healing Pipeline         H: Agentic Tool Use (K2v2)
D: Natural Language Interface    J: Model Capability Profiling
E: Agent Telemetry               I: Confidence-Weighted Ensemble
```

---

## Success Metrics

| Metric | Phase 1 (Current) | Phase 2 (Target) |
|--------|-------------------|-------------------|
| Accounts analyzed | 1 | 100+ per batch |
| Time to detection | Manual trigger | Real-time alerting |
| Recovery lifecycle | Generate only | Generate → Approve → Execute |
| Agent count | 4 | 7+ |
| LLM providers | 1 (Gemini) | 3 (Gemini + K2v2 + Hermes) |
| Data layer | JSON files | PostgreSQL + vector store |
| Contract input | Pre-structured JSON | Raw PDF upload |
| User interaction | Click-through demo | Conversational + dashboard |
