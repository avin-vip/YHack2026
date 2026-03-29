"""Slack notifications for ARIA leakage alerts."""
import os
import httpx

_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")


def _is_configured() -> bool:
    return bool(_WEBHOOK_URL and not _WEBHOOK_URL.startswith("https://hooks.slack.com/services/YOUR"))


async def _post(payload: dict) -> None:
    if not _is_configured():
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(_WEBHOOK_URL, json=payload)
    except Exception:
        pass  # Never block the pipeline on a Slack failure


async def send_leakage_alert(
    account_name: str,
    account_id: str,
    leakage_amount: float,
    confidence: float,
    top_action: str = "",
    account_tier: str = "",
) -> None:
    """Fire a Slack alert when leakage is detected for a single account."""
    if leakage_amount <= 0:
        return

    tier_text = f" · {account_tier}" if account_tier else ""
    action_text = top_action or "Issue corrective invoice"
    conf_pct = f"{confidence * 100:.0f}%"

    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "⚡ ARIA Revenue Leakage Detected", "emoji": True},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Account*\n{account_name}{tier_text}"},
                    {"type": "mrkdwn", "text": f"*Net Leakage*\n`${leakage_amount:,.0f}`"},
                    {"type": "mrkdwn", "text": f"*Confidence*\n{conf_pct}"},
                    {"type": "mrkdwn", "text": f"*Top Action*\n{action_text}"},
                ],
            },
            {"type": "divider"},
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"ARIA Revenue Intelligence · Account ID: `{account_id}`"},
                ],
            },
        ]
    }
    await _post(payload)


async def send_batch_summary(
    total_leakage: float,
    accounts_analyzed: int,
    accounts_with_leakage: int,
    top_accounts: list[dict] | None = None,
) -> None:
    """Fire a Slack summary at the end of a batch analysis run."""
    top_accounts = top_accounts or []

    fields = [
        {"type": "mrkdwn", "text": f"*Accounts Analyzed*\n{accounts_analyzed}"},
        {"type": "mrkdwn", "text": f"*Leakage Found*\n{accounts_with_leakage} of {accounts_analyzed}"},
        {"type": "mrkdwn", "text": f"*Total Leakage*\n`${total_leakage:,.0f}`"},
    ]

    blocks: list[dict] = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "📊 ARIA Batch Analysis Complete", "emoji": True},
        },
        {"type": "section", "fields": fields},
    ]

    if top_accounts:
        lines = "\n".join(
            f"• *{a['name']}* — `${a['leakage']:,.0f}`"
            for a in top_accounts[:3]
        )
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Top Accounts*\n{lines}"},
        })

    blocks.append({"type": "divider"})
    blocks.append({
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": "ARIA Revenue Intelligence · Batch Run Complete"}],
    })

    await _post({"blocks": blocks})
