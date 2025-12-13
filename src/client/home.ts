import type { SmdModule } from './types.js';
import { isMac, getElement } from './utils.js';

export function initHome(): void {
  const form = getElement<HTMLFormElement>('generate-form');
  if (!form) return; // Not on home page

  const generateSection = getElement<HTMLElement>('generate-section');
  const streamingSection = getElement<HTMLElement>('streaming-section');
  const streamingContent = getElement<HTMLElement>('streaming-content');
  const topicInput = getElement<HTMLTextAreaElement>('topic');
  const currentProject = form.dataset.project;

  if (!generateSection || !streamingSection || !streamingContent || !topicInput) return;

  // Cmd/Ctrl + Enter to submit
  topicInput.addEventListener('keydown', (e) => {
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    if (modKey && e.key === 'Enter') {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const topic = topicInput.value.trim();
    if (!topic) return;

    // Show streaming UI
    generateSection.style.display = 'none';
    streamingSection.style.display = 'block';
    streamingContent.innerHTML = '';

    // Import streaming-markdown from CDN
    // @ts-ignore - External CDN module
    const smd: SmdModule = await import('https://cdn.jsdelivr.net/npm/streaming-markdown/smd.min.js');

    // Set up streaming markdown renderer
    const renderer = smd.default_renderer(streamingContent);
    const parser = smd.parser(renderer);

    try {
      window.setCostLoading?.(true);
      const response = await fetch('/' + currentProject + '/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ topic }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.content) {
                smd.parser_write(parser, data.content);
              }
              if (data.url) {
                // Complete - redirect
                window.setCostLoading?.(false);
                smd.parser_end(parser);
                setTimeout(() => {
                  window.location.href = data.url;
                }, 500);
              }
              if (data.message) {
                // Error
                window.setCostLoading?.(false);
                streamingContent.innerHTML = '<p class="error">Error: ' + data.message + '</p>';
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      window.setCostLoading?.(false);
      streamingContent.innerHTML = '<p class="error">Connection error: ' + (error as Error).message + '</p>';
    }
  });
}
