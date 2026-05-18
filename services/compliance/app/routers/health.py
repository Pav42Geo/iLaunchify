"""Health endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from app.db import get_prisma

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict[str, str]:
    """Returns ok only if the DB is reachable."""
    try:
        prisma = await get_prisma()
        await prisma.execute_raw("SELECT 1")
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}
