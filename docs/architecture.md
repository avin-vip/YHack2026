# ARIA — System Architecture

## Overview
ARIA (Autonomous Revenue Integrity Agent) is a multi-agent system that detects revenue leakage in enterprise billing and autonomously generates recovery actions.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Vite)                       │
│  index.html + CSS + JS Modules                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │Terminals │ │  Graph   │ │   Dock   │ │ Reasoning │  │
│  │  Panel   │ │  (SVG)   │ │  Panel   │ │  Overlay  │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│                      │ api.js                           │
└──────────────────────┼──────────────────────────────────┘
                       │ HTTP (REST)
┌──────────────────────┼──────────────────────────────────┐
│               BACKEND (FastAPI)                         │
│                      │                                  │
│  ┌───────────────────▼──────────────────────────┐       │
│  │              API Routes                       │       │
│  │  /accounts  /analyze  /actions  /audit        │       │
│  └───────────────────┬──────────────────────────┘       │
│                      │                                  │
│  ┌───────────────────▼──────────────────────────┐       │
│  │           Analysis Pipeline                   │       │
│  │                                               │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐      │       │
│  │  │Contract │  │ Usage   │  │Billing  │      │       │
│  │  │Analyst  │  │Validator│  │Auditor  │      │       │
│  │  └────┬────┘  └────┬────┘  └────┬────┘      │       │
│  │       └─────────────┼───────────┘            │       │
│  │                     ▼                        │       │
│  │             ┌──────────────┐                 │       │
│  │             │ Orchestrator │                 │       │
│  │             └──────────────┘                 │       │
│  └──────────────────────────────────────────────┘       │
│                      │                                  │
│  ┌───────────────────▼──────────────────────────┐       │
│  │            LLM Client (llm.py)                │       │
│  │  Gemini (default) | Hermes | K2 (swappable)   │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │            Data Layer (JSON files)            │       │
│  │  accounts/ contracts/ invoices/ usage/ audit/ │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Agent Pipeline

1. **Contract Analyst** — Parses contract terms, extracts pricing structure, flags clauses
2. **Usage Validator** — Validates usage data against contract limits, detects overages
3. **Billing Auditor** — Audits invoices against contract terms, finds mismatches
4. **Orchestrator** — Aggregates all outputs, calculates net leakage, ranks recovery actions

## Tech Stack
- **Frontend**: Vanilla JS + Vite (ES modules), IBM Plex Mono, Bebas Neue
- **Backend**: Python FastAPI, Pydantic schemas
- **LLM**: Google Gemini 2.0 Flash (swappable)
- **Data**: JSON files (no database)
- **Communication**: REST API with JSON

## Key Design Decisions
- No database — JSON files in `data/` folder for hackathon speed
- Single LLM with swappable provider — start with Gemini, add Hermes/K2 later
- Frontend works standalone with fallback data — enables parallel development
- Step-by-step demo flow — judges see each agent work, not a black box
