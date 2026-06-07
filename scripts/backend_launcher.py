"""Executable entrypoint for packaged Kai IA backend builds."""

from __future__ import annotations

import os
import sys

import uvicorn

if getattr(sys, "frozen", False):
    sys.path.insert(0, sys._MEIPASS)  # type: ignore[attr-defined]

from main import app  # noqa: E402


def main() -> None:
    """Launch the packaged backend with uvicorn.

    Returns:
        None
    """
    host = os.getenv("KAI_IA_HOST", "127.0.0.1")
    port = int(os.getenv("KAI_IA_PORT", "8000"))
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
