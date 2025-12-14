import * as fs from 'fs/promises';
import * as path from 'path';
import { marked } from 'marked';
import { config, buildPrompt } from './config.js';
import {
  invokeModel,
  invokeModelStreaming,
  getEffectiveModel as getProviderEffectiveModel,
  type ProviderId,
  type RequestContext,
} from './providers/index.js';

// ============================================
// User Settings
// ============================================

export interface UserSettings {
  systemPrompt: string;
  model: string;
  searchEnabled: boolean;
  provider: ProviderId;
  providerApiKeys: Partial<Record<ProviderId, string>>;
}

const DEFAULT_SETTINGS: UserSettings = {
  systemPrompt: '',
  model: '',
  searchEnabled: true,
  provider: 'openrouter',
  providerApiKeys: {},
};

/**
 * Get the effective model ID with web search applied if enabled
 */
export function getEffectiveModel(settings: UserSettings): string {
  return getProviderEffectiveModel(settings);
}

function getSettingsPath(): string {
  return path.join(config.configDir, 'settings.json');
}

export async function readSettings(): Promise<UserSettings> {
  try {
    const data = await fs.readFile(getSettingsPath(), 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(settings: UserSettings): Promise<void> {
  await fs.mkdir(config.configDir, { recursive: true });
  await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')    // remove non-word chars except spaces and hyphens
    .replace(/\s+/g, '-')         // spaces to hyphens
    .replace(/-+/g, '-')          // collapse multiple hyphens
    .replace(/^-+|-+$/g, '')      // trim leading/trailing hyphens
    .slice(0, 100);               // limit length for filesystem safety
}

/**
 * Generate a unique slug by appending a number if the base slug already exists.
 * e.g., "dns" -> "dns-2" -> "dns-3" etc.
 */
export async function uniqueSlug(baseSlug: string, project: string = DEFAULT_PROJECT): Promise<string> {
  if (!(await pageExists(baseSlug, project))) {
    return baseSlug;
  }

  let counter = 2;
  while (await pageExists(`${baseSlug}-${counter}`, project)) {
    counter++;
  }
  return `${baseSlug}-${counter}`;
}

/**
 * Generate a unique title by appending a number if needed.
 * e.g., "DNS" -> "DNS (2)" -> "DNS (3)" etc.
 */
export async function uniqueTitle(baseTitle: string, project: string = DEFAULT_PROJECT): Promise<{ title: string; slug: string }> {
  const baseSlug = slugify(baseTitle);

  if (!(await pageExists(baseSlug, project))) {
    return { title: baseTitle, slug: baseSlug };
  }

  let counter = 2;
  while (await pageExists(`${baseSlug}-${counter}`, project)) {
    counter++;
  }
  return {
    title: `${baseTitle} (${counter})`,
    slug: `${baseSlug}-${counter}`,
  };
}

export function unslugify(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================
// Project Management
// ============================================

export const DEFAULT_PROJECT = 'main';

/**
 * Validate that a resolved path is contained within the data directory.
 * Throws an error if the path escapes the data directory (path traversal attack).
 */
function assertPathContained(resolvedPath: string): void {
  const dataDir = path.resolve(config.dataDir);
  const normalized = path.resolve(resolvedPath);
  if (!normalized.startsWith(dataDir + path.sep) && normalized !== dataDir) {
    throw new Error('Invalid path: path traversal detected');
  }
}

export function getProjectDir(project: string): string {
  const dir = path.join(config.dataDir, project);
  assertPathContained(dir);
  return dir;
}

export function getPagePath(slug: string, project: string = DEFAULT_PROJECT): string {
  const pagePath = path.join(getProjectDir(project), `${slug}.md`);
  assertPathContained(pagePath);
  return pagePath;
}

export function getChatHistoryPath(slug: string, project: string = DEFAULT_PROJECT): string {
  const historyPath = path.join(getProjectDir(project), `${slug}.json`);
  assertPathContained(historyPath);
  return historyPath;
}

export async function listProjects(): Promise<string[]> {
  try {
    const entries = await fs.readdir(config.dataDir, { withFileTypes: true });
    const projects = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((a, b) => {
        // Always put 'default' first
        if (a === DEFAULT_PROJECT) return -1;
        if (b === DEFAULT_PROJECT) return 1;
        return a.localeCompare(b);
      });

    // Ensure default project always exists in the list
    if (!projects.includes(DEFAULT_PROJECT)) {
      projects.unshift(DEFAULT_PROJECT);
    }

    return projects;
  } catch {
    return [DEFAULT_PROJECT];
  }
}

export async function projectExists(project: string): Promise<boolean> {
  try {
    const stat = await fs.stat(getProjectDir(project));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function createProject(name: string): Promise<{ success: boolean; error?: string }> {
  // Validate project name - only allow alphanumeric, hyphens, and underscores
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Please provide a project name' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { success: false, error: 'Project name can only contain letters, numbers, hyphens, and underscores' };
  }

  const sanitized = trimmed.toLowerCase();

  // Check if project already exists
  if (await projectExists(sanitized)) {
    return { success: false, error: 'Project already exists' };
  }

  // Create project directory
  try {
    await fs.mkdir(getProjectDir(sanitized), { recursive: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to create project directory' };
  }
}

export async function ensureDefaultProject(): Promise<void> {
  const defaultDir = getProjectDir(DEFAULT_PROJECT);
  try {
    await fs.access(defaultDir);
  } catch {
    await fs.mkdir(defaultDir, { recursive: true });
  }
}

/**
 * Migrate existing pages from the root data directory to the default project subdirectory.
 * This is a one-time migration that moves all .md and .json files.
 */
export async function migrateToProjects(): Promise<void> {
  const dataDir = config.dataDir;
  const defaultDir = getProjectDir(DEFAULT_PROJECT);

  // Check if default project already exists and has content
  try {
    const defaultFiles = await fs.readdir(defaultDir);
    if (defaultFiles.some(f => f.endsWith('.md'))) {
      // Already migrated
      return;
    }
  } catch {
    // Directory doesn't exist, will be created
  }

  // Ensure the default project directory exists
  await fs.mkdir(defaultDir, { recursive: true });

  // Read all files from the root data directory
  let files: string[];
  try {
    files = await fs.readdir(dataDir);
  } catch {
    return; // No data directory yet
  }

  // Move all .md and .json files to the default project
  for (const file of files) {
    if (file.endsWith('.md') || file.endsWith('.json')) {
      const srcPath = path.join(dataDir, file);
      const destPath = path.join(defaultDir, file);

      // Check if source is a file (not a directory)
      const stat = await fs.stat(srcPath);
      if (stat.isFile()) {
        await fs.rename(srcPath, destPath);
      }
    }
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export async function readChatHistory(slug: string, project: string = DEFAULT_PROJECT): Promise<ChatMessage[]> {
  try {
    const data = await fs.readFile(getChatHistoryPath(slug, project), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function appendChatHistory(
  slug: string,
  userMessage: string,
  assistantSummary?: string,
  project: string = DEFAULT_PROJECT
): Promise<void> {
  const history = await readChatHistory(slug, project);
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

  await fs.mkdir(getProjectDir(project), { recursive: true });
  await fs.writeFile(getChatHistoryPath(slug, project), JSON.stringify(history, null, 2));
}

export async function pageExists(slug: string, project: string = DEFAULT_PROJECT): Promise<boolean> {
  try {
    await fs.access(getPagePath(slug, project));
    return true;
  } catch {
    return false;
  }
}

export async function readPage(slug: string, project: string = DEFAULT_PROJECT): Promise<string | null> {
  try {
    return await fs.readFile(getPagePath(slug, project), 'utf-8');
  } catch {
    return null;
  }
}

export async function writePage(slug: string, content: string, project: string = DEFAULT_PROJECT): Promise<void> {
  await fs.mkdir(getProjectDir(project), { recursive: true });
  await fs.writeFile(getPagePath(slug, project), content, 'utf-8');
}

export async function deletePage(slug: string, project: string = DEFAULT_PROJECT): Promise<boolean> {
  try {
    const mdPath = getPagePath(slug, project);
    const jsonPath = getChatHistoryPath(slug, project);

    // Delete both the .md and .json files
    await fs.unlink(mdPath).catch(() => {});
    await fs.unlink(jsonPath).catch(() => {});

    return true;
  } catch {
    return false;
  }
}

export interface PageInfo {
  slug: string;
  title: string;
  modifiedAt: number;
}

export async function listPages(project: string = DEFAULT_PROJECT): Promise<PageInfo[]> {
  try {
    const projectDir = getProjectDir(project);
    await fs.mkdir(projectDir, { recursive: true });
    const files = await fs.readdir(projectDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    const pages = await Promise.all(
      mdFiles.map(async (f) => {
        const slug = f.replace('.md', '');
        const filePath = path.join(projectDir, f);
        const stats = await fs.stat(filePath);
        // Use saved title if available, otherwise fall back to unslugify
        const pageData = await readPageData(slug, project);
        return {
          slug,
          title: pageData.title || unslugify(slug),
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
async function processWikiLinks(html: string, project: string = DEFAULT_PROJECT): Promise<string> {
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
  const existsResults = await Promise.all(slugs.map(slug => pageExists(slug, project)));

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
    result += `<a href="/${project}/${slug}" class="${className}">${text}</a>`;
    lastIndex = index + match.length;
  }
  result += html.slice(lastIndex);

  return result;
}

export async function renderMarkdown(content: string, project: string = DEFAULT_PROJECT): Promise<string> {
  const html = await marked(content);
  return await processWikiLinks(html, project);
}

export async function generatePage(
  topic: string,
  userMessage?: string,
  project: string = DEFAULT_PROJECT,
  settings?: UserSettings
): Promise<{ slug: string; content: string }> {
  const slug = slugify(topic);
  const existingContent = await readPage(slug, project);

  const prompt = buildPrompt(topic, existingContent ?? undefined, userMessage);

  const context: RequestContext = {
    action: existingContent ? 'edit' : 'generate',
    pageName: topic,
    prompt: userMessage || `Generate: ${topic}`,
  };

  const markdownContent = await invokeModel(prompt, settings?.systemPrompt, settings, context);

  await writePage(slug, markdownContent, project);

  return { slug, content: markdownContent };
}

/**
 * Extract title from markdown H1 heading
 */
export function extractTitleFromMarkdown(content: string): string | null {
  // Match H1 that ends with newline, or at end of content (for complete documents)
  const h1Match = content.match(/^#\s+(.+?)(?:\n|$)/m);
  return h1Match ? h1Match[1].trim() : null;
}

/**
 * Streaming version - yields chunks but does NOT save.
 * The caller is responsible for saving the content with the appropriate slug.
 * Returns the full content when complete.
 */
export async function* generatePageStreaming(
  userRequest: string,
  userMessage?: string,
  project: string = DEFAULT_PROJECT,
  settings?: UserSettings
): AsyncGenerator<string, string> {
  const prompt = buildPrompt(userRequest, undefined, userMessage);

  const context: RequestContext = {
    action: 'generate',
    pageName: userRequest,
    prompt: userMessage || `Generate: ${userRequest}`,
  };

  let fullContent = '';
  for await (const chunk of invokeModelStreaming(prompt, settings?.systemPrompt, settings, context)) {
    fullContent += chunk;
    yield chunk;
  }

  return fullContent;
}

/**
 * Save a generated page with the given slug and title.
 */
export async function saveGeneratedPage(
  slug: string,
  title: string,
  content: string,
  project: string = DEFAULT_PROJECT
): Promise<void> {
  await writePage(slug, content, project);

  // Save the title with preserved capitalization
  const pageData = await readPageData(slug, project);
  pageData.title = title;
  await writePageData(slug, pageData, project);
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
  supersededAt?: string;     // ISO timestamp when this version was invalidated by a revert+edit
}

export interface PageData {
  title?: string;              // Original topic name with preserved capitalization
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

export async function readPageData(slug: string, project: string = DEFAULT_PROJECT): Promise<PageData> {
  try {
    const data = await fs.readFile(getChatHistoryPath(slug, project), 'utf-8');
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

export async function writePageData(slug: string, data: PageData, project: string = DEFAULT_PROJECT): Promise<void> {
  await fs.mkdir(getProjectDir(project), { recursive: true });
  await fs.writeFile(getChatHistoryPath(slug, project), JSON.stringify(data, null, 2));
}

// ============================================
// Page Versioning Functions
// ============================================

/**
 * Ensures versions array is initialized. Creates v1 from current .md content if missing.
 * Mutates pageData in place.
 */
async function ensureVersionsInitialized(pageData: PageData, slug: string, project: string = DEFAULT_PROJECT): Promise<void> {
  if (pageData.versions && pageData.versions.length > 0) {
    return;
  }

  // Migration: create initial version from current content
  const content = await readPage(slug, project) || '';
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
 * If current pointer is behind the latest version (after a revert),
 * marks all versions beyond the pointer as superseded.
 */
export async function addVersion(
  slug: string,
  content: string,
  editPrompt: string,
  createdBy: 'generation' | 'edit' | 'revert' = 'edit',
  project: string = DEFAULT_PROJECT
): Promise<PageVersion> {
  const pageData = await readPageData(slug, project);
  await ensureVersionsInitialized(pageData, slug, project);

  const now = new Date().toISOString();

  // Mark versions beyond current pointer as superseded (if any)
  for (const v of pageData.versions!) {
    if (v.version > pageData.currentVersion! && !v.supersededAt) {
      v.supersededAt = now;
    }
  }

  // Get next version number (always incrementing, even after reverts)
  const nextVersion = pageData.versions!.length + 1;

  const newVersion: PageVersion = {
    version: nextVersion,
    content,
    editPrompt,
    timestamp: now,
    createdBy,
  };

  pageData.versions!.push(newVersion);
  pageData.currentVersion = nextVersion;

  await writePageData(slug, pageData, project);
  return newVersion;
}

/**
 * Reverts/restores to any version (including superseded ones).
 * Updates the pointer and clears supersededAt if restoring a superseded version.
 */
export async function revertToVersion(
  slug: string,
  targetVersion: number,
  project: string = DEFAULT_PROJECT
): Promise<PageVersion | null> {
  const pageData = await readPageData(slug, project);
  await ensureVersionsInitialized(pageData, slug, project);

  const targetVersionData = pageData.versions!.find(v => v.version === targetVersion);
  if (!targetVersionData) {
    return null;
  }

  // If restoring a superseded version, clear its supersededAt flag
  if (targetVersionData.supersededAt) {
    delete targetVersionData.supersededAt;
  }

  // Update pointer
  pageData.currentVersion = targetVersion;

  // Write the reverted content to .md file
  await writePage(slug, targetVersionData.content, project);
  await writePageData(slug, pageData, project);

  return targetVersionData;
}

/**
 * Returns visible versions for UI display.
 * Excludes superseded versions (those invalidated by edits after a revert).
 * Most recent first.
 */
export async function getVersionHistory(slug: string, project: string = DEFAULT_PROJECT): Promise<PageVersion[]> {
  const pageData = await readPageData(slug, project);
  await ensureVersionsInitialized(pageData, slug, project);
  await writePageData(slug, pageData, project); // Persist migration if it happened

  // Only return non-superseded versions up to current pointer
  const visible = pageData.versions!.filter(
    v => v.version <= pageData.currentVersion! && !v.supersededAt
  );
  // Return most recent first
  return visible.slice().reverse();
}

/**
 * Returns ALL versions including superseded ones for "show all" UI.
 * Most recent first.
 */
export async function getAllVersionHistory(slug: string, project: string = DEFAULT_PROJECT): Promise<PageVersion[]> {
  const pageData = await readPageData(slug, project);
  await ensureVersionsInitialized(pageData, slug, project);
  await writePageData(slug, pageData, project); // Persist migration if it happened

  // Return all versions, most recent first
  return pageData.versions!.slice().reverse();
}

/**
 * Gets a specific version for preview (including superseded versions).
 */
export async function getVersion(
  slug: string,
  version: number,
  project: string = DEFAULT_PROJECT
): Promise<PageVersion | null> {
  const pageData = await readPageData(slug, project);
  await ensureVersionsInitialized(pageData, slug, project);

  if (version < 1) {
    return null;
  }

  return pageData.versions!.find(v => v.version === version) || null;
}

/**
 * Gets current version number for a page.
 */
export async function getCurrentVersion(slug: string, project: string = DEFAULT_PROJECT): Promise<number> {
  const pageData = await readPageData(slug, project);
  await ensureVersionsInitialized(pageData, slug, project);
  await writePageData(slug, pageData, project); // Persist migration if it happened
  return pageData.currentVersion!;
}

// ============================================
// Page-Level Comments
// ============================================

export async function addPageComment(
  slug: string,
  content: string,
  aiResponse?: string,
  project: string = DEFAULT_PROJECT
): Promise<CommentThread> {
  const pageData = await readPageData(slug, project);
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
  await writePageData(slug, pageData, project);

  return thread;
}

export async function addReplyToPageComment(
  slug: string,
  threadId: string,
  content: string,
  role: 'user' | 'assistant' = 'user',
  project: string = DEFAULT_PROJECT
): Promise<CommentThread | null> {
  const pageData = await readPageData(slug, project);
  const thread = pageData.pageComments.find(t => t.id === threadId);

  if (!thread) return null;

  thread.messages.push({
    id: generateId(),
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  await writePageData(slug, pageData, project);
  return thread;
}

export async function resolvePageComment(
  slug: string,
  threadId: string,
  resolved: boolean = true,
  project: string = DEFAULT_PROJECT
): Promise<boolean> {
  const pageData = await readPageData(slug, project);
  const thread = pageData.pageComments.find(t => t.id === threadId);

  if (!thread) return false;

  thread.resolved = resolved;
  await writePageData(slug, pageData, project);
  return true;
}

// ============================================
// Inline Comments
// ============================================

export async function addInlineComment(
  slug: string,
  anchor: TextAnchor,
  content: string,
  aiResponse?: string,
  project: string = DEFAULT_PROJECT
): Promise<InlineComment> {
  const pageData = await readPageData(slug, project);
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
  await writePageData(slug, pageData, project);

  return inlineComment;
}

export async function addReplyToInlineComment(
  slug: string,
  threadId: string,
  content: string,
  role: 'user' | 'assistant' = 'user',
  project: string = DEFAULT_PROJECT
): Promise<InlineComment | null> {
  const pageData = await readPageData(slug, project);
  const thread = pageData.inlineComments.find(t => t.id === threadId);

  if (!thread) return null;

  thread.messages.push({
    id: generateId(),
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  await writePageData(slug, pageData, project);
  return thread;
}

export async function resolveInlineComment(
  slug: string,
  threadId: string,
  resolved: boolean = true,
  project: string = DEFAULT_PROJECT
): Promise<boolean> {
  const pageData = await readPageData(slug, project);
  const thread = pageData.inlineComments.find(t => t.id === threadId);

  if (!thread) return false;

  thread.resolved = resolved;
  await writePageData(slug, pageData, project);
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
 * Find anchor position only within text content (not inside HTML tags).
 * Can match text that spans across HTML tags.
 */
function findAnchorInTextContent(
  html: string,
  anchor: TextAnchor
): AnchorMatch | null {
  // Normalize line endings in anchor (browsers may have stored \r\n)
  const searchText = anchor.text.replace(/\r\n/g, '\n');

  // Build concatenated text content and a map from text position to HTML position
  let textContent = '';
  const textPosToHtmlPos: number[] = []; // textPosToHtmlPos[i] = HTML position of text char i
  let inTag = false;

  for (let i = 0; i < html.length; i++) {
    if (html[i] === '<') {
      inTag = true;
    } else if (html[i] === '>') {
      inTag = false;
    } else if (!inTag) {
      textPosToHtmlPos.push(i);
      textContent += html[i];
    }
  }

  // Search for the anchor text in the concatenated text content
  const idx = textContent.indexOf(searchText);
  if (idx === -1) {
    return null;
  }

  // Map back to HTML positions
  const startHtmlPos = textPosToHtmlPos[idx];
  const endHtmlPos = textPosToHtmlPos[idx + searchText.length - 1] + 1;

  return { start: startHtmlPos, end: endHtmlPos };
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
