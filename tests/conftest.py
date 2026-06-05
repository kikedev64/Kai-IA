"""Shared pytest fixtures for the Kai IA test suite."""
from pathlib import Path
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect every DB connection to a fresh temp file for each test.

    Patches core.database.DB_PATH so tests never touch data/kai.db.
    init_db() is called once per test to build the schema and seed data.
    """
    db_file = tmp_path / "test_kai.db"
    monkeypatch.setattr("core.database.DB_PATH", db_file)
    from core.database import init_db
    init_db()
    return db_file


@pytest.fixture
def client(isolated_db: Path) -> TestClient:
    """Return a synchronous ASGI TestClient wired to the full FastAPI app."""
    from main import app
    with TestClient(app, raise_server_exceptions=True) as tc:
        yield tc
