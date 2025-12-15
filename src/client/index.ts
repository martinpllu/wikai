// Main client bundle entry point
// This file imports and initializes all client-side modules

import { initCostTracker } from './cost-tracker.js';
import { initSidebar } from './sidebar.js';
import { initSettings } from './settings.js';
import { initHome } from './home.js';
import { initGeneratePage } from './generate-page.js';
import { initPage } from './page.js';
import { initTheme } from './theme.js';

// Initialize modules based on which page we're on
function init(): void {
  // Theme runs on all pages (system preference detection + toggle)
  initTheme();

  // Cost tracker runs on all pages
  initCostTracker();

  // Sidebar runs on all pages with the sidebar element
  initSidebar();

  // Page-specific initializations (each checks if relevant elements exist)
  initSettings();
  initHome();
  initGeneratePage();
  initPage();
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
