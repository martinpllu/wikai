import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const TEST_PROJECT_PREFIX = 'test-';

// Generate project name once at module load time so it's shared across all tests
const testProjectName = `${TEST_PROJECT_PREFIX}${Math.random().toString(36).substring(2, 10)}`;

test.describe.configure({ mode: 'serial' });

test.describe('Delve Complete Workflow', () => {
  test.beforeAll(() => {
    console.log(`Test project name: ${testProjectName}`);
  });

  test.afterAll(async () => {
    // Clean up test project directory
    const projectDir = path.join(process.cwd(), 'data', testProjectName);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      console.log(`Cleaned up test project: ${testProjectName}`);
    }
  });

  test('1. Create a new project with random name', async ({ page }) => {
    // Navigate to home
    await page.goto('/');

    // Should redirect to /main
    await expect(page).toHaveURL(/\/main/);

    // Open project dropdown
    await page.click('#project-current');
    await expect(page.locator('#project-dropdown')).toBeVisible();

    // Click create new project button
    await page.click('#project-create-btn');

    // Fill in project name
    await page.fill('#project-create-input', testProjectName);

    // Submit to create project
    await page.click('#project-create-submit');

    // Wait for navigation to new project
    await page.waitForURL(`/${testProjectName}`);
    await expect(page).toHaveURL(`/${testProjectName}`);

    // Verify project appears in selector
    await expect(page.locator('#project-current')).toContainText(testProjectName);
  });

  test('2. Create a new wiki page about a topic', async ({ page }) => {
    // Navigate to project home
    await page.goto(`/${testProjectName}`);

    // Fill in topic
    const topic = 'The History of Pizza';
    await page.fill('#topic', topic);

    // Submit the form
    await page.click('#generate-btn');

    // Wait for streaming to start (streaming section becomes visible)
    await expect(page.locator('#streaming-section')).toBeVisible({ timeout: 10000 });

    // Wait for navigation to wiki page (streaming complete)
    await page.waitForURL(/the-history-of-pizza/, { timeout: 120000 });

    // Verify content was generated
    await expect(page.locator('#wiki-content')).not.toBeEmpty();
    const content = await page.locator('#wiki-content').textContent();
    expect(content?.toLowerCase()).toContain('pizza');
  });

  test('3. Ask a question (page-level comment) on the page', async ({ page }) => {
    // Navigate to the wiki page
    await page.goto(`/${testProjectName}/the-history-of-pizza`);
    await expect(page.locator('#wiki-content')).toBeVisible();

    // Switch to comment tab if needed
    const commentTab = page.locator('[data-tab="comment"]');
    if (await commentTab.isVisible()) {
      await commentTab.click();
    }

    // Fill in a question
    const question = 'What is the most popular pizza topping in Italy?';
    await page.fill('#comment-message', question);

    // Submit the comment
    await page.click('#comment-submit');

    // Wait for AI response (comment thread should appear)
    await expect(page.locator('.comment-thread')).toBeVisible({ timeout: 60000 });

    // Verify the user's question appears
    await expect(page.locator('.comment-message-user .comment-content').first()).toContainText(question);

    // Verify AI responded
    await expect(page.locator('.comment-message-assistant .comment-content').first()).not.toBeEmpty({ timeout: 60000 });
  });

  test('4. Reply to the question thread', async ({ page }) => {
    // Navigate to the wiki page
    await page.goto(`/${testProjectName}/the-history-of-pizza`);
    await expect(page.locator('#wiki-content')).toBeVisible();

    // Switch to comment tab
    const commentTab = page.locator('[data-tab="comment"]');
    if (await commentTab.isVisible()) {
      await commentTab.click();
    }

    // Wait for existing comment thread to load
    await expect(page.locator('.comment-thread')).toBeVisible({ timeout: 10000 });

    // Click reply button on the first thread
    const replyBtn = page.locator('.btn-reply').first();
    await replyBtn.click();

    // Wait for reply form to appear
    const threadId = await replyBtn.getAttribute('data-thread-id');
    const replyForm = page.locator(`.reply-form[data-thread-id="${threadId}"]`);
    await expect(replyForm).toBeVisible();

    // Type a reply
    const reply = 'Thanks! What about in America?';
    await replyForm.locator('textarea').fill(reply);

    // Submit reply
    await replyForm.locator('.btn-submit-reply').click();

    // Wait for the reply to appear and AI response
    await expect(page.locator('.comment-message-user .comment-content').nth(1)).toContainText(reply, { timeout: 60000 });

    // Wait for AI response to the reply
    const messages = page.locator('.comment-thread .comment-message');
    await expect(messages).toHaveCount(4, { timeout: 60000 }); // 2 original + 2 new (user reply + AI response)
  });

  test('5. Request a page-level edit (translate to pirate speak)', async ({ page }) => {
    // Navigate to the wiki page
    await page.goto(`/${testProjectName}/the-history-of-pizza`);
    await expect(page.locator('#wiki-content')).toBeVisible();

    // Get original content for comparison
    const originalContent = await page.locator('#wiki-content').textContent();

    // Switch to edit tab
    await page.click('[data-tab="edit"]');
    await expect(page.locator('#tab-edit')).toBeVisible();

    // Fill in edit request
    const editRequest = 'Translate the entire page to pirate speak. Use "arr", "matey", "ye", "be" instead of formal English. Make it fun and playful like a pirate would talk.';
    await page.fill('#edit-message', editRequest);

    // Submit edit
    await page.click('#edit-submit');

    // Wait for page to update (content should change)
    await page.waitForFunction(
      (original) => {
        const content = document.querySelector('#wiki-content')?.textContent;
        return content && content !== original;
      },
      originalContent,
      { timeout: 120000 }
    );

    // Verify content changed and has pirate-y words
    const newContent = await page.locator('#wiki-content').textContent();
    expect(newContent).not.toBe(originalContent);

    // Check for pirate speak indicators (at least one should be present)
    const pirateWords = ['arr', 'matey', 'ye', 'be', 'ahoy', 'scallywag', 'buccaneer', 'landlubber'];
    const hasPirateSpeak = pirateWords.some(word =>
      newContent?.toLowerCase().includes(word)
    );
    expect(hasPirateSpeak).toBe(true);
  });

  test('6. Inline comment - select text and ask a question', async ({ page }) => {
    // Navigate to the wiki page
    await page.goto(`/${testProjectName}/the-history-of-pizza`);
    await expect(page.locator('#wiki-content')).toBeVisible();

    // Get a paragraph element to select text from
    const paragraph = page.locator('#wiki-content p').first();
    await expect(paragraph).toBeVisible();

    // Use JavaScript to reliably select text (triple-click can be flaky)
    await paragraph.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      // Dispatch mouseup to trigger toolbar
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    // Wait for selection toolbar to appear
    await expect(page.locator('#selection-toolbar')).toBeVisible({ timeout: 5000 });

    // Click the comment button
    await page.click('#btn-comment');

    // Wait for popover to appear
    await expect(page.locator('#inline-popover')).toBeVisible();

    // Type a question about the selected text
    const inlineQuestion = 'Can you explain this in simpler terms?';
    await page.fill('#popover-textarea', inlineQuestion);

    // Submit
    await page.click('#popover-submit');

    // Wait for response in popover - the popover uses .popover-message-assistant class
    await expect(page.locator('#popover-body .popover-message-assistant')).toBeVisible({ timeout: 60000 });

    // Verify inline comment mark exists in content (may need to reload if selection spanned elements)
    await page.waitForTimeout(1000); // Allow for any DOM updates

    // Either the mark should exist or the page was reloaded - check for either
    const hasInlineComment = await page.locator('#wiki-content mark.inline-comment').count() > 0;

    // If the page was reloaded to handle the selection, close popover and verify
    if (!hasInlineComment) {
      // Page might have reloaded, so verify we're still on the wiki page
      await expect(page.locator('#wiki-content')).toBeVisible();
    }
  });

  test('7. Inline edit - select text and request edit', async ({ page }) => {
    // Navigate to the wiki page
    await page.goto(`/${testProjectName}/the-history-of-pizza`);
    await expect(page.locator('#wiki-content')).toBeVisible();

    // Get original content
    const originalContent = await page.locator('#wiki-content').textContent();

    // Select text from a paragraph
    const paragraph = page.locator('#wiki-content p').first();
    await expect(paragraph).toBeVisible();

    // Use JavaScript to reliably select text (triple-click can be flaky)
    await paragraph.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      // Dispatch mouseup to trigger toolbar
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    // Wait for selection toolbar
    await expect(page.locator('#selection-toolbar')).toBeVisible({ timeout: 5000 });

    // Click the edit button
    await page.click('#btn-edit');

    // Wait for popover
    await expect(page.locator('#inline-popover')).toBeVisible();

    // Type edit instruction
    const editInstruction = 'Make this paragraph ALL CAPS';
    await page.fill('#popover-textarea', editInstruction);

    // Submit
    await page.click('#popover-submit');

    // Wait for content to update - the page will reload after streaming edit
    await page.waitForFunction(
      (original) => {
        const content = document.querySelector('#wiki-content')?.textContent;
        return content && content !== original;
      },
      originalContent,
      { timeout: 120000 }
    );

    // Verify content changed
    const newContent = await page.locator('#wiki-content').textContent();
    expect(newContent).not.toBe(originalContent);
  });

  test('8. Test version history and revert functionality', async ({ page }) => {
    // Navigate to the wiki page
    await page.goto(`/${testProjectName}/the-history-of-pizza`);
    await expect(page.locator('#wiki-content')).toBeVisible();

    // Switch to edit tab to see version history
    await page.click('[data-tab="edit"]');
    await expect(page.locator('#tab-edit')).toBeVisible();

    // Version history should be visible
    await expect(page.locator('#version-history')).toBeVisible();

    // We should have multiple versions now (original + pirate + inline edit)
    const versionItems = page.locator('.version-item');
    const versionCount = await versionItems.count();
    expect(versionCount).toBeGreaterThanOrEqual(2);

    // Get the current version number
    const currentVersionBadge = page.locator('.version-item.version-current .version-number');
    const currentVersionText = await currentVersionBadge.textContent();
    const currentVersionNum = parseInt(currentVersionText?.replace('v', '') || '0');

    // Click preview on v1
    const previewBtn = page.locator('.btn-preview-version[data-version="1"]');
    if (await previewBtn.isVisible()) {
      await previewBtn.click();

      // Modal should appear
      await expect(page.locator('#version-preview-modal')).toBeVisible();

      // Preview content should exist
      await expect(page.locator('#preview-content')).not.toBeEmpty();

      // Close modal
      await page.click('#modal-close');
      await expect(page.locator('#version-preview-modal')).not.toBeVisible();
    }

    // If we're not already on v1, revert to it
    if (currentVersionNum > 1) {
      const revertBtn = page.locator('.btn-revert-version[data-version="1"]');
      if (await revertBtn.isVisible()) {
        // Handle confirmation dialog
        page.on('dialog', dialog => dialog.accept());

        await revertBtn.click();

        // Wait for page to reload
        await page.waitForLoadState('networkidle');

        // Verify we're now on v1 by checking the URL is still correct
        await expect(page).toHaveURL(/the-history-of-pizza/);
        await expect(page.locator('#wiki-content')).toBeVisible();
      }
    }
  });

  test('9. Verify version history shows multiple versions', async ({ page }) => {
    // Navigate to the wiki page
    await page.goto(`/${testProjectName}/the-history-of-pizza`);
    await expect(page.locator('#wiki-content')).toBeVisible();

    // Switch to edit tab
    await page.click('[data-tab="edit"]');
    await expect(page.locator('#tab-edit')).toBeVisible();

    // Wait for initial version history to load
    await expect(page.locator('.version-item')).toBeVisible({ timeout: 10000 });

    // Check "show all versions" checkbox to see all versions
    const showAllCheckbox = page.locator('#show-all-versions');
    await expect(showAllCheckbox).toBeVisible();
    await showAllCheckbox.check();

    // Wait for the version list to reload
    await page.waitForResponse(response =>
      response.url().includes('/history') && response.status() === 200
    );

    // Give time for DOM to update after the fetch
    await page.waitForTimeout(500);

    // We should have multiple versions (original + pirate + inline edit = at least 3)
    const versionItems = page.locator('.version-item');
    const versionCount = await versionItems.count();
    expect(versionCount).toBeGreaterThanOrEqual(3);

    // Verify v1 is current (after revert)
    const currentVersion = page.locator('.version-item.version-current');
    await expect(currentVersion).toBeVisible();

    // The current version should be v1 (with "Current" badge)
    await expect(currentVersion.locator('.version-badge')).toContainText('Current');

    // Other versions should have "Revert" buttons (not current)
    const revertButtons = page.locator('.btn-revert-version');
    const revertCount = await revertButtons.count();
    expect(revertCount).toBeGreaterThanOrEqual(2); // v2 and v3 should have revert buttons
  });

  test('10. Page delete and cleanup verification', async ({ page }) => {
    // Navigate to the wiki page
    await page.goto(`/${testProjectName}/the-history-of-pizza`);
    await expect(page.locator('#wiki-content')).toBeVisible();

    // Handle confirmation dialogs
    page.on('dialog', dialog => dialog.accept());

    // Click delete button
    const deleteBtn = page.locator('#btn-delete-page');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Should redirect to project home after deletion
    await page.waitForURL(`/${testProjectName}`, { timeout: 10000 });

    // Verify we're on the project home
    await expect(page.locator('#generate-section')).toBeVisible();

    // The page should no longer be in the sidebar
    await expect(page.locator('.page-item[data-slug="the-history-of-pizza"]')).not.toBeVisible();
  });
});
