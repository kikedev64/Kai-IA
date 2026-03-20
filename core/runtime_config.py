from typing import Any

_RUNTIME_CONFIG: dict[str, Any] = {}


def set_runtime_config(data: dict[str, Any]) -> None:
    global _RUNTIME_CONFIG
    _RUNTIME_CONFIG = dict(data)


def get_runtime_config_value(key: str, default=None):
    return _RUNTIME_CONFIG.get(key, default)


def update_runtime_config_value(key: str, value: Any) -> None:
    _RUNTIME_CONFIG[key] = value


def get_all_runtime_config() -> dict[str, Any]:
    return dict(_RUNTIME_CONFIG)