"""Integration tests for the /health router."""
from fastapi.testclient import TestClient


def test_health_returns_200(client: TestClient):
    """Verify that the health endpoint returns HTTP 200."""
    response = client.get("/health")
    assert response.status_code == 200


def test_health_returns_status_ok(client: TestClient):
    """Verify that the health payload reports ok status."""
    data = client.get("/health").json()
    assert data["status"] == "ok"


def test_health_includes_message(client: TestClient):
    """Verify that the health payload includes a non-empty message."""
    data = client.get("/health").json()
    assert "message" in data
    assert data["message"]


def test_health_message_mentions_backend(client: TestClient):
    """Verify that the health message identifies backend connectivity."""
    data = client.get("/health").json()
    assert "backend" in data["message"].lower() or "connected" in data["message"].lower()


def test_health_response_is_json(client: TestClient):
    """Verify that the health endpoint returns a JSON response."""
    response = client.get("/health")
    assert response.headers["content-type"].startswith("application/json")
