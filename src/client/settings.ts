import { isMac, getElement } from './utils.js';

const MODEL_HELP: Record<string, string> = {
  openrouter: 'Find model names at <a href="https://openrouter.ai/models" target="_blank" rel="noopener">openrouter.ai/models</a>. Examples: <code>anthropic/claude-sonnet-4</code>, <code>openai/gpt-4o</code>',
  openai: 'Examples: <code>gpt-4o</code>, <code>gpt-4o-mini</code>, <code>o1</code>',
  anthropic: 'Examples: <code>claude-sonnet-4-20250514</code>, <code>claude-opus-4-20250514</code>',
};

const SEARCH_HELP: Record<string, string> = {
  openrouter: 'When enabled, appends <code>:online</code> to the model ID for web search via OpenRouter.',
  openai: 'Uses OpenAI search-enabled models for real-time information.',
  anthropic: 'Web search is not available for Anthropic models.',
};

const DEFAULT_MODELS: Record<string, string> = {
  openrouter: 'anthropic/claude-sonnet-4',
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
};

export function initSettings(): void {
  const form = getElement<HTMLFormElement>('settings-form');
  if (!form) return; // Not on settings page

  const saveBtn = getElement<HTMLButtonElement>('save-btn');
  const saveStatus = getElement<HTMLSpanElement>('save-status');
  const textarea = getElement<HTMLTextAreaElement>('system-prompt');
  const providerSelect = document.getElementById('provider') as HTMLSelectElement | null;
  const modelInput = document.getElementById('model') as HTMLInputElement | null;
  const modelHelp = document.getElementById('model-help');
  const searchToggle = document.getElementById('search-toggle');
  const searchCheckbox = document.getElementById('search-enabled') as HTMLInputElement | null;
  const searchDescription = document.getElementById('search-description');

  if (!saveBtn || !saveStatus || !textarea) return;

  // Update UI based on selected provider
  function updateProviderUI() {
    const provider = providerSelect?.value || 'openrouter';

    // Show/hide API key fields
    document.querySelectorAll('.api-key-field').forEach(el => {
      (el as HTMLElement).classList.add('hidden');
    });
    document.getElementById(`api-key-${provider}`)?.classList.remove('hidden');

    // Update model help text
    if (modelHelp) {
      modelHelp.innerHTML = MODEL_HELP[provider] || MODEL_HELP.openrouter;
    }

    // Update model placeholder
    if (modelInput) {
      modelInput.placeholder = DEFAULT_MODELS[provider] || '';
    }

    // Update search toggle
    if (searchToggle && searchCheckbox && searchDescription) {
      if (provider === 'anthropic') {
        searchToggle.style.opacity = '0.5';
        searchCheckbox.disabled = true;
      } else {
        searchToggle.style.opacity = '1';
        searchCheckbox.disabled = false;
      }
      searchDescription.innerHTML = SEARCH_HELP[provider] || SEARCH_HELP.openrouter;
    }
  }

  // Set initial state
  updateProviderUI();

  // Listen for provider changes
  providerSelect?.addEventListener('change', updateProviderUI);

  // Cmd/Ctrl+Enter to submit
  textarea.addEventListener('keydown', (e) => {
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    if (modKey && e.key === 'Enter') {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';
    saveStatus.textContent = '';

    try {
      const formData = new FormData(form);
      const response = await fetch('/_settings', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        saveStatus.textContent = 'Saved!';
        saveStatus.className = 'save-status success';
      } else {
        saveStatus.textContent = 'Error: ' + (result.error || 'Failed to save');
        saveStatus.className = 'save-status error';
      }
    } catch (error) {
      saveStatus.textContent = 'Error: ' + (error as Error).message;
      saveStatus.className = 'save-status error';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';
    }
  });
}
