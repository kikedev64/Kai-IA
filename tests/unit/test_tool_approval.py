"""Unit tests for api.routers.tool_approval in-process approval flow."""
import threading
import pytest
from api.routers.tool_approval import (
    register_approval,
    consume_approval,
    _pending,
    _decisions,
)


@pytest.fixture(autouse=True)
def clean_state():
    """Ensure shared module-level dicts are empty before and after each test."""
    _pending.clear()
    _decisions.clear()
    yield
    _pending.clear()
    _decisions.clear()


def test_register_creates_threading_event():
    """Verify that registering an approval creates a threading event."""
    evt = register_approval("req-001")
    assert isinstance(evt, threading.Event)


def test_register_adds_to_pending():
    """Verify that registering an approval stores pending state."""
    register_approval("req-002")
    assert "req-002" in _pending
    assert "req-002" in _decisions


def test_default_decision_is_false():
    """Verify that approvals start with a default false decision."""
    register_approval("req-003")
    assert _decisions["req-003"] is False


def test_consume_removes_slot():
    """Verify that consuming an approval removes its state slot."""
    evt = register_approval("req-004")
    evt.set()
    consume_approval("req-004")
    assert "req-004" not in _pending
    assert "req-004" not in _decisions


def test_consume_without_approval_returns_false():
    """Verify that an unset decision is consumed as false."""
    evt = register_approval("req-005")
    evt.set()
    result = consume_approval("req-005")
    assert result is False


def test_consume_after_approve_returns_true():
    """Verify that a true decision is returned after approval."""
    evt = register_approval("req-006")
    _decisions["req-006"] = True
    evt.set()
    assert consume_approval("req-006") is True


def test_consume_unknown_id_returns_false():
    """Verify that consuming an unknown approval id returns false."""
    assert consume_approval("unregistered-id") is False


def test_multiple_slots_are_independent():
    """Verify that independent approval slots keep separate decisions."""
    register_approval("a")
    register_approval("b")
    _decisions["a"] = True
    _pending["a"].set()
    _pending["b"].set()

    assert consume_approval("a") is True
    assert consume_approval("b") is False


def test_event_is_not_set_on_register():
    """Verify that a newly registered approval event is not signaled."""
    evt = register_approval("req-007")
    assert not evt.is_set()
