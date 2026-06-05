"""Unit tests for services.chat_store chat session and message CRUD."""
import pytest
from services.chat_store import (
    ensure_session,
    add_message,
    get_messages,
    get_system_prompt,
    set_chat_context,
    get_chat_context,
    delete_chat,
    list_chat_sessions,
    update_chat_title,
    get_chat_title,
    count_user_messages,
    get_full_chat_by_id,
)

CHAT_ID = "test-chat-001"
SYSTEM_PROMPT = "You are a test assistant."


@pytest.fixture(autouse=True)
def session(isolated_db):
    """Create the default chat session before each test."""
    ensure_session(CHAT_ID, SYSTEM_PROMPT)


class TestEnsureSession:
    """Tests for chat session creation and idempotency."""

    def test_creates_session(self):
        """Verify that ensure_session creates a retrievable session."""
        assert get_system_prompt(CHAT_ID) == SYSTEM_PROMPT

    def test_is_idempotent(self):
        """Verify that ensure_session does not overwrite an existing prompt."""
        ensure_session(CHAT_ID, "another different prompt")
        assert get_system_prompt(CHAT_ID) == SYSTEM_PROMPT

    def test_new_chat_has_no_messages(self):
        """Verify that a newly created chat has no stored messages."""
        ensure_session("new-chat", SYSTEM_PROMPT)
        assert get_messages("new-chat") == []


class TestAddMessage:
    """Tests for adding and reading chat messages."""

    def test_add_user_message(self):
        """Verify that a user message is persisted with role and content."""
        add_message(CHAT_ID, "user", "Hello")
        msgs = get_messages(CHAT_ID)
        assert len(msgs) == 1
        assert msgs[0]["role"] == "user"
        assert msgs[0]["content"] == "Hello"

    def test_add_assistant_message(self):
        """Verify that an assistant message is persisted with its role."""
        add_message(CHAT_ID, "assistant", "Hello, how can I help?")
        msgs = get_messages(CHAT_ID)
        assert msgs[0]["role"] == "assistant"

    def test_ignores_system_role(self):
        """Verify that system-role messages are not persisted."""
        add_message(CHAT_ID, "system", "This should not be stored")
        assert get_messages(CHAT_ID) == []

    def test_ignores_tool_role(self):
        """Verify that tool-role messages are not persisted."""
        add_message(CHAT_ID, "tool", "tool result")
        assert get_messages(CHAT_ID) == []

    def test_multiple_messages_preserved_in_order(self):
        """Verify that multiple messages are returned in insertion order."""
        for i in range(4):
            add_message(CHAT_ID, "user", f"Message {i}")
        msgs = get_messages(CHAT_ID)
        assert [m["content"] for m in msgs] == ["Message 0", "Message 1", "Message 2", "Message 3"]

    def test_limit_is_respected(self):
        """Verify that get_messages respects an explicit result limit."""
        for i in range(10):
            add_message(CHAT_ID, "user", f"msg {i}")
        msgs = get_messages(CHAT_ID, limit=3)
        assert len(msgs) == 3

    def test_default_limit_is_50(self):
        """Verify that get_messages applies the default 50-message limit."""
        for i in range(60):
            add_message(CHAT_ID, "user", f"m{i}")
        msgs = get_messages(CHAT_ID)
        assert len(msgs) == 50


class TestChatContext:
    """Tests for per-chat context storage."""

    def test_set_and_get(self):
        """Verify that chat context can be stored and retrieved."""
        set_chat_context(CHAT_ID, "summary", "Test content")
        assert get_chat_context(CHAT_ID, "summary") == "Test content"

    def test_update_overwrites_previous(self):
        """Verify that setting the same context key overwrites its value."""
        set_chat_context(CHAT_ID, "key", "v1")
        set_chat_context(CHAT_ID, "key", "v2")
        assert get_chat_context(CHAT_ID, "key") == "v2"

    def test_missing_key_returns_none(self):
        """Verify that a missing context key returns None."""
        assert get_chat_context(CHAT_ID, "missing") is None

    def test_blank_content_is_not_stored(self):
        """Verify that blank context content is ignored."""
        set_chat_context(CHAT_ID, "empty", "   ")
        assert get_chat_context(CHAT_ID, "empty") is None

    def test_different_chats_have_independent_contexts(self):
        """Verify that context values are isolated by chat id."""
        ensure_session("chat-b", SYSTEM_PROMPT)
        set_chat_context(CHAT_ID, "k", "value-a")
        set_chat_context("chat-b", "k", "value-b")
        assert get_chat_context(CHAT_ID, "k") == "value-a"
        assert get_chat_context("chat-b", "k") == "value-b"


class TestDeleteChat:
    """Tests for deleting chats and related data."""

    def test_delete_returns_true_for_existing_chat(self):
        """Verify that deleting an existing chat returns true."""
        assert delete_chat(CHAT_ID) is True

    def test_session_is_gone_after_delete(self):
        """Verify that the session prompt is removed after deletion."""
        delete_chat(CHAT_ID)
        assert get_system_prompt(CHAT_ID) is None

    def test_delete_nonexistent_returns_false(self):
        """Verify that deleting an unknown chat returns false."""
        assert delete_chat("missing-chat") is False

    def test_messages_are_removed_on_delete(self):
        """Verify that messages are removed when their chat is deleted."""
        add_message(CHAT_ID, "user", "Message before deletion")
        delete_chat(CHAT_ID)
        ensure_session(CHAT_ID, SYSTEM_PROMPT)
        assert get_messages(CHAT_ID) == []

    def test_context_is_removed_on_delete(self):
        """Verify that context is removed when its chat is deleted."""
        set_chat_context(CHAT_ID, "data", "value")
        delete_chat(CHAT_ID)
        ensure_session(CHAT_ID, SYSTEM_PROMPT)
        assert get_chat_context(CHAT_ID, "data") is None


class TestListAndTitle:
    """Tests for listing sessions and managing chat titles."""

    def test_list_sessions_contains_created_chat(self):
        """Verify that the created chat appears in the session list."""
        ids = [s["chat_id"] for s in list_chat_sessions()]
        assert CHAT_ID in ids

    def test_list_sessions_includes_required_fields(self):
        """Verify that listed sessions include the required metadata fields."""
        sessions = list_chat_sessions()
        for s in sessions:
            assert "chat_id" in s
            assert "title" in s
            assert "created_at" in s
            assert "updated_at" in s

    def test_update_and_get_title(self):
        """Verify that a chat title can be updated and fetched."""
        update_chat_title(CHAT_ID, "My test title")
        assert get_chat_title(CHAT_ID) == "My test title"

    def test_title_of_unknown_chat_is_none(self):
        """Verify that an unknown chat title lookup returns None."""
        assert get_chat_title("missing-chat") is None


class TestCountAndFullChat:
    """Tests for user-message counts and full chat retrieval."""

    def test_count_user_messages_only_counts_user(self):
        """Verify that only user-role messages are counted."""
        add_message(CHAT_ID, "user", "u1")
        add_message(CHAT_ID, "assistant", "a1")
        add_message(CHAT_ID, "user", "u2")
        assert count_user_messages(CHAT_ID) == 2

    def test_count_zero_for_empty_chat(self):
        """Verify that an empty chat has zero user messages."""
        assert count_user_messages(CHAT_ID) == 0

    def test_get_full_chat_returns_all_fields(self):
        """Verify that get_full_chat_by_id returns chat metadata and messages."""
        add_message(CHAT_ID, "user", "question")
        add_message(CHAT_ID, "assistant", "answer")
        full = get_full_chat_by_id(CHAT_ID)
        assert full is not None
        assert full["chat_id"] == CHAT_ID
        assert len(full["messages"]) == 2
        assert full["messages"][0]["role"] == "user"
        assert full["messages"][1]["role"] == "assistant"

    def test_get_full_chat_unknown_id_returns_none(self):
        """Verify that requesting a missing full chat returns None."""
        assert get_full_chat_by_id("missing-chat") is None
