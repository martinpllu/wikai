/**
 * Records a demo video of Delve for the README.
 *
 * Usage: npx tsx scripts/record-demo.ts
 *
 * Requires the dev server to be running on port 3171.
 * Outputs: demo.webm (convert to mp4 with ffmpeg)
 *
 * Flow:
 * 1. Generate Bloom Filter page, scroll down
 * 2. Navigate to the first link that contains the word 'hash' (case insensitive)
 * 3. Back to the Bloom Filter page, go to page-level Edit and request a Python example
 * 4. Scroll to top, select the word "probabilistic" and ask "What does this mean?"
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3171';
const PROJECT = 'data-structures';
const TOPIC = 'Bloom filters';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function typeSlowly(page: Page, selector: string, text: string, delay = 60) {
  await page.click(selector);
  for (const char of text) {
    await page.type(selector, char, { delay: 0 });
    await sleep(delay);
  }
}

// Inject a visible cursor that follows mouse movements
async function injectCursor(page: Page) {
  await page.evaluate(() => {
    // Remove existing cursor if any
    document.getElementById('fake-cursor')?.remove();

    const cursor = document.createElement('div');
    cursor.id = 'fake-cursor';
    cursor.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 0 0-.85.36Z" fill="#000" stroke="#fff" stroke-width="1.5"/>
      </svg>
    `;
    cursor.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 24px;
      height: 24px;
      pointer-events: none;
      z-index: 999999;
      transition: transform 0.1s ease-out;
    `;
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', (e) => {
      cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    });
  });
}

// Smoothly move mouse to an element
async function moveToElement(page: Page, selector: string) {
  const element = page.locator(selector);
  const box = await element.boundingBox();
  if (!box) return;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await sleep(200);
}

// Clean all pages from the demo project (delete and recreate directory)
function cleanDemoProject() {
  const demoDir = path.join(process.cwd(), '.delve', 'data', PROJECT);
  if (fs.existsSync(demoDir)) {
    fs.rmSync(demoDir, { recursive: true, force: true });
    console.log(`Deleted demo project directory: ${demoDir}`);
  }
  fs.mkdirSync(demoDir, { recursive: true });
  console.log('Created fresh demo project directory');
}

async function main() {
  console.log('Starting demo recording...');

  // Clean existing pages from demo project before starting
  cleanDemoProject();

  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: './videos',
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();

  try {
    // === Scene 1: Generate Bloom Filter page ===
    console.log('Scene 1: Navigate to demo project and generate page');
    await page.goto(`${BASE_URL}/${PROJECT}`);
    await page.waitForLoadState('networkidle');

    await injectCursor(page);
    await sleep(500);

    // Move cursor to center initially
    await page.mouse.move(640, 360, { steps: 10 });
    await sleep(500);

    // Type the topic
    await moveToElement(page, '#topic');
    await typeSlowly(page, '#topic', TOPIC, 80);
    await sleep(400);

    // Click generate
    await moveToElement(page, '#generate-btn');
    await sleep(200);
    await page.click('#generate-btn');

    // Wait for streaming to start
    await page.waitForSelector('#streaming-section:not([style*="display: none"])', { timeout: 10000 });
    console.log('Streaming started...');

    // Scroll during streaming
    const scrollDuringStreaming = async () => {
      try {
        while (true) {
          const streamingSection = await page.$('#streaming-section:not([style*="display: none"])');
          if (!streamingSection) break;
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          }).catch(() => {});
          await sleep(400);
        }
      } catch {
        // Navigation happened, stop scrolling
      }
    };
    const scrollPromise = scrollDuringStreaming();

    // Wait for page to be generated
    await page.waitForURL(/\/data-structures\/bloom-filter/, { timeout: 120000 });
    await scrollPromise.catch(() => {});
    console.log('Page generated');

    // Re-inject cursor after navigation
    await injectCursor(page);
    await sleep(500);

    // Scroll down to show content
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await sleep(1500);

    // Scroll back up
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(1000);

    // Save the Bloom Filter page URL
    const bloomFilterUrl = page.url();

    // === Scene 2: Click a wiki link containing 'hash' ===
    console.log('Scene 2: Click wiki link containing "hash"');

    // Find a link containing 'hash'
    const wikiLinks = page.locator('.wiki-link');
    const linkCount = await wikiLinks.count();
    let hashLink = null;

    for (let i = 0; i < linkCount; i++) {
      const link = wikiLinks.nth(i);
      const text = await link.textContent();
      if (text && text.toLowerCase().includes('hash')) {
        hashLink = link;
        console.log(`Found hash link: "${text}"`);
        break;
      }
    }

    if (!hashLink) {
      // Fall back to first link
      hashLink = wikiLinks.first();
      const text = await hashLink.textContent();
      console.log(`No hash link found, using first link: "${text}"`);
    }

    // Move to and click the link
    const linkBox = await hashLink.boundingBox();
    if (linkBox) {
      await page.mouse.move(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2, { steps: 25 });
      await sleep(500);
      await page.mouse.click(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2);
    }

    // Wait for new page to load/stream
    try {
      await page.waitForSelector('#streaming-section:not([style*="display: none"])', { timeout: 5000 });
      console.log('New page streaming...');

      // Wait for streaming to complete (page navigates to the new wiki page)
      await page.waitForURL(url => url.href !== bloomFilterUrl && url.pathname.startsWith('/data-structures/'), { timeout: 120000 });
      console.log('Second page generated');
    } catch {
      console.log('Page loaded directly');
    }

    // Re-inject cursor and wait for content to fully render
    await injectCursor(page);
    await page.waitForLoadState('networkidle');
    await sleep(1000);

    // Scroll down and back up to show the generated content
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await sleep(1500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(1000);

    // === Scene 3: Go back to Bloom Filter page and request Python example via page-level edit ===
    console.log('Scene 3: Back to Bloom Filter, request Python example');

    await page.goto(bloomFilterUrl);
    await page.waitForLoadState('networkidle');
    await injectCursor(page);
    await sleep(1000);

    // Scroll down to show the chat section
    await page.evaluate(() => {
      const chatSection = document.querySelector('.chat-section');
      if (chatSection) {
        chatSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    await sleep(800);

    // Click in the unified message textarea
    await moveToElement(page, '#unified-message');
    await sleep(200);

    // Type the edit request
    await typeSlowly(page, '#unified-message', 'Add a Python code example', 50);
    await sleep(400);

    // Click "Apply Edit" button
    await moveToElement(page, '#btn-apply-edit');
    await sleep(200);
    await page.click('#btn-apply-edit');

    // Wait for the edit to complete by polling for a code block
    console.log('Waiting for edit to complete...');

    // Poll for the code block to appear (indicates edit is done)
    let codeFound = false;
    for (let i = 0; i < 60; i++) { // Max 60 seconds
      codeFound = await page.evaluate(() => {
        const codeBlock = document.querySelector('#wiki-content pre code, #wiki-content pre');
        return codeBlock !== null;
      });
      if (codeFound) {
        console.log('Code block detected');
        break;
      }
      await sleep(1000);
    }

    if (!codeFound) {
      console.log('No code block found after waiting, continuing anyway');
    }

    await sleep(500);
    console.log('Edit applied');

    // Scroll down to show the code example that was added
    await page.evaluate(() => {
      const codeBlock = document.querySelector('#wiki-content pre');
      if (codeBlock) {
        codeBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
    });
    await sleep(2000);

    // Scroll back to top
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(1500);

    // === Scene 4: Select "probabilistic" and ask what it means ===
    console.log('Scene 4: Select "probabilistic" and ask about it');

    // Find the word "probabilistic" in the content
    const foundWord = await page.evaluate(() => {
      const content = document.getElementById('wiki-content');
      if (!content) return null;

      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent || '';
        const idx = text.toLowerCase().indexOf('probabilistic');
        if (idx !== -1) {
          // Create a range for just this word
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + 'probabilistic'.length);

          const rect = range.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
      }
      return null;
    });

    if (foundWord) {
      console.log('Found "probabilistic" at:', foundWord);

      // Move to the word and select it by dragging
      const startX = foundWord.x;
      const startY = foundWord.y + foundWord.height / 2;
      const endX = foundWord.x + foundWord.width;
      const endY = startY;

      await page.mouse.move(startX, startY, { steps: 20 });
      await sleep(300);

      // Click and drag to select
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 15 });
      await page.mouse.up();
      await sleep(500);

      // Wait for selection toolbar
      try {
        await page.waitForSelector('#selection-toolbar', { state: 'visible', timeout: 3000 });
        console.log('Selection toolbar visible');

        // Click the Ask/Edit button
        const btnPos = await page.evaluate(() => {
          const btn = document.getElementById('btn-selection');
          if (btn) {
            const rect = btn.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
          return null;
        });

        if (btnPos) {
          await page.mouse.move(btnPos.x, btnPos.y, { steps: 10 });
          await sleep(150);
          await page.mouse.click(btnPos.x, btnPos.y);

          // Wait for popover
          await page.waitForSelector('#inline-popover', { state: 'visible', timeout: 5000 });
          await sleep(300);

          // Type the question
          await moveToElement(page, '#popover-textarea');
          await typeSlowly(page, '#popover-textarea', 'What does this mean?', 50);
          await sleep(300);

          // Click Ask button
          await moveToElement(page, '#popover-ask');
          await sleep(200);
          await page.click('#popover-ask');

          // Wait for AI response to complete
          console.log('Waiting for AI response...');
          await page.waitForSelector('.popover-message-assistant', { timeout: 60000 });

          // Wait a bit more for the response to fully stream
          await sleep(5000);
          console.log('Got AI response');
        }
      } catch (e) {
        console.log('Selection interaction failed:', e);
      }
    } else {
      console.log('Could not find "probabilistic" in content');
    }

    // === Final pause ===
    console.log('Final pause...');
    await sleep(2000);

    console.log('Demo recording complete!');

  } catch (error) {
    console.error('Error during recording:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();

    // Find the most recent video file and rename it
    const videosDir = './videos';
    const files = fs.readdirSync(videosDir)
      .filter(f => f.endsWith('.webm') && f !== 'demo.webm')
      .map(f => ({ name: f, mtime: fs.statSync(path.join(videosDir, f)).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    if (files.length > 0) {
      const oldPath = path.join(videosDir, files[0].name);
      const newPath = path.join(videosDir, 'demo.webm');
      // Remove old demo.webm if exists
      if (fs.existsSync(newPath)) {
        fs.unlinkSync(newPath);
      }
      fs.renameSync(oldPath, newPath);
      console.log(`Video saved to: ${newPath}`);
      console.log('\nTo convert to MP4, run:');
      console.log('  ffmpeg -i videos/demo.webm -c:v libx264 -crf 20 -preset slow demo.mp4');
    }
  }
}

main().catch(console.error);
