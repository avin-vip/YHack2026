from pydantic import BaseModel


class Account(BaseModel):
    id: str
    name: str
    arr: int
    tier: str
    contract_id: str
    primary_contact: str
    industry: str
    status: str
    created_at: str
    region: str
