FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY stampd_scraper ./stampd_scraper
# accounts.db lives on a persistent volume mounted at /data (plan B6b). Run exactly one replica:
# twscrape keeps its sessions in SQLite.
ENV ACCOUNTS_DB=/data/accounts.db
ENV PORT=8000
EXPOSE 8000
# One dual-stack socket: IPv6 for Railway's private network (scraper.railway.internal), IPv4 for the
# health check. Plain `uvicorn --host ::` would be IPv6-only (see stampd_scraper/serve.py).
CMD ["uv", "run", "--no-dev", "python", "-m", "stampd_scraper.serve"]
