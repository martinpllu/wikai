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
  project: string = DEFAULT_PROJECT,
  projects: string[] = [DEFAULT_PROJECT]
): string {
  // Inject inline comment highlights into the HTML
  const { html: contentWithHighlights, orphanedIds } = injectInlineHighlights(
    htmlContent,
    pageData.inlineComments
  );

  // Prepare inline comments data for client-side JS
  const inlineCommentsJson = encodeJsonForAttr(pageData.inlineComments);

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
      style="display: none;"></div>

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
        <form action="/${project}/${slug}/chat" method="POST" class="chat-form" id="edit-form">
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

export function generatePageView(topic: string, project: string = DEFAULT_PROJECT): string {
  return layout(`Generating: ${topic}`, `
    <section class="streaming-section" id="streaming-section" data-topic="${topic}" data-project="${project}">
      <div class="streaming-title-row">
        <div class="spinner" id="streaming-spinner"></div>
        <h1 class="streaming-title" id="streaming-title">${escapeHtml(topic)}</h1>
      </div>
      <div class="streaming-content" id="streaming-content"></div>
    </section>
  `);
}
