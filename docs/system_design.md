# ARIA — System Design

## Data Flow

```
Input Data (JSON files)
    │
    ├── Account profile
    ├── Contract terms + clauses
    ├── Invoice line items
    └── Usage records
         │
         ▼
  POST /api/accounts/{id}/analyze
         │
         ▼
  ┌──────────────────────┐
  │  Analysis Pipeline   │
  │                      │
  │  1. Contract Analyst │ ← contract.json
  │  2. Usage Validator  │ ← usage.json + contract terms
  │  3. Billing Auditor  │ ← invoice.json + contract terms
  │  4. Orchestrator     │ ← all 3 agent outputs
  └──────┬───────────────┘
         │
         ▼
  Response: {
    agents: { contract, usage, billing, orchestrator },
    leakage: { net: $21,250 },
    recovery_actions: [ ranked list ],
    email: { to, subject, body },
    billing_payload: { invoice correction },
    audit_trail: [ timestamped events ]
  }
```

## API Surface

| Method | Route                          | Purpose                    |
|--------|--------------------------------|----------------------------|
| GET    | /api/health                    | Health check               |
| GET    | /api/accounts                  | List accounts              |
| GET    | /api/accounts/{id}             | Account details            |
| GET    | /api/accounts/{id}/contract    | Contract terms             |
| GET    | /api/accounts/{id}/usage       | Usage records              |
| GET    | /api/accounts/{id}/invoices    | Invoice records            |
| POST   | /api/accounts/{id}/analyze     | Run full analysis pipeline |
| POST   | /api/actions/recover           | Execute recovery action    |
| GET    | /api/audit/{account_id}        | Get audit trail            |

## Data Models (Pydantic)

- **Account**: id, name, ARR, tier, contract_id, contact, status
- **Contract**: id, base_fee, usage_limit, overage_rate, discount, clauses
- **Invoice**: id, line_items, discount_applied, total, status
- **UsageRecord**: total_units, contract_limit, overage_units, daily_breakdown
- **AgentOutput**: role, output, confidence, evidence, reasoning, logs
- **RecoveryAction**: rank, name, score, amount, basis, deadline, probability
- **AuditEvent**: timestamp, agent, action, detail, confidence

## LLM Integration

The `LLMClient` class in `app/agents/llm.py` abstracts the LLM provider:

```python
llm = LLMClient(provider="gemini")  # or "hermes", "k2"
response = await llm.generate(system_prompt, user_prompt)
```

Each agent has:
- A **system prompt** defining its role and expected JSON output schema
- A **build_user_prompt()** method that formats input data
- Structured JSON output parsing with confidence scores

## Future Extensions

1. **RAG Pipeline**: PDF upload → OCR → chunk → embed → vector store → retrieval
2. **Multi-Model**: Different LLMs per agent (Hermes for NLP, K2 for reasoning)
3. **What-If Simulation**: POST /api/accounts/{id}/simulate with modified parameters
4. **Real-Time Streaming**: SSE or WebSocket for live agent output
5. **Database**: PostgreSQL replacing JSON files
6. **Authentication**: API keys, role-based access
