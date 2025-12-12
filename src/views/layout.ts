import type { PageInfo } from '../wiki.js';

export interface LayoutOptions {
  title: string;
  content: string;
  pages?: PageInfo[];
  currentSlug?: string;
  project?: string;
  projects?: string[];
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

  const { title, content, pages = [], currentSlug = '', project = 'default', projects = ['default'] } = options;
  const pagesJson = JSON.stringify(pages);
  const projectsJson = JSON.stringify(projects);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - delve</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <aside class="sidebar" id="sidebar" data-pages='${pagesJson}' data-current-slug="${currentSlug}" data-project="${project}" data-projects='${projectsJson}'>
    <div class="sidebar-header">
      <a href="/p/${project}" class="logo">wikai</a>
      <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle sidebar">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <div class="project-selector" id="project-selector">
      <button class="project-current" id="project-current" aria-label="Switch project">
        <span class="project-icon">📁</span>
        <span class="project-name" id="project-name">${project}</span>
        <svg class="project-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="project-dropdown" id="project-dropdown">
        <div class="project-list" id="project-list"></div>
        <div class="project-create" id="project-create">
          <button class="project-create-btn" id="project-create-btn">
            <span class="create-icon">+</span>
            <span>New Project</span>
          </button>
          <div class="project-create-form" id="project-create-form" style="display: none;">
            <input type="text" id="project-create-input" placeholder="Project name..." autocomplete="off" />
            <div class="project-create-actions">
              <button type="button" id="project-create-cancel" class="btn-cancel">Cancel</button>
              <button type="button" id="project-create-submit" class="btn-submit">Create</button>
            </div>
          </div>
        </div>
      </div>
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
      <a href="/p/${project}" class="new-page-btn" id="new-page-btn">
        <span class="new-page-icon">+</span>
        <span>New Page</span>
        <kbd class="shortcut-hint" data-mac="⌘P" data-other="Ctrl+P"></kbd>
      </a>
      <a href="/settings" class="settings-link" title="Settings">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6.5 1.5L6.9 3.1C6.3 3.3 5.8 3.6 5.3 4L3.8 3.3L2.3 5.7L3.5 6.8C3.4 7.3 3.4 7.7 3.5 8.2L2.3 9.3L3.8 11.7L5.3 11C5.8 11.4 6.3 11.7 6.9 11.9L6.5 13.5H9.5L9.1 11.9C9.7 11.7 10.2 11.4 10.7 11L12.2 11.7L13.7 9.3L12.5 8.2C12.6 7.7 12.6 7.3 12.5 6.8L13.7 5.7L12.2 3.3L10.7 4C10.2 3.6 9.7 3.3 9.1 3.1L9.5 1.5H6.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <circle cx="8" cy="7.5" r="2" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </a>
    </div>
  </aside>

  <button class="sidebar-expand-btn" id="sidebar-expand" aria-label="Open sidebar">
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>

  <!-- Cost tracking script - logs costs to console -->
  <script>
    (function() {
      var previousRequestCount = 0;

      function formatCost(cost) {
        return '$' + cost.toFixed(4);
      }

      function fetchLatestCost() {
        fetch('/api/costs?limit=1')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.totalRequests > previousRequestCount && data.recentRequests.length > 0) {
              var req = data.recentRequests[0];
              console.log('%c API Cost: ' + formatCost(req.totalCost) + ' %c ' + (req.action || 'request') + ' | ' + (req.pageName || ''),
                'background: #4a5; color: white; padding: 2px 6px; border-radius: 3px;',
                'color: #666;');
              previousRequestCount = data.totalRequests;
            }
          })
          .catch(function() {});
      }

      window.setCostLoading = function(loading) {
        if (!loading) {
          // Fetch cost after request completes (delay for OpenRouter to record it)
          setTimeout(fetchLatestCost, 1500);
        }
      };

      // Initialize previous request count
      fetch('/api/costs?limit=1')
        .then(function(r) { return r.json(); })
        .then(function(data) { previousRequestCount = data.totalRequests; })
        .catch(function() {});
    })();
  </script>

  <div class="main-wrapper">
    <main>
      ${content}
    </main>
  </div>

  <script type="module">
    // ===== STATE =====
    const state = {
      sidebarOpen: localStorage.getItem('delve-sidebar') !== 'false',
      sortMode: localStorage.getItem('delve-sort') || 'recent',
      favorites: JSON.parse(localStorage.getItem('delve-favorites') || '[]'),
      searchQuery: '',
      pages: [],
      currentSlug: '',
      currentProject: '',
      projects: [],
      projectDropdownOpen: false,
      projectCreateMode: false,
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
    const projectSelector = document.getElementById('project-selector');
    const projectCurrent = document.getElementById('project-current');
    const projectDropdown = document.getElementById('project-dropdown');
    const projectList = document.getElementById('project-list');
    const projectCreateBtn = document.getElementById('project-create-btn');
    const projectCreateForm = document.getElementById('project-create-form');
    const projectCreateInput = document.getElementById('project-create-input');
    const projectCreateCancel = document.getElementById('project-create-cancel');
    const projectCreateSubmit = document.getElementById('project-create-submit');

    // ===== PLATFORM DETECTION =====
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // ===== INITIALIZATION =====
    function init() {
      // Load pages and projects from data attributes
      try {
        state.pages = JSON.parse(sidebar.dataset.pages || '[]');
        state.currentSlug = sidebar.dataset.currentSlug || '';
        state.currentProject = sidebar.dataset.project || 'default';
        state.projects = JSON.parse(sidebar.dataset.projects || '["default"]');
      } catch (e) {
        state.pages = [];
        state.projects = ['default'];
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
      renderProjectList();
      bindEvents();
      bindProjectEvents();
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
      localStorage.setItem('delve-sidebar', state.sidebarOpen);
      localStorage.setItem('delve-sort', state.sortMode);
      localStorage.setItem('delve-favorites', JSON.stringify(state.favorites));
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
          <a href="/p/\${state.currentProject}/wiki/\${page.slug}">
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

    // ===== PROJECT SELECTOR =====
    function renderProjectList() {
      if (!projectList) return;

      projectList.innerHTML = state.projects.map(project => \`
        <button class="project-item\${project === state.currentProject ? ' active' : ''}" data-project="\${project}">
          <span class="project-icon">📁</span>
          <span class="project-name">\${project}</span>
          \${project === state.currentProject ? '<span class="check-icon">✓</span>' : ''}
        </button>
      \`).join('');

      // Bind click events
      projectList.querySelectorAll('.project-item').forEach(btn => {
        btn.onclick = () => {
          const project = btn.dataset.project;
          if (project !== state.currentProject) {
            window.location.href = '/p/' + project;
          } else {
            closeProjectDropdown();
          }
        };
      });
    }

    function toggleProjectDropdown() {
      state.projectDropdownOpen = !state.projectDropdownOpen;
      projectDropdown.classList.toggle('open', state.projectDropdownOpen);
      projectSelector.classList.toggle('open', state.projectDropdownOpen);
      if (!state.projectDropdownOpen) {
        hideProjectCreateForm();
      }
    }

    function closeProjectDropdown() {
      state.projectDropdownOpen = false;
      projectDropdown.classList.remove('open');
      projectSelector.classList.remove('open');
      hideProjectCreateForm();
    }

    function showProjectCreateForm() {
      state.projectCreateMode = true;
      projectCreateBtn.style.display = 'none';
      projectCreateForm.style.display = 'block';
      projectCreateInput.value = '';
      projectCreateInput.focus();
    }

    function hideProjectCreateForm() {
      state.projectCreateMode = false;
      projectCreateBtn.style.display = 'flex';
      projectCreateForm.style.display = 'none';
      projectCreateInput.value = '';
    }

    async function createProject() {
      const name = projectCreateInput.value.trim();
      if (!name) return;

      try {
        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ name }),
        });

        const data = await response.json();
        if (data.error) {
          alert('Error: ' + data.error);
          return;
        }

        // Navigate to the new project
        window.location.href = '/p/' + data.project;
      } catch (error) {
        alert('Failed to create project: ' + error.message);
      }
    }

    function bindProjectEvents() {
      // Toggle dropdown
      projectCurrent?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleProjectDropdown();
      });

      // Create button
      projectCreateBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        showProjectCreateForm();
      });

      // Cancel create
      projectCreateCancel?.addEventListener('click', (e) => {
        e.stopPropagation();
        hideProjectCreateForm();
      });

      // Submit create
      projectCreateSubmit?.addEventListener('click', (e) => {
        e.stopPropagation();
        createProject();
      });

      // Enter to submit create form
      projectCreateInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          createProject();
        } else if (e.key === 'Escape') {
          hideProjectCreateForm();
        }
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (state.projectDropdownOpen && !projectSelector.contains(e.target)) {
          closeProjectDropdown();
        }
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
        window.location.href = '/p/' + state.currentProject;
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
