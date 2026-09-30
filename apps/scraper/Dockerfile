FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY stampd_scraper ./stampd_scraper
# accounts.db lives on a persistent volume mounted at /data (plan B6b)
ENV ACCOUNTS_DB=/data/accounts.db
EXPOSE 8000
CMD ["uv", "run", "--no-dev", "uvicorn", "stampd_scraper.app:main_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
