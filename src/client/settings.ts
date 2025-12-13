import { isMac, getElement } from './utils.js';

export function initSettings(): void {
  const form = getElement<HTMLFormElement>('settings-form');
  if (!form) return; // Not on settings page

  const saveBtn = getElement<HTMLButtonElement>('save-btn');
  const saveStatus = getElement<HTMLSpanElement>('save-status');
  const textarea = getElement<HTMLTextAreaElement>('system-prompt');

  if (!saveBtn || !saveStatus || !textarea) return;

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
