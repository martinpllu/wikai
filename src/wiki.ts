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

// ============================================
// Page Versioning
// ============================================

export interface PageVersion {
  version: number;           // 1-indexed version number
  content: string;           // Full markdown content snapshot
  editPrompt: string | null; // User's edit instruction (null for initial generation)
  timestamp: string;         // ISO timestamp
  createdBy: 'generation' | 'edit' | 'revert';
  revertedFrom?: number;     // If createdBy='revert', source version
}

export interface PageData {
  editHistory: ChatMessage[];
  pageComments: CommentThread[];
  inlineComments: InlineComment[];
  versions?: PageVersion[];    // All versions including hidden ones past pointer
  currentVersion?: number;     // Pointer to active version (1-indexed)
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
// Page Versioning Functions
// ============================================

/**
 * Ensures versions array is initialized. Creates v1 from current .md content if missing.
 * Mutates pageData in place.
 */
async function ensureVersionsInitialized(pageData: PageData, slug: string): Promise<void> {
  if (pageData.versions && pageData.versions.length > 0) {
    return;
  }

  // Migration: create initial version from current content
  const content = await readPage(slug) || '';
  pageData.versions = [{
    version: 1,
    content,
    editPrompt: null,
    timestamp: new Date().toISOString(),
    createdBy: 'generation',
  }];
  pageData.currentVersion = 1;
}

/**
 * Adds a new version after an edit. Returns the new version.
 */
export async function addVersion(
  slug: string,
  content: string,
  editPrompt: string,
  createdBy: 'generation' | 'edit' | 'revert' = 'edit'
): Promise<PageVersion> {
  const pageData = await readPageData(slug);
  await ensureVersionsInitialized(pageData, slug);

  // Get next version number (always incrementing, even after reverts)
  const nextVersion = pageData.versions!.length + 1;

  const newVersion: PageVersion = {
    version: nextVersion,
    content,
    editPrompt,
    timestamp: new Date().toISOString(),
    createdBy,
  };

  pageData.versions!.push(newVersion);
  pageData.currentVersion = nextVersion;

  await writePageData(slug, pageData);
  return newVersion;
}

/**
 * Reverts to a previous version by moving the pointer.
 * Versions beyond the pointer remain on disk but are hidden from UI.
 */
export async function revertToVersion(
  slug: string,
  targetVersion: number
): Promise<PageVersion | null> {
  const pageData = await readPageData(slug);
  await ensureVersionsInitialized(pageData, slug);

  const targetVersionData = pageData.versions!.find(v => v.version === targetVersion);
  if (!targetVersionData || targetVersion > pageData.currentVersion!) {
    return null;
  }

  // Update pointer - versions beyond are now "hidden"
  pageData.currentVersion = targetVersion;

  // Write the reverted content to .md file
  await writePage(slug, targetVersionData.content);
  await writePageData(slug, pageData);

  return targetVersionData;
}

/**
 * Returns visible versions (up to current pointer) for UI display.
 * Most recent first.
 */
export async function getVersionHistory(slug: string): Promise<PageVersion[]> {
  const pageData = await readPageData(slug);
  await ensureVersionsInitialized(pageData, slug);
  await writePageData(slug, pageData); // Persist migration if it happened

  // Only return versions up to current pointer
  const visible = pageData.versions!.filter(v => v.version <= pageData.currentVersion!);
  // Return most recent first
  return visible.slice().reverse();
}

/**
 * Gets a specific version for preview.
 */
export async function getVersion(
  slug: string,
  version: number
): Promise<PageVersion | null> {
  const pageData = await readPageData(slug);
  await ensureVersionsInitialized(pageData, slug);

  // Only allow access to versions up to current pointer
  if (version < 1 || version > pageData.currentVersion!) {
    return null;
  }

  return pageData.versions!.find(v => v.version === version) || null;
}

/**
 * Gets current version number for a page.
 */
export async function getCurrentVersion(slug: string): Promise<number> {
  const pageData = await readPageData(slug);
  await ensureVersionsInitialized(pageData, slug);
  await writePageData(slug, pageData); // Persist migration if it happened
  return pageData.currentVersion!;
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
 * Find anchor position only within text content (not inside HTML tags)
 */
function findAnchorInTextContent(
  html: string,
  anchor: TextAnchor
): AnchorMatch | null {
  // Build a map of "safe" positions (positions that are in text content, not inside tags)
  // We'll search for the anchor only in these safe regions

  const textRegions: { start: number; end: number; text: string }[] = [];
  let inTag = false;
  let regionStart = 0;

  for (let i = 0; i < html.length; i++) {
    if (html[i] === '<') {
      if (!inTag && i > regionStart) {
        textRegions.push({
          start: regionStart,
          end: i,
          text: html.slice(regionStart, i)
        });
      }
      inTag = true;
    } else if (html[i] === '>') {
      inTag = false;
      regionStart = i + 1;
    }
  }

  // Don't forget the last region after the final tag
  if (!inTag && regionStart < html.length) {
    textRegions.push({
      start: regionStart,
      end: html.length,
      text: html.slice(regionStart)
    });
  }

  // Now search for the anchor text only within text regions
  // First try exact match
  for (const region of textRegions) {
    const idx = region.text.indexOf(anchor.text);
    if (idx !== -1) {
      return {
        start: region.start + idx,
        end: region.start + idx + anchor.text.length
      };
    }
  }

  // Try with prefix context
  if (anchor.prefix) {
    for (const region of textRegions) {
      const pattern = anchor.prefix + anchor.text;
      const idx = region.text.indexOf(pattern);
      if (idx !== -1) {
        const start = region.start + idx + anchor.prefix.length;
        return { start, end: start + anchor.text.length };
      }
    }
  }

  // Try with suffix context
  if (anchor.suffix) {
    for (const region of textRegions) {
      const pattern = anchor.text + anchor.suffix;
      const idx = region.text.indexOf(pattern);
      if (idx !== -1) {
        return {
          start: region.start + idx,
          end: region.start + idx + anchor.text.length
        };
      }
    }
  }

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
    // Use the safe text-content-only search
    const match = findAnchorInTextContent(html, comment.anchor);
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
