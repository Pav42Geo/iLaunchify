"""iLaunchify compliance service — entry point.

This service owns three responsibilities:
  1. Nutrition calculation from recipe + ingredient nutrient profiles (USDA-backed).
  2. Compliance evaluation against US/FDA rule packs (food + supplements).
  3. Label PDF rendering (replaces the FOD-era jQuery plugin).

Reads from the shared CockroachDB via Prisma Python Client.
Writes only ComplianceCheck audit-log rows.

V1 endpoints:
  POST /v1/nutrition/calculate        → NutritionProfile (cached on Product)
  POST /v1/compliance/check           → ComplianceResult (writes ComplianceCheck)
  POST /v1/labels/render              → PDF bytes (also stored to R2)
  GET  /healthz                       → liveness
  GET  /readyz                        → readiness (db ping)
"""
from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.config import settings

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("compliance.startup")
    if not settings.service_token and settings.environment != "development":
        log.error(
            "compliance.startup.no_service_token",
            hint="Set COMPLIANCE_SERVICE_TOKEN — /v1 routes will return 503 until configured.",
        )
    # TODO: connect Prisma client, warm USDA lookups
    yield
    log.info("compliance.shutdown")


app = FastAPI(
    title="iLaunchify Compliance Service",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
async def readyz() -> dict[str, str]:
    # TODO: ping Prisma, ping R2 bucket
    return {"status": "ok"}


# Routers — wired up as we build them. EVERY /v1 router MUST carry the
# service-token dependency (docs/SECURITY_ARCHITECTURE.md Tier 0.4) —
# /healthz + /readyz are the only unauthenticated routes.
# from fastapi import Depends
# from app.security import verify_service_token
# from app.routers import nutrition, compliance, labels
# app.include_router(nutrition.router, prefix="/v1", dependencies=[Depends(verify_service_token)])
# app.include_router(compliance.router, prefix="/v1", dependencies=[Depends(verify_service_token)])
# app.include_router(labels.router, prefix="/v1", dependencies=[Depends(verify_service_token)])
