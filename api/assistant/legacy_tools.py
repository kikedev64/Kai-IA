import json


class LegacyToolFunction:
    """Small adapter that mimics the function object of a native tool call."""

    def __init__(self, name: str, arguments: dict) -> None:
        """Initialize the legacy function adapter.

        Args:
            name: Name of the tool to execute.
            arguments: Arguments to pass to the tool.
        """
        self.name = name
        self.arguments = json.dumps(arguments, ensure_ascii=False)


class LegacyToolCall:
    """Small adapter that mimics a native tool call object."""

    def __init__(self, name: str, arguments: dict) -> None:
        """Initialize the legacy tool-call adapter.

        Args:
            name: Name of the tool to execute.
            arguments: Arguments to pass to the tool.
        """
        self.id = "legacy"
        self.function = LegacyToolFunction(name, arguments)