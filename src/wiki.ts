import * as fs from 'fs/promises';
import * as path from 'path';
import { marked } from 'marked';
import { config, buildPrompt } from './config.js';
import { invokeClaude, invokeClaudeStreaming } from './openrouter.js';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function unslugify(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getPagePath(slug: string): string {
  return path.join(config.dataDir, `${slug}.md`);
}

export function getChatHistoryPath(slug: string): string {
  return path.join(config.dataDir, `${slug}.json`);
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export async function readChatHistory(slug: string): Promise<ChatMessage[]> {
  try {
    const data = await fs.readFile(getChatHistoryPath(slug), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function appendChatHistory(
  slug: string,
  userMessage: string,
  assistantSummary?: string
): Promise<void> {
  const history = await readChatHistory(slug);
  const timestamp = new Date().toISOString();

  history.push({
    role: 'user',
    content: userMessage,
    timestamp,
  });

  if (assistantSummary) {
    history.push({
      role: 'assistant',
      content: assistantSummary,
      timestamp,
    });
  }

  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(getChatHistoryPath(slug), JSON.stringify(history, null, 2));
}

export async function pageExists(slug: string): Promise<boolean> {
  try {
    await fs.access(getPagePath(slug));
    return true;
  } catch {
    return false;
  }
}

export async function readPage(slug: string): Promise<string | null> {
  try {
    return await fs.readFile(getPagePath(slug), 'utf-8');
  } catch {
    return null;
  }
}

export async function writePage(slug: string, content: string): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(getPagePath(slug), content, 'utf-8');
}

export interface PageInfo {
  slug: string;
  title: string;
  modifiedAt: number;
}

export async function listPages(): Promise<PageInfo[]> {
  try {
    const files = await fs.readdir(config.dataDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    const pages = await Promise.all(
      mdFiles.map(async (f) => {
        const slug = f.replace('.md', '');
        const filePath = path.join(config.dataDir, f);
        const stats = await fs.stat(filePath);
        return {
          slug,
          title: unslugify(slug),
          modifiedAt: stats.mtimeMs,
        };
      })
    );

    // Sort by most recent first
    return pages.sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch {
    return [];
  }
}

// Convert [[WikiLinks]] to HTML links
// Supports [[Topic]] and [[Topic|Display Text]] syntax
// Links to non-existent pages get a "wiki-link-missing" class (red links)
async function processWikiLinks(html: string): Promise<string> {
  // Find all wiki links and their positions
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  const matches: { match: string; linkContent: string; index: number }[] = [];
  let match;
  while ((match = wikiLinkRegex.exec(html)) !== null) {
    matches.push({ match: match[0], linkContent: match[1], index: match.index });
  }

  if (matches.length === 0) return html;

  // Check which pages exist (in parallel)
  const slugs = matches.map(m => {
    const [target] = m.linkContent.split('|');
    return slugify(target);
  });
  const existsResults = await Promise.all(slugs.map(slug => pageExists(slug)));

  // Build result string by replacing matches
  let result = '';
  let lastIndex = 0;
  for (let i = 0; i < matches.length; i++) {
    const { match, linkContent, index } = matches[i];
    const [target, displayText] = linkContent.split('|');
    const slug = slugs[i];
    const text = displayText ?? target;
    const exists = existsResults[i];
    const className = exists ? 'wiki-link' : 'wiki-link wiki-link-missing';

    result += html.slice(lastIndex, index);
    result += `<a href="/wiki/${slug}" class="${className}">${text}</a>`;
    lastIndex = index + match.length;
  }
  result += html.slice(lastIndex);

  return result;
}

export async function renderMarkdown(content: string): Promise<string> {
  const html = await marked(content);
  return await processWikiLinks(html);
}

export async function generatePage(
  topic: string,
  userMessage?: string
): Promise<{ slug: string; content: string }> {
  const slug = slugify(topic);
  const existingContent = await readPage(slug);

  const prompt = buildPrompt(topic, existingContent ?? undefined, userMessage);
  const markdownContent = await invokeClaude(prompt);

  await writePage(slug, markdownContent);

  return { slug, content: markdownContent };
}

/**
 * Streaming version - yields chunks and saves when complete
 */
export async function* generatePageStreaming(
  topic: string,
  userMessage?: string
): AsyncGenerator<string, { slug: string; content: string }> {
  const slug = slugify(topic);
  const existingContent = await readPage(slug);

  const prompt = buildPrompt(topic, existingContent ?? undefined, userMessage);

  let fullContent = '';
  for await (const chunk of invokeClaudeStreaming(prompt)) {
    fullContent += chunk;
    yield chunk;
  }

  await writePage(slug, fullContent);

  return { slug, content: fullContent };
}

// ============================================
// Comments and Page Data Types
// ============================================

export interface CommentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface CommentThread {
  id: string;
  messages: CommentMessage[];
  createdAt: string;
  resolved: boolean;
}

export interface TextAnchor {
  text: string;      // The selected text
  prefix: string;    // ~30 chars before for fuzzy matching
  suffix: string;    // ~30 chars after for fuzzy matching
}

export interface InlineComment extends CommentThread {
  anchor: TextAnchor;
}

export interface PageData {
  editHistory: ChatMessage[];
  pageComments: CommentThread[];
  inlineComments: InlineComment[];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// ============================================
// Page Data CRUD
// ============================================

export async function readPageData(slug: string): Promise<PageData> {
  try {
    const data = await fs.readFile(getChatHistoryPath(slug), 'utf-8');
    const parsed = JSON.parse(data);

    // Migration: if old format (flat array), convert to new format
    if (Array.isArray(parsed)) {
      return {
        editHistory: parsed as ChatMessage[],
        pageComments: [],
        inlineComments: [],
      };
    }

    return parsed as PageData;
  } catch {
    return {
      editHistory: [],
      pageComments: [],
      inlineComments: [],
    };
  }
}

export async function writePageData(slug: string, data: PageData): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(getChatHistoryPath(slug), JSON.stringify(data, null, 2));
}

// ============================================
// Page-Level Comments
// ============================================

export async function addPageComment(
  slug: string,
  content: string,
  aiResponse?: string
): Promise<CommentThread> {
  const pageData = await readPageData(slug);
  const timestamp = new Date().toISOString();
  const threadId = generateId();

  const messages: CommentMessage[] = [
    {
      id: generateId(),
      role: 'user',
      content,
      timestamp,
    },
  ];

  if (aiResponse) {
    messages.push({
      id: generateId(),
      role: 'assistant',
      content: aiResponse,
      timestamp,
    });
  }

  const thread: CommentThread = {
    id: threadId,
    messages,
    createdAt: timestamp,
    resolved: false,
  };

  pageData.pageComments.push(thread);
  await writePageData(slug, pageData);

  return thread;
}

export async function addReplyToPageComment(
  slug: string,
  threadId: string,
  content: string,
  role: 'user' | 'assistant' = 'user'
): Promise<CommentThread | null> {
  const pageData = await readPageData(slug);
  const thread = pageData.pageComments.find(t => t.id === threadId);

  if (!thread) return null;

  thread.messages.push({
    id: generateId(),
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  await writePageData(slug, pageData);
  return thread;
}

export async function resolvePageComment(
  slug: string,
  threadId: string,
  resolved: boolean = true
): Promise<boolean> {
  const pageData = await readPageData(slug);
  const thread = pageData.pageComments.find(t => t.id === threadId);

  if (!thread) return false;

  thread.resolved = resolved;
  await writePageData(slug, pageData);
  return true;
}

// ============================================
// Inline Comments
// ============================================

export async function addInlineComment(
  slug: string,
  anchor: TextAnchor,
  content: string,
  aiResponse?: string
): Promise<InlineComment> {
  const pageData = await readPageData(slug);
  const timestamp = new Date().toISOString();
  const threadId = generateId();

  const messages: CommentMessage[] = [
    {
      id: generateId(),
      role: 'user',
      content,
      timestamp,
    },
  ];

  if (aiResponse) {
    messages.push({
      id: generateId(),
      role: 'assistant',
      content: aiResponse,
      timestamp,
    });
  }

  const inlineComment: InlineComment = {
    id: threadId,
    messages,
    createdAt: timestamp,
    resolved: false,
    anchor,
  };

  pageData.inlineComments.push(inlineComment);
  await writePageData(slug, pageData);

  return inlineComment;
}

export async function addReplyToInlineComment(
  slug: string,
  threadId: string,
  content: string,
  role: 'user' | 'assistant' = 'user'
): Promise<InlineComment | null> {
  const pageData = await readPageData(slug);
  const thread = pageData.inlineComments.find(t => t.id === threadId);

  if (!thread) return null;

  thread.messages.push({
    id: generateId(),
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  await writePageData(slug, pageData);
  return thread;
}

export async function resolveInlineComment(
  slug: string,
  threadId: string,
  resolved: boolean = true
): Promise<boolean> {
  const pageData = await readPageData(slug);
  const thread = pageData.inlineComments.find(t => t.id === threadId);

  if (!thread) return false;

  thread.resolved = resolved;
  await writePageData(slug, pageData);
  return true;
}

// ============================================
// Text Anchor Matching for Highlights
// ============================================

export interface AnchorMatch {
  start: number;
  end: number;
}

export function findAnchorPosition(content: string, anchor: TextAnchor): AnchorMatch | null {
  // 1. Try exact match first
  const exactIndex = content.indexOf(anchor.text);
  if (exactIndex !== -1) {
    return { start: exactIndex, end: exactIndex + anchor.text.length };
  }

  // 2. Try with surrounding context (prefix + text + suffix)
  if (anchor.prefix || anchor.suffix) {
    const contextPattern = (anchor.prefix || '') + anchor.text + (anchor.suffix || '');
    const contextIndex = content.indexOf(contextPattern);
    if (contextIndex !== -1) {
      const start = contextIndex + (anchor.prefix || '').length;
      return { start, end: start + anchor.text.length };
    }
  }

  // 3. Try partial context matches
  if (anchor.prefix) {
    const prefixPattern = anchor.prefix + anchor.text;
    const prefixIndex = content.indexOf(prefixPattern);
    if (prefixIndex !== -1) {
      const start = prefixIndex + anchor.prefix.length;
      return { start, end: start + anchor.text.length };
    }
  }

  if (anchor.suffix) {
    const suffixPattern = anchor.text + anchor.suffix;
    const suffixIndex = content.indexOf(suffixPattern);
    if (suffixIndex !== -1) {
      return { start: suffixIndex, end: suffixIndex + anchor.text.length };
    }
  }

  // Anchor not found - comment is orphaned
  return null;
}

/**
 * Inject highlight markers into HTML for inline comments
 * Returns the HTML with <mark> elements and a list of orphaned comment IDs
 */
export function injectInlineHighlights(
  html: string,
  inlineComments: InlineComment[]
): { html: string; orphanedIds: string[] } {
  const orphanedIds: string[] = [];

  // Sort comments by position (we need to inject from end to start to preserve indices)
  const matchedComments: { comment: InlineComment; match: AnchorMatch }[] = [];

  for (const comment of inlineComments) {
    const match = findAnchorPosition(html, comment.anchor);
    if (match) {
      matchedComments.push({ comment, match });
    } else {
      orphanedIds.push(comment.id);
    }
  }

  // Sort by start position descending (so we inject from end first)
  matchedComments.sort((a, b) => b.match.start - a.match.start);

  let result = html;
  for (const { comment, match } of matchedComments) {
    const before = result.slice(0, match.start);
    const text = result.slice(match.start, match.end);
    const after = result.slice(match.end);
    const resolvedClass = comment.resolved ? ' inline-comment-resolved' : '';
    result = `${before}<mark class="inline-comment${resolvedClass}" data-comment-id="${comment.id}">${text}</mark>${after}`;
  }

  return { html: result, orphanedIds };
}
