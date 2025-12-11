import { layout } from './layout.js';
import type { ChatMessage } from '../wiki.js';

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderChatHistory(history: ChatMessage[]): string {
  if (history.length === 0) return '';

  const messages = history.map(msg => `
    <div class="chat-message chat-message-${msg.role}">
      <span class="chat-timestamp">${formatTimestamp(msg.timestamp)}</span>
      <span class="chat-content">${msg.content}</span>
    </div>
  `).join('');

  return `
    <div class="chat-history">
      <h4>Edit History</h4>
      ${messages}
    </div>
  `;
}

export function wikiPage(slug: string, title: string, htmlContent: string, chatHistory: ChatMessage[] = []): string {
  return layout(title, `
    <article class="wiki-page">
      <div class="wiki-content">
        ${htmlContent}
      </div>
    </article>

    <section class="chat-section">
      <h3>Ask or Edit</h3>
      ${renderChatHistory(chatHistory)}
      <form action="/wiki/${slug}/chat" method="POST" class="chat-form" id="chat-form">
        <textarea
          name="message"
          id="chat-message"
          placeholder="Ask a question about this topic, or give instructions to edit the page..."
          rows="3"
          required
        ></textarea>
        <button type="submit" id="chat-submit">Send</button>
      </form>
    </section>

    <script>
      const form = document.getElementById('chat-form');
      const textarea = document.getElementById('chat-message');
      const button = document.getElementById('chat-submit');

      form.addEventListener('submit', () => {
        textarea.disabled = true;
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> Updating...';
      });
    </script>
  `);
}

export function generatingPage(topic: string): string {
  return layout('Generating...', `
    <section class="generating">
      <h1>Generating page for "${topic}"</h1>
      <p>Please wait while Claude creates your wiki page...</p>
      <div class="spinner"></div>
    </section>
  `);
}

export function errorPage(message: string): string {
  return layout('Error', `
    <section class="error-page">
      <h1>Something went wrong</h1>
      <p>${message}</p>
      <a href="/" class="btn">Go Home</a>
    </section>
  `);
}

export function generatePageView(topic: string): string {
  return layout(`Generating: ${topic}`, `
    <section class="streaming-section" id="streaming-section">
      <div class="streaming-header">
        <div class="spinner"></div>
      </div>
      <div class="streaming-content" id="streaming-content"></div>
    </section>

    <script type="module">
      import * as smd from 'https://cdn.jsdelivr.net/npm/streaming-markdown/smd.min.js';

      const streamingContent = document.getElementById('streaming-content');
      const topic = ${JSON.stringify(topic)};

      // Set up streaming markdown renderer
      const renderer = smd.default_renderer(streamingContent);
      const parser = smd.parser(renderer);

      async function generate() {
        try {
          const response = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ topic }),
          });

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));

                  if (data.content) {
                    smd.parser_write(parser, data.content);
                  }
                  if (data.url) {
                    // Complete - redirect (replace so generate page isn't in history)
                    smd.parser_end(parser);
                    setTimeout(() => {
                      window.location.replace(data.url);
                    }, 500);
                  }
                  if (data.message) {
                    // Error
                    streamingContent.innerHTML = '<p class="error">Error: ' + data.message + '</p>';
                  }
                } catch {}
              }
            }
          }
        } catch (error) {
          streamingContent.innerHTML = '<p class="error">Connection error: ' + error.message + '</p>';
        }
      }

      generate();
    </script>
  `);
}
