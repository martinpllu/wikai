import { layout } from './layout.js';
import type { PageInfo } from '../wiki.js';

export function homePage(pages: PageInfo[], project: string = 'default', projects: string[] = ['default']): string {
  return layout({
    title: 'Home',
    pages,
    project,
    projects,
    content: `
    <section class="hero">
      <h1>Welcome to WikAI</h1>
      <p>Your personal AI-powered wiki. Enter a topic to generate a knowledge page.</p>
    </section>

    <section class="generate-section" id="generate-section">
      <form action="/p/${project}/generate" method="POST" class="generate-form" id="generate-form">
        <label for="topic">Topic</label>
        <textarea
          id="topic"
          name="topic"
          placeholder="e.g., Machine Learning, Ancient Greece, Sourdough Bread, DNS..."
          rows="3"
          required
          autofocus
        ></textarea>
        <div class="form-footer">
          <button type="submit" id="generate-btn">Generate Page</button>
          <span class="submit-hint">⌘↵ to submit</span>
        </div>
      </form>
    </section>

    <section class="streaming-section" id="streaming-section" style="display: none;">
      <div class="streaming-header">
        <div class="spinner"></div>
      </div>
      <div class="streaming-content" id="streaming-content"></div>
    </section>

    <script type="module">
      import * as smd from 'https://cdn.jsdelivr.net/npm/streaming-markdown/smd.min.js';

      const form = document.getElementById('generate-form');
      const generateSection = document.getElementById('generate-section');
      const streamingSection = document.getElementById('streaming-section');
      const streamingContent = document.getElementById('streaming-content');
      const topicInput = document.getElementById('topic');
      const currentProject = '${project}';

      // Cmd/Ctrl + Enter to submit
      topicInput.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modKey = isMac ? e.metaKey : e.ctrlKey;
        if (modKey && e.key === 'Enter') {
          e.preventDefault();
          form.requestSubmit();
        }
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const topic = document.getElementById('topic').value.trim();
        if (!topic) return;

        // Show streaming UI
        generateSection.style.display = 'none';
        streamingSection.style.display = 'block';
        streamingContent.innerHTML = '';

        // Set up streaming markdown renderer
        const renderer = smd.default_renderer(streamingContent);
        const parser = smd.parser(renderer);

        try {
          const response = await fetch('/p/' + currentProject + '/generate', {
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
                    // Complete - redirect
                    smd.parser_end(parser);
                    setTimeout(() => {
                      window.location.href = data.url;
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
      });
    </script>
  `,
  });
}
