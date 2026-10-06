"""
Fault Alert Emails (Emergent-managed Resend).

Qualifying faults are queued in memory and flushed as ONE digest email per cooldown
window, so a burst of anomalies never spams the maintenance team.
Recipients/thresholds live server-side in Mongo (alert_settings); bodies are fixed templates.
"""
import asyncio
import ipaddress
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from html import escape
from html.parser import HTMLParser
from typing import List, Literal
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

from db import db

logger = logging.getLogger("alerts")
router = APIRouter(prefix="/alerts")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
FLUSH_INTERVAL_S = 20
TEST_COOLDOWN_S = 60

pending: List[dict] = []
_state = {"last_sent": None, "last_test": None}


class AlertSettings(BaseModel):
    enabled: bool = True
    recipients: List[EmailStr] = Field(default_factory=list, max_length=5)
    min_severity: Literal["critical", "high"] = "critical"
    cooldown_minutes: int = Field(10, ge=1, le=1440)


async def get_settings() -> AlertSettings:
    doc = await db.alert_settings.find_one({"key": "alerts"}, {"_id": 0, "key": 0})
    return AlertSettings(**doc) if doc else AlertSettings()


def enqueue(anomaly: dict) -> None:
    pending.append(anomaly)
    del pending[:-50]


# ---------------------------------------------------------------- guardrail gate
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                 headers={"X-Email-Key": EMAIL_KEY}, json=payload)
    resp.raise_for_status()
    return resp.json().get("id")


# ---------------------------------------------------------------- templates
def _wrap(title: str, inner: str) -> str:
    return (f'<table role="presentation" width="100%" style="background:#0f172a;padding:24px 0">'
            f'<tr><td align="center"><table role="presentation" width="600" style="background:#ffffff;'
            f'border-radius:12px;font-family:Arial,sans-serif;color:#0f172a">'
            f'<tr><td style="padding:20px 28px;border-bottom:3px solid #f59e0b">'
            f'<div style="font-size:12px;letter-spacing:2px;color:#d97706;font-weight:bold">SOLARSENSE ALERT</div>'
            f'<div style="font-size:22px;font-weight:bold;margin-top:6px">{escape(title)}</div></td></tr>'
            f'<tr><td style="padding:20px 28px">{inner}</td></tr>'
            f'<tr><td style="padding:16px 28px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0">'
            f'Sent automatically by {escape(EMAIL_FROM_NAME)} predictive monitoring. '
            f'Open the SolarSense dashboard to acknowledge or dispatch a crew.</td></tr>'
            f'</table></td></tr></table>')


def digest_html(faults: List[dict]) -> str:
    rows = "".join(
        f'<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-weight:bold">{escape(f["panel_id"])}</td>'
        f'<td style="padding:8px;border-bottom:1px solid #e2e8f0">{escape(f["type"])}</td>'
        f'<td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#dc2626;font-weight:bold">-{f["drop_pct"]}%</td>'
        f'<td style="padding:8px;border-bottom:1px solid #e2e8f0">{escape(f["timestamp"][:16].replace("T", " "))}</td>'
        f'<td style="padding:8px;border-bottom:1px solid #e2e8f0">${f["lost_revenue_usd"]}</td></tr>'
        for f in faults)
    lost = round(sum(f["lost_revenue_usd"] for f in faults), 3)
    inner = (f'<p style="margin:0 0 14px">{len(faults)} panel fault(s) need attention. '
             f'Estimated revenue lost so far: <strong>${lost}</strong>.</p>'
             f'<table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px">'
             f'<tr style="background:#f1f5f9;text-align:left"><th style="padding:8px">Panel</th><th style="padding:8px">Fault</th>'
             f'<th style="padding:8px">Drop</th><th style="padding:8px">Sim time</th><th style="padding:8px">Lost</th></tr>{rows}</table>'
             f'<p style="margin:16px 0 0;font-size:13px">Recommended: inspect the listed modules and service via the Panel Array page.</p>')
    return _wrap(f"{len(faults)} critical panel fault(s) detected", inner)


async def _deliver(recipients: List[str], subject: str, html: str, faults: List[dict], kind: str) -> dict:
    log = {"id": str(uuid.uuid4()), "kind": kind, "sent_at": datetime.now(timezone.utc).isoformat(),
           "recipients": recipients, "subject": subject, "fault_count": len(faults),
           "panels": sorted({f["panel_id"] for f in faults}), "status": "sent", "error": None}
    try:
        for r in recipients:
            await send_email(to=r, subject=subject, html=html)
    except Exception as exc:
        logger.error("alert email failed: %s", exc)
        log.update(status="failed", error=str(exc)[:300])
    await db.email_log.insert_one(dict(log))
    return log


async def flush_once() -> None:
    s = await get_settings()
    now = datetime.now(timezone.utc)
    last = _state["last_sent"]
    if not (s.enabled and s.recipients and pending):
        return
    if last and (now - last).total_seconds() < s.cooldown_minutes * 60:
        return
    allowed = {"critical"} if s.min_severity == "critical" else {"critical", "high"}
    faults = [f for f in pending if f["severity"] in allowed]
    pending.clear()
    if not faults:
        return
    _state["last_sent"] = now
    log = await _deliver([str(r) for r in s.recipients],
                         f"[SolarSense] {len(faults)} panel fault(s) detected", digest_html(faults), faults, "digest")
    if log["status"] == "sent":
        await db.anomaly_history.update_many({"id": {"$in": [f["id"] for f in faults]}}, {"$set": {"emailed": True}})


async def run_forever() -> None:
    while True:
        try:
            await flush_once()
        except Exception:
            logger.exception("alert flush failed")
        await asyncio.sleep(FLUSH_INTERVAL_S)


# ---------------------------------------------------------------- endpoints
@router.get("/settings")
async def read_settings():
    return (await get_settings()).model_dump()


@router.put("/settings")
async def update_settings(body: AlertSettings):
    await db.alert_settings.update_one({"key": "alerts"}, {"$set": body.model_dump()}, upsert=True)
    return body.model_dump()


@router.post("/test")
async def send_test():
    """Send a fixed-template test alert to the saved recipients (rate-limited)."""
    s = await get_settings()
    if not s.recipients:
        raise HTTPException(400, "Add at least one recipient first")
    now = datetime.now(timezone.utc)
    if _state["last_test"] and (now - _state["last_test"]).total_seconds() < TEST_COOLDOWN_S:
        raise HTTPException(429, "Please wait a minute between test emails")
    _state["last_test"] = now
    sample = [{"panel_id": "P-7", "type": "Inverter Failure (test)", "drop_pct": 52.0,
               "timestamp": now.isoformat(), "lost_revenue_usd": 0.0}]
    log = await _deliver([str(r) for r in s.recipients], "[SolarSense] Test alert",
                         digest_html(sample), sample, "test")
    if log["status"] != "sent":
        raise HTTPException(502, "Email delivery failed")
    return log


@router.get("/log")
async def email_log():
    return await db.email_log.find({}, {"_id": 0}).sort("sent_at", -1).to_list(30)


@router.get("/status")
async def alert_status():
    last = _state["last_sent"]
    return {"pending": len(pending), "last_sent": last.isoformat() if last else None}
