"""Integration tests for the /config router."""
from fastapi.testclient import TestClient


def test_get_all_config_returns_200(client: TestClient):
    """Verify that GET /config returns HTTP 200."""
    assert client.get("/config").status_code == 200


def test_get_all_config_structure(client: TestClient):
    """Verify that GET /config returns the expected collection shape."""
    data = client.get("/config").json()
    assert data["ok"] is True
    assert isinstance(data["items"], list)
    assert data["count"] == len(data["items"])


def test_get_all_config_contains_seeded_keys(client: TestClient):
    """Verify that GET /config includes seeded configuration keys."""
    items = client.get("/config").json()["items"]
    keys = {item["key"] for item in items}
    assert "model_name" in keys
    assert "temperature" in keys


def test_get_config_by_existing_key(client: TestClient):
    """Verify that GET /config can fetch an existing key."""
    response = client.get("/config", params={"key": "model_name"})
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["item"]["key"] == "model_name"
    assert data["item"]["value"]


def test_get_config_missing_key_returns_404(client: TestClient):
    """Verify that GET /config returns 404 for a missing key."""
    response = client.get("/config", params={"key": "missing_key_xyz"})
    assert response.status_code == 404


def test_post_config_creates_new_key(client: TestClient):
    """Verify that POST /config creates a new configuration key."""
    payload = {"key": "test_new_key", "value": "test_value_99"}
    response = client.post("/config", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["item"]["key"] == "test_new_key"
    assert data["item"]["value"] == "test_value_99"


def test_post_then_get_roundtrip(client: TestClient):
    """Verify that a posted configuration value can be fetched later."""
    client.post("/config", json={"key": "roundtrip_key", "value": "roundtrip_val"})
    data = client.get("/config", params={"key": "roundtrip_key"}).json()
    assert data["item"]["value"] == "roundtrip_val"


def test_post_config_updates_existing_key(client: TestClient):
    """Verify that POST /config updates an existing configuration key."""
    client.post("/config", json={"key": "model_name", "value": "new-test-model"})
    data = client.get("/config", params={"key": "model_name"}).json()
    assert data["item"]["value"] == "new-test-model"


def test_post_config_response_has_updated_at(client: TestClient):
    """Verify that POST /config responses include updated_at metadata."""
    response = client.post("/config", json={"key": "ts_key", "value": "v"})
    assert "updated_at" in response.json()["item"]
