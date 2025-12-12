import { layout } from './layout.js';
import type { PageInfo, PageData, CommentThread, InlineComment } from '../wiki.js';
import { injectInlineHighlights } from '../wiki.js';

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSimpleMarkdown(text: string): string {
  let s = escapeHtml(text);
  // Bold: **text** or __text__
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic: *text* or _text_
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/_(.+?)_/g, '<em>$1</em>');
  // Code: `text`
  s = s.replace(/`(.+?)`/g, '<code>$1</code>');
  // Line breaks
  s = s.replace(/\n/g, '<br>');
  return s;
}

function renderCommentThread(thread: CommentThread, _slug: string, isInline: boolean = false): string {
  const messages = thread.messages.map(msg => `
    <div class="comment-message comment-message-${msg.role}">
      <span class="comment-role">${msg.role === 'user' ? 'You' : 'AI'}:</span>
      <span class="comment-content">${msg.role === 'assistant' ? renderSimpleMarkdown(msg.content) : escapeHtml(msg.content)}</span>
      <span class="comment-timestamp">${formatTimestamp(msg.timestamp)}</span>
    </div>
  `).join('');

  const resolvedClass = thread.resolved ? ' comment-thread-resolved' : '';
  const endpoint = isInline ? 'inline' : 'comment';

  return `
    <div class="comment-thread${resolvedClass}" data-thread-id="${thread.id}">
      ${messages}
      <div class="comment-actions">
        <button class="btn-reply" data-thread-id="${thread.id}" data-endpoint="${endpoint}">Reply</button>
        <button class="btn-resolve" data-thread-id="${thread.id}" data-endpoint="${endpoint}" data-resolved="${thread.resolved}">
          ${thread.resolved ? 'Unresolve' : 'Resolve'}
        </button>
      </div>
      <div class="reply-form hidden" data-thread-id="${thread.id}">
        <textarea placeholder="Reply..." rows="2"></textarea>
        <div class="reply-buttons">
          <button class="btn-cancel-reply">Cancel</button>
          <button class="btn-submit-reply" data-thread-id="${thread.id}" data-endpoint="${endpoint}">Send</button>
        </div>
      </div>
    </div>
  `;
}

function renderPageComments(comments: CommentThread[], slug: string): string {
  if (comments.length === 0) {
    return '';
  }

  return comments.map(thread => renderCommentThread(thread, slug, false)).join('');
}

function renderOrphanedComments(orphanedIds: string[], inlineComments: InlineComment[], slug: string): string {
  const orphaned = inlineComments.filter(c => orphanedIds.includes(c.id));
  if (orphaned.length === 0) return '';

  const threads = orphaned.map(thread => `
    <div class="orphaned-comment">
      <div class="orphaned-context">
        <em>Original text: "${escapeHtml(thread.anchor.text.slice(0, 100))}${thread.anchor.text.length > 100 ? '...' : ''}"</em>
      </div>
      ${renderCommentThread(thread, slug, true)}
    </div>
  `).join('');

  return `
    <div class="orphaned-comments">
      <h4>Orphaned Comments</h4>
      <p class="orphaned-note">These comments reference text that has been edited or removed.</p>
      ${threads}
    </div>
  `;
}

export function wikiPage(
  slug: string,
  title: string,
  htmlContent: string,
  pageData: PageData,
  pages: PageInfo[] = [],
  project: string = 'default',
  projects: string[] = ['default']
): string {
  // Inject inline comment highlights into the HTML
  const { html: contentWithHighlights, orphanedIds } = injectInlineHighlights(
    htmlContent,
    pageData.inlineComments
  );

  // Prepare inline comments data for client-side JS
  const inlineCommentsJson = JSON.stringify(pageData.inlineComments);

  return layout({
    title,
    pages,
    currentSlug: slug,
    project,
    projects,
    content: `
    <article class="wiki-page">
      <div class="wiki-content" id="wiki-content">
        ${contentWithHighlights}
      </div>
    </article>

    <!-- Selection Toolbar (hidden by default) -->
    <div class="selection-toolbar hidden" id="selection-toolbar">
      <button class="toolbar-btn" id="btn-comment" title="Add comment">
        <span class="toolbar-icon">💬</span> Ask
      </button>
      <button class="toolbar-btn" id="btn-edit" title="Edit selection">
        <span class="toolbar-icon">✏️</span> Edit
      </button>
    </div>

    <!-- Inline Popover (hidden by default) -->
    <div class="inline-popover hidden" id="inline-popover">
      <div class="popover-header">
        <span class="popover-selection" id="popover-selection"></span>
      </div>
      <div class="popover-body" id="popover-body">
        <!-- Content changes based on mode -->
      </div>
    </div>

    <section class="chat-section">
      <!-- Tab Toggle -->
      <div class="chat-tabs">
        <button class="chat-tab active" data-tab="comment">Ask</button>
        <button class="chat-tab" data-tab="edit">Edit</button>
      </div>

      <!-- Comment Tab Content -->
      <div class="chat-tab-content" id="tab-comment">
        <div class="page-comments" id="page-comments">
          ${renderPageComments(pageData.pageComments, slug)}
        </div>
        ${renderOrphanedComments(orphanedIds, pageData.inlineComments, slug)}
        <form class="comment-form" id="comment-form">
          <textarea
            name="message"
            id="comment-message"
            placeholder="Ask a question about this page..."
            rows="3"
            required
          ></textarea>
          <button type="submit" id="comment-submit">Ask</button>
        </form>
      </div>

      <!-- Edit Tab Content -->
      <div class="chat-tab-content hidden" id="tab-edit">
        <form action="/p/${project}/wiki/${slug}/chat" method="POST" class="chat-form" id="edit-form">
          <textarea
            name="message"
            id="edit-message"
            placeholder="Give instructions to edit the page..."
            rows="3"
            required
          ></textarea>
          <button type="submit" id="edit-submit">Apply Edit</button>
        </form>

        <!-- Version History -->
        <div class="version-history" id="version-history">
          <div class="version-history-header">
            <h4>Version History</h4>
            <label class="show-all-toggle">
              <input type="checkbox" id="show-all-versions" />
              <span>Show reverted</span>
            </label>
          </div>
          <div class="version-list" id="version-list">
            <p class="loading-versions"><span class="spinner"></span> Loading versions...</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Version Preview Modal -->
    <div class="version-preview-modal hidden" id="version-preview-modal">
      <div class="modal-backdrop" id="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3>Version <span id="preview-version-num"></span></h3>
          <button class="modal-close" id="modal-close">&times;</button>
        </div>
        <div class="modal-body wiki-content" id="preview-content"></div>
        <div class="modal-footer">
          <button class="btn-cancel" id="preview-cancel">Cancel</button>
          <button class="btn-revert" id="preview-revert">Revert to this version</button>
        </div>
      </div>
    </div>

    <!-- Delete Page Section -->
    <section class="danger-zone">
      <button class="btn-delete-page" id="btn-delete-page">Delete Page</button>
    </section>

    <script>
      (function() {
        const slug = ${JSON.stringify(slug)};
        const project = ${JSON.stringify(project)};
        const inlineComments = ${inlineCommentsJson};

        // ============================================
        // Cmd/Ctrl+Enter to Submit
        // ============================================
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

        function handleCmdEnter(textarea, submitFn) {
          textarea.addEventListener('keydown', (e) => {
            const modKey = isMac ? e.metaKey : e.ctrlKey;
            if (modKey && e.key === 'Enter') {
              e.preventDefault();
              submitFn();
            }
          });
        }

        // Also handle dynamically created textareas (popovers, reply forms)
        document.addEventListener('keydown', (e) => {
          const modKey = isMac ? e.metaKey : e.ctrlKey;
          if (modKey && e.key === 'Enter' && e.target.tagName === 'TEXTAREA') {
            const popoverTextarea = document.getElementById('popover-textarea');
            if (e.target === popoverTextarea) {
              e.preventDefault();
              const submitBtn = document.getElementById('popover-submit');
              const inlineSubmitBtn = document.querySelector('.btn-submit-inline');
              if (submitBtn) submitBtn.click();
              else if (inlineSubmitBtn) inlineSubmitBtn.click();
            }
            // Reply form textareas
            const replyForm = e.target.closest('.reply-form');
            if (replyForm) {
              e.preventDefault();
              const submitBtn = replyForm.querySelector('.btn-submit-reply');
              if (submitBtn) submitBtn.click();
            }
          }
        });

        // ============================================
        // Tab Switching
        // ============================================
        const tabs = document.querySelectorAll('.chat-tab');
        const tabContents = {
          comment: document.getElementById('tab-comment'),
          edit: document.getElementById('tab-edit'),
        };

        tabs.forEach(tab => {
          tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const tabName = tab.dataset.tab;
            Object.keys(tabContents).forEach(key => {
              tabContents[key].classList.toggle('hidden', key !== tabName);
            });
          });
        });

        // ============================================
        // Edit Form Submission
        // ============================================
        const editForm = document.getElementById('edit-form');
        const editTextarea = document.getElementById('edit-message');
        const editButton = document.getElementById('edit-submit');

        editForm.addEventListener('submit', () => {
          // Only disable the button, not the textarea (disabled fields don't submit)
          editButton.disabled = true;
          editButton.innerHTML = '<span class="spinner"></span> Updating...';
        });

        // Cmd/Ctrl+Enter to submit edit form
        handleCmdEnter(editTextarea, () => editForm.requestSubmit());

        // ============================================
        // Page Comment Form
        // ============================================
        const commentForm = document.getElementById('comment-form');
        const commentTextarea = document.getElementById('comment-message');
        const commentButton = document.getElementById('comment-submit');
        const pageCommentsContainer = document.getElementById('page-comments');

        // Cmd/Ctrl+Enter to submit comment form
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

            if (window.setCostLoading) window.setCostLoading(true);
            const response = await fetch('/p/' + project + '/wiki/' + slug + '/comment', {
              method: 'POST',
              body: formData,
            });
            if (window.setCostLoading) window.setCostLoading(false);

            const result = await response.json();
            if (result.success) {
              // Reload to show new comment
              window.location.reload();
            } else {
              alert('Error: ' + result.error);
            }
          } catch (error) {
            if (window.setCostLoading) window.setCostLoading(false);
            alert('Error: ' + error.message);
          } finally {
            commentTextarea.disabled = false;
            commentButton.disabled = false;
            commentButton.textContent = 'Ask';
          }
        });

        // ============================================
        // Reply and Resolve Buttons
        // ============================================
        document.addEventListener('click', async (e) => {
          const target = e.target;

          // Reply button
          if (target.classList.contains('btn-reply')) {
            const threadId = target.dataset.threadId;
            const replyForm = document.querySelector('.reply-form[data-thread-id="' + threadId + '"]');
            replyForm.classList.remove('hidden');
            replyForm.querySelector('textarea').focus();
          }

          // Cancel reply
          if (target.classList.contains('btn-cancel-reply')) {
            target.closest('.reply-form').classList.add('hidden');
          }

          // Submit reply
          if (target.classList.contains('btn-submit-reply')) {
            const threadId = target.dataset.threadId;
            const endpoint = target.dataset.endpoint;
            const replyForm = target.closest('.reply-form');
            const textarea = replyForm.querySelector('textarea');
            const message = textarea.value.trim();

            if (!message) return;

            target.disabled = true;
            target.innerHTML = '<span class="spinner"></span>';

            try {
              const formData = new FormData();
              formData.append('message', message);

              if (window.setCostLoading) window.setCostLoading(true);
              const response = await fetch('/p/' + project + '/wiki/' + slug + '/' + endpoint + '/' + threadId + '/reply', {
                method: 'POST',
                body: formData,
              });
              if (window.setCostLoading) window.setCostLoading(false);

              const result = await response.json();
              if (result.success) {
                window.location.reload();
              } else {
                alert('Error: ' + result.error);
              }
            } catch (error) {
              if (window.setCostLoading) window.setCostLoading(false);
              alert('Error: ' + error.message);
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

              const response = await fetch('/p/' + project + '/wiki/' + slug + '/' + endpoint + '/' + threadId + '/resolve', {
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
              alert('Error: ' + error.message);
            }
          }
        });

        // ============================================
        // Selection Toolbar
        // ============================================
        const toolbar = document.getElementById('selection-toolbar');
        const btnComment = document.getElementById('btn-comment');
        const btnEdit = document.getElementById('btn-edit');
        const wikiContent = document.getElementById('wiki-content');

        let currentSelection = null;
        let currentRange = null;

        function getSelectionContext(range, charsBefore = 30, charsAfter = 30) {
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
          if (e.target.closest('.selection-toolbar') || e.target.closest('.inline-popover')) {
            return;
          }

          const selection = window.getSelection();
          const selectedText = selection.toString().trim();

          if (selectedText.length > 0 && wikiContent.contains(selection.anchorNode)) {
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

        // ============================================
        // Inline Popover
        // ============================================
        const popover = document.getElementById('inline-popover');
        const popoverSelection = document.getElementById('popover-selection');
        const popoverBody = document.getElementById('popover-body');

        let popoverMode = null; // 'comment' or 'edit'

        function showPopover(mode, rect) {
          popoverMode = mode;
          const preview = currentSelection.length > 100
            ? currentSelection.slice(0, 100) + '...'
            : currentSelection;
          popoverSelection.textContent = '"' + preview + '"';

          if (mode === 'comment') {
            popoverBody.innerHTML = \`
              <textarea id="popover-textarea" placeholder="Ask about this..." rows="3"></textarea>
              <div class="popover-buttons">
                <button class="btn-cancel" id="popover-cancel">Cancel</button>
                <button class="btn-submit" id="popover-submit">Ask</button>
              </div>
            \`;
          } else {
            popoverBody.innerHTML = \`
              <textarea id="popover-textarea" placeholder="What change would you like?" rows="3"></textarea>
              <div class="popover-buttons">
                <button class="btn-cancel" id="popover-cancel">Cancel</button>
                <button class="btn-submit" id="popover-submit">Apply</button>
              </div>
            \`;
          }

          popover.style.top = (window.scrollY + rect.bottom + 10) + 'px';
          popover.style.left = (window.scrollX + rect.left) + 'px';
          popover.classList.remove('hidden');
          toolbar.classList.add('hidden');

          document.getElementById('popover-textarea').focus();
        }

        function hidePopover() {
          popover.classList.add('hidden');
          currentSelection = null;
          currentRange = null;
          popoverMode = null;
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

        // Escape HTML to prevent XSS
        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }

        // Simple markdown rendering for AI responses
        function renderSimpleMarkdown(text) {
          var s = escapeHtml(text);
          // Bold: **text** or __text__
          s = s.replace(new RegExp('\\\\*\\\\*(.+?)\\\\*\\\\*', 'g'), '<strong>$1</strong>');
          s = s.replace(new RegExp('__(.+?)__', 'g'), '<strong>$1</strong>');
          // Italic: *text* or _text_
          s = s.replace(new RegExp('\\\\*(.+?)\\\\*', 'g'), '<em>$1</em>');
          s = s.replace(new RegExp('_(.+?)_', 'g'), '<em>$1</em>');
          // Code: backticks
          s = s.replace(new RegExp('\`(.+?)\`', 'g'), '<code>$1</code>');
          // Line breaks
          s = s.replace(new RegExp('\\\\n', 'g'), '<br>');
          return s;
        }

        // Show thread in popover after comment is created
        function showThreadInPopover(thread, selectedText) {
          const preview = selectedText.length > 100
            ? selectedText.slice(0, 100) + '...'
            : selectedText;
          popoverSelection.textContent = '"' + preview + '"';

          const messagesHtml = thread.messages.map(msg => \`
            <div class="popover-message popover-message-\${msg.role}">
              <strong>\${msg.role === 'user' ? 'You' : 'AI'}:</strong>
              <span class="message-content">\${msg.role === 'assistant' ? renderSimpleMarkdown(msg.content) : escapeHtml(msg.content)}</span>
            </div>
          \`).join('');

          popoverBody.innerHTML = \`
            <div class="popover-thread" id="popover-thread">
              \${messagesHtml}
            </div>
            <div class="popover-reply-form">
              <textarea id="popover-textarea" placeholder="Reply..." rows="2"></textarea>
              <div class="popover-buttons">
                <button class="btn-submit-inline" data-comment-id="\${thread.id}">Reply</button>
              </div>
            </div>
          \`;

          // Scroll to show AI response
          const threadEl = document.getElementById('popover-thread');
          if (threadEl) {
            threadEl.scrollTop = threadEl.scrollHeight;
          }

          // Update inline comments data for future interactions
          inlineComments.push(thread);
          popoverMode = 'view-inline';
        }

        popoverBody.addEventListener('click', async (e) => {
          const target = e.target;

          if (target.id === 'popover-cancel') {
            hidePopover();
          }

          if (target.id === 'popover-submit') {
            const textarea = document.getElementById('popover-textarea');
            const message = textarea.value.trim();
            if (!message || !currentSelection) return;

            target.disabled = true;
            target.innerHTML = '<span class="spinner"></span>';

            try {
              const context = getSelectionContext(currentRange);

              if (popoverMode === 'comment') {
                try {
                  // Show loading state in popover
                  const userMessage = message;
                  console.log('Showing loading state...');
                  popoverBody.innerHTML = \`
                    <div class="popover-thread">
                      <div class="popover-message popover-message-user">
                        <strong>You:</strong> \${escapeHtml(userMessage)}
                      </div>
                      <div class="popover-message popover-message-assistant loading">
                        <strong>AI:</strong> <span class="spinner"></span> Thinking...
                      </div>
                    </div>
                  \`;

                  console.log('Sending request...');
                  const formData = new FormData();
                  formData.append('message', message);
                  formData.append('text', context.text);
                  formData.append('prefix', context.prefix);
                  formData.append('suffix', context.suffix);

                  if (window.setCostLoading) window.setCostLoading(true);
                  const response = await fetch('/p/' + project + '/wiki/' + slug + '/inline', {
                    method: 'POST',
                    body: formData,
                  });
                  if (window.setCostLoading) window.setCostLoading(false);

                  console.log('Got response, parsing JSON...');
                  const result = await response.json();
                  console.log('Result:', result);

                  if (result.success && result.thread) {
                    console.log('Calling showThreadInPopover...');
                    // Show the thread with AI response in popover
                    showThreadInPopover(result.thread, context.text);

                    // Add highlight to the page (without reload)
                    console.log('Adding highlight...');
                    const range = currentRange;
                    if (range) {
                      const mark = document.createElement('mark');
                      mark.className = 'inline-comment';
                      mark.dataset.commentId = result.thread.id;
                      try {
                        range.surroundContents(mark);
                      } catch (e) {
                        console.log('surroundContents failed, reloading', e);
                        // surroundContents fails if selection spans multiple elements
                        // In that case, just reload
                        window.location.reload();
                      }
                    }
                    console.log('Done!');
                  } else {
                    alert('Error: ' + (result.error || 'Unknown error'));
                    hidePopover();
                  }
                } catch (innerError) {
                  console.error('Inner error in comment flow:', innerError);
                  console.error('Stack:', innerError.stack);
                  alert('Error: ' + innerError.message);
                }
              } else {
                // Inline edit - streaming
                popoverBody.innerHTML = '<div class="edit-streaming"><div class="spinner"></div> Editing...</div>';

                const formData = new FormData();
                formData.append('instruction', message);
                formData.append('text', context.text);

                if (window.setCostLoading) window.setCostLoading(true);
                const response = await fetch('/p/' + project + '/wiki/' + slug + '/inline-edit', {
                  method: 'POST',
                  body: formData,
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
                        if (data.success) {
                          if (window.setCostLoading) window.setCostLoading(false);
                          window.location.reload();
                        }
                        if (data.message) {
                          if (window.setCostLoading) window.setCostLoading(false);
                          alert('Error: ' + data.message);
                          hidePopover();
                        }
                      } catch {}
                    }
                  }
                }
              }
            } catch (error) {
              if (window.setCostLoading) window.setCostLoading(false);
              alert('Error: ' + error.message);
              hidePopover();
            }
          }
        });

        // Close popover when clicking outside
        document.addEventListener('mousedown', (e) => {
          if (!popover.classList.contains('hidden') &&
              !popover.contains(e.target) &&
              !toolbar.contains(e.target)) {
            hidePopover();
          }
        });

        // ============================================
        // Inline Comment Highlights - Click to View
        // ============================================
        wikiContent.addEventListener('click', (e) => {
          const highlight = e.target.closest('.inline-comment');
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

          const messagesHtml = comment.messages.map(msg => \`
            <div class="popover-message popover-message-\${msg.role}">
              <strong>\${msg.role === 'user' ? 'You' : 'AI'}:</strong>
              <span class="message-content">\${msg.role === 'assistant' ? renderSimpleMarkdown(msg.content) : escapeHtml(msg.content)}</span>
            </div>
          \`).join('');

          popoverBody.innerHTML = \`
            <div class="popover-thread" id="popover-thread">
              \${messagesHtml}
            </div>
            <div class="popover-reply-form">
              <textarea id="popover-textarea" placeholder="Reply..." rows="2"></textarea>
              <div class="popover-buttons">
                <button class="btn-submit-inline" data-comment-id="\${commentId}">Reply</button>
              </div>
            </div>
          \`;

          popover.style.top = (window.scrollY + rect.bottom + 10) + 'px';
          popover.style.left = (window.scrollX + rect.left) + 'px';
          popover.classList.remove('hidden');

          // Scroll thread to bottom to show latest
          const threadEl = document.getElementById('popover-thread');
          if (threadEl) {
            threadEl.scrollTop = threadEl.scrollHeight;
          }

          popoverMode = 'view-inline';
        });

        popoverBody.addEventListener('click', async (e) => {
          const target = e.target;

          // Submit inline reply
          if (target.classList.contains('btn-submit-inline')) {
            const commentId = target.dataset.commentId;
            const textarea = document.getElementById('popover-textarea');
            const message = textarea.value.trim();
            if (!message) return;

            target.disabled = true;
            target.innerHTML = '<span class="spinner"></span>';

            // Show loading state for AI response
            const threadEl = document.getElementById('popover-thread');
            if (threadEl) {
              threadEl.innerHTML += \`
                <div class="popover-message popover-message-user">
                  <strong>You:</strong>
                  <span class="message-content">\${escapeHtml(message)}</span>
                </div>
                <div class="popover-message popover-message-assistant loading">
                  <strong>AI:</strong> <span class="spinner"></span> Thinking...
                </div>
              \`;
              threadEl.scrollTop = threadEl.scrollHeight;
            }
            textarea.value = '';

            try {
              const formData = new FormData();
              formData.append('message', message);

              if (window.setCostLoading) window.setCostLoading(true);
              const response = await fetch('/p/' + project + '/wiki/' + slug + '/inline/' + commentId + '/reply', {
                method: 'POST',
                body: formData,
              });
              if (window.setCostLoading) window.setCostLoading(false);

              const result = await response.json();
              if (result.success && result.thread) {
                // Update the thread display with the new messages
                const comment = inlineComments.find(c => c.id === commentId);
                if (comment) {
                  comment.messages = result.thread.messages;
                }

                // Re-render the thread
                const messagesHtml = result.thread.messages.map(msg => \`
                  <div class="popover-message popover-message-\${msg.role}">
                    <strong>\${msg.role === 'user' ? 'You' : 'AI'}:</strong>
                    <span class="message-content">\${msg.role === 'assistant' ? renderSimpleMarkdown(msg.content) : escapeHtml(msg.content)}</span>
                  </div>
                \`).join('');

                if (threadEl) {
                  threadEl.innerHTML = messagesHtml;
                  threadEl.scrollTop = threadEl.scrollHeight;
                }

                target.disabled = false;
                target.textContent = 'Reply';
              } else {
                alert('Error: ' + (result.error || 'Unknown error'));
                window.location.reload();
              }
            } catch (error) {
              if (window.setCostLoading) window.setCostLoading(false);
              alert('Error: ' + error.message);
              window.location.reload();
            }
          }
        });

        // ============================================
        // Version History
        // ============================================
        const versionList = document.getElementById('version-list');
        const previewModal = document.getElementById('version-preview-modal');
        const previewContent = document.getElementById('preview-content');
        const previewVersionNum = document.getElementById('preview-version-num');
        const previewRevertBtn = document.getElementById('preview-revert');
        const showAllCheckbox = document.getElementById('show-all-versions');

        let currentVersionNum = 1;
        let showAllVersions = false;

        function formatVersionTimestamp(isoString) {
          const date = new Date(isoString);
          return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
        }

        async function loadVersionHistory() {
          try {
            const url = showAllVersions
              ? '/p/' + project + '/wiki/' + slug + '/history?all=true'
              : '/p/' + project + '/wiki/' + slug + '/history';
            const response = await fetch(url);
            const data = await response.json();

            if (!data.versions || data.versions.length === 0) {
              versionList.innerHTML = '<p class="no-versions">No version history yet.</p>';
              return;
            }

            currentVersionNum = data.currentVersion;

            const versionsHtml = data.versions.map(v => {
              const isCurrent = v.version === currentVersionNum;
              const isSuperseded = !!v.supersededAt;
              const promptPreview = v.editPrompt
                ? escapeHtml(v.editPrompt.slice(0, 60)) + (v.editPrompt.length > 60 ? '...' : '')
                : '(Initial generation)';

              const classes = ['version-item'];
              if (isCurrent) classes.push('version-current');
              if (isSuperseded) classes.push('version-superseded');

              return \`
                <div class="\${classes.join(' ')}" data-version="\${v.version}">
                  <div class="version-header">
                    <span class="version-number">v\${v.version}</span>
                    <span class="version-timestamp">\${formatVersionTimestamp(v.timestamp)}</span>
                    \${isCurrent ? '<span class="version-badge">Current</span>' : ''}
                    \${isSuperseded ? '<span class="version-badge version-badge-superseded">Reverted</span>' : ''}
                  </div>
                  <div class="version-prompt">\${promptPreview}</div>
                  <div class="version-actions">
                    <button class="btn-preview-version" data-version="\${v.version}">Preview</button>
                    \${!isCurrent ? \`<button class="btn-revert-version" data-version="\${v.version}">\${isSuperseded ? 'Restore' : 'Revert'}</button>\` : ''}
                  </div>
                </div>
              \`;
            }).join('');

            versionList.innerHTML = versionsHtml;
          } catch (error) {
            versionList.innerHTML = '<p class="error">Failed to load version history</p>';
            console.error('Failed to load version history:', error);
          }
        }

        showAllCheckbox.addEventListener('change', (e) => {
          showAllVersions = e.target.checked;
          loadVersionHistory();
        });

        async function previewVersion(versionNum) {
          try {
            const response = await fetch('/p/' + project + '/wiki/' + slug + '/version/' + versionNum);
            const data = await response.json();

            previewVersionNum.textContent = versionNum;
            previewContent.innerHTML = data.html;
            previewRevertBtn.dataset.version = versionNum;

            // Hide revert button if this is the current version
            previewRevertBtn.style.display = versionNum === currentVersionNum ? 'none' : 'inline-block';

            previewModal.classList.remove('hidden');
          } catch (error) {
            alert('Failed to load version preview');
            console.error('Failed to load version:', error);
          }
        }

        async function revertToVersion(versionNum) {
          if (!confirm('Revert to version ' + versionNum + '? Later versions will be hidden but can be recovered.')) {
            return;
          }

          try {
            const formData = new FormData();
            formData.append('version', versionNum);

            const response = await fetch('/p/' + project + '/wiki/' + slug + '/revert', {
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
            alert('Error reverting: ' + error.message);
          }
        }

        function hidePreviewModal() {
          previewModal.classList.add('hidden');
        }

        // Event listeners for version history
        versionList.addEventListener('click', (e) => {
          const target = e.target;

          if (target.classList.contains('btn-preview-version')) {
            previewVersion(parseInt(target.dataset.version));
          }
          if (target.classList.contains('btn-revert-version')) {
            revertToVersion(parseInt(target.dataset.version));
          }
        });

        // Modal event listeners
        document.getElementById('modal-close').addEventListener('click', hidePreviewModal);
        document.getElementById('preview-cancel').addEventListener('click', hidePreviewModal);
        document.getElementById('modal-backdrop').addEventListener('click', hidePreviewModal);
        previewRevertBtn.addEventListener('click', () => {
          revertToVersion(parseInt(previewRevertBtn.dataset.version));
        });

        // Load version history on page load
        loadVersionHistory();

        // ============================================
        // Delete Page
        // ============================================
        const deleteBtn = document.getElementById('btn-delete-page');
        deleteBtn.addEventListener('click', async () => {
          const confirmed = confirm(
            'Are you sure you want to delete this page?\\n\\n' +
            'This will permanently delete:\\n' +
            '- All page content\\n' +
            '- All comments\\n' +
            '- All version history\\n\\n' +
            'This action cannot be undone.'
          );

          if (!confirmed) return;

          deleteBtn.disabled = true;
          deleteBtn.textContent = 'Deleting...';

          try {
            const response = await fetch('/p/' + project + '/wiki/' + slug + '/delete', {
              method: 'POST',
            });

            const result = await response.json();
            if (result.success) {
              window.location.href = '/p/' + project;
            } else {
              alert('Error: ' + (result.error || 'Failed to delete page'));
              deleteBtn.disabled = false;
              deleteBtn.textContent = 'Delete Page';
            }
          } catch (error) {
            alert('Error: ' + error.message);
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete Page';
          }
        });
      })();
    </script>
  `,
  });
}

export function generatingPage(topic: string): string {
  return layout('Generating...', `
    <section class="generating">
      <h1>Generating page for "${topic}"</h1>
      <p>Please wait while Claude creates your wiki page...</p>
      <div class="spinner"></div>
    </section>
  `);
}

export function errorPage(message: string): string {
  return layout('Error', `
    <section class="error-page">
      <h1>Something went wrong</h1>
      <p>${message}</p>
      <a href="/" class="btn">Go Home</a>
    </section>
  `);
}

export function generatePageView(topic: string, project: string = 'default'): string {
  return layout(`Generating: ${topic}`, `
    <section class="streaming-section" id="streaming-section">
      <div class="streaming-header">
        <div class="spinner"></div>
      </div>
      <div class="streaming-content" id="streaming-content"></div>
    </section>

    <script type="module">
      import * as smd from 'https://cdn.jsdelivr.net/npm/streaming-markdown/smd.min.js';

      const streamingContent = document.getElementById('streaming-content');
      const topic = ${JSON.stringify(topic)};
      const project = ${JSON.stringify(project)};

      // Set up streaming markdown renderer
      const renderer = smd.default_renderer(streamingContent);
      const parser = smd.parser(renderer);

      async function generate() {
        try {
          if (window.setCostLoading) window.setCostLoading(true);
          const response = await fetch('/p/' + project + '/generate', {
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
                    // Complete - redirect (replace so generate page isn't in history)
                    if (window.setCostLoading) window.setCostLoading(false);
                    smd.parser_end(parser);
                    setTimeout(() => {
                      window.location.replace(data.url);
                    }, 500);
                  }
                  if (data.message) {
                    // Error
                    if (window.setCostLoading) window.setCostLoading(false);
                    streamingContent.innerHTML = '<p class="error">Error: ' + data.message + '</p>';
                  }
                } catch {}
              }
            }
          }
        } catch (error) {
          if (window.setCostLoading) window.setCostLoading(false);
          streamingContent.innerHTML = '<p class="error">Connection error: ' + error.message + '</p>';
        }
      }

      generate();
    </script>
  `);
}
