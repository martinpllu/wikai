import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { config } from './config.js';
import {
  listPages,
  readPage,
  pageExists,
  generatePage,
  generatePageStreaming,
  renderMarkdown,
  unslugify,
  slugify,
  readChatHistory,
  appendChatHistory,
} from './wiki.js';
import { homePage } from './views/home.js';
import { wikiPage, errorPage, generatePageView } from './views/page.js';

const app = new Hono();

// Serve static files
app.use('/style.css', serveStatic({ root: './public' }));

// Home page
app.get('/', async (c) => {
  const pages = await listPages();
  return c.html(homePage(pages));
});

// Generate page from topic (streaming SSE)
app.post('/generate', async (c) => {
  const body = await c.req.parseBody();
  const topic = body['topic'];

  if (!topic || typeof topic !== 'string') {
    return c.json({ error: 'Please provide a topic' }, 400);
  }

  const topicStr = topic.trim();
  const slug = slugify(topicStr);

  return streamSSE(c, async (stream) => {
    try {
      // Send start event
      await stream.writeSSE({
        event: 'start',
        data: JSON.stringify({ topic: topicStr, slug }),
      });

      // Stream content chunks
      const generator = generatePageStreaming(topicStr);
      let result = await generator.next();

      while (!result.done) {
        await stream.writeSSE({
          event: 'chunk',
          data: JSON.stringify({ content: result.value }),
        });
        result = await generator.next();
      }

      // Send complete event
      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ slug, url: `/wiki/${slug}` }),
      });
    } catch (error) {
      console.error('Generation error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message }),
      });
    }
  });
});

// Streaming generation page (for wiki links to non-existent pages)
app.get('/generate-page/:topic', async (c) => {
  const topic = decodeURIComponent(c.req.param('topic'));
  return c.html(generatePageView(topic));
});

// View wiki page
app.get('/wiki/:slug', async (c) => {
  const slug = c.req.param('slug');
  const exists = await pageExists(slug);

  if (!exists) {
    // Redirect to streaming generation page
    const topic = unslugify(slug);
    return c.redirect(`/generate-page/${encodeURIComponent(topic)}`);
  }

  const content = await readPage(slug);
  if (!content) {
    return c.html(errorPage('Page not found'), 404);
  }

  const htmlContent = await renderMarkdown(content);
  const title = unslugify(slug);
  const chatHistory = await readChatHistory(slug);
  return c.html(wikiPage(slug, title, htmlContent, chatHistory));
});

// Chat/edit page
app.post('/wiki/:slug/chat', async (c) => {
  const slug = c.req.param('slug');

  try {
    const body = await c.req.parseBody();
    const message = body['message'];

    if (!message || typeof message !== 'string') {
      return c.html(errorPage('Please provide a message'), 400);
    }

    const topic = unslugify(slug);
    const userMessage = message.trim();
    await generatePage(topic, userMessage);
    await appendChatHistory(slug, userMessage, 'Page updated');
    return c.redirect(`/wiki/${slug}`);
  } catch (error) {
    console.error('Chat error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.html(errorPage(`Failed to update page: ${message}`), 500);
  }
});

// Start server
console.log(`Starting WikAI on http://localhost:${config.port}`);
serve({
  fetch: app.fetch,
  port: config.port,
});
