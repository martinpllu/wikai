// Theme toggle functionality with system preference detection
// Stores preference in localStorage, defaults to system preference

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'delve-theme';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function setTheme(theme: Theme, animate = true): void {
  const html = document.documentElement;

  if (animate) {
    html.classList.add('theme-transition');
    setTimeout(() => html.classList.remove('theme-transition'), 300);
  }

  html.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

function toggleTheme(): void {
  const current = document.documentElement.getAttribute('data-theme') as Theme;
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

function createToggleButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'theme-toggle';
  button.setAttribute('aria-label', 'Toggle theme');
  button.setAttribute('title', 'Toggle light/dark mode');

  // Sun icon (for dark mode - click to go light)
  // Moon icon (for light mode - click to go dark)
  button.innerHTML = `
    <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
    <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  `;

  button.addEventListener('click', toggleTheme);

  return button;
}

export function initTheme(): void {
  // Apply theme immediately (before DOM ready) to prevent flash
  const storedTheme = getStoredTheme();
  const theme = storedTheme ?? getSystemTheme();
  document.documentElement.setAttribute('data-theme', theme);

  // Add toggle button once DOM is ready
  const button = createToggleButton();
  document.body.appendChild(button);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    // Only auto-switch if user hasn't set a preference
    if (!getStoredTheme()) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });
}
