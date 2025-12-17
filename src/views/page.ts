import { layout, encodeJsonForAttr } from './layout.js';
import { DEFAULT_PROJECT, injectInlineHighlights, type PageInfo, type PageData, type CommentThread, type InlineComment } from '../wiki.js';

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
    <details class="orphaned-comments-section">
      <summary>Orphaned Comments (${orphaned.length})</summary>
      <p class="orphaned-note">These comments reference text that has been edited or removed.</p>
      ${threads}
    </details>
  `;
}

export function wikiPage(
  slug: string,
  title: string,
  htmlContent: string,
  pageData: PageData,
  pages: PageInfo[] = [],
  project: string = DEFAULT_PROJECT,
  projects: string[] = [DEFAULT_PROJECT],
  rawMarkdown: string = ''
): string {
  // Inject inline comment highlights into the HTML
  const { html: contentWithHighlights, orphanedIds } = injectInlineHighlights(
    htmlContent,
    pageData.inlineComments
  );

  // Prepare inline comments data for client-side JS
  const inlineCommentsJson = encodeJsonForAttr(pageData.inlineComments);
  // Encode markdown for safe HTML attribute storage
  const markdownJson = encodeJsonForAttr(rawMarkdown);

  return layout({
    title,
    pages,
    currentSlug: slug,
    project,
    projects,
    content: `
    <div id="page-data"
      data-slug="${slug}"
      data-project="${project}"
      data-inline-comments='${inlineCommentsJson}'
      data-markdown='${markdownJson}'
      style="display: none;"></div>

    <article class="wiki-page">
      <div class="wiki-content" id="wiki-content">
        ${contentWithHighlights}
      </div>
      <div class="markdown-editor hidden" id="markdown-editor">
        <div class="editor-toolbar">
          <div class="editor-info">
            <span class="editor-label">Editing Markdown</span>
            <span class="editor-stats" id="editor-stats"></span>
          </div>
          <div class="editor-actions">
            <kbd class="editor-shortcut">${process.platform === 'darwin' ? '⌘' : 'Ctrl'}+S save</kbd>
            <kbd class="editor-shortcut">Esc cancel</kbd>
          </div>
        </div>
        <textarea id="markdown-textarea" spellcheck="false"></textarea>
        <div class="editor-footer">
          <button class="btn-cancel-edit" id="btn-cancel-edit">Cancel</button>
          <button class="btn-save-edit" id="btn-save-edit">
            <span class="btn-text">Save Changes</span>
            <span class="btn-loading hidden"><span class="spinner"></span> Saving...</span>
          </button>
        </div>
      </div>
    </article>

    <!-- Selection Toolbar (hidden by default) -->
    <div class="selection-toolbar hidden" id="selection-toolbar">
      <button class="toolbar-btn" id="btn-selection" title="Ask or Edit">
        <span class="toolbar-icon">💬</span> Ask / Edit
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
      <form class="unified-form" id="unified-form">
        <textarea
          name="message"
          id="unified-message"
          placeholder="Ask a question or describe an edit..."
          rows="3"
          required
        ></textarea>
        <div class="unified-buttons">
          <button type="button" id="btn-ask">Ask</button>
          <button type="button" id="btn-apply-edit">Edit</button>
          <button type="button" class="btn-edit-source" id="btn-edit-markdown">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            Edit Source
          </button>
        </div>
      </form>

      <div class="page-comments" id="page-comments">
        ${renderPageComments(pageData.pageComments, slug)}
      </div>

      <details class="version-history-section">
        <summary>Version History (<span id="version-count">...</span>)</summary>
        <div class="version-history" id="version-history">
          <div class="version-history-header">
            <label class="show-all-toggle">
              <input type="checkbox" id="show-all-versions" />
              <span>Show reverted</span>
            </label>
          </div>
          <div class="version-list" id="version-list">
            <p class="loading-versions"><span class="spinner"></span> Loading versions...</p>
          </div>
        </div>
      </details>

      ${renderOrphanedComments(orphanedIds, pageData.inlineComments, slug)}
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

export function generatePageView(
  topic: string,
  project: string = DEFAULT_PROJECT,
  pages: PageInfo[] = [],
  projects: string[] = [DEFAULT_PROJECT]
): string {
  return layout({
    title: `Generating: ${topic}`,
    pages,
    project,
    projects,
    content: `
    <section class="streaming-section" id="streaming-section" data-topic="${topic}" data-project="${project}">
      <div class="streaming-title-row">
        <div class="spinner" id="streaming-spinner"></div>
        <h1 class="streaming-title" id="streaming-title">${escapeHtml(topic)}</h1>
      </div>
      <div class="streaming-content" id="streaming-content"></div>
    </section>
  `,
  });
}
