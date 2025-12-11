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

export async function listPages(): Promise<Array<{ slug: string; title: string }>> {
  try {
    const files = await fs.readdir(config.dataDir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const slug = f.replace('.md', '');
        return { slug, title: unslugify(slug) };
      });
  } catch {
    return [];
  }
}

// Convert [[WikiLinks]] to HTML links
// Supports [[Topic]] and [[Topic|Display Text]] syntax
function processWikiLinks(html: string): string {
  return html.replace(/\[\[([^\]]+)\]\]/g, (_, linkContent: string) => {
    const [target, displayText] = linkContent.split('|');
    const slug = slugify(target);
    const text = displayText ?? target;
    return `<a href="/wiki/${slug}" class="wiki-link">${text}</a>`;
  });
}

export async function renderMarkdown(content: string): Promise<string> {
  const html = await marked(content);
  return processWikiLinks(html);
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
