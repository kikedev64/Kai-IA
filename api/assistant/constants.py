"""Constants shared by assistant chat flows."""

MAX_TOOL_STEPS = 6
MAX_EMPTY_MODEL_RETRIES = 0
MAX_COMPLETION_GATE_RETRIES = 0
GMAIL_CONTEXT_KEY = "gmail_recent_refs"
DEBUG_TOOLS = True

GMAIL_CONTEXT_TOOLS = {
    "read_last_emails_full",
    "read_last_emails_from_sender",
    "read_last_emails_by_subject",
    "read_thread_from_message_id",
    "get_full_email",
}
