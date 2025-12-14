# Delve

**A private, local-first wiki for AI-assisted learning**

Describe what you want to learn about. Watch the page stream in real-time. Ask questions and request edits. Click a link to generate the next page. Everything is stored as local markdown files.

https://github.com/user-attachments/assets/7e2a4393-3c35-41e9-9a9c-b61f1a372f50

## Quick Start

You'll need an API key from [OpenRouter](https://openrouter.ai), [Anthropic](https://console.anthropic.com), or [OpenAI](https://platform.openai.com).

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

## Why Delve?

### "Why not just use ChatGPT / Claude?"

Chat interfaces are ephemeral. You ask, you get an answer, it scrolls away. Delve turns AI responses into **persistent, editable, interconnected pages** you can build on over time.

- Pages are markdown files stored locally on your machine
- `[[WikiLinks]]` connect concepts and auto-generate new pages on click
- Full version history with branching: revert to v3, keep editing, v4-6 still recoverable
- Organize into projects for separate knowledge bases

### "Why not Obsidian + Claude Code?"

You could. Delve is for people who want that workflow without the glue work:

- **Streaming generation**: content appears word-by-word as it's written, not after a loading spinner
- **Inline comments anchored to text**: select a passage, ask a question, get a response attached to that exact location (survives edits)
- **Chat-based editing**: describe what you want changed in natural language, or select text for targeted inline edits
- **Auto-generating wiki links**: red links become new pages on click, enabling serendipitous exploration

### "Why not Notion AI / ChatGPT Canvas?"

Delve is self-hosted, local-first, and provider-agnostic:

- Your pages are plain markdown files on disk
- Works with OpenRouter, OpenAI, or Anthropic APIs directly
- No vendor lock-in, no subscription beyond API costs
- Customize the system prompt per workspace

## Features

- **Streaming page generation** with real-time markdown rendering
- **Inline comments**: select text to ask questions or request changes, anchored to the passage
- **Chat-based editing**: refine pages through natural language instructions
- **Version history**: full history with preview, revert, and branching
- **Wiki links**: `[[Link]]` syntax with auto-generation of missing pages
- **Projects**: organize pages into separate namespaces
- **Multi-provider**: OpenRouter, OpenAI, or Anthropic (configure in Settings)
- **Web search**: optional real-time information for supported providers

## Configuration

Configure your API provider, model, and other settings through the web UI at `http://localhost:3171/_settings`.

Environment variables can be set via a `.env` file in the project root or passed directly:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3171` | Server port |
| `DATA_DIR` | `data` | Directory for page storage |

## Data Storage

Pages are stored as plain files under `.delve/data/{project}/`:
- `{slug}.md` — Page content (markdown)
- `{slug}.json` — Metadata (comments, versions, history)

No database required. Back up by copying the `.delve/` directory.

## Tech Stack

- Vanilla JS frontend
- [Hono](https://hono.dev) - Backend
- [streaming-markdown](https://github.com/thetarnav/streaming-markdown) - Progressive rendering
- [marked](https://marked.js.org) - Markdown to HTML

## Testing

End-to-end tests use [Playwright](https://playwright.dev) and cover the complete workflow: project creation, page generation, commenting, editing, version history, and page deletion.

```bash
# Run tests (starts dev server automatically)
npm test

# Run tests with UI for debugging
npm run test:ui
```

Tests create isolated test projects with random names and clean up after themselves. The test suite requires a valid API key configured in settings to generate AI responses.

## License

MIT
