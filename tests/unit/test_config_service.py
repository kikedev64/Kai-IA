"""Unit tests for services.config.config_service app_config CRUD."""
from services.config.config_service import (
    get_all_config,
    get_config_value,
    set_config_value,
)


def test_get_all_config_returns_seeded_defaults(isolated_db):
    """Verify that get_all_config returns the seeded configuration defaults."""
    items = get_all_config()
    assert isinstance(items, list)
    assert len(items) > 0
    keys = {item["key"] for item in items}
    assert "model_name" in keys
    assert "temperature" in keys
    assert "system_prompt_default" in keys


def test_all_config_items_have_required_fields(isolated_db):
    """Verify that every configuration item exposes the required fields."""
    for item in get_all_config():
        assert "key" in item
        assert "value" in item
        assert "updated_at" in item


def test_get_config_value_existing_key(isolated_db):
    """Verify that an existing configuration key can be fetched."""
    item = get_config_value("model_name")
    assert item is not None
    assert item["key"] == "model_name"
    assert item["value"]


def test_get_config_value_missing_key_returns_none(isolated_db):
    """Verify that a missing configuration key returns None."""
    assert get_config_value("key_that_never_exists") is None


def test_set_config_value_creates_new_key(isolated_db):
    """Verify that set_config_value creates a new key when absent."""
    result = set_config_value("new_test_key", "my_value")
    assert result["key"] == "new_test_key"
    assert result["value"] == "my_value"

    fetched = get_config_value("new_test_key")
    assert fetched is not None
    assert fetched["value"] == "my_value"


def test_set_config_value_updates_existing_key(isolated_db):
    """Verify that set_config_value updates an existing key."""
    set_config_value("model_name", "new-model")
    assert get_config_value("model_name")["value"] == "new-model"


def test_set_config_value_returns_updated_row(isolated_db):
    """Verify that set_config_value returns the updated row metadata."""
    result = set_config_value("temperature", "0.7")
    assert result["value"] == "0.7"
    assert "updated_at" in result


def test_config_list_is_ordered_by_key(isolated_db):
    """Verify that get_all_config returns items ordered by key."""
    items = get_all_config()
    keys = [item["key"] for item in items]
    assert keys == sorted(keys)
