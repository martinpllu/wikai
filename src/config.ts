// Load .env file first (CLI env vars override these)
import { loadEnv } from './env.js';
loadEnv();

export const config = {
  dataDir: process.env.DATA_DIR ?? 'data',
  port: parseInt(process.env.PORT ?? '3171'),
};

export function buildPrompt(
  topic: string,
  existingContent?: string,
  userMessage?: string
): string {
  const contentSection = existingContent
    ? `Current page content:\n${existingContent}`
    : 'This is a new page - no existing content.';

  const instructionSection = userMessage
    ? `\nUser instruction: ${userMessage}`
    : '';

  return `You are a wiki page generator. Output ONLY the markdown content - no explanations, no code block wrappers, just raw markdown.

Topic: ${topic}

${contentSection}
${instructionSection}

Guidelines:
- Keep it SHORT: about 200-300 words maximum (roughly one page)
- Start with a level-1 heading (# Topic Name)
- Brief intro paragraph (2-3 sentences)
- 2-3 key sections with bullet points
- Use [[WikiLinks]] liberally for any notable entity: people, books, places, concepts, historical events, or anything wiki-page-worthy
- For ambiguous terms, use disambiguation in the link target: [[Port (computing)]], [[Mercury (planet)]], [[Java (programming language)]]
- Display text can differ from link target: [[Port (computing)|port]] shows "port" but links to the disambiguated page
- Example: "[[To Kill a Mockingbird]] by [[Harper Lee]]" not plain text
- Output ONLY the markdown content, nothing else`;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function buildCommentPrompt(
  pageContent: string,
  selectedText: string | null,
  question: string,
  conversationHistory: ConversationMessage[] = []
): string {
  const selectionContext = selectedText
    ? `The user highlighted this text: "${selectedText}"`
    : '';

  const historySection = conversationHistory.length > 0
    ? `Previous conversation:\n${conversationHistory.map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n')}\n\n`
    : '';

  return `You are answering a question about a wiki page. Be concise and helpful.

Page content:
${pageContent}

${selectionContext}

${historySection}User's question: ${question}

Provide a helpful, concise answer (2-4 sentences). If the question is about clarifying something in the text, explain it clearly. If it's asking for sources or verification, be honest about what you know. If this is a follow-up question, make sure to consider the previous conversation context.`;
}

export function buildInlineEditPrompt(
  pageContent: string,
  selectedText: string,
  instruction: string
): string {
  return `You are editing a wiki page. The user has selected some text in the rendered HTML view and wants it changed.

Current page content (markdown):
${pageContent}

The user selected this text in the rendered page (this is the HTML-rendered text, not the raw markdown):
"${selectedText}"

Their edit instruction: ${instruction}

Your task:
1. Find the part of the markdown that corresponds to the selected text (accounting for wiki links like [[term]], formatting, etc.)
2. Apply the user's edit instruction to that section
3. Return the COMPLETE updated page content

Return ONLY the full updated markdown content - no explanations, no code blocks, just the raw markdown for the entire page.`;
}
