# ARIA — Demo Script

## Setup (before demo)
1. Backend: `cd backend && uvicorn main:app --reload`
2. Frontend: `cd frontend && npm run dev`
3. Open browser at http://localhost:3000

## Script (2 minutes)

### Opening (15 sec)
"ARIA is an autonomous revenue integrity agent. It monitors enterprise accounts, detects billing discrepancies, and takes corrective action — all without human intervention."

*Point to the idle screen with 4 agents standing by.*

### Step 1: Contract Analysis (20 sec)
*Click BEGIN or press SPACE*

"ARIA's Contract Analyst agent is parsing a 24-page contract. It extracts pricing terms, usage limits, and discount clauses. Notice it flags §12.3 — discounts apply to base charges only."

*Point to the terminal logs appearing in real-time.*

### Step 2: Usage + Billing (25 sec)
*Click NEXT STEP*

"Two agents deploy in parallel. The Usage Validator ingests API usage logs and detects 840 overage units. The Billing Auditor pulls the invoice and finds zero overage charges — the overage was never billed."

*Point to the animated edges showing data flow between agents.*

### Step 3: Orchestrator (25 sec)
*Click NEXT STEP*

"The Orchestrator aggregates all findings. It calculates net leakage of $21,250 — overage units never billed plus a discount misapplied to non-base charges."

*Point to the leakage number animating on screen.*

### Step 4: Recovery (20 sec)
*Click NEXT STEP*

"ARIA autonomously generates three ranked recovery actions, drafts a professional recovery email, and creates a billing correction payload ready for the billing system API."

*Point to the right panel showing email, JSON payload, and ranked actions.*

### Step 5: Completion (15 sec)
*Click NEXT STEP*

"Case closed. $21,250 recovered with 91.7% average confidence. Every step is auditable — click any agent node to see its full reasoning trace."

*Click a node to show the reasoning panel. Click export to download JSON report.*

## Judge Q&A Prep

**Q: Why multi-agent instead of one LLM call?**
A: Each agent is a specialist with domain-specific prompts. This produces higher confidence scores than a single monolithic prompt. It also creates a natural audit trail and lets us swap models per agent.

**Q: How does confidence scoring work?**
A: Each agent returns a confidence score based on evidence strength. The Orchestrator computes a weighted average. Impact score = confidence × financial impact.

**Q: What's the RAG strategy?**
A: We plan to ingest real contract PDFs, chunk them, embed with a sentence transformer, and store in a vector DB. The Contract Analyst would retrieve relevant clauses at query time.

**Q: How would this scale to production?**
A: Replace JSON files with PostgreSQL. Add a document ingestion pipeline (OCR + chunking + embeddings). Deploy agents as async workers. Add SSE/WebSocket for real-time streaming.

**Q: What models are you using?**
A: Currently Gemini 2.0 Flash. The LLM client is provider-agnostic — we can swap in Hermes for NLP tasks or K2 Think V2 for the Orchestrator's multi-step reasoning.
