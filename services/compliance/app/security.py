"""Service-to-service auth — bearer token shared with the Next.js apps.

Per docs/SECURITY_ARCHITECTURE.md Tier 0.4 (LOCKED 2026-06-05): the compliance
service handles partner trade secrets (recipes) and returns verdicts that
print on physical FDA labels, so every /v1 route requires the shared token.

Behavior:
  - COMPLIANCE_SERVICE_TOKEN set → require exact `Authorization: Bearer <token>`
    (constant-time compare).
  - token unset + environment=development → allow (local dev convenience).
  - token unset + any other environment → 503: refuse to serve rather than serve open.

/healthz and /readyz stay unauthenticated (liveness probes).
"""
from __future__ import annotations

import hmac

from fastapi import Header, HTTPException

from app.config import settings


async def verify_service_token(
    authorization: str | None = Header(default=None),
) -> None:
    token = settings.service_token

    if not token:
        if settings.environment == "development":
            return  # local dev without a token is fine
        raise HTTPException(
            status_code=503,
            detail="COMPLIANCE_SERVICE_TOKEN is not configured; refusing to serve unauthenticated.",
        )

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")

    presented = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(presented, token):
        raise HTTPException(status_code=401, detail="Invalid service token.")
