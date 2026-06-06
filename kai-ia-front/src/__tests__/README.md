# Frontend Tests - Kai IA

TypeScript test suite for the Kai IA Electron and React frontend. It covers the
renderer services with Vitest and jsdom.

## Structure

```text
src/__tests__/
|-- setup.ts
`-- services/
    |-- assistant.service.test.ts
    |-- settings.service.test.ts
    `-- debug_lab.service.test.ts
```

The setup file registers Electron preload mocks. The service suites cover the
assistant service, local and backend settings, and Debug Lab event publishing.

## Requirements

```powershell
cd kai-ia-front
npm install
```

## Running The Tests

Run the suite once for CI:

```powershell
npm test
```

Run in watch mode for development:

```powershell
npm run test:watch
```

Run with coverage:

```powershell
npm run test:coverage
```

## Mocking Strategy

Renderer services depend on two APIs exposed by Electron's main process through
the preload bridge:

| Global | Purpose |
|---|---|
| `window.configApi` | Access to local Electron-persisted configuration. |
| `window.electronAPI` | IPC bridge for system operations. |

Both globals are mocked in `setup.ts` with `vi.stubGlobal` before the suites run.
The default values mirror the development setup, including
`http://localhost:8000` and the standard polling intervals.

Each test mocks `fetch` with `vi.stubGlobal('fetch', vi.fn())` so HTTP responses
can be controlled without a real server.

## Coverage

| Service | Tests |
|---|---|
| `assistant.services.ts` | 23 |
| `settings.service.ts` | 14 |
| `debug_lab.service.ts` | 12 |
| **Total** | **49** |

## Adding New Tests

1. Create the file under `src/__tests__/services/` or `src/__tests__/utils/`.
2. Import renderer code with the `@renderer/...` alias configured in `vitest.config.ts`.
3. Mock `fetch` and `window.configApi` as needed.
4. Run `npm run test:watch` during iterative development.
