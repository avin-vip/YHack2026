# ARIA — Autonomous Revenue Integrity Agent

Multi-agent system that detects revenue leakage in enterprise billing and autonomously generates recovery actions.

Built for YHack 2026 — Personal AI Agents in Enterprises track.

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # Add your GEMINI_API_KEY
uvicorn main:app --reload
```
API runs at http://localhost:8000. Docs at http://localhost:8000/docs.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Opens at http://localhost:3000.

The frontend works standalone with fallback data. Connect the backend for real LLM-powered analysis.

## Project Structure
```
├── frontend/          # Vanilla JS + Vite
│   ├── index.html
│   ├── css/styles.css
│   └── js/            # ES modules (main, api, terminals, graph, dock, reasoning, resize, state)
├── backend/           # Python FastAPI
│   ├── main.py
│   ├── app/
│   │   ├── routes/    # API endpoints
│   │   ├── schemas/   # Pydantic models
│   │   ├── agents/    # LLM agents (contract, usage, billing, orchestrator)
│   │   ├── services/  # Pipeline orchestration
│   │   └── utils/     # Audit logging
│   └── data/          # Seed data (JSON files)
├── docs/              # Architecture, demo script, system design
└── .env.example
```

## Team
- **Frontend**: UI, animations, API wiring
- **Backend + Integration**: Agents, LLM, pipeline, data
- **Pitch**: Architecture docs, demo script, judge Q&A

## Key API Endpoint
```
POST /api/accounts/acme-ent-90210/analyze
```
Runs all 4 agents and returns leakage detection + recovery actions.
