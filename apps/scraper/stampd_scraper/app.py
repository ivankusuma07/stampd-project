"""HTTP API used by apps/worker (plan B6b):

    GET /timeline/{user_id}?after_id=...   newest first, only posts with id > after_id
    GET /post/{id}
    GET /user/{handle}
    GET /health                            active / locked accounts, last success

Single instance only: twscrape keeps sessions in SQLite, which doesn't suit several writers.
Scraped data only discovers predictions; it is never used to resolve a market.
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request

from .backend import Backend, NoAccountAvailable

VERSION = "0.1.0"
TIMELINE_LIMIT = 40
ID_RE = re.compile(r"^\d{1,20}$")
HANDLE_RE = re.compile(r"^[A-Za-z0-9_]{1,15}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def create_app(backend: Backend, token: str | None = None, enabled: bool = True) -> FastAPI:
    app = FastAPI(title="stampd-scraper", version=VERSION)
    state: dict[str, str | None] = {"last_success": None, "last_error": None}

    def auth(request: Request) -> None:
        if token and request.headers.get("authorization") != f"Bearer {token}":
            raise HTTPException(401, "bad token")

    def guard() -> None:
        # Kill switch (plan B6b): one config value stops all scraping.
        if not enabled:
            raise HTTPException(503, "scraping disabled")

    async def run(coro):
        try:
            result = await coro
        except NoAccountAvailable as e:
            state["last_error"] = str(e)
            raise HTTPException(503, f"no scraper account available: {e}") from e
        state["last_success"] = _now()
        return result

    data = [Depends(auth), Depends(guard)]

    @app.get("/timeline/{user_id}", dependencies=data)
    async def timeline(user_id: str, after_id: str | None = None):
        if not ID_RE.match(user_id) or (after_id and not ID_RE.match(after_id)):
            raise HTTPException(400, "ids are numeric")
        posts = await run(backend.timeline(user_id, TIMELINE_LIMIT))
        # The timeline also carries other people's posts from reply/quote conversation modules,
        # and repeats some entries. Keep only this user's own posts, once each: a post by someone
        # else must never be attributed to the KOL (plan R3).
        # twscrape has no since_id and pinned posts arrive out of order, so filter and sort
        # rather than stopping at the first known id.
        floor = int(after_id) if after_id else -1
        own = {p.id: p for p in posts if p.authorId == user_id and int(p.id) > floor}
        fresh = sorted(own.values(), key=lambda p: int(p.id), reverse=True)
        return {"posts": [p.to_json() for p in fresh]}

    @app.get("/post/{post_id}", dependencies=data)
    async def post(post_id: str):
        if not ID_RE.match(post_id):
            raise HTTPException(400, "ids are numeric")
        p = await run(backend.post(post_id))
        if p is None:
            raise HTTPException(404, "not found")
        return p.to_json()

    @app.get("/user/{handle}", dependencies=data)
    async def user(handle: str):
        if not HANDLE_RE.match(handle):
            raise HTTPException(400, "bad handle")
        u = await run(backend.user(handle))
        if u is None:
            raise HTTPException(404, "not found")
        return u.__dict__

    @app.get("/health", dependencies=[Depends(auth)])
    async def health():
        started = time.monotonic()
        pool = await backend.pool()
        return {
            "ok": enabled and pool.active > 0,
            "enabled": enabled,
            "activeAccounts": pool.active,
            "lockedAccounts": pool.locked,
            "lastSuccessAt": state["last_success"],
            "lastError": state["last_error"],
            "version": VERSION,
            "latencyMs": round((time.monotonic() - started) * 1000),
        }

    return app


def main_app() -> FastAPI:
    """Entry point: `uvicorn stampd_scraper.app:main_app --factory`."""
    from .backend import TwscrapeBackend

    return create_app(
        TwscrapeBackend(os.environ.get("ACCOUNTS_DB", "data/accounts.db")),
        token=os.environ.get("SCRAPER_TOKEN") or None,
        enabled=os.environ.get("SCRAPER_ENABLED", "true").lower() in ("1", "true"),
    )
