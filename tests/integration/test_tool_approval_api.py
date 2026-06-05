"""Integration tests for the /assistant/tool/approve router."""
import pytest
from fastapi.testclient import TestClient
from api.routers.tool_approval import (
    register_approval,
    consume_approval,
    _pending,
    _decisions,
)


@pytest.fixture(autouse=True)
def clean_state():
    """Ensure shared approval state is empty before and after each test."""
    _pending.clear()
    _decisions.clear()
    yield
    _pending.clear()
    _decisions.clear()


def test_approve_unknown_id_returns_404(client: TestClient):
    """Verify that approving an unknown id returns HTTP 404."""
    response = client.post("/assistant/tool/approve/unknown-id")
    assert response.status_code == 404


def test_approve_registered_id_returns_200(client: TestClient):
    """Verify that approving a registered id returns HTTP 200."""
    register_approval("api-test-01")
    response = client.post("/assistant/tool/approve/api-test-01", params={"approved": True})
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_approve_sets_event(client: TestClient):
    """Verify that approval through the API signals the waiting event."""
    evt = register_approval("api-test-02")
    assert not evt.is_set()
    client.post("/assistant/tool/approve/api-test-02", params={"approved": True})
    assert evt.is_set()


def test_approve_true_stores_decision(client: TestClient):
    """Verify that approved=true stores a true approval decision."""
    register_approval("api-test-03")
    client.post("/assistant/tool/approve/api-test-03", params={"approved": True})
    assert consume_approval("api-test-03") is True


def test_approve_false_stores_decision(client: TestClient):
    """Verify that approved=false stores a false approval decision."""
    register_approval("api-test-04")
    client.post("/assistant/tool/approve/api-test-04", params={"approved": False})
    assert consume_approval("api-test-04") is False


def test_approve_default_param_is_true(client: TestClient):
    """Verify that the approved query parameter defaults to true."""
    register_approval("api-test-05")
    client.post("/assistant/tool/approve/api-test-05")
    assert consume_approval("api-test-05") is True


def test_second_approve_on_consumed_slot_returns_404(client: TestClient):
    """Verify that a consumed approval slot cannot be approved again."""
    register_approval("api-test-06")
    client.post("/assistant/tool/approve/api-test-06", params={"approved": True})
    consume_approval("api-test-06")

    response = client.post("/assistant/tool/approve/api-test-06")
    assert response.status_code == 404
