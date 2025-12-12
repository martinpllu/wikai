import { layout } from './layout.js';
import type { ChatMessage, PageInfo, PageData, CommentThread, InlineComment } from '../wiki.js';
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

function renderEditHistory(history: ChatMessage[]): string {
  if (history.length === 0) return '<p class="no-history">No edit history yet.</p>';

  const messages = history.map(msg => `
    <div class="chat-message chat-message-${msg.role}">
      <span class="chat-timestamp">${formatTimestamp(msg.timestamp)}</span>
      <span class="chat-content">${escapeHtml(msg.content)}</span>
    </div>
  `).join('');

  return `
    <div class="chat-history">
      <h4>Edit History</h4>
      ${messages}
    </div>
  `;
}

function renderCommentThread(thread: CommentThread, slug: string, isInline: boolean = false): string {
  const messages = thread.messages.map(msg => `
    <div class="comment-message comment-message-${msg.role}">
      <span class="comment-role">${msg.role === 'user' ? 'You' : 'AI'}:</span>
      <span class="comment-content">${escapeHtml(msg.content)}</span>
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
    return '<p class="no-comments">No comments yet. Ask a question below!</p>';
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
  pages: PageInfo[] = []
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
    content: `
    <article class="wiki-page">
      <div class="wiki-content" id="wiki-content">
        ${contentWithHighlights}
      </div>
    </article>

    <!-- Selection Toolbar (hidden by default) -->
    <div class="selection-toolbar hidden" id="selection-toolbar">
      <button class="toolbar-btn" id="btn-comment" title="Add comment">
        <span class="toolbar-icon">💬</span> Comment
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
        <button class="chat-tab active" data-tab="comment">Comment</button>
        <button class="chat-tab" data-tab="edit">Edit Page</button>
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
          <button type="submit" id="comment-submit">Comment</button>
        </form>
      </div>

      <!-- Edit Tab Content -->
      <div class="chat-tab-content hidden" id="tab-edit">
        ${renderEditHistory(pageData.editHistory)}
        <form action="/wiki/${slug}/chat" method="POST" class="chat-form" id="edit-form">
          <textarea
            name="message"
            id="edit-message"
            placeholder="Give instructions to edit the page..."
            rows="3"
            required
          ></textarea>
          <button type="submit" id="edit-submit">Apply Edit</button>
        </form>
      </div>
    </section>

    <script>
      (function() {
        const slug = ${JSON.stringify(slug)};
        const inlineComments = ${inlineCommentsJson};

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
          editTextarea.disabled = true;
          editButton.disabled = true;
          editButton.innerHTML = '<span class="spinner"></span> Updating...';
        });

        // ============================================
        // Page Comment Form
        // ============================================
        const commentForm = document.getElementById('comment-form');
        const commentTextarea = document.getElementById('comment-message');
        const commentButton = document.getElementById('comment-submit');
        const pageCommentsContainer = document.getElementById('page-comments');

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

            const response = await fetch('/wiki/' + slug + '/comment', {
              method: 'POST',
              body: formData,
            });

            const result = await response.json();
            if (result.success) {
              // Reload to show new comment
              window.location.reload();
            } else {
              alert('Error: ' + result.error);
            }
          } catch (error) {
            alert('Error: ' + error.message);
          } finally {
            commentTextarea.disabled = false;
            commentButton.disabled = false;
            commentButton.textContent = 'Comment';
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

              const response = await fetch('/wiki/' + slug + '/' + endpoint + '/' + threadId + '/reply', {
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

          // Resolve/Unresolve
          if (target.classList.contains('btn-resolve')) {
            const threadId = target.dataset.threadId;
            const endpoint = target.dataset.endpoint;
            const isResolved = target.dataset.resolved === 'true';

            try {
              const formData = new FormData();
              formData.append('resolved', isResolved ? 'false' : 'true');

              const response = await fetch('/wiki/' + slug + '/' + endpoint + '/' + threadId + '/resolve', {
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
                <button class="btn-submit" id="popover-submit">Comment</button>
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
                <button class="btn-resolve-inline" data-comment-id="\${thread.id}" data-resolved="false">
                  Resolve
                </button>
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

                  const response = await fetch('/wiki/' + slug + '/inline', {
                    method: 'POST',
                    body: formData,
                  });

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

                const response = await fetch('/wiki/' + slug + '/inline-edit', {
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
                          window.location.reload();
                        }
                        if (data.message) {
                          alert('Error: ' + data.message);
                          hidePopover();
                        }
                      } catch {}
                    }
                  }
                }
              }
            } catch (error) {
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
                <button class="btn-resolve-inline" data-comment-id="\${commentId}" data-resolved="\${comment.resolved}">
                  \${comment.resolved ? 'Unresolve' : 'Resolve'}
                </button>
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

              const response = await fetch('/wiki/' + slug + '/inline/' + commentId + '/reply', {
                method: 'POST',
                body: formData,
              });

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
              alert('Error: ' + error.message);
              window.location.reload();
            }
          }

          // Resolve inline comment
          if (target.classList.contains('btn-resolve-inline')) {
            const commentId = target.dataset.commentId;
            const isResolved = target.dataset.resolved === 'true';

            try {
              const formData = new FormData();
              formData.append('resolved', isResolved ? 'false' : 'true');

              const response = await fetch('/wiki/' + slug + '/inline/' + commentId + '/resolve', {
                method: 'POST',
                body: formData,
              });

              const result = await response.json();
              if (result.success) {
                // Update button state
                target.dataset.resolved = isResolved ? 'false' : 'true';
                target.textContent = isResolved ? 'Resolve' : 'Unresolve';

                // Update the highlight style
                const highlight = document.querySelector('.inline-comment[data-comment-id="' + commentId + '"]');
                if (highlight) {
                  highlight.classList.toggle('inline-comment-resolved', !isResolved);
                }

                // Update local data
                const comment = inlineComments.find(c => c.id === commentId);
                if (comment) {
                  comment.resolved = !isResolved;
                }
              } else {
                alert('Error: ' + result.error);
              }
            } catch (error) {
              alert('Error: ' + error.message);
            }
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

export function generatePageView(topic: string): string {
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

      // Set up streaming markdown renderer
      const renderer = smd.default_renderer(streamingContent);
      const parser = smd.parser(renderer);

      async function generate() {
        try {
          const response = await fetch('/generate', {
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
                    smd.parser_end(parser);
                    setTimeout(() => {
                      window.location.replace(data.url);
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
      }

      generate();
    </script>
  `);
}
