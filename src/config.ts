// Load .env file first (CLI env vars override these)
import { loadEnv } from './env.js';
loadEnv();

export const config = {
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  model: process.env.MODEL ?? 'anthropic/claude-sonnet-4',
  dataDir: process.env.DATA_DIR ?? 'data',
  detailLevel: process.env.DETAIL_LEVEL ?? 'comprehensive',
  port: parseInt(process.env.PORT ?? '3000'),
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
- Example: "[[To Kill a Mockingbird]] by [[Harper Lee]]" not plain text
- Output ONLY the markdown content, nothing else`;
}

export function buildCommentPrompt(
  pageContent: string,
  selectedText: string | null,
  question: string
): string {
  const selectionContext = selectedText
    ? `The user highlighted this text: "${selectedText}"`
    : '';

  return `You are answering a question about a wiki page. Be concise and helpful.

Page content:
${pageContent}

${selectionContext}

User's question: ${question}

Provide a helpful, concise answer (2-4 sentences). If the question is about clarifying something in the text, explain it clearly. If it's asking for sources or verification, be honest about what you know.`;
}

export function buildInlineEditPrompt(
  pageContent: string,
  selectedText: string,
  instruction: string
): string {
  return `You are editing a specific part of a wiki page.

Full page content:
${pageContent}

The user selected this text to edit:
"${selectedText}"

Their edit instruction: ${instruction}

Return ONLY the replacement text for the selected portion. Do not include any explanation or the rest of the page - just the new text that should replace the selection. Maintain proper markdown formatting.`;
}
