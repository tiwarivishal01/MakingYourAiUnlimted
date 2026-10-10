# MakingYourAiUnlimted

Browser-backed AI bridge for VS Code and local HTTP clients. The backend routes prompts to a real browser session, and the VS Code extension lets you ask for code, explain selections, and rewrite code in place.

## What it does

- Provides a local API at `http://127.0.0.1:8787`
- Connects to Gemini or Claude through a browser session
- Supports a fake UI for local smoke testing
- Ships a VS Code extension for prompt, explain, fix, refactor, and optimize flows

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- VS Code
- Google Chrome if you want real Gemini browser mode

## Setup

```powershell
cd C:\Users\Dell\Desktop\theFreeAi\MakingYourAiUnlimted
npm install
```

## Run the backend

### Real Gemini mode

Start Chrome with remote debugging, open Gemini, and sign in:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
	--remote-debugging-port=9222 `
	--user-data-dir="C:\temp\chrome-gemini-debug" `
	--new-window="https://gemini.google.com/app"
```

Then start the API:

```powershell
$env:BROWSER_PROVIDER = "gemini"
$env:BROWSER_CDP_URL = "http://127.0.0.1:9222"
npm start
```

Check sessions:

```powershell
curl.exe -sS http://127.0.0.1:8787/v1/sessions
```

### Fake UI mode

```powershell
npm run fake-ui
$env:FAKE_UI_URL = "http://127.0.0.1:3001/fake-ai"
$env:BROWSER_HEADLESS = "true"
npm start
```

## Verify the API

```powershell
curl.exe -sS http://127.0.0.1:8787/v1/health
npm test
npm run build
npm run extension:build
```

## Use the VS Code extension

Open the repository root in VS Code and press F5. That launches the extension host using [.vscode/launch.json](.vscode/launch.json).

The workspace defaults are already set in [.vscode/settings.json](.vscode/settings.json):

- `browserAiBridge.url = http://127.0.0.1:8787`
- `browserAiBridge.model = gemini-ui`

In the new Extension Development Host window, open the Command Palette and run one of these commands:

- Browser AI Bridge: Ask
- Browser AI Bridge: Explain Selection
- Browser AI Bridge: Fix Selection
- Browser AI Bridge: Refactor Selection
- Browser AI Bridge: Optimize Selection

For selection-based commands, highlight code first. The extension sends selection-based requests to `POST /v1/code`, and freeform prompts to `POST /v1/chat/completions`.

## Project commands

```powershell
npm run dev
npm run build
npm run build:all
npm test
```

## Architecture

The flow is:

```text
VS Code or local client -> API -> request engine -> browser session -> provider adapter -> AI UI
																							 <- response parser <- assistant response
```

The implementation is intentionally local-first: one API process, one request queue, and browser-authenticated provider sessions. Credentials stay in the browser, not in the backend.

See [docs/architecture.md](docs/architecture.md) and [docs/provider-adapter.md](docs/provider-adapter.md) for the deeper design.