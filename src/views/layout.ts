import type { PageInfo } from '../wiki.js';

export interface LayoutOptions {
  title: string;
  content: string;
  pages?: PageInfo[];
  currentSlug?: string;
}

export function layout(options: LayoutOptions): string;
export function layout(title: string, content: string): string;
export function layout(
  titleOrOptions: string | LayoutOptions,
  contentArg?: string
): string {
  // Support both old signature and new options object
  const options: LayoutOptions =
    typeof titleOrOptions === 'string'
      ? { title: titleOrOptions, content: contentArg! }
      : titleOrOptions;

  const { title, content, pages = [], currentSlug = '' } = options;
  const pagesJson = JSON.stringify(pages);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - WikAI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <aside class="sidebar" id="sidebar" data-pages='${pagesJson}' data-current-slug="${currentSlug}">
    <div class="sidebar-header">
      <a href="/" class="logo">WikAI</a>
      <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle sidebar">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <div class="sidebar-search">
      <input type="text" placeholder="Search pages..." id="search-input" autocomplete="off" />
      <kbd class="shortcut-hint" data-mac="⌘K" data-other="Ctrl+K"></kbd>
    </div>

    <div class="sidebar-controls">
      <button data-sort="recent" class="sort-btn active">Recent</button>
      <button data-sort="alpha" class="sort-btn">A-Z</button>
    </div>

    <nav class="sidebar-nav">
      <section class="nav-section" id="favorites-section" style="display: none;">
        <h3>Favorites</h3>
        <ul class="page-list" id="favorites-list"></ul>
      </section>

      <section class="nav-section">
        <h3>Pages</h3>
        <ul class="page-list" id="pages-list"></ul>
      </section>
    </nav>

    <div class="sidebar-footer">
      <a href="/" class="new-page-btn" id="new-page-btn">
        <span class="new-page-icon">+</span>
        <span>New Page</span>
        <kbd class="shortcut-hint" data-mac="⌘P" data-other="Ctrl+P"></kbd>
      </a>
    </div>
  </aside>

  <button class="sidebar-expand-btn" id="sidebar-expand" aria-label="Open sidebar">
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>

  <div class="main-wrapper">
    <main>
      ${content}
    </main>
  </div>

  <script type="module">
    // ===== STATE =====
    const state = {
      sidebarOpen: localStorage.getItem('wikai-sidebar') !== 'false',
      sortMode: localStorage.getItem('wikai-sort') || 'recent',
      favorites: JSON.parse(localStorage.getItem('wikai-favorites') || '[]'),
      searchQuery: '',
      pages: [],
      currentSlug: '',
    };

    // ===== ELEMENTS =====
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarExpand = document.getElementById('sidebar-expand');
    const searchInput = document.getElementById('search-input');
    const sortBtns = document.querySelectorAll('.sort-btn');
    const pagesList = document.getElementById('pages-list');
    const favoritesList = document.getElementById('favorites-list');
    const favoritesSection = document.getElementById('favorites-section');

    // ===== PLATFORM DETECTION =====
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // ===== INITIALIZATION =====
    function init() {
      // Load pages from data attribute
      try {
        state.pages = JSON.parse(sidebar.dataset.pages || '[]');
        state.currentSlug = sidebar.dataset.currentSlug || '';
      } catch (e) {
        state.pages = [];
      }

      // Clean up favorites (remove pages that no longer exist)
      const slugSet = new Set(state.pages.map(p => p.slug));
      state.favorites = state.favorites.filter(slug => slugSet.has(slug));
      saveState();

      // Initialize shortcut hints (hide on touch, show platform-appropriate text)
      initShortcutHints();

      // Apply initial state
      applySidebarState();
      applySortState();
      render();
      bindEvents();
    }

    // ===== SHORTCUT HINTS =====
    function initShortcutHints() {
      const hints = document.querySelectorAll('.shortcut-hint');
      hints.forEach(hint => {
        if (isTouchDevice) {
          hint.style.display = 'none';
        } else {
          const text = isMac ? hint.dataset.mac : hint.dataset.other;
          hint.textContent = text || '';
        }
      });
    }

    // ===== STATE PERSISTENCE =====
    function saveState() {
      localStorage.setItem('wikai-sidebar', state.sidebarOpen);
      localStorage.setItem('wikai-sort', state.sortMode);
      localStorage.setItem('wikai-favorites', JSON.stringify(state.favorites));
    }

    // ===== SIDEBAR TOGGLE =====
    function applySidebarState() {
      sidebar.dataset.open = state.sidebarOpen;
      document.body.dataset.sidebarOpen = state.sidebarOpen;
    }

    function toggleSidebar() {
      state.sidebarOpen = !state.sidebarOpen;
      applySidebarState();
      saveState();
    }

    // ===== SORT =====
    function applySortState() {
      sortBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === state.sortMode);
      });
    }

    function setSort(mode) {
      state.sortMode = mode;
      applySortState();
      saveState();
      render();
    }

    // ===== FAVORITES =====
    function toggleFavorite(slug, btnEl) {
      const idx = state.favorites.indexOf(slug);
      if (idx >= 0) {
        state.favorites.splice(idx, 1);
      } else {
        state.favorites.push(slug);
      }

      // Animate star
      if (btnEl) {
        btnEl.classList.toggle('active', state.favorites.includes(slug));
        const svg = btnEl.querySelector('svg');
        if (svg) {
          svg.style.animation = 'none';
          svg.offsetHeight; // reflow
          svg.style.animation = 'star-pop 0.3s ease';
        }
      }

      saveState();
      render();
    }

    // ===== FILTERING =====
    function filterPages(query) {
      state.searchQuery = query.toLowerCase();
      render();
    }

    // Debounce helper
    function debounce(fn, delay) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
      };
    }

    // ===== RENDERING =====
    function getFilteredPages() {
      let pages = [...state.pages];

      // Filter by search
      if (state.searchQuery) {
        pages = pages.filter(p =>
          p.title.toLowerCase().includes(state.searchQuery) ||
          p.slug.toLowerCase().includes(state.searchQuery)
        );
      }

      // Sort
      if (state.sortMode === 'alpha') {
        pages.sort((a, b) => a.title.localeCompare(b.title));
      } else {
        pages.sort((a, b) => b.modifiedAt - a.modifiedAt);
      }

      return pages;
    }

    function renderPageItem(page, isFavorite = false) {
      const isActive = page.slug === state.currentSlug;
      const isFav = state.favorites.includes(page.slug);

      return \`
        <li class="page-item\${isActive ? ' active' : ''}" data-slug="\${page.slug}">
          <a href="/wiki/\${page.slug}">
            <span class="page-icon">📄</span>
            <span class="page-title">\${page.title}</span>
          </a>
          <button class="favorite-btn\${isFav ? ' active' : ''}" data-slug="\${page.slug}" aria-label="\${isFav ? 'Remove from' : 'Add to'} favorites">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="\${isFav ? 'currentColor' : 'none'}">
              <path d="M7 1.5L8.5 5L12.5 5.5L9.5 8L10.5 12L7 10L3.5 12L4.5 8L1.5 5.5L5.5 5L7 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
            </svg>
          </button>
        </li>
      \`;
    }

    function render() {
      const filteredPages = getFilteredPages();

      // Render main page list (excluding favorites if not searching)
      const nonFavoritePages = state.searchQuery
        ? filteredPages
        : filteredPages.filter(p => !state.favorites.includes(p.slug));

      pagesList.innerHTML = nonFavoritePages.length > 0
        ? nonFavoritePages.map(p => renderPageItem(p)).join('')
        : '<li class="empty-state">No pages found</li>';

      // Render favorites section
      const favoritePages = state.pages.filter(p => state.favorites.includes(p.slug));
      if (favoritePages.length > 0 && !state.searchQuery) {
        favoritesSection.style.display = '';
        favoritesList.innerHTML = favoritePages.map(p => renderPageItem(p, true)).join('');
      } else {
        favoritesSection.style.display = 'none';
      }

      // Rebind favorite buttons
      document.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(btn.dataset.slug, btn);
        };
      });
    }

    // ===== EVENT BINDINGS =====
    function bindEvents() {
      // Sidebar toggle
      sidebarToggle?.addEventListener('click', toggleSidebar);
      sidebarExpand?.addEventListener('click', toggleSidebar);

      // Sort buttons
      sortBtns.forEach(btn => {
        btn.addEventListener('click', () => setSort(btn.dataset.sort));
      });

      // Search input (debounced)
      const debouncedFilter = debounce(filterPages, 150);
      searchInput?.addEventListener('input', (e) => debouncedFilter(e.target.value));

      // Keyboard shortcuts
      document.addEventListener('keydown', handleKeydown);

      // Click outside to close on mobile
      document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && state.sidebarOpen) {
          if (!sidebar.contains(e.target) && e.target !== sidebarExpand) {
            state.sidebarOpen = false;
            applySidebarState();
            saveState();
          }
        }
      });
    }

    // ===== KEYBOARD SHORTCUTS =====
    function handleKeydown(e) {
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + K - Focus search
      if (modKey && e.key === 'k') {
        e.preventDefault();
        if (!state.sidebarOpen) {
          state.sidebarOpen = true;
          applySidebarState();
          saveState();
        }
        searchInput?.focus();
        searchInput?.select();
      }

      // Cmd/Ctrl + \\ - Toggle sidebar
      if (modKey && e.key === '\\\\') {
        e.preventDefault();
        toggleSidebar();
      }

      // Cmd/Ctrl + P - New page
      if (modKey && e.key === 'p') {
        e.preventDefault();
        window.location.href = '/';
      }

      // Escape - Clear search or close sidebar
      if (e.key === 'Escape') {
        if (document.activeElement === searchInput && state.searchQuery) {
          state.searchQuery = '';
          searchInput.value = '';
          render();
        } else if (state.sidebarOpen && window.innerWidth <= 768) {
          state.sidebarOpen = false;
          applySidebarState();
          saveState();
        }
      }

      // Arrow navigation in page list
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement === searchInput) {
        e.preventDefault();
        const items = pagesList.querySelectorAll('.page-item a');
        if (items.length > 0) {
          items[0].focus();
        }
      }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    // Reload page when navigating back (bfcache) to refresh wiki link colors
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) location.reload();
    });
  </script>
</body>
</html>`;
}
