# WikAI Architecture

## Overview

WikAI is a TypeScript/Hono web app that generates wiki pages using OpenRouter's streaming API. Pages are stored as markdown files and rendered with wiki-style `[[links]]`.

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

Run the dev server with auto-reload:
```
pnpm dev
```

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
