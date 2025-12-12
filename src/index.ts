import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { config, buildCommentPrompt, buildInlineEditPrompt } from './config.js';
import {
  listPages,
  readPage,
  writePage,
  pageExists,
  generatePage,
  generatePageStreaming,
  renderMarkdown,
  unslugify,
  slugify,
  readPageData,
  writePageData,
  addPageComment,
  addReplyToPageComment,
  resolvePageComment,
  addInlineComment,
  addReplyToInlineComment,
  resolveInlineComment,
  TextAnchor,
} from './wiki.js';
import { invokeClaude, invokeClaudeStreaming } from './openrouter.js';
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

  const [htmlContent, pages, pageData] = await Promise.all([
    renderMarkdown(content),
    listPages(),
    readPageData(slug),
  ]);
  const title = unslugify(slug);
  return c.html(wikiPage(slug, title, htmlContent, pageData, pages));
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

    // Append to edit history using new PageData structure
    const pageData = await readPageData(slug);
    const timestamp = new Date().toISOString();
    pageData.editHistory.push(
      { role: 'user', content: userMessage, timestamp },
      { role: 'assistant', content: 'Page updated', timestamp }
    );
    await writePageData(slug, pageData);

    return c.redirect(`/wiki/${slug}`);
  } catch (error) {
    console.error('Chat error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.html(errorPage(`Failed to update page: ${message}`), 500);
  }
});

// ============================================
// Page-Level Comment Routes
// ============================================

// Add page-level comment (with AI auto-response)
app.post('/wiki/:slug/comment', async (c) => {
  const slug = c.req.param('slug');

  try {
    const body = await c.req.parseBody();
    const message = body['message'];

    if (!message || typeof message !== 'string') {
      return c.json({ error: 'Please provide a message' }, 400);
    }

    // Get page content for AI context
    const pageContent = await readPage(slug);
    if (!pageContent) {
      return c.json({ error: 'Page not found' }, 404);
    }

    // Generate AI response
    const prompt = buildCommentPrompt(pageContent, null, message.trim());
    const aiResponse = await invokeClaude(prompt);

    // Save comment with AI response
    const thread = await addPageComment(slug, message.trim(), aiResponse);

    return c.json({ success: true, thread });
  } catch (error) {
    console.error('Comment error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// Reply to page-level comment
app.post('/wiki/:slug/comment/:id/reply', async (c) => {
  const slug = c.req.param('slug');
  const threadId = c.req.param('id');

  try {
    const body = await c.req.parseBody();
    const message = body['message'];

    if (!message || typeof message !== 'string') {
      return c.json({ error: 'Please provide a message' }, 400);
    }

    // Add user reply
    let thread = await addReplyToPageComment(slug, threadId, message.trim(), 'user');
    if (!thread) {
      return c.json({ error: 'Thread not found' }, 404);
    }

    // Generate AI response for follow-up
    const pageContent = await readPage(slug);
    if (pageContent) {
      const prompt = buildCommentPrompt(pageContent, null, message.trim());
      const aiResponse = await invokeClaude(prompt);
      thread = await addReplyToPageComment(slug, threadId, aiResponse, 'assistant');
    }

    return c.json({ success: true, thread });
  } catch (error) {
    console.error('Reply error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// Resolve/unresolve page comment
app.post('/wiki/:slug/comment/:id/resolve', async (c) => {
  const slug = c.req.param('slug');
  const threadId = c.req.param('id');

  try {
    const body = await c.req.parseBody();
    const resolved = body['resolved'] !== 'false';

    const success = await resolvePageComment(slug, threadId, resolved);
    if (!success) {
      return c.json({ error: 'Thread not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Resolve error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// ============================================
// Inline Comment Routes
// ============================================

// Add inline comment (with AI auto-response)
app.post('/wiki/:slug/inline', async (c) => {
  const slug = c.req.param('slug');

  try {
    const body = await c.req.parseBody();
    const message = body['message'];
    const text = body['text'];
    const prefix = body['prefix'];
    const suffix = body['suffix'];

    if (!message || typeof message !== 'string') {
      return c.json({ error: 'Please provide a message' }, 400);
    }
    if (!text || typeof text !== 'string') {
      return c.json({ error: 'Please provide selected text' }, 400);
    }

    const anchor: TextAnchor = {
      text: text,
      prefix: typeof prefix === 'string' ? prefix : '',
      suffix: typeof suffix === 'string' ? suffix : '',
    };

    // Get page content for AI context
    const pageContent = await readPage(slug);
    if (!pageContent) {
      return c.json({ error: 'Page not found' }, 404);
    }

    // Generate AI response
    const prompt = buildCommentPrompt(pageContent, text, message.trim());
    const aiResponse = await invokeClaude(prompt);

    // Save inline comment with AI response
    const thread = await addInlineComment(slug, anchor, message.trim(), aiResponse);

    return c.json({ success: true, thread });
  } catch (error) {
    console.error('Inline comment error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// Reply to inline comment
app.post('/wiki/:slug/inline/:id/reply', async (c) => {
  const slug = c.req.param('slug');
  const threadId = c.req.param('id');

  try {
    const body = await c.req.parseBody();
    const message = body['message'];

    if (!message || typeof message !== 'string') {
      return c.json({ error: 'Please provide a message' }, 400);
    }

    // Add user reply
    let thread = await addReplyToInlineComment(slug, threadId, message.trim(), 'user');
    if (!thread) {
      return c.json({ error: 'Thread not found' }, 404);
    }

    // Generate AI response for follow-up
    const pageContent = await readPage(slug);
    if (pageContent) {
      const selectedText = thread.anchor.text;
      const prompt = buildCommentPrompt(pageContent, selectedText, message.trim());
      const aiResponse = await invokeClaude(prompt);
      thread = await addReplyToInlineComment(slug, threadId, aiResponse, 'assistant');
    }

    return c.json({ success: true, thread });
  } catch (error) {
    console.error('Inline reply error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// Resolve/unresolve inline comment
app.post('/wiki/:slug/inline/:id/resolve', async (c) => {
  const slug = c.req.param('slug');
  const threadId = c.req.param('id');

  try {
    const body = await c.req.parseBody();
    const resolved = body['resolved'] !== 'false';

    const success = await resolveInlineComment(slug, threadId, resolved);
    if (!success) {
      return c.json({ error: 'Thread not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Resolve error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// ============================================
// Inline Edit Route (SSE streaming)
// ============================================

app.post('/wiki/:slug/inline-edit', async (c) => {
  const slug = c.req.param('slug');

  const body = await c.req.parseBody();
  const instruction = body['instruction'];
  const text = body['text'];

  if (!instruction || typeof instruction !== 'string') {
    return c.json({ error: 'Please provide an instruction' }, 400);
  }
  if (!text || typeof text !== 'string') {
    return c.json({ error: 'Please provide selected text' }, 400);
  }

  const pageContent = await readPage(slug);
  if (!pageContent) {
    return c.json({ error: 'Page not found' }, 404);
  }

  return streamSSE(c, async (stream) => {
    try {
      const prompt = buildInlineEditPrompt(pageContent, text, instruction.trim());

      let newText = '';
      for await (const chunk of invokeClaudeStreaming(prompt)) {
        newText += chunk;
        await stream.writeSSE({
          event: 'chunk',
          data: JSON.stringify({ content: chunk }),
        });
      }

      // Replace the selected text in the page content
      const updatedContent = pageContent.replace(text, newText);
      await writePage(slug, updatedContent);

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ newText, success: true }),
      });
    } catch (error) {
      console.error('Inline edit error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message }),
      });
    }
  });
});

// Start server
console.log(`Starting WikAI on http://localhost:${config.port}`);
serve({
  fetch: app.fetch,
  port: config.port,
});
