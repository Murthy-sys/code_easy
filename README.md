# CodeEasy Chat

A ChatGPT-style web UI for a model running on your own machine. Nothing is sent anywhere
except your local runtime.

- Streaming replies, token by token, with a stop button
- Multiple conversations, auto-titled, persisted in `localStorage`
- Markdown + syntax-highlighted code blocks with copy buttons
- Model picker, system prompt, temperature, dark/light theme
- Works with any **OpenAI-compatible** server (`mlx_lm.server`, LM Studio, `llama.cpp`,
  vLLM) or with **Ollama**'s native `/api/chat` — switch dialect in Settings
- **Coworkspace**: attach a project folder and the model can read, search, edit and run
  commands in it — every write and command waits for your approval

## Coworkspace

Attach a folder in the **Files** panel (`~/Desktop/my-project`). The model then gets seven
tools: `list_files`, `read_file`, `search`, `edit_file`, `write_file`, `delete_file`,
`run_command`.

Reads happen freely. Anything that changes the project pauses the agent and shows you a
card — a line diff for edits, the command line for `run_command` — with **Approve** /
**Reject**. Nothing touches disk until you click, and rejecting sends the refusal back to
the model so it can adjust rather than retry blindly.

The tree in the Files panel is clickable, and refreshes after each turn.

### Safety boundaries

The sidecar ([server/index.js](server/index.js)) binds to `127.0.0.1` only and resolves
every path against the attached root, rejecting anything that escapes it. `run_command`
is a real shell with your user's permissions, capped at a 120s timeout — that's the reason
it is approval-gated. Only attach folders you'd be comfortable running a script in.

## Run it

Start your model server first:

```bash
mlx_lm.server --model mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit-DWQ
```

`mlx_lm.server` listens on `127.0.0.1:8080` and serves every model in
`~/.cache/huggingface/hub`, so the Settings dropdown lets you switch between them
without restarting it.

Then:

```bash
npm install
npm run dev
```

Open the printed URL, click the model pill in the top bar, hit **Refresh** to load
the model list, pick one, and save.

### Pointing at a different runtime

The dev server proxies `/llm` → `http://127.0.0.1:8080` so the browser never makes a
cross-origin request. Override the target:

```bash
VITE_LLM_TARGET=http://localhost:11434 npm run dev   # Ollama
VITE_LLM_TARGET=http://localhost:1234  npm run dev   # LM Studio
```

...and set the matching dialect in Settings (Ollama needs the *Ollama* dialect; the rest
use *OpenAI-compatible*).

For a production build (`npm run build`), the proxy doesn't exist — set the Base URL in
Settings to the server's real address (e.g. `http://127.0.0.1:8080`) and make sure that
server allows the page's origin.

## Layout

| Path | Purpose |
| --- | --- |
| [src/lib/llm.js](src/lib/llm.js) | Streaming client for both API dialects, incl. tool calls |
| [src/lib/agent.js](src/lib/agent.js) | The agentic turn: stream → run tools → feed back → repeat |
| [src/lib/tools.js](src/lib/tools.js) | Tool schemas, system prompt, and the executor |
| [src/lib/workspace.js](src/lib/workspace.js) | Client for the sidecar |
| [server/index.js](server/index.js) | Sidecar: scoped filesystem access + command execution |
| [src/lib/store.js](src/lib/store.js) | Chat + settings persistence |
| [src/App.jsx](src/App.jsx) | Chat state, approval gate, workspace wiring |
| [src/components/](src/components/) | Sidebar, Composer, Settings, Markdown, Workspace, ToolCard, DiffView |

`npm run dev` starts both processes (Vite on 5173, sidecar on 8787). Run them separately
with `npm run dev:ui` and `npm run server`.

Shortcuts: `⌘K` new chat · `Enter` send · `Shift+Enter` newline
