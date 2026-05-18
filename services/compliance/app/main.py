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

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("compliance.startup")
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


# Routers — wired up as we build them
# from app.routers import nutrition, compliance, labels
# app.include_router(nutrition.router, prefix="/v1")
# app.include_router(compliance.router, prefix="/v1")
# app.include_router(labels.router, prefix="/v1")
