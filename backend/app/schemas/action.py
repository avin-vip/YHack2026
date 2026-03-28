from pydantic import BaseModel


class RecoveryAction(BaseModel):
    rank: int
    name: str
    score: float
    amount: float
    basis: str
    deadline: str
    probability: float
    agent: str
    description: str


class RecoveryEmail(BaseModel):
    to: str
    subject: str
    body: str


class BillingPayload(BaseModel):
    invoice_id: str
    amount: float
    overage_units: int
    rate_per_unit: float
    confidence: float
    due_days: int


class AuditEvent(BaseModel):
    timestamp: str
    agent: str
    action: str
    detail: str
    confidence: float | None = None
