import { layout } from './layout.js';
import { DEFAULT_PROJECT, type PageInfo, type UserSettings } from '../wiki.js';
import { getDefaultModel } from '../providers/index.js';

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
  const provider = settings.provider || 'openrouter';
  const openrouterKey = settings.providerApiKeys?.openrouter || '';
  const openaiKey = settings.providerApiKeys?.openai || '';
  const anthropicKey = settings.providerApiKeys?.anthropic || '';

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
          <h2>API Provider</h2>

          <label for="provider">Provider</label>
          <p class="settings-description">
            Select which AI provider to use for generation.
          </p>
          <select id="provider" name="provider">
            <option value="openrouter" ${provider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
            <option value="openai" ${provider === 'openai' ? 'selected' : ''}>OpenAI</option>
            <option value="anthropic" ${provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
          </select>

          <div id="api-key-openrouter" class="api-key-field ${provider !== 'openrouter' ? 'hidden' : ''}">
            <label for="openrouterApiKey">OpenRouter API Key</label>
            <p class="settings-description">
              Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>
            </p>
            <input
              type="password"
              id="openrouterApiKey"
              name="openrouterApiKey"
              value="${escapeHtml(openrouterKey)}"
              placeholder="sk-or-..."
              autocomplete="off"
            />
          </div>

          <div id="api-key-openai" class="api-key-field ${provider !== 'openai' ? 'hidden' : ''}">
            <label for="openaiApiKey">OpenAI API Key</label>
            <p class="settings-description">
              Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com</a>
            </p>
            <input
              type="password"
              id="openaiApiKey"
              name="openaiApiKey"
              value="${escapeHtml(openaiKey)}"
              placeholder="sk-..."
              autocomplete="off"
            />
          </div>

          <div id="api-key-anthropic" class="api-key-field ${provider !== 'anthropic' ? 'hidden' : ''}">
            <label for="anthropicApiKey">Anthropic API Key</label>
            <p class="settings-description">
              Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>
            </p>
            <input
              type="password"
              id="anthropicApiKey"
              name="anthropicApiKey"
              value="${escapeHtml(anthropicKey)}"
              placeholder="sk-ant-..."
              autocomplete="off"
            />
          </div>
        </div>

        <div class="settings-section">
          <h2>Model</h2>
          <label for="model">Model Name</label>
          <p class="settings-description" id="model-help">
            ${getModelHelpText(provider)}
          </p>
          <input
            type="text"
            id="model"
            name="model"
            value="${escapeHtml(settings.model || '')}"
            placeholder="${escapeHtml(getDefaultModel(provider))}"
          />

          <div class="settings-toggle" id="search-toggle" ${provider === 'anthropic' ? 'style="opacity: 0.5"' : ''}>
            <label class="toggle-label">
              <input
                type="checkbox"
                id="search-enabled"
                name="searchEnabled"
                ${settings.searchEnabled ? 'checked' : ''}
                ${provider === 'anthropic' ? 'disabled' : ''}
              />
              <span class="toggle-text">Enable web search</span>
            </label>
            <p class="settings-description" id="search-description">
              ${getSearchHelpText(provider)}
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

function getModelHelpText(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'Examples: <code>gpt-4o</code>, <code>gpt-4o-mini</code>, <code>o1</code>';
    case 'anthropic':
      return 'Examples: <code>claude-sonnet-4-20250514</code>, <code>claude-opus-4-20250514</code>';
    default:
      return 'Find model names at <a href="https://openrouter.ai/models" target="_blank" rel="noopener">openrouter.ai/models</a>. Examples: <code>anthropic/claude-sonnet-4</code>, <code>openai/gpt-4o</code>';
  }
}

function getSearchHelpText(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'Uses OpenAI search-enabled models for real-time information.';
    case 'anthropic':
      return 'Web search is not available for Anthropic models.';
    default:
      return 'When enabled, appends <code>:online</code> to the model ID for web search via OpenRouter.';
  }
}
