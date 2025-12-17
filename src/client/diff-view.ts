// Diff view module for showing edit changes with accept/reject UI
import htmldiffModule from 'htmldiff-js';

// htmldiff-js exports { default: { execute: fn } }
const htmldiff = htmldiffModule.default || htmldiffModule;

/**
 * Normalize HTML to avoid spurious diffs from:
 * - Quote/apostrophe variations (LLMs often return "smart quotes")
 * - Whitespace differences between server and browser HTML
 * - Self-closing tag differences
 */
function normalizeHtml(html: string): string {
  // Use a temporary element to decode all HTML entities and normalize structure
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Re-serialize to get consistent browser-normalized HTML
  let normalized = temp.innerHTML;

  return normalized
    // Normalize apostrophes and single quotes (Unicode curly to straight)
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    // Normalize double quotes (Unicode curly to straight)
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    // Normalize dashes (en-dash and em-dash to hyphen)
    .replace(/[\u2013\u2014]/g, '-')
    // Normalize ellipsis
    .replace(/\u2026/g, '...')
    // Normalize spaces (non-breaking, thin, etc.)
    .replace(/[\u00A0\u2009\u200A\u202F]/g, ' ')
    // Remove leading/trailing whitespace within tags
    .replace(/>\s+</g, '><')
    // Normalize multiple spaces to single space
    .replace(/\s{2,}/g, ' ')
    // Trim whitespace at start and end
    .trim();
}

export interface DiffReviewState {
  oldHtml: string;
  newHtml: string;
  newMarkdown: string;
  editPrompt: string;
  onAccept: () => Promise<void>;
  onReject: () => void;
}

let currentState: DiffReviewState | null = null;

/**
 * Show the diff review UI using htmldiff-js for proper HTML-aware diffing
 */
export function showDiffReview(state: DiffReviewState): void {
  currentState = state;

  const wikiContent = document.querySelector<HTMLElement>('.wiki-content');
  if (!wikiContent) return;

  // Store original content for reject
  const originalContent = wikiContent.innerHTML;

  // Normalize HTML to avoid spurious diffs from whitespace/typography variations
  const normalizedOldHtml = normalizeHtml(state.oldHtml);
  const normalizedNewHtml = normalizeHtml(state.newHtml);

  // Check if there are any meaningful changes (compare normalized text)
  const oldText = extractText(normalizedOldHtml);
  const newText = extractText(normalizedNewHtml);

  if (oldText === newText) {
    showNoChangesMessage(wikiContent, state.onReject);
    return;
  }

  // Use htmldiff-js to compute a proper HTML-aware diff
  const diffHtml = htmldiff.execute(normalizedOldHtml, normalizedNewHtml);

  // Show the diff result
  wikiContent.innerHTML = diffHtml;

  // Add review mode class to page
  document.body.classList.add('diff-review-mode');

  // Create and show toolbar
  const toolbar = createReviewToolbar(state, () => {
    // Reset on reject
    wikiContent.innerHTML = originalContent;
    document.body.classList.remove('diff-review-mode');
  });

  // Insert toolbar at the top of the page, before wiki content
  const contentContainer = wikiContent.closest('.page-content') || wikiContent.parentElement;
  if (contentContainer) {
    contentContainer.insertBefore(toolbar, contentContainer.firstChild);
  }

  // Add beforeunload warning
  window.addEventListener('beforeunload', handleBeforeUnload);
}

/**
 * Extract plain text from HTML for comparison
 */
function extractText(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return (temp.textContent || '').replace(/\s+/g, ' ').trim();
}

function showNoChangesMessage(container: HTMLElement, onDismiss: () => void): void {
  const message = document.createElement('div');
  message.className = 'diff-no-changes';
  message.innerHTML = `
    <p>No changes were made to the page.</p>
    <button class="btn btn-secondary" id="diff-dismiss">OK</button>
  `;

  const existingMessage = container.querySelector('.diff-no-changes');
  if (existingMessage) existingMessage.remove();

  container.insertBefore(message, container.firstChild);

  message.querySelector('#diff-dismiss')?.addEventListener('click', () => {
    message.remove();
    onDismiss();
  });
}

function createReviewToolbar(state: DiffReviewState, onCleanup: () => void): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'diff-review-toolbar';
  toolbar.id = 'diff-review-toolbar';

  toolbar.innerHTML = `
    <div class="diff-review-indicator"></div>
    <span class="diff-review-label">Review changes</span>
    <span class="diff-review-hint"><span class="hint-del">struck through</span> = removed, <span class="hint-ins">highlighted</span> = added</span>
    <button id="diff-reject">Reject</button>
    <button id="diff-accept">Accept</button>
  `;

  const rejectBtn = toolbar.querySelector('#diff-reject') as HTMLButtonElement;
  const acceptBtn = toolbar.querySelector('#diff-accept') as HTMLButtonElement;

  rejectBtn.addEventListener('click', () => {
    hideDiffReview();
    onCleanup();
    state.onReject();
  });

  acceptBtn.addEventListener('click', async () => {
    acceptBtn.disabled = true;
    rejectBtn.disabled = true;
    acceptBtn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
      await state.onAccept();
      // Remove beforeunload listener BEFORE reload to avoid the browser warning
      hideDiffReview();
      window.location.reload();
    } catch (error) {
      acceptBtn.disabled = false;
      rejectBtn.disabled = false;
      acceptBtn.textContent = 'Accept';
      alert('Failed to save: ' + (error as Error).message);
    }
  });

  return toolbar;
}

function handleBeforeUnload(e: BeforeUnloadEvent): void {
  if (currentState) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
  }
}

/**
 * Hide the diff review UI
 */
export function hideDiffReview(): void {
  currentState = null;
  document.body.classList.remove('diff-review-mode');

  const toolbar = document.getElementById('diff-review-toolbar');
  if (toolbar) toolbar.remove();

  window.removeEventListener('beforeunload', handleBeforeUnload);
}

/**
 * Check if we're currently in diff review mode
 */
export function isInDiffReview(): boolean {
  return currentState !== null;
}
