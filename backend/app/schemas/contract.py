from pydantic import BaseModel


class ContractClause(BaseModel):
    section: str
    text: str


class DiscountTerms(BaseModel):
    rate: float
    scope: str
    clause: str
    description: str


class Contract(BaseModel):
    id: str
    account_id: str
    effective_date: str
    expiration_date: str
    term_months: int
    pricing_tier: str
    base_fee_monthly: int
    usage_limit_monthly: int
    usage_unit: str
    overage_rate_per_unit: float
    unit_multiplier: int
    discount: DiscountTerms
    clauses: dict[str, ContractClause]
    total_pages: int
    signed_by: str
    status: str
