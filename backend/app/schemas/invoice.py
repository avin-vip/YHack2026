from pydantic import BaseModel


class LineItem(BaseModel):
    id: str
    description: str
    quantity: int | float
    unit_price: int | float
    discount_rate: float
    amount: int | float
    type: str
    note: str


class DiscountApplied(BaseModel):
    rate: float
    applied_to: str
    note: str


class Invoice(BaseModel):
    id: str
    account_id: str
    contract_id: str
    billing_period: str
    issued_date: str
    due_date: str
    line_items: list[LineItem]
    subtotal: int | float
    discount_applied: DiscountApplied
    total: int | float
    currency: str
    status: str
    payment_status: str
