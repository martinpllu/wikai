# Delve

**An AI-powered wiki engine for building knowledge bases through conversation.**

Describe what you want to know. Watch it stream into existence. Refine it through inline comments and natural language edits. Click a link to generate the next page.

![Delve demo](demo.gif)

## Why Delve?

### "Why not just use ChatGPT / Claude?"

Chat interfaces are ephemeral. You ask, you get an answer, it scrolls away. Delve turns AI responses into **persistent, editable, interconnected pages** you can build on over time.

- Pages are markdown files you own
- `[[WikiLinks]]` connect concepts and auto-generate new pages on click
- Full version history with branching — revert to v3, keep editing, v4-6 still recoverable
- Organize into projects for separate knowledge bases

### "Why not Obsidian + Claude Code?"

You could. Delve is for people who want that workflow without the glue work:

- **Streaming generation** — content appears word-by-word as it's written, not after a loading spinner
- **Inline comments anchored to text** — select a passage, ask a question, get a response attached to that exact location (survives edits)
- **Chat-based editing** — describe what you want changed in natural language, or select text for targeted inline edits
- **Auto-generating wiki links** — red links become new pages on click, enabling serendipitous exploration

### "Why not Notion AI / ChatGPT Canvas?"

Delve is self-hosted, local-first, and provider-agnostic:

- Your pages are plain markdown files on disk
- Works with OpenRouter, OpenAI, or Anthropic APIs directly
- No vendor lock-in, no subscription beyond API costs
- Customize the system prompt per workspace

## Features

- **Streaming page generation** with real-time markdown rendering
- **Inline comments** — select text to ask questions or request changes, anchored to the passage
- **Chat-based editing** — refine pages through natural language instructions
- **Version history** — full history with preview, revert, and branching
- **Wiki links** — `[[Link]]` syntax with auto-generation of missing pages
- **Projects** — organize pages into separate namespaces
- **Multi-provider** — OpenRouter, OpenAI, or Anthropic (configure in Settings)
- **Web search** — optional real-time information via OpenRouter or OpenAI

## Setup

1. Clone and install:
   ```bash
   git clone https://github.com/martinpllu/delve.git
   cd delve
   npm install
   ```

2. Start the server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3171 and configure your API key in Settings


## Configuration

All settings are configurable through the web UI at `/_settings`:

| Setting | Description |
|---------|-------------|
| Provider | OpenRouter, OpenAI, or Anthropic |
| API Key | Your key for the selected provider |
| Model | Model name (e.g. `anthropic/claude-sonnet-4`, `gpt-4.1`) |
| Web Search | Enable real-time information (OpenRouter/OpenAI only) |
| System Prompt | Custom instructions for all requests |

### Environment Variables (optional)

For deployment or automated setups:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3171` | Server port |
| `DATA_DIR` | `data` | Directory for page storage |

## Data Storage

Pages are stored as plain files under `data/{project}/`:
- `{slug}.md` — Page content (markdown)
- `{slug}.json` — Metadata (comments, versions, history)

No database required. Back up by copying the `data/` directory.

## Tech Stack

- [Hono](https://hono.dev) — Web framework
- [streaming-markdown](https://github.com/nicoverbruggen/streaming-markdown) — Progressive rendering
- [marked](https://marked.js.org) — Markdown to HTML

## License

MIT
