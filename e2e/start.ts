import { expect, type Page } from '@playwright/test';

/** A fresh page load waits on the start screen (R28): press Start to set the clock going. */
export async function pressStart(page: Page) {
  const start = page.locator('button.act');
  await expect(start).toHaveText('Start');
  await start.click();
}
