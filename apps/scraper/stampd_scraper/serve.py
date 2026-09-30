"""Production entry point: `python -m stampd_scraper.serve`.

uvicorn's `--host ::` makes an IPv6-only socket (asyncio sets IPV6_V6ONLY), so IPv4 callers such as
Railway's health check never reach it. This binds one dual-stack socket instead: IPv6 for Railway's
private network (scraper.railway.internal) and IPv4 for everything else.
"""

import os
import socket

import uvicorn


def dual_stack_socket(port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    sock.bind(("::", port))
    return sock


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    config = uvicorn.Config("stampd_scraper.app:main_app", factory=True, proxy_headers=True, forwarded_allow_ips="*")
    uvicorn.Server(config).run(sockets=[dual_stack_socket(port)])


if __name__ == "__main__":
    main()
