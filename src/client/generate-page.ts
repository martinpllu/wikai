import type { SmdModule } from './types.js';
import { getElement } from './utils.js';

export async function initGeneratePage(): Promise<void> {
  const streamingSection = getElement<HTMLElement>('streaming-section');
  if (!streamingSection || !streamingSection.dataset.topic) return; // Not on generate page

  const streamingContent = getElement<HTMLElement>('streaming-content');
  const topic = streamingSection.dataset.topic;
  const project = streamingSection.dataset.project;

  if (!streamingContent || !topic) return;

  // Import streaming-markdown from CDN
  // @ts-ignore - External CDN module
  const smd: SmdModule = await import('https://cdn.jsdelivr.net/npm/streaming-markdown/smd.min.js');

  // Set up streaming markdown renderer
  const renderer = smd.default_renderer(streamingContent);
  const parser = smd.parser(renderer);

  try {
    window.setCostLoading?.(true);
    const response = await fetch('/' + project + '/generate', {
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
              // Complete - redirect (replace so generate page isn't in history)
              window.setCostLoading?.(false);
              smd.parser_end(parser);
              setTimeout(() => {
                window.location.replace(data.url);
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
}
