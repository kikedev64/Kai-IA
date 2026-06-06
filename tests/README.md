# Backend Tests - Kai IA

Python test suite for the Kai IA FastAPI backend. It covers the database layer,
business services, and HTTP endpoints.

## Structure

```text
tests/
|-- conftest.py
|-- unit/
|   |-- test_database.py
|   |-- test_chat_store.py
|   |-- test_config_service.py
|   `-- test_tool_approval.py
`-- integration/
    |-- test_health.py
    |-- test_config_api.py
    `-- test_tool_approval_api.py
```

The unit layer covers SQLite schema creation, chat storage, configuration CRUD,
and the in-process tool approval flow. The integration layer covers `/health`,
`/config`, and `/assistant/tool/approve/:id`.

## Requirements

Install the test dependencies inside the project virtual environment:

```powershell
.\.venv\Scripts\activate
pip install -r requirements-test.txt
```

## Running The Tests

Run all tests:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/ -v
```

Run only unit tests:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/unit/ -v
```

Run only integration tests:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/integration/ -v
```

Stop after the first failure:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/ -x
```

Run with a coverage summary when `pytest-cov` is installed:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/ --cov=. --cov-report=term-missing
```

## Database Isolation

Each test receives a temporary, independent SQLite database through the
`isolated_db` fixture in `conftest.py`. The fixture patches
`core.database.DB_PATH`, calls `init_db()` to build the schema, and removes the
temporary database when the test ends.

This guarantees that tests:

- Do not touch the production `data/kai.db` file.
- Remain independent from each other.
- Include the project's default seed data.

## External Services

The tests do not require LM Studio, Google APIs, or any external service.
Network dependencies are avoided through mocking or by keeping the tested paths
away from chat streaming and OAuth flows.

## Coverage

| Module | Type | Tests |
|---|---|---|
| `core.database` | Unit | 8 |
| `services.chat_store` | Unit | 28 |
| `services.config.config_service` | Unit | 8 |
| `api.routers.tool_approval` logic | Unit | 9 |
| `GET /health` | Integration | 5 |
| `GET /config`, `POST /config` | Integration | 9 |
| `POST /assistant/tool/approve/:id` | Integration | 7 |
| **Total** | | **74** |
