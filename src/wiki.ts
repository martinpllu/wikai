import * as fs from 'fs/promises';
import * as path from 'path';
import { marked } from 'marked';
import { config, buildPrompt } from './config.js';
import { invokeClaude, invokeClaudeStreaming } from './claude.js';

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
