from dataclasses import dataclass, field
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from stampd_scraper.app import create_app
from stampd_scraper.backend import NoAccountAvailable, PoolStats, XPost, XUser, to_post


def post(i: int, **kw) -> XPost:
    return XPost(
        id=str(i), authorId="42", authorHandle="kol", text=f"post {i}",
        createdAt="2026-09-30T00:00:00Z", url=f"https://x.com/kol/status/{i}", **kw,
    )


@dataclass
class Fake:
    posts: list = field(default_factory=list)
    locked: bool = False
    calls: list = field(default_factory=list)

    async def user(self, handle):
        self.calls.append(("user", handle))
        return XUser(id="42", handle=handle, name="Kol", avatarUrl="a") if handle == "kol" else None

    async def timeline(self, user_id, limit):
        self.calls.append(("timeline", user_id, limit))
        if self.locked:
            raise NoAccountAvailable("all locked")
        return self.posts

    async def post(self, post_id):
        self.calls.append(("post", post_id))
        return next((p for p in self.posts if p.id == post_id), None)

    async def pool(self):
        return PoolStats(active=0 if self.locked else 3, locked=3 if self.locked else 0)


def test_timeline_returns_only_newer_posts_newest_first_even_with_a_pinned_post():
    fake = Fake(posts=[post(5), post(100), post(103), post(101)])  # 5 is an old pinned post
    c = TestClient(create_app(fake))
    r = c.get("/timeline/42", params={"after_id": "100"})
    assert r.status_code == 200
    assert [p["id"] for p in r.json()["posts"]] == ["103", "101"]
    assert "replyToId" not in r.json()["posts"][0]


def test_timeline_drops_other_authors_and_duplicates():
    # Seen live: X's timeline repeats entries and includes posts by other accounts from
    # conversation modules. Those must never be attributed to the KOL.
    other = XPost(id="200", authorId="99", authorHandle="someone_else", text="not the KOL",
                  createdAt="2026-09-30T00:00:00Z", url="https://x.com/someone_else/status/200")
    fake = Fake(posts=[post(150), other, post(150), post(120)])
    r = TestClient(create_app(fake)).get("/timeline/42")
    assert [p["id"] for p in r.json()["posts"]] == ["150", "120"]
    assert {p["authorHandle"] for p in r.json()["posts"]} == {"kol"}


def test_post_user_and_404s():
    c = TestClient(create_app(Fake(posts=[post(7, replyToId="3")])))
    assert c.get("/post/7").json()["replyToId"] == "3"
    assert c.get("/post/8").status_code == 404
    assert c.get("/user/kol").json()["id"] == "42"
    assert c.get("/user/nobody").status_code == 404


def test_rejects_bad_input():
    c = TestClient(create_app(Fake()))
    assert c.get("/timeline/abc").status_code == 400
    assert c.get("/post/1x").status_code == 400
    assert c.get("/user/not-a-handle").status_code == 400


def test_locked_pool_is_503_and_reported_by_health():
    c = TestClient(create_app(Fake(locked=True)))
    assert c.get("/timeline/42").status_code == 503
    h = c.get("/health").json()
    assert h["ok"] is False and h["activeAccounts"] == 0 and h["lastError"] == "all locked"


def test_health_records_last_success():
    c = TestClient(create_app(Fake(posts=[post(1)])))
    assert c.get("/health").json()["lastSuccessAt"] is None
    c.get("/timeline/42")
    assert c.get("/health").json()["lastSuccessAt"].endswith("Z")


def test_kill_switch_blocks_every_data_route_without_calling_x():
    fake = Fake(posts=[post(1)])
    c = TestClient(create_app(fake, enabled=False))
    for path in ["/timeline/42", "/post/1", "/user/kol"]:
        assert c.get(path).status_code == 503
    assert fake.calls == []
    assert c.get("/health").json()["enabled"] is False


def test_bearer_token():
    c = TestClient(create_app(Fake(), token="s3cret"))
    assert c.get("/health").status_code == 401
    assert c.get("/health", headers={"Authorization": "Bearer s3cret"}).status_code == 200


def test_to_post_maps_twscrape_tweets():
    user = SimpleNamespace(id_str="42", username="kol")
    t = SimpleNamespace(
        id_str="1873", user=user, rawContent="BTC to 100k by EOY",
        date=datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc),
        inReplyToTweetIdStr=None, quotedTweet=SimpleNamespace(id_str="9"), retweetedTweet=None,
    )
    assert to_post(t).to_json() == {
        "id": "1873", "authorId": "42", "authorHandle": "kol", "text": "BTC to 100k by EOY",
        "createdAt": "2026-09-30T12:00:00Z", "url": "https://x.com/kol/status/1873",
        "quotedId": "9", "isRepost": False,
    }


def test_twscrape_backend_constructs_against_a_real_accounts_db(tmp_path):
    # Imports the pinned twscrape and opens an empty pool: catches API drift on upgrade.
    import asyncio

    from stampd_scraper.backend import TwscrapeBackend

    b = TwscrapeBackend(str(tmp_path / "accounts.db"))
    assert asyncio.run(b.pool()) == PoolStats(active=0, locked=0)
