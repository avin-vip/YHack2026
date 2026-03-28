from pydantic import BaseModel


class AgentOutput(BaseModel):
    role: str
    input_description: str
    output: dict
    confidence: float
    evidence: list[str]
    reasoning: list[str]
    logs: list[dict]


class Discrepancy(BaseModel):
    type: str
    description: str
    expected_value: str
    actual_value: str
    impact: float
    clause_reference: str


class AnalysisResult(BaseModel):
    account_id: str
    agents: dict[str, AgentOutput]
    discrepancies: list[Discrepancy]
    leakage: dict
    recovery_actions: list[dict]
    email: dict
    billing_payload: dict
    audit_trail: list[dict]
