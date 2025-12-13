import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { config, buildCommentPrompt, buildInlineEditPrompt } from './config.js';
import {
  listPages,
  listProjects,
  projectExists,
  createProject,
  migrateToProjects,
  DEFAULT_PROJECT,
  readPage,
  writePage,
  deletePage,
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
  addVersion,
  revertToVersion,
  getVersionHistory,
  getAllVersionHistory,
  getVersion,
  getCurrentVersion,
  PageVersion,
  readSettings,
  writeSettings,
  getEffectiveModel,
} from './wiki.js';
import { invokeModel, invokeModelStreaming, type RequestContext } from './openrouter.js';
import { getCostSummary } from './costs.js';
import { homePage } from './views/home.js';
import { wikiPage, errorPage, generatePageView } from './views/page.js';
import { settingsPage } from './views/settings.js';

const app = new Hono();

// Run migration on startup
migrateToProjects().catch(console.error);

// Serve static files
app.use('/style.css', serveStatic({ root: './public' }));
app.use('/js/*', serveStatic({ root: './public' }));

// ============================================
// System Routes (/_*)
// ============================================

// Settings page
app.get('/_settings', async (c) => {
  const [settings, pages, projects] = await Promise.all([
    readSettings(),
    listPages(DEFAULT_PROJECT),
    listProjects(),
  ]);
  return c.html(settingsPage(settings, pages, DEFAULT_PROJECT, projects));
});

// Save settings
app.post('/_settings', async (c) => {
  try {
    const body = await c.req.parseBody();
    const systemPrompt = typeof body['systemPrompt'] === 'string' ? body['systemPrompt'] : '';
    const model = typeof body['model'] === 'string' ? body['model'] : '';
    // Checkbox is present in body only if checked
    const searchEnabled = body['searchEnabled'] === 'on';

    await writeSettings({ systemPrompt, model, searchEnabled });
    return c.json({ success: true });
  } catch (error) {
    console.error('Settings error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// ============================================
// API Routes (/_api/*)
// ============================================

// List all projects
app.get('/_api/projects', async (c) => {
  const projects = await listProjects();
  return c.json({ projects });
});

// Get cost summary
app.get('/_api/costs', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10');
  const summary = getCostSummary(limit);
  return c.json(summary);
});

// Create a new project
app.post('/_api/projects', async (c) => {
  const body = await c.req.parseBody();
  const name = body['name'];

  if (!name || typeof name !== 'string') {
    return c.json({ error: 'Please provide a project name' }, 400);
  }

  // Validate project name doesn't start with underscore
  const trimmedName = name.trim();
  if (trimmedName.startsWith('_')) {
    return c.json({ error: 'Project names cannot start with underscore' }, 400);
  }

  const result = await createProject(trimmedName);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  const sanitizedName = slugify(trimmedName);
  return c.json({ success: true, project: sanitizedName });
});

// ============================================
// Root Route
// ============================================

// Home page - redirect to default project
app.get('/', async (c) => {
  return c.redirect(`/${DEFAULT_PROJECT}`);
});

// ============================================
// Project-Scoped Routes
// ============================================

// Project home page
app.get('/:project', async (c) => {
  const project = c.req.param('project');

  // Skip if this looks like a system route (shouldn't happen, but safety check)
  if (project.startsWith('_')) {
    return c.notFound();
  }

  // Validate project exists (or it's the default project)
  if (project !== DEFAULT_PROJECT && !(await projectExists(project))) {
    return c.html(errorPage('Project not found'), 404);
  }

  const [pages, projects] = await Promise.all([
    listPages(project),
    listProjects(),
  ]);
  return c.html(homePage(pages, project, projects));
});

// Generate page from topic (streaming SSE) - project scoped
app.post('/:project/generate', async (c) => {
  const project = c.req.param('project');
  const body = await c.req.parseBody();
  const topic = body['topic'];

  if (!topic || typeof topic !== 'string') {
    return c.json({ error: 'Please provide a topic' }, 400);
  }

  const topicStr = topic.trim();
  const slug = slugify(topicStr);

  // If page already exists, redirect immediately without regenerating
  if (await pageExists(slug, project)) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ slug, url: `/${project}/${slug}` }),
      });
    });
  }

  // Get user settings
  const settings = await readSettings();
  const systemPrompt = settings.systemPrompt || undefined;
  const model = getEffectiveModel(settings);

  return streamSSE(c, async (stream) => {
    try {
      // Send start event
      await stream.writeSSE({
        event: 'start',
        data: JSON.stringify({ topic: topicStr, slug }),
      });

      // Stream content chunks
      const generator = generatePageStreaming(topicStr, undefined, project, systemPrompt, model);
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
        data: JSON.stringify({ slug, url: `/${project}/${slug}` }),
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
app.get('/:project/generate-page/:topic', async (c) => {
  const project = c.req.param('project');
  const topic = decodeURIComponent(c.req.param('topic'));
  return c.html(generatePageView(topic, project));
});

// View wiki page
app.get('/:project/:slug', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');

  // Skip if this looks like a system route
  if (project.startsWith('_')) {
    return c.notFound();
  }

  const exists = await pageExists(slug, project);

  if (!exists) {
    // Redirect to streaming generation page
    const topic = unslugify(slug);
    return c.redirect(`/${project}/generate-page/${encodeURIComponent(topic)}`);
  }

  const content = await readPage(slug, project);
  if (!content) {
    return c.html(errorPage('Page not found'), 404);
  }

  const [htmlContent, pages, projects, pageData] = await Promise.all([
    renderMarkdown(content, project),
    listPages(project),
    listProjects(),
    readPageData(slug, project),
  ]);
  // Use saved title if available, otherwise fall back to unslugify
  const title = pageData.title || unslugify(slug);
  return c.html(wikiPage(slug, title, htmlContent, pageData, pages, project, projects));
});

// Chat/edit page
app.post('/:project/:slug/chat', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');

  try {
    const body = await c.req.parseBody();
    const message = body['message'];

    if (!message || typeof message !== 'string') {
      return c.html(errorPage('Please provide a message'), 400);
    }

    // Use saved title if available for better context in prompts
    const pageData = await readPageData(slug, project);
    const topic = pageData.title || unslugify(slug);
    const userMessage = message.trim();
    const settings = await readSettings();
    const systemPrompt = settings.systemPrompt || undefined;
    const model = getEffectiveModel(settings);
    const { content } = await generatePage(topic, userMessage, project, systemPrompt, model);

    // Add version for the edit
    await addVersion(slug, content, userMessage, 'edit', project);
    const timestamp = new Date().toISOString();
    pageData.editHistory.push(
      { role: 'user', content: userMessage, timestamp },
      { role: 'assistant', content: 'Page updated', timestamp }
    );
    await writePageData(slug, pageData, project);

    return c.redirect(`/${project}/${slug}`);
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
app.post('/:project/:slug/comment', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');

  try {
    const body = await c.req.parseBody();
    const message = body['message'];

    if (!message || typeof message !== 'string') {
      return c.json({ error: 'Please provide a message' }, 400);
    }

    // Get page content for AI context
    const pageContent = await readPage(slug, project);
    if (!pageContent) {
      return c.json({ error: 'Page not found' }, 404);
    }

    // Generate AI response
    const settings = await readSettings();
    const systemPrompt = settings.systemPrompt || undefined;
    const model = getEffectiveModel(settings);
    const prompt = buildCommentPrompt(pageContent, null, message.trim());
    const context: RequestContext = {
      action: 'comment',
      pageName: unslugify(slug),
      promptExcerpt: message.trim().slice(0, 50),
    };
    const aiResponse = await invokeModel(prompt, systemPrompt, model, context);

    // Save comment with AI response
    const thread = await addPageComment(slug, message.trim(), aiResponse, project);

    return c.json({ success: true, thread });
  } catch (error) {
    console.error('Comment error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// Reply to page-level comment
app.post('/:project/:slug/comment/:id/reply', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');
  const threadId = c.req.param('id');

  try {
    const body = await c.req.parseBody();
    const message = body['message'];

    if (!message || typeof message !== 'string') {
      return c.json({ error: 'Please provide a message' }, 400);
    }

    // Add user reply
    let thread = await addReplyToPageComment(slug, threadId, message.trim(), 'user', project);
    if (!thread) {
      return c.json({ error: 'Thread not found' }, 404);
    }

    // Generate AI response for follow-up
    const pageContent = await readPage(slug, project);
    if (pageContent) {
      // Pass conversation history (excluding the message we just added, which is the current question)
      const conversationHistory = thread.messages.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
      const settings = await readSettings();
      const systemPrompt = settings.systemPrompt || undefined;
      const model = getEffectiveModel(settings);
      const prompt = buildCommentPrompt(pageContent, null, message.trim(), conversationHistory);
      const context: RequestContext = {
        action: 'reply',
        pageName: unslugify(slug),
        promptExcerpt: message.trim().slice(0, 50),
      };
      const aiResponse = await invokeModel(prompt, systemPrompt, model, context);
      thread = await addReplyToPageComment(slug, threadId, aiResponse, 'assistant', project);
    }

    return c.json({ success: true, thread });
  } catch (error) {
    console.error('Reply error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// Resolve/unresolve page comment
app.post('/:project/:slug/comment/:id/resolve', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');
  const threadId = c.req.param('id');

  try {
    const body = await c.req.parseBody();
    const resolved = body['resolved'] !== 'false';

    const success = await resolvePageComment(slug, threadId, resolved, project);
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
app.post('/:project/:slug/inline', async (c) => {
  const project = c.req.param('project');
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
    const pageContent = await readPage(slug, project);
    if (!pageContent) {
      return c.json({ error: 'Page not found' }, 404);
    }

    // Generate AI response
    const settings = await readSettings();
    const systemPrompt = settings.systemPrompt || undefined;
    const model = getEffectiveModel(settings);
    const prompt = buildCommentPrompt(pageContent, text, message.trim());
    const context: RequestContext = {
      action: 'inline-comment',
      pageName: unslugify(slug),
      promptExcerpt: message.trim().slice(0, 50),
    };
    const aiResponse = await invokeModel(prompt, systemPrompt, model, context);

    // Save inline comment with AI response
    const thread = await addInlineComment(slug, anchor, message.trim(), aiResponse, project);

    return c.json({ success: true, thread });
  } catch (error) {
    console.error('Inline comment error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// Reply to inline comment
app.post('/:project/:slug/inline/:id/reply', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');
  const threadId = c.req.param('id');

  try {
    const body = await c.req.parseBody();
    const message = body['message'];

    if (!message || typeof message !== 'string') {
      return c.json({ error: 'Please provide a message' }, 400);
    }

    // Add user reply
    let thread = await addReplyToInlineComment(slug, threadId, message.trim(), 'user', project);
    if (!thread) {
      return c.json({ error: 'Thread not found' }, 404);
    }

    // Generate AI response for follow-up
    const pageContent = await readPage(slug, project);
    if (pageContent) {
      const selectedText = thread.anchor.text;
      // Pass conversation history (excluding the message we just added, which is the current question)
      const conversationHistory = thread.messages.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
      const settings = await readSettings();
      const systemPrompt = settings.systemPrompt || undefined;
      const model = getEffectiveModel(settings);
      const prompt = buildCommentPrompt(pageContent, selectedText, message.trim(), conversationHistory);
      const context: RequestContext = {
        action: 'inline-reply',
        pageName: unslugify(slug),
        promptExcerpt: message.trim().slice(0, 50),
      };
      const aiResponse = await invokeModel(prompt, systemPrompt, model, context);
      thread = await addReplyToInlineComment(slug, threadId, aiResponse, 'assistant', project);
    }

    return c.json({ success: true, thread });
  } catch (error) {
    console.error('Inline reply error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
});

// Resolve/unresolve inline comment
app.post('/:project/:slug/inline/:id/resolve', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');
  const threadId = c.req.param('id');

  try {
    const body = await c.req.parseBody();
    const resolved = body['resolved'] !== 'false';

    const success = await resolveInlineComment(slug, threadId, resolved, project);
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

app.post('/:project/:slug/inline-edit', async (c) => {
  const project = c.req.param('project');
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

  const pageContent = await readPage(slug, project);
  if (!pageContent) {
    return c.json({ error: 'Page not found' }, 404);
  }

  const settings = await readSettings();
  const systemPrompt = settings.systemPrompt || undefined;
  const model = getEffectiveModel(settings);

  return streamSSE(c, async (stream) => {
    try {
      const prompt = buildInlineEditPrompt(pageContent, text, instruction.trim());
      const context: RequestContext = {
        action: 'inline-edit',
        pageName: unslugify(slug),
        promptExcerpt: instruction.trim().slice(0, 50),
      };

      let updatedContent = '';
      for await (const chunk of invokeModelStreaming(prompt, systemPrompt, model, context)) {
        updatedContent += chunk;
        await stream.writeSSE({
          event: 'chunk',
          data: JSON.stringify({ content: chunk }),
        });
      }

      // The LLM returns the full updated page content
      await writePage(slug, updatedContent, project);

      // Add version for the edit
      await addVersion(slug, updatedContent, instruction.trim(), 'edit', project);

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ success: true }),
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

// ============================================
// Version History Routes
// ============================================

// Get version history for a page
// ?all=true returns all versions including superseded ones
app.get('/:project/:slug/history', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');
  const showAll = c.req.query('all') === 'true';
  const exists = await pageExists(slug, project);

  if (!exists) {
    return c.json({ error: 'Page not found' }, 404);
  }

  const versions = showAll
    ? await getAllVersionHistory(slug, project)
    : await getVersionHistory(slug, project);
  const currentVersion = await getCurrentVersion(slug, project);
  return c.json({ versions, currentVersion });
});

// Get a specific version for preview
app.get('/:project/:slug/version/:version', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');
  const versionNum = parseInt(c.req.param('version'));

  if (isNaN(versionNum) || versionNum < 1) {
    return c.json({ error: 'Invalid version number' }, 400);
  }

  const version = await getVersion(slug, versionNum, project);
  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  // Render to HTML for preview
  const html = await renderMarkdown(version.content, project);
  return c.json({ version, html });
});

// Revert to a specific version
app.post('/:project/:slug/revert', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');
  const body = await c.req.parseBody();
  const targetVersion = parseInt(body['version'] as string);

  if (isNaN(targetVersion) || targetVersion < 1) {
    return c.json({ error: 'Invalid version number' }, 400);
  }

  const result = await revertToVersion(slug, targetVersion, project);
  if (!result) {
    return c.json({ error: 'Version not found' }, 404);
  }

  return c.json({ success: true, currentVersion: targetVersion });
});

// Delete a page
app.post('/:project/:slug/delete', async (c) => {
  const project = c.req.param('project');
  const slug = c.req.param('slug');

  const exists = await pageExists(slug, project);
  if (!exists) {
    return c.json({ error: 'Page not found' }, 404);
  }

  const success = await deletePage(slug, project);
  if (!success) {
    return c.json({ error: 'Failed to delete page' }, 500);
  }

  return c.json({ success: true });
});

// Start server
console.log(`Starting WikAI on http://localhost:${config.port}`);
serve({
  fetch: app.fetch,
  port: config.port,
});
