import type { PageInfo } from './types.js';
import { isMac, isTouchDevice, debounce, initShortcutHints } from './utils.js';

interface SidebarState {
  sidebarOpen: boolean;
  sortMode: 'recent' | 'alpha';
  favorites: string[];
  searchQuery: string;
  pages: PageInfo[];
  currentSlug: string;
  currentProject: string;
  projects: string[];
  projectDropdownOpen: boolean;
  projectCreateMode: boolean;
}

// Elements
let sidebar: HTMLElement;
let sidebarToggle: HTMLElement | null;
let sidebarExpand: HTMLElement | null;
let searchInput: HTMLInputElement | null;
let sortBtns: NodeListOf<HTMLElement>;
let pagesList: HTMLElement;
let favoritesList: HTMLElement;
let favoritesSection: HTMLElement;
let projectSelector: HTMLElement | null;
let projectCurrent: HTMLElement | null;
let projectDropdown: HTMLElement | null;
let projectList: HTMLElement | null;
let projectCreateBtn: HTMLElement | null;
let projectCreateForm: HTMLElement | null;
let projectCreateInput: HTMLInputElement | null;
let projectCreateCancel: HTMLElement | null;
let projectCreateSubmit: HTMLElement | null;

const state: SidebarState = {
  sidebarOpen: localStorage.getItem('wikai-sidebar') !== 'false',
  sortMode: (localStorage.getItem('wikai-sort') as 'recent' | 'alpha') || 'recent',
  favorites: JSON.parse(localStorage.getItem('wikai-favorites') || '[]'),
  searchQuery: '',
  pages: [],
  currentSlug: '',
  currentProject: '',
  projects: [],
  projectDropdownOpen: false,
  projectCreateMode: false,
};

function saveState(): void {
  localStorage.setItem('wikai-sidebar', String(state.sidebarOpen));
  localStorage.setItem('wikai-sort', state.sortMode);
  localStorage.setItem('wikai-favorites', JSON.stringify(state.favorites));
}

function applySidebarState(): void {
  sidebar.dataset.open = String(state.sidebarOpen);
  document.body.dataset.sidebarOpen = String(state.sidebarOpen);
}

function toggleSidebar(): void {
  state.sidebarOpen = !state.sidebarOpen;
  applySidebarState();
  saveState();
}

function applySortState(): void {
  sortBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === state.sortMode);
  });
}

function setSort(mode: 'recent' | 'alpha'): void {
  state.sortMode = mode;
  applySortState();
  saveState();
  render();
}

function toggleFavorite(slug: string, btnEl?: HTMLElement): void {
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
      void (svg as unknown as HTMLElement).offsetHeight; // reflow
      svg.style.animation = 'star-pop 0.3s ease';
    }
  }

  saveState();
  render();
}

function filterPages(query: string): void {
  state.searchQuery = query.toLowerCase();
  render();
}

function getFilteredPages(): PageInfo[] {
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

function renderPageItem(page: PageInfo): string {
  const isActive = page.slug === state.currentSlug;
  const isFav = state.favorites.includes(page.slug);

  return `
    <li class="page-item${isActive ? ' active' : ''}" data-slug="${page.slug}">
      <a href="/${state.currentProject}/${page.slug}">
        <span class="page-title">${page.title}</span>
      </a>
      <button class="favorite-btn${isFav ? ' active' : ''}" data-slug="${page.slug}" aria-label="${isFav ? 'Remove from' : 'Add to'} favorites">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="${isFav ? 'currentColor' : 'none'}">
          <path d="M7 1.5L8.5 5L12.5 5.5L9.5 8L10.5 12L7 10L3.5 12L4.5 8L1.5 5.5L5.5 5L7 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
        </svg>
      </button>
    </li>
  `;
}

function render(): void {
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
    favoritesList.innerHTML = favoritePages.map(p => renderPageItem(p)).join('');
  } else {
    favoritesSection.style.display = 'none';
  }

  // Rebind favorite buttons
  document.querySelectorAll<HTMLElement>('.favorite-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(btn.dataset.slug!, btn);
    };
  });
}

function renderProjectList(): void {
  if (!projectList) return;

  projectList.innerHTML = state.projects.map(project => `
    <button class="project-item${project === state.currentProject ? ' active' : ''}" data-project="${project}">
      <span class="project-icon">📁</span>
      <span class="project-name">${project}</span>
      ${project === state.currentProject ? '<span class="check-icon">✓</span>' : ''}
    </button>
  `).join('');

  // Bind click events
  projectList.querySelectorAll<HTMLElement>('.project-item').forEach(btn => {
    btn.onclick = () => {
      const project = btn.dataset.project;
      if (project !== state.currentProject) {
        window.location.href = '/' + project;
      } else {
        closeProjectDropdown();
      }
    };
  });
}

function toggleProjectDropdown(): void {
  state.projectDropdownOpen = !state.projectDropdownOpen;
  projectDropdown?.classList.toggle('open', state.projectDropdownOpen);
  projectSelector?.classList.toggle('open', state.projectDropdownOpen);
  if (!state.projectDropdownOpen) {
    hideProjectCreateForm();
  }
}

function closeProjectDropdown(): void {
  state.projectDropdownOpen = false;
  projectDropdown?.classList.remove('open');
  projectSelector?.classList.remove('open');
  hideProjectCreateForm();
}

function showProjectCreateForm(): void {
  state.projectCreateMode = true;
  if (projectCreateBtn) projectCreateBtn.style.display = 'none';
  if (projectCreateForm) projectCreateForm.style.display = 'block';
  if (projectCreateInput) {
    projectCreateInput.value = '';
    projectCreateInput.focus();
  }
}

function hideProjectCreateForm(): void {
  state.projectCreateMode = false;
  if (projectCreateBtn) projectCreateBtn.style.display = 'flex';
  if (projectCreateForm) projectCreateForm.style.display = 'none';
  if (projectCreateInput) projectCreateInput.value = '';
}

async function createProject(): Promise<void> {
  const name = projectCreateInput?.value.trim();
  if (!name) return;

  try {
    const response = await fetch('/_api/projects', {
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
    window.location.href = '/' + data.project;
  } catch (error) {
    alert('Failed to create project: ' + (error as Error).message);
  }
}

function bindProjectEvents(): void {
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
    if (state.projectDropdownOpen && projectSelector && !projectSelector.contains(e.target as Node)) {
      closeProjectDropdown();
    }
  });
}

function handleKeydown(e: KeyboardEvent): void {
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

  // Cmd/Ctrl + \ - Toggle sidebar
  if (modKey && e.key === '\\') {
    e.preventDefault();
    toggleSidebar();
  }

  // Cmd/Ctrl + P - New page
  if (modKey && e.key === 'p') {
    e.preventDefault();
    window.location.href = '/' + state.currentProject;
  }

  // Escape - Clear search or close sidebar
  if (e.key === 'Escape') {
    if (searchInput && document.activeElement === searchInput && state.searchQuery) {
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
    const items = pagesList.querySelectorAll<HTMLAnchorElement>('.page-item a');
    if (items.length > 0) {
      items[0].focus();
    }
  }
}

function bindEvents(): void {
  // Sidebar toggle
  sidebarToggle?.addEventListener('click', toggleSidebar);
  sidebarExpand?.addEventListener('click', toggleSidebar);

  // Sort buttons
  sortBtns.forEach(btn => {
    btn.addEventListener('click', () => setSort(btn.dataset.sort as 'recent' | 'alpha'));
  });

  // Search input (debounced)
  const debouncedFilter = debounce((value: string) => filterPages(value), 150);
  searchInput?.addEventListener('input', (e) => debouncedFilter((e.target as HTMLInputElement).value));

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);

  // Click outside to close on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && state.sidebarOpen) {
      if (!sidebar.contains(e.target as Node) && e.target !== sidebarExpand) {
        state.sidebarOpen = false;
        applySidebarState();
        saveState();
      }
    }
  });
}

export function initSidebar(): void {
  sidebar = document.getElementById('sidebar')!;
  if (!sidebar) return; // Sidebar not present on this page

  sidebarToggle = document.getElementById('sidebar-toggle');
  sidebarExpand = document.getElementById('sidebar-expand');
  searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  sortBtns = document.querySelectorAll('.sort-btn');
  pagesList = document.getElementById('pages-list')!;
  favoritesList = document.getElementById('favorites-list')!;
  favoritesSection = document.getElementById('favorites-section')!;
  projectSelector = document.getElementById('project-selector');
  projectCurrent = document.getElementById('project-current');
  projectDropdown = document.getElementById('project-dropdown');
  projectList = document.getElementById('project-list');
  projectCreateBtn = document.getElementById('project-create-btn');
  projectCreateForm = document.getElementById('project-create-form');
  projectCreateInput = document.getElementById('project-create-input') as HTMLInputElement | null;
  projectCreateCancel = document.getElementById('project-create-cancel');
  projectCreateSubmit = document.getElementById('project-create-submit');

  // Load pages and projects from data attributes
  try {
    state.pages = JSON.parse(sidebar.dataset.pages || '[]');
    state.currentSlug = sidebar.dataset.currentSlug || '';
    state.currentProject = sidebar.dataset.project || 'default';
    state.projects = JSON.parse(sidebar.dataset.projects || '["default"]');
  } catch {
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

  // Reload page when navigating back (bfcache) to refresh wiki link colors
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });
}
