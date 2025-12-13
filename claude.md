# Delve Architecture

## Overview

Delve is a TypeScript/Hono web app that generates wiki pages using OpenRouter's streaming API. Pages are stored as markdown files and rendered with wiki-style `[[links]]`.

## Project Structure

```
src/
├── index.ts       # Hono routes & server
├── config.ts      # Config and prompt templates
├── env.ts         # .env parser (no dotenv dependency)
├── openrouter.ts  # OpenRouter API client (streaming + non-streaming)
├── wiki.ts        # Page CRUD, comments, versioning, projects, [[WikiLink]] processing
└── views/
    ├── layout.ts  # Base HTML template with sidebar and project selector
    ├── home.ts    # Home page with topic form
    └── page.ts    # Wiki page view with comments, edit, version history
public/
└── style.css      # All styles
data/
└── {project}/     # Project directories (default: "main")
    ├── {slug}.md  # Page content
    └── {slug}.json # Page metadata
```

## Development

The dev server runs with hot-reload. Check `.env` for the PORT (default: 3171).

**DO NOT restart the server after making changes.** The `pnpm dev` command uses:
- `tsx watch` for server-side TypeScript (auto-restarts on changes to `src/`)
- Client watcher that rebuilds `bundle.js` on changes to `src/client/`

Just edit files and refresh the browser. Server restarts are only needed if:
- The server crashed
- You changed environment variables in `.env`
- You installed new dependencies

**If the server isn't running**, start it with: `pnpm dev`

## Key Features

- **Projects**: Organize pages into separate namespaces (subdirectories under data/)
- **Page generation**: Streaming AI-generated wiki pages with `[[WikiLinks]]`
- **Page editing**: Chat-based editing via AI
- **Comments**: Page-level and inline (text-anchored) comment threads with AI responses
- **Version history**: Full version history with revert/restore capability

## URL Structure

- `/` - Redirects to `/main`
- `/{project}` - Project home page
- `/{project}/{slug}` - Wiki page view
- `/{project}/generate` - Generate new page (POST)
- `/_settings` - Settings page
- `/_api/projects` - List/create projects

Routes starting with `/_` are reserved for system routes. Project names cannot start with underscore.

## Data Model

Each project is a subdirectory under `data/`. Each page within a project has:
- `{slug}.md` - Markdown content
- `{slug}.json` - PageData (editHistory, pageComments, inlineComments, versions)

## Dependencies

- `hono` + `@hono/node-server` - Web framework
- `marked` - Markdown to HTML
- `streaming-markdown` (CDN) - Progressive rendering during generation

## Data Storage

Page data is stored in `.delve/data/{project}/` (not `data/`). Settings are in `.delve/settings.json`.

## Recording Demo Video

To record a new demo video for the README:

1. Ensure dev server is running: `pnpm dev`
2. Ensure ffmpeg is installed: `brew install ffmpeg`
3. Run the recording script: `npx tsx scripts/record-demo.ts`
4. Convert to MP4: `ffmpeg -i videos/demo.webm -c:v libx264 -crf 20 -preset slow -y demo.mp4`

The script uses Playwright to automate a browser session showing:
- Page generation with streaming
- Wiki link navigation
- Page-level editing
- Inline comments

See `scripts/README.md` for full documentation. The script deletes all pages in the target project before recording, so use a dedicated project (default: `data-structures`).
