import { layout } from './layout.js';
import { DEFAULT_PROJECT, type PageInfo, type UserSettings } from '../wiki.js';
import { config } from '../config.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function settingsPage(
  settings: UserSettings,
  pages: PageInfo[] = [],
  project: string = DEFAULT_PROJECT,
  projects: string[] = [DEFAULT_PROJECT]
): string {
  return layout({
    title: 'Settings',
    pages,
    project,
    projects,
    content: `
    <section class="settings-page">
      <h1>Settings</h1>

      <form action="/settings" method="POST" class="settings-form" id="settings-form">
        <div class="settings-section">
          <h2>OpenRouter</h2>
          <label for="model">Model</label>
          <p class="settings-description">
            Specify the model to use for generation.
            <br><br>
            Find model names at <a href="https://openrouter.ai/models" target="_blank" rel="noopener">openrouter.ai/models</a>.
            <br><br>
            Examples: <code>anthropic/claude-opus-4.5</code>, <code>openai/gpt-5.2</code>, <code>google/gemini-3-pro-preview</code>, <code>google/gemini-2.5-flash</code>, <code>x-ai/grok-4-fast</code>
          </p>
          <input
            type="text"
            id="model"
            name="model"
            value="${escapeHtml(settings.model || config.model)}"
          />

          <div class="settings-toggle">
            <label class="toggle-label">
              <input
                type="checkbox"
                id="search-enabled"
                name="searchEnabled"
                ${settings.searchEnabled ? 'checked' : ''}
              />
              <span class="toggle-text">Enable web search</span>
            </label>
            <p class="settings-description">
              When enabled, appends <code>:online</code> to the model ID to give it web search capabilities via OpenRouter.
            </p>
          </div>
        </div>

        <div class="settings-section">
          <h2>Prompts</h2>
          <label for="system-prompt">Custom System Prompt</label>
          <p class="settings-description">
            Add custom instructions that will be included with every LLM request.
            Leave blank to use default behavior.
          </p>
          <textarea
            id="system-prompt"
            name="systemPrompt"
            placeholder="e.g., Always write in a formal academic tone. Focus on historical accuracy. Include citations where possible."
            rows="6"
          >${escapeHtml(settings.systemPrompt)}</textarea>
        </div>

        <div class="form-footer">
          <button type="submit" id="save-btn">Save Settings</button>
          <span class="save-status" id="save-status"></span>
        </div>
      </form>
    </section>
  `,
  });
}
