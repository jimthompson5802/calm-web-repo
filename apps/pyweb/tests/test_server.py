from __future__ import annotations

import json
import threading
from contextlib import contextmanager
from http.client import HTTPConnection
from pathlib import Path
from typing import Iterator

from pyweb.server import (
    DEFAULT_HOST,
    DEFAULT_PORT,
    ServerConfig,
    SIMPLE_AUTH_HEADER,
    SIMPLE_AUTH_VALUE,
    create_server,
    parse_args,
    print_startup_messages,
)


@contextmanager
def run_server(config: ServerConfig | None = None) -> Iterator[tuple[str, int]]:
    server = create_server(config or ServerConfig(port=0))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_address[0], server.server_address[1]
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


def request(
    method: str,
    path: str,
    *,
    config: ServerConfig | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    with run_server(config) as (host, port):
        connection = HTTPConnection(host, port, timeout=5)
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        body = response.read()
        headers = {key: value for key, value in response.getheaders()}
        connection.close()
        return response.status, headers, body


def test_serves_static_json_file() -> None:
    status, headers, body = request("GET", "/architectures/calm-1.json")

    assert status == 200
    assert headers["Content-Type"] == "application/json"

    payload = json.loads(body.decode("utf-8"))
    assert payload["nodes"][0]["unique-id"] == "calm-user"


def test_missing_file_returns_404() -> None:
    status, _, _ = request("GET", "/architectures/does-not-exist.json")

    assert status == 404


def test_path_traversal_is_rejected() -> None:
    status, _, _ = request("GET", "/../README.md")

    assert status == 404


def test_directory_listing_is_not_served() -> None:
    status, _, _ = request("GET", "/architectures")

    assert status == 404


def test_health_endpoint_returns_ok() -> None:
    status, headers, body = request("GET", "/health")

    assert status == 200
    assert headers["Content-Type"] == "application/json"
    assert json.loads(body.decode("utf-8")) == {"status": "ok"}


def test_head_request_returns_headers_without_body() -> None:
    status, headers, body = request("HEAD", "/architectures/calm-1.json")

    assert status == 200
    assert headers["Content-Type"] == "application/json"
    assert body == b""


def test_simple_auth_protects_static_get_requests() -> None:
    status, headers, body = request(
        "GET",
        "/architectures/calm-1.json",
        config=ServerConfig(port=0, simple_auth=True),
        headers={SIMPLE_AUTH_HEADER: SIMPLE_AUTH_VALUE},
    )

    assert status == 200
    assert headers["Content-Type"] == "application/json"

    payload = json.loads(body.decode("utf-8"))
    assert payload["nodes"][0]["unique-id"] == "calm-user"


def test_simple_auth_protects_static_head_requests() -> None:
    status, headers, body = request(
        "HEAD",
        "/architectures/calm-1.json",
        config=ServerConfig(port=0, simple_auth=True),
        headers={SIMPLE_AUTH_HEADER: SIMPLE_AUTH_VALUE},
    )

    assert status == 200
    assert headers["Content-Type"] == "application/json"
    assert body == b""


def test_simple_auth_rejects_missing_authorization_header() -> None:
    status, _, _ = request(
        "GET",
        "/architectures/calm-1.json",
        config=ServerConfig(port=0, simple_auth=True),
    )

    assert status == 403


def test_simple_auth_rejects_wrong_authorization_value() -> None:
    status, _, _ = request(
        "GET",
        "/architectures/calm-1.json",
        config=ServerConfig(port=0, simple_auth=True),
        headers={SIMPLE_AUTH_HEADER: "wrong"},
    )

    assert status == 403


def test_health_endpoint_stays_open_with_simple_auth_enabled() -> None:
    status, headers, body = request(
        "GET",
        "/health",
        config=ServerConfig(port=0, simple_auth=True),
    )

    assert status == 200
    assert headers["Content-Type"] == "application/json"
    assert json.loads(body.decode("utf-8")) == {"status": "ok"}


def test_missing_file_still_returns_404_after_auth_passes() -> None:
    status, _, _ = request(
        "GET",
        "/architectures/does-not-exist.json",
        config=ServerConfig(port=0, simple_auth=True),
        headers={SIMPLE_AUTH_HEADER: SIMPLE_AUTH_VALUE},
    )

    assert status == 404


def test_parse_args_uses_default_bind_values() -> None:
    config = parse_args([])

    assert config.host == DEFAULT_HOST
    assert config.port == DEFAULT_PORT
    assert config.static_root == Path(__file__).resolve().parents[3] / "static"
    assert config.simple_auth is False


def test_parse_args_allows_overrides() -> None:
    config = parse_args(["--host", "0.0.0.0", "--port", "9090", "--simple-auth"])

    assert config.host == "0.0.0.0"
    assert config.port == 9090
    assert config.simple_auth is True


def test_print_startup_messages_without_simple_auth(capsys: object) -> None:
    print_startup_messages(ServerConfig())

    captured = capsys.readouterr()
    assert "Serving" in captured.out
    assert "Simple authentication enabled" not in captured.out


def test_print_startup_messages_with_simple_auth(capsys: object) -> None:
    print_startup_messages(ServerConfig(simple_auth=True))

    captured = capsys.readouterr()
    assert "Serving" in captured.out
    assert "Simple authentication enabled" in captured.out
    assert f"{SIMPLE_AUTH_HEADER}: {SIMPLE_AUTH_VALUE}" in captured.out
