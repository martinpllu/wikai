import type { InlineComment } from './types.js';
import { isMac, getElement, escapeHtml, renderSimpleMarkdown, handleCmdEnter } from './utils.js';

interface SelectionContext {
  text: string;
  prefix: string;
  suffix: string;
}

export function initPage(): void {
  const pageDataEl = getElement<HTMLElement>('page-data');
  if (!pageDataEl) return; // Not on wiki page

  const slug = pageDataEl.dataset.slug!;
  const project = pageDataEl.dataset.project!;
  const inlineComments: InlineComment[] = JSON.parse(pageDataEl.dataset.inlineComments || '[]');

  // Handle dynamically created textareas (popovers, reply forms)
  document.addEventListener('keydown', (e) => {
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    const target = e.target as HTMLElement;
    if (modKey && e.key === 'Enter' && target.tagName === 'TEXTAREA') {
      const popoverTextarea = getElement<HTMLTextAreaElement>('popover-textarea');
      if (target === popoverTextarea) {
        e.preventDefault();
        const submitBtn = getElement<HTMLButtonElement>('popover-submit');
        const inlineSubmitBtn = document.querySelector<HTMLButtonElement>('.btn-submit-inline');
        if (submitBtn) submitBtn.click();
        else if (inlineSubmitBtn) inlineSubmitBtn.click();
      }
      // Reply form textareas
      const replyForm = target.closest('.reply-form');
      if (replyForm) {
        e.preventDefault();
        const submitBtn = replyForm.querySelector<HTMLButtonElement>('.btn-submit-reply');
        if (submitBtn) submitBtn.click();
      }
    }
  });

  // Tab Switching
  const tabs = document.querySelectorAll<HTMLElement>('.chat-tab');
  const tabContents: Record<string, HTMLElement | null> = {
    comment: getElement('tab-comment'),
    edit: getElement('tab-edit'),
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabName = tab.dataset.tab!;
      Object.keys(tabContents).forEach(key => {
        tabContents[key]?.classList.toggle('hidden', key !== tabName);
      });
    });
  });

  // Edit Form Submission
  const editForm = getElement<HTMLFormElement>('edit-form');
  const editTextarea = getElement<HTMLTextAreaElement>('edit-message');
  const editButton = getElement<HTMLButtonElement>('edit-submit');

  if (editForm && editTextarea && editButton) {
    editForm.addEventListener('submit', () => {
      editButton.disabled = true;
      editButton.innerHTML = '<span class="spinner"></span> Updating...';
    });

    handleCmdEnter(editTextarea, () => editForm.requestSubmit());
  }

  // Page Comment Form
  const commentForm = getElement<HTMLFormElement>('comment-form');
  const commentTextarea = getElement<HTMLTextAreaElement>('comment-message');
  const commentButton = getElement<HTMLButtonElement>('comment-submit');

  if (commentForm && commentTextarea && commentButton) {
    handleCmdEnter(commentTextarea, () => commentForm.requestSubmit());

    commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = commentTextarea.value.trim();
      if (!message) return;

      commentTextarea.disabled = true;
      commentButton.disabled = true;
      commentButton.innerHTML = '<span class="spinner"></span> Sending...';

      try {
        const formData = new FormData();
        formData.append('message', message);

        window.setCostLoading?.(true);
        const response = await fetch('/' + project + '/' + slug + '/comment', {
          method: 'POST',
          body: formData,
        });
        window.setCostLoading?.(false);

        const result = await response.json();
        if (result.success) {
          window.location.reload();
        } else {
          alert('Error: ' + result.error);
        }
      } catch (error) {
        window.setCostLoading?.(false);
        alert('Error: ' + (error as Error).message);
      } finally {
        commentTextarea.disabled = false;
        commentButton.disabled = false;
        commentButton.textContent = 'Ask';
      }
    });
  }

  // Reply and Resolve Buttons
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Reply button
    if (target.classList.contains('btn-reply')) {
      const threadId = target.dataset.threadId;
      const replyForm = document.querySelector<HTMLElement>('.reply-form[data-thread-id="' + threadId + '"]');
      if (replyForm) {
        replyForm.classList.remove('hidden');
        replyForm.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      }
    }

    // Cancel reply
    if (target.classList.contains('btn-cancel-reply')) {
      target.closest('.reply-form')?.classList.add('hidden');
    }

    // Submit reply
    if (target.classList.contains('btn-submit-reply')) {
      const threadId = target.dataset.threadId;
      const endpoint = target.dataset.endpoint;
      const replyForm = target.closest('.reply-form');
      const textarea = replyForm?.querySelector<HTMLTextAreaElement>('textarea');
      const message = textarea?.value.trim();

      if (!message) return;

      (target as HTMLButtonElement).disabled = true;
      target.innerHTML = '<span class="spinner"></span>';

      try {
        const formData = new FormData();
        formData.append('message', message);

        window.setCostLoading?.(true);
        const response = await fetch('/' + project + '/' + slug + '/' + endpoint + '/' + threadId + '/reply', {
          method: 'POST',
          body: formData,
        });
        window.setCostLoading?.(false);

        const result = await response.json();
        if (result.success) {
          window.location.reload();
        } else {
          alert('Error: ' + result.error);
        }
      } catch (error) {
        window.setCostLoading?.(false);
        alert('Error: ' + (error as Error).message);
      }
    }

    // Resolve/Unresolve
    if (target.classList.contains('btn-resolve')) {
      const threadId = target.dataset.threadId;
      const endpoint = target.dataset.endpoint;
      const isResolved = target.dataset.resolved === 'true';

      try {
        const formData = new FormData();
        formData.append('resolved', isResolved ? 'false' : 'true');

        const response = await fetch('/' + project + '/' + slug + '/' + endpoint + '/' + threadId + '/resolve', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (result.success) {
          window.location.reload();
        } else {
          alert('Error: ' + result.error);
        }
      } catch (error) {
        alert('Error: ' + (error as Error).message);
      }
    }
  });

  // Selection Toolbar
  const toolbarEl = getElement<HTMLElement>('selection-toolbar');
  const btnCommentEl = getElement<HTMLButtonElement>('btn-comment');
  const btnEditEl = getElement<HTMLButtonElement>('btn-edit');
  const wikiContentEl = getElement<HTMLElement>('wiki-content');

  if (!toolbarEl || !btnCommentEl || !btnEditEl || !wikiContentEl) return;

  // Store in const to avoid TypeScript null checks in nested functions
  const toolbar = toolbarEl;
  const btnComment = btnCommentEl;
  const btnEdit = btnEditEl;
  const wikiContent = wikiContentEl;

  let currentSelection: string | null = null;
  let currentRange: Range | null = null;

  function getSelectionContext(range: Range, charsBefore = 30, charsAfter = 30): SelectionContext {
    const text = range.toString();
    const container = range.commonAncestorContainer;
    const fullText = container.textContent || '';
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    let prefix = '';
    let suffix = '';

    if (container.nodeType === Node.TEXT_NODE) {
      const beforeStart = Math.max(0, startOffset - charsBefore);
      prefix = fullText.slice(beforeStart, startOffset);
      suffix = fullText.slice(endOffset, endOffset + charsAfter);
    }

    return { text, prefix, suffix };
  }

  document.addEventListener('mouseup', (e) => {
    // Don't show toolbar if clicking inside toolbar or popover
    if ((e.target as HTMLElement).closest('.selection-toolbar') || (e.target as HTMLElement).closest('.inline-popover')) {
      return;
    }

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 0 && selection && wikiContent.contains(selection.anchorNode)) {
      currentSelection = selectedText;
      currentRange = selection.getRangeAt(0).cloneRange();

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      toolbar.style.top = (window.scrollY + rect.top - 40) + 'px';
      toolbar.style.left = (window.scrollX + rect.left + rect.width / 2 - toolbar.offsetWidth / 2) + 'px';
      toolbar.classList.remove('hidden');
    } else {
      // Hide toolbar after small delay (allows clicking toolbar buttons)
      setTimeout(() => {
        if (!toolbar.matches(':hover')) {
          toolbar.classList.add('hidden');
        }
      }, 100);
    }
  });

  // Inline Popover
  const popoverEl = getElement<HTMLElement>('inline-popover');
  const popoverSelectionEl = getElement<HTMLElement>('popover-selection');
  const popoverBodyEl = getElement<HTMLElement>('popover-body');

  if (!popoverEl || !popoverSelectionEl || !popoverBodyEl) return;

  // Store in const to avoid TypeScript null checks in nested functions
  const popover = popoverEl;
  const popoverSelection = popoverSelectionEl;
  const popoverBody = popoverBodyEl;

  let popoverMode: 'comment' | 'edit' | 'view-inline' | null = null;

  function showPopover(mode: 'comment' | 'edit', rect: DOMRect): void {
    popoverMode = mode;
    const preview = currentSelection!.length > 100
      ? currentSelection!.slice(0, 100) + '...'
      : currentSelection;
    popoverSelection.textContent = '"' + preview + '"';

    if (mode === 'comment') {
      popoverBody.innerHTML = `
        <textarea id="popover-textarea" placeholder="Ask about this..." rows="3"></textarea>
        <div class="popover-buttons">
          <button class="btn-cancel" id="popover-cancel">Cancel</button>
          <button class="btn-submit" id="popover-submit">Ask</button>
        </div>
      `;
    } else {
      popoverBody.innerHTML = `
        <textarea id="popover-textarea" placeholder="What change would you like?" rows="3"></textarea>
        <div class="popover-buttons">
          <button class="btn-cancel" id="popover-cancel">Cancel</button>
          <button class="btn-submit" id="popover-submit">Apply</button>
        </div>
      `;
    }

    popover.style.top = (window.scrollY + rect.bottom + 10) + 'px';
    popover.style.left = (window.scrollX + rect.left) + 'px';
    popover.classList.remove('hidden');
    toolbar.classList.add('hidden');

    getElement<HTMLTextAreaElement>('popover-textarea')?.focus();
  }

  function hidePopover(): void {
    popover.classList.add('hidden');
    currentSelection = null;
    currentRange = null;
    popoverMode = null;
  }

  // Show thread in popover after comment is created
  function showThreadInPopover(thread: InlineComment, selectedText: string): void {
    const preview = selectedText.length > 100
      ? selectedText.slice(0, 100) + '...'
      : selectedText;
    popoverSelection.textContent = '"' + preview + '"';

    const messagesHtml = thread.messages.map(msg => `
      <div class="popover-message popover-message-${msg.role}">
        <strong>${msg.role === 'user' ? 'You' : 'AI'}:</strong>
        <span class="message-content">${msg.role === 'assistant' ? renderSimpleMarkdown(msg.content) : escapeHtml(msg.content)}</span>
      </div>
    `).join('');

    popoverBody.innerHTML = `
      <div class="popover-thread" id="popover-thread">
        ${messagesHtml}
      </div>
      <div class="popover-reply-form">
        <textarea id="popover-textarea" placeholder="Reply..." rows="2"></textarea>
        <div class="popover-buttons">
          <button class="btn-submit-inline" data-comment-id="${thread.id}">Reply</button>
        </div>
      </div>
    `;

    // Scroll to show AI response
    const threadEl = getElement<HTMLElement>('popover-thread');
    if (threadEl) {
      threadEl.scrollTop = threadEl.scrollHeight;
    }

    // Update inline comments data for future interactions
    inlineComments.push(thread);
    popoverMode = 'view-inline';
  }

  btnComment.addEventListener('click', () => {
    if (!currentRange) return;
    const rect = currentRange.getBoundingClientRect();
    showPopover('comment', rect);
  });

  btnEdit.addEventListener('click', () => {
    if (!currentRange) return;
    const rect = currentRange.getBoundingClientRect();
    showPopover('edit', rect);
  });

  popoverBody.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    if (target.id === 'popover-cancel') {
      hidePopover();
    }

    if (target.id === 'popover-submit') {
      const textarea = getElement<HTMLTextAreaElement>('popover-textarea');
      const message = textarea?.value.trim();
      if (!message || !currentSelection) return;

      (target as HTMLButtonElement).disabled = true;
      target.innerHTML = '<span class="spinner"></span>';

      try {
        const context = getSelectionContext(currentRange!);

        if (popoverMode === 'comment') {
          try {
            // Show loading state in popover
            const userMessage = message;
            popoverBody.innerHTML = `
              <div class="popover-thread">
                <div class="popover-message popover-message-user">
                  <strong>You:</strong> ${escapeHtml(userMessage)}
                </div>
                <div class="popover-message popover-message-assistant loading">
                  <strong>AI:</strong> <span class="spinner"></span> Thinking...
                </div>
              </div>
            `;

            const formData = new FormData();
            formData.append('message', message);
            formData.append('text', context.text);
            formData.append('prefix', context.prefix);
            formData.append('suffix', context.suffix);

            window.setCostLoading?.(true);
            const response = await fetch('/' + project + '/' + slug + '/inline', {
              method: 'POST',
              body: formData,
            });
            window.setCostLoading?.(false);

            const result = await response.json();

            if (result.success && result.thread) {
              // Show the thread with AI response in popover
              showThreadInPopover(result.thread, context.text);

              // Add highlight to the page (without reload)
              const range = currentRange;
              if (range) {
                const mark = document.createElement('mark');
                mark.className = 'inline-comment';
                mark.dataset.commentId = result.thread.id;
                try {
                  range.surroundContents(mark);
                } catch {
                  // surroundContents fails if selection spans multiple elements
                  // In that case, just reload
                  window.location.reload();
                }
              }
            } else {
              alert('Error: ' + (result.error || 'Unknown error'));
              hidePopover();
            }
          } catch (innerError) {
            console.error('Error in comment flow:', innerError);
            alert('Error: ' + (innerError as Error).message);
          }
        } else {
          // Inline edit - streaming
          popoverBody.innerHTML = '<div class="edit-streaming"><div class="spinner"></div> Editing...</div>';

          const formData = new FormData();
          formData.append('instruction', message);
          formData.append('text', context.text);

          window.setCostLoading?.(true);
          const response = await fetch('/' + project + '/' + slug + '/inline-edit', {
            method: 'POST',
            body: formData,
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
                  if (data.success) {
                    window.setCostLoading?.(false);
                    window.location.reload();
                  }
                  if (data.message) {
                    window.setCostLoading?.(false);
                    alert('Error: ' + data.message);
                    hidePopover();
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }
        }
      } catch (error) {
        window.setCostLoading?.(false);
        alert('Error: ' + (error as Error).message);
        hidePopover();
      }
    }
  });

  // Close popover when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (!popover.classList.contains('hidden') &&
        !popover.contains(e.target as Node) &&
        !toolbar.contains(e.target as Node)) {
      hidePopover();
    }
  });

  // Inline Comment Highlights - Click to View
  wikiContent.addEventListener('click', (e) => {
    const highlight = (e.target as HTMLElement).closest<HTMLElement>('.inline-comment');
    if (!highlight) return;

    const commentId = highlight.dataset.commentId;
    const comment = inlineComments.find(c => c.id === commentId);
    if (!comment) return;

    // Show comment popover
    currentSelection = comment.anchor.text;
    const rect = highlight.getBoundingClientRect();

    popoverSelection.textContent = '"' + (comment.anchor.text.length > 100
      ? comment.anchor.text.slice(0, 100) + '...'
      : comment.anchor.text) + '"';

    const messagesHtml = comment.messages.map(msg => `
      <div class="popover-message popover-message-${msg.role}">
        <strong>${msg.role === 'user' ? 'You' : 'AI'}:</strong>
        <span class="message-content">${msg.role === 'assistant' ? renderSimpleMarkdown(msg.content) : escapeHtml(msg.content)}</span>
      </div>
    `).join('');

    popoverBody.innerHTML = `
      <div class="popover-thread" id="popover-thread">
        ${messagesHtml}
      </div>
      <div class="popover-reply-form">
        <textarea id="popover-textarea" placeholder="Reply..." rows="2"></textarea>
        <div class="popover-buttons">
          <button class="btn-submit-inline" data-comment-id="${commentId}">Reply</button>
        </div>
      </div>
    `;

    popover.style.top = (window.scrollY + rect.bottom + 10) + 'px';
    popover.style.left = (window.scrollX + rect.left) + 'px';
    popover.classList.remove('hidden');

    // Scroll thread to bottom to show latest
    const threadEl = getElement<HTMLElement>('popover-thread');
    if (threadEl) {
      threadEl.scrollTop = threadEl.scrollHeight;
    }

    popoverMode = 'view-inline';
  });

  popoverBody.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Submit inline reply
    if (target.classList.contains('btn-submit-inline')) {
      const commentId = target.dataset.commentId;
      const textarea = getElement<HTMLTextAreaElement>('popover-textarea');
      const message = textarea?.value.trim();
      if (!message) return;

      (target as HTMLButtonElement).disabled = true;
      target.innerHTML = '<span class="spinner"></span>';

      // Show loading state for AI response
      const threadEl = getElement<HTMLElement>('popover-thread');
      if (threadEl) {
        threadEl.innerHTML += `
          <div class="popover-message popover-message-user">
            <strong>You:</strong>
            <span class="message-content">${escapeHtml(message)}</span>
          </div>
          <div class="popover-message popover-message-assistant loading">
            <strong>AI:</strong> <span class="spinner"></span> Thinking...
          </div>
        `;
        threadEl.scrollTop = threadEl.scrollHeight;
      }
      if (textarea) textarea.value = '';

      try {
        const formData = new FormData();
        formData.append('message', message);

        window.setCostLoading?.(true);
        const response = await fetch('/' + project + '/' + slug + '/inline/' + commentId + '/reply', {
          method: 'POST',
          body: formData,
        });
        window.setCostLoading?.(false);

        const result = await response.json();
        if (result.success && result.thread) {
          // Update the thread display with the new messages
          const comment = inlineComments.find(c => c.id === commentId);
          if (comment) {
            comment.messages = result.thread.messages;
          }

          // Re-render the thread
          const messagesHtml = result.thread.messages.map((msg: { role: string; content: string }) => `
            <div class="popover-message popover-message-${msg.role}">
              <strong>${msg.role === 'user' ? 'You' : 'AI'}:</strong>
              <span class="message-content">${msg.role === 'assistant' ? renderSimpleMarkdown(msg.content) : escapeHtml(msg.content)}</span>
            </div>
          `).join('');

          if (threadEl) {
            threadEl.innerHTML = messagesHtml;
            threadEl.scrollTop = threadEl.scrollHeight;
          }

          (target as HTMLButtonElement).disabled = false;
          target.textContent = 'Reply';
        } else {
          alert('Error: ' + (result.error || 'Unknown error'));
          window.location.reload();
        }
      } catch (error) {
        window.setCostLoading?.(false);
        alert('Error: ' + (error as Error).message);
        window.location.reload();
      }
    }
  });

  // Version History
  const versionListEl = getElement<HTMLElement>('version-list');
  const previewModalEl = getElement<HTMLElement>('version-preview-modal');
  const previewContentEl = getElement<HTMLElement>('preview-content');
  const previewVersionNumEl = getElement<HTMLElement>('preview-version-num');
  const previewRevertBtnEl = getElement<HTMLButtonElement>('preview-revert');
  const showAllCheckboxEl = getElement<HTMLInputElement>('show-all-versions');

  if (!versionListEl || !previewModalEl || !previewContentEl || !previewVersionNumEl || !previewRevertBtnEl || !showAllCheckboxEl) return;

  // Store in const to avoid TypeScript null checks in nested functions
  const versionList = versionListEl;
  const previewModal = previewModalEl;
  const previewContent = previewContentEl;
  const previewVersionNum = previewVersionNumEl;
  const previewRevertBtn = previewRevertBtnEl;
  const showAllCheckbox = showAllCheckboxEl;

  let currentVersionNum = 1;
  let showAllVersions = false;

  function formatVersionTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  async function loadVersionHistory(): Promise<void> {
    try {
      const url = showAllVersions
        ? '/' + project + '/' + slug + '/history?all=true'
        : '/' + project + '/' + slug + '/history';
      const response = await fetch(url);
      const data = await response.json();

      if (!data.versions || data.versions.length === 0) {
        versionList.innerHTML = '<p class="no-versions">No version history yet.</p>';
        return;
      }

      currentVersionNum = data.currentVersion;

      const versionsHtml = data.versions.map((v: { version: number; supersededAt?: string; editPrompt?: string; timestamp: string }) => {
        const isCurrent = v.version === currentVersionNum;
        const isSuperseded = !!v.supersededAt;
        const promptPreview = v.editPrompt
          ? escapeHtml(v.editPrompt.slice(0, 60)) + (v.editPrompt.length > 60 ? '...' : '')
          : '(Initial generation)';

        const classes = ['version-item'];
        if (isCurrent) classes.push('version-current');
        if (isSuperseded) classes.push('version-superseded');

        return `
          <div class="${classes.join(' ')}" data-version="${v.version}">
            <div class="version-header">
              <span class="version-number">v${v.version}</span>
              <span class="version-timestamp">${formatVersionTimestamp(v.timestamp)}</span>
              ${isCurrent ? '<span class="version-badge">Current</span>' : ''}
              ${isSuperseded ? '<span class="version-badge version-badge-superseded">Reverted</span>' : ''}
            </div>
            <div class="version-prompt">${promptPreview}</div>
            <div class="version-actions">
              <button class="btn-preview-version" data-version="${v.version}">Preview</button>
              ${!isCurrent ? `<button class="btn-revert-version" data-version="${v.version}">${isSuperseded ? 'Restore' : 'Revert'}</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      versionList.innerHTML = versionsHtml;
    } catch (error) {
      versionList.innerHTML = '<p class="error">Failed to load version history</p>';
      console.error('Failed to load version history:', error);
    }
  }

  showAllCheckbox.addEventListener('change', (e) => {
    showAllVersions = (e.target as HTMLInputElement).checked;
    loadVersionHistory();
  });

  async function previewVersion(versionNum: number): Promise<void> {
    try {
      const response = await fetch('/' + project + '/' + slug + '/version/' + versionNum);
      const data = await response.json();

      previewVersionNum.textContent = String(versionNum);
      previewContent.innerHTML = data.html;
      previewRevertBtn.dataset.version = String(versionNum);

      // Hide revert button if this is the current version
      previewRevertBtn.style.display = versionNum === currentVersionNum ? 'none' : 'inline-block';

      previewModal.classList.remove('hidden');
    } catch (error) {
      alert('Failed to load version preview');
      console.error('Failed to load version:', error);
    }
  }

  async function revertToVersion(versionNum: number): Promise<void> {
    if (!confirm('Revert to version ' + versionNum + '? Later versions will be hidden but can be recovered.')) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append('version', String(versionNum));

      const response = await fetch('/' + project + '/' + slug + '/revert', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        window.location.reload();
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      alert('Error reverting: ' + (error as Error).message);
    }
  }

  function hidePreviewModal(): void {
    previewModal.classList.add('hidden');
  }

  // Event listeners for version history
  versionList.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    if (target.classList.contains('btn-preview-version')) {
      previewVersion(parseInt(target.dataset.version!));
    }
    if (target.classList.contains('btn-revert-version')) {
      revertToVersion(parseInt(target.dataset.version!));
    }
  });

  // Modal event listeners
  getElement('modal-close')?.addEventListener('click', hidePreviewModal);
  getElement('preview-cancel')?.addEventListener('click', hidePreviewModal);
  getElement('modal-backdrop')?.addEventListener('click', hidePreviewModal);
  previewRevertBtn.addEventListener('click', () => {
    revertToVersion(parseInt(previewRevertBtn.dataset.version!));
  });

  // Load version history on page load
  loadVersionHistory();

  // Delete Page
  const deleteBtn = getElement<HTMLButtonElement>('btn-delete-page');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const confirmed = confirm(
        'Are you sure you want to delete this page?\n\n' +
        'This will permanently delete:\n' +
        '- All page content\n' +
        '- All comments\n' +
        '- All version history\n\n' +
        'This action cannot be undone.'
      );

      if (!confirmed) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';

      try {
        const response = await fetch('/' + project + '/' + slug + '/delete', {
          method: 'POST',
        });

        const result = await response.json();
        if (result.success) {
          window.location.href = '/' + project;
        } else {
          alert('Error: ' + (result.error || 'Failed to delete page'));
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Delete Page';
        }
      } catch (error) {
        alert('Error: ' + (error as Error).message);
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete Page';
      }
    });
  }
}
