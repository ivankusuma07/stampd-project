"""X data backends. `TwscrapeBackend` is the real one; tests use a fake with the same shape."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import timezone
from typing import Protocol


@dataclass
class XPost:
    """Mirrors `XPost` in packages/core/src/types.ts."""

    id: str
    authorId: str
    authorHandle: str
    text: str
    createdAt: str
    url: str
    replyToId: str | None = None
    quotedId: str | None = None
    isRepost: bool = False

    def to_json(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class XUser:
    id: str
    handle: str
    name: str
    avatarUrl: str


@dataclass
class PoolStats:
    active: int
    locked: int


class NoAccountAvailable(Exception):
    """Every scraper account is locked or inactive."""


class Backend(Protocol):
    async def user(self, handle: str) -> XUser | None: ...
    async def timeline(self, user_id: str, limit: int) -> list[XPost]: ...
    async def post(self, post_id: str) -> XPost | None: ...
    async def pool(self) -> PoolStats: ...


def to_post(t) -> XPost:
    """twscrape Tweet -> XPost."""
    return XPost(
        id=t.id_str,
        authorId=t.user.id_str,
        authorHandle=t.user.username,
        text=t.rawContent,
        createdAt=t.date.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        url=f"https://x.com/{t.user.username}/status/{t.id_str}",
        replyToId=t.inReplyToTweetIdStr,
        quotedId=t.quotedTweet.id_str if t.quotedTweet else None,
        isRepost=t.retweetedTweet is not None,
    )


class TwscrapeBackend:
    """Reads X through twscrape's account pool (sessions in a SQLite file on a persistent volume)."""

    def __init__(self, accounts_db: str, wait_timeout: float = 20.0):
        from twscrape import API

        # Fail fast instead of blocking when every account is rate-limited: the worker's
        # health guard then pauses ingest (plan B6b).
        self.api = API(accounts_db, raise_when_no_account=True, wait_timeout=wait_timeout)

    async def _call(self, coro):
        from twscrape.accounts_pool import NoAccountError

        try:
            return await coro
        except NoAccountError as e:
            raise NoAccountAvailable(str(e)) from e

    async def user(self, handle: str) -> XUser | None:
        u = await self._call(self.api.user_by_login(handle))
        if u is None:
            return None
        return XUser(id=u.id_str, handle=u.username, name=u.displayname, avatarUrl=u.profileImageUrl)

    async def timeline(self, user_id: str, limit: int) -> list[XPost]:
        async def collect():
            return [to_post(t) async for t in self.api.user_tweets(int(user_id), limit=limit)]

        return await self._call(collect())

    async def post(self, post_id: str) -> XPost | None:
        t = await self._call(self.api.tweet_details(int(post_id)))
        return to_post(t) if t else None

    async def pool(self) -> PoolStats:
        stats = await self.api.pool.stats()
        locked = max([v for k, v in stats.items() if k.startswith("locked_")] or [0])
        return PoolStats(active=int(stats.get("active", 0)), locked=int(locked))
