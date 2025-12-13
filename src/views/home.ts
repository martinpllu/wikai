import { layout } from './layout.js';
import { DEFAULT_PROJECT, type PageInfo } from '../wiki.js';

export function homePage(pages: PageInfo[], project: string = DEFAULT_PROJECT, projects: string[] = [DEFAULT_PROJECT]): string {
  return layout({
    title: 'Home',
    pages,
    project,
    projects,
    content: `
    <section class="generate-section" id="generate-section">
      <h1>Create new page</h1>
      <form action="/${project}/generate" method="POST" class="generate-form" id="generate-form" data-project="${project}">
        <label for="topic">What would you like to know about?</label>
        <textarea
          id="topic"
          name="topic"
          placeholder="e.g., Machine Learning, Ancient Greece, Sourdough Bread, DNS..."
          rows="3"
          required
          autofocus
        ></textarea>
        <p class="tip">Tip: Add instructions on a new line to guide page generation.</p>
        <button type="submit" id="generate-btn">Create <kbd class="shortcut-hint" data-mac="⌘↵" data-other="Ctrl+↵"></kbd></button>
      </form>
    </section>

    <section class="streaming-section" id="streaming-section" style="display: none;">
      <div class="streaming-header">
        <div class="spinner"></div>
      </div>
      <div class="streaming-content" id="streaming-content"></div>
    </section>
  `,
  });
}
