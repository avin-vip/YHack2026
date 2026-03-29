KUBO is a multi-agent revenue integrity platform that uses K2 Think V2 reasoning to find contract-to-invoice leakage, quantify ARR impact, and generate ranked recovery actions. Built like infrastructure, not a demo.

---

## Inspiration

Finance teams don't lose sleep over "AI in the abstract." They lose sleep over money that should already be on the balance sheet: revenue that contracts say you earned, but invoices never captured.

Enterprise SaaS billing is a maze. Proration rules, discount scope, usage tiers, and invoice line items drift out of sync with what legal agreed to months earlier. Manual audits can't scale. Generic chatbots can't prove a discrepancy. We built KUBO because we believe revenue integrity is a reasoning problem, not a spreadsheet task. A CFO deserves prioritized, defensible recovery actions, not another dashboard of vibes.

---

## What it does

KUBO is an autonomous revenue-integrity system for enterprise billing. It deploys four specialized agents: a Contract Analyst, Usage Validator, Billing Auditor, and Orchestrator. Each agent has a specific role, and together they work through every customer account systematically. KUBO ingests contract logic, usage reality, and invoice truth, then detects leakage, quantifies dollar impact, and produces ranked recovery actions alongside draft recovery communications and structured billing corrections. The kind of outputs finance and RevOps teams actually file, send, and reconcile.

In operations mode, teams run parallel analysis across many accounts and watch pipelines complete in real time, with aggregate leakage and confidence surfaced at a glance. In detail mode, stakeholders step through evidence trails and reasoning traces so every dollar is tied to a clause, a data point, or a line item rather than a black-box summary.

At the center is deep, multi-step reasoning: reconciling conflicting signals, applying discount and overage math correctly, and ranking what to do next when the stakes are measured in ARR, not tokens.

---

## How we built it

We built KUBO as a production-shaped stack rather than a single-script demo.

**Backend:** FastAPI with Pydantic schemas for validated, auditable payloads. Agent pipelines are orchestrated as structured services with explicit input/output contracts, not ad hoc prompts strung together.

**Frontend:** A focused operations console built on Vite and vanilla ES modules. It includes a multi-account grid, live pipeline visualization, per-agent activity terminals, and a dock for recovery artifacts including email drafts, billing payloads, ranked actions, and exportable reporting.

**AI architecture:** Multi-agent collaboration with explicit roles and cross-agent verification. K2 Think V2 sits at the reasoning core, particularly for the Orchestrator and other high-complexity steps where the system must perform sustained, multi-step reconciliation over contracts, usage data, and invoices, produce calibrated confidence, and rank actions by real financial impact. We treat K2 not as a decorative API call but as the engine for the hardest part of the product: turning messy enterprise reality into defensible financial conclusions.

The result reads like infrastructure: APIs, traces, and structured artifacts, because that is what serious finance workflows actually require.

---

## Challenges we ran into

**Reasoning vs. speed:** Revenue leakage analysis is not "one completion." It is multi-hop reasoning with numeric discipline. Getting agents to specialize without contradicting each other, and getting the Orchestrator to merge conflicting evidence cleanly, took real iteration.

**Trust under pressure:** Judges and CFOs don't reward confidence scores without evidence. We invested heavily in traceability: what was read, what was measured, what was billed, and why the net number is what it is. Every claim is backed by a clause citation or a data reference.

**Real-time operations UX:** Parallel account analysis, streaming progress updates, and a UI that stays readable when everything happens at once forced hard choices in layout, state management, and failure handling.

**Integration reality:** Wiring multiple model providers, backend health checks, and graceful fallbacks without turning the demo into a live debugging session required disciplined engineering throughout, not just at the finish line.

---

## Accomplishments that we're proud of

We shipped a coherent agentic workflow that genuinely looks and feels like a real enterprise operations product: analyze, detect, quantify, recommend, draft artifacts. The pipeline is not simulated. The outputs are not fabricated.

We placed K2 Think V2 at the center of the reasoning story, where multi-step reconciliation and action ranking must be correct, rather than using advanced models as marketing garnish sprinkled on top of simple logic.

We built parallelism by design: multiple accounts, multiple concurrent pipelines, and an aggregate view that communicates scale and urgency immediately.

We prioritized outputs finance teams can actually act on. Not just "insights," but next actions, corrective invoice payloads, and structured communications, because impact is measured in recovered revenue, not slide decks.

---

## What we learned

The best agent products are boring where it matters: schemas, audit trails, and explicit handoffs between roles. Reasoning models shine when the task is genuinely hard, with real math, real constraints, and conflicting documents, not when they are asked to "be smart" in a vacuum. Human oversight is not the enemy of automation; it is the safety layer that makes autonomous finance credible. And we learned that a hackathon can be the beginning of something serious, if you build toward deployment instead of applause.

---

## What's next for KUBO

We are not treating KUBO as a weekend prototype. The roadmap is deliberately product-shaped.

**Deeper integrations:** Read-only connectors into contract repositories, usage warehouses, and billing systems like Stripe and Zuora-class workflows, so analyses run continuously rather than as one-off exports triggered by hand.

**Stronger document reasoning:** Production PDF ingestion, clause retrieval, and grounded extraction at enterprise volume, so KUBO can work from real contracts rather than structured data.

**Operational closure:** Approvals, ticketing, and safe execution paths so recovery actions move from drafted to posted with proper governance and an audit trail.

**Evaluation rigor:** Expanded golden datasets and metrics so every release proves precision, recall, and calibration. The language finance trusts.

KUBO is our bet that agentic AI wins when it recovers real money, with real evidence, under real constraints. We are building it like a company would: K2-powered reasoning at the core, multi-agent orchestration at scale, and enterprise outcomes as the only scoreboard.
