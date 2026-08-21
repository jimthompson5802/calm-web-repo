from __future__ import annotations

import argparse
import json
import mimetypes
import shutil
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from typing import Sequence
from urllib.parse import unquote, urlsplit

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8081
SIMPLE_AUTH_HEADER = "Authorization"
SIMPLE_AUTH_VALUE = "XYZ"


def find_repo_root(start: Path | None = None) -> Path:
    search_from = (start or Path(__file__)).resolve()

    for candidate in (search_from, *search_from.parents):
        if (candidate / "static").is_dir() and (candidate / "apps").is_dir():
            return candidate

    raise RuntimeError("Could not locate repo root containing 'static/' and 'apps/'")


@dataclass(frozen=True)
class ServerConfig:
    host: str = DEFAULT_HOST
    port: int = DEFAULT_PORT
    static_root: Path = find_repo_root() / "static"
    simple_auth: bool = False


class StaticFileRequestHandler(BaseHTTPRequestHandler):
    static_root = find_repo_root() / "static"
    simple_auth = False
    server_version = "pyweb/0.1"
    sys_version = ""

    def do_GET(self) -> None:  # noqa: N802
        self._serve_response(include_body=True)

    def do_HEAD(self) -> None:  # noqa: N802
        self._serve_response(include_body=False)

    def _serve_response(self, *, include_body: bool) -> None:
        request_path = urlsplit(self.path).path

        if request_path == "/health":
            self._serve_health(include_body=include_body)
            return

        if self.simple_auth and not self._has_valid_simple_auth():
            self.send_error(HTTPStatus.FORBIDDEN, "Forbidden")
            return

        resolved_path = self._resolve_static_path(request_path)
        if resolved_path is None or not resolved_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return

        content_type, _ = mimetypes.guess_type(resolved_path.name)
        response_content_type = content_type or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", response_content_type)
        self.send_header("Content-Length", str(resolved_path.stat().st_size))
        self.end_headers()

        if include_body:
            with resolved_path.open("rb") as static_file:
                shutil.copyfileobj(static_file, self.wfile)

    def _serve_health(self, *, include_body: bool) -> None:
        payload = json.dumps({"status": "ok"}).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()

        if include_body:
            self.wfile.write(payload)

    def _has_valid_simple_auth(self) -> bool:
        return self.headers.get(SIMPLE_AUTH_HEADER) == SIMPLE_AUTH_VALUE

    @classmethod
    def _resolve_static_path(cls, request_path: str) -> Path | None:
        decoded_path = unquote(request_path)
        relative_path = PurePosixPath(decoded_path.lstrip("/"))

        if str(relative_path) == ".":
            return None

        if relative_path.is_absolute() or ".." in relative_path.parts:
            return None

        candidate = (cls.static_root / Path(relative_path)).resolve()
        try:
            candidate.relative_to(cls.static_root.resolve())
        except ValueError:
            return None

        return candidate

    def log_message(self, format: str, *args: object) -> None:
        return


def create_server(config: ServerConfig) -> ThreadingHTTPServer:
    handler_class = type(
        "ConfiguredStaticFileRequestHandler",
        (StaticFileRequestHandler,),
        {
            "static_root": config.static_root.resolve(),
            "simple_auth": config.simple_auth,
        },
    )
    return ThreadingHTTPServer((config.host, config.port), handler_class)


def print_startup_messages(config: ServerConfig) -> None:
    print(f"Serving {config.static_root} at http://{config.host}:{config.port}")
    if config.simple_auth:
        print(
            "Simple authentication enabled; static GET and HEAD requests require "
            f"{SIMPLE_AUTH_HEADER}: {SIMPLE_AUTH_VALUE}"
        )


def parse_args(argv: Sequence[str] | None = None) -> ServerConfig:
    parser = argparse.ArgumentParser(
        description="Serve files from calm-web-repo/static using Python's standard library."
    )
    parser.add_argument("--host", default=DEFAULT_HOST, help="Host interface to bind.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to listen on.")
    parser.add_argument(
        "--simple-auth",
        action="store_true",
        help="Require Authorization: XYZ for static file GET and HEAD requests.",
    )

    arguments = parser.parse_args(argv)
    return ServerConfig(
        host=arguments.host,
        port=arguments.port,
        simple_auth=arguments.simple_auth,
    )


def main(argv: Sequence[str] | None = None) -> int:
    config = parse_args(argv)
    server = create_server(config)

    print_startup_messages(config)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

    return 0
