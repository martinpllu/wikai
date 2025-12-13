# Scripts

## record-demo.ts

Records a demo video of Delve for the README/marketing.

### Prerequisites

1. Dev server running on port 3171: `pnpm dev`
2. ffmpeg installed: `brew install ffmpeg`
3. A valid API key configured in Settings (the script makes real API calls)

### Usage

```bash
npx tsx scripts/record-demo.ts
```

This will:
1. Delete all pages in the `data-structures` project (clean slate)
2. Open a browser and record the demo flow
3. Save the video to `videos/demo.webm`

Then convert to MP4:

```bash
ffmpeg -i videos/demo.webm -c:v libx264 -crf 20 -preset slow -y demo.mp4
```

### What the demo shows

1. **Generate a page**: Types "Bloom filters", clicks Create, shows streaming generation
2. **Wiki link navigation**: Clicks a link containing "hash", shows second page streaming
3. **Page-level edit**: Returns to Bloom filters page, requests "Add a Python code example", scrolls to show the result
4. **Inline question**: Selects the word "probabilistic", asks "What does this mean?", shows AI response

### Configuration

Edit the constants at the top of the script to change:

- `PROJECT` - Which project to use (default: `data-structures`)
- `TOPIC` - What topic to generate (default: `Bloom filters`)

### Notes

- The script injects a fake cursor for visibility in the recording
- Video is recorded at 1280x720
- The script waits for real API responses, so duration varies (~60-90 seconds typically)
- All pages in the target project are deleted before recording starts
