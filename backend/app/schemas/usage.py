from pydantic import BaseModel


class DailyUsage(BaseModel):
    date: str
    units: int


class UsageRecord(BaseModel):
    account_id: str
    period: str
    source: str
    total_rows: int
    total_units: int
    contract_limit: int
    overage_units: int
    deduplicated: bool
    retry_calls_removed: int
    daily_breakdown: list[DailyUsage]
