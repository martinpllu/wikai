# Delve

A personal AI-powered wiki that generates knowledge pages on any topic using Claude via OpenRouter.

## Setup

1. Copy `.env.example` to `.env` and add your OpenRouter API key:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the dev server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

## Usage

- **Projects**: Organize pages into separate projects (click the project dropdown in the sidebar)
- **Generate a page**: Enter a topic and click "Generate Page"
- **Navigate**: Click `[[WikiLinks]]` to generate related pages on-the-fly
- **Comment**: Add page or inline comments (select text) with AI responses
- **Edit pages**: Use the Edit tab to refine content via AI
- **Version history**: View, preview, and revert to previous versions

## Configuration

Set in `.env` or as environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | (required) | Your OpenRouter API key |
| `MODEL` | `anthropic/claude-sonnet-4` | Model to use |
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `data` | Directory for markdown files |

## Tech Stack

- **Hono** - Web framework
- **OpenRouter** - LLM API
- **streaming-markdown** - Progressive markdown rendering
- **marked** - Markdown to HTML
