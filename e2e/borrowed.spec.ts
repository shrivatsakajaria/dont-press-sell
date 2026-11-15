import { expect, test, type Page } from '@playwright/test';
import { pressStart } from './start';

async function unlockBorrowed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('dps:borrowedUnlocked', 'true');
    localStorage.setItem('dps:borrowed', 'true');
    // A pot above $10,000, as after the first blind win that unlocks the mode (a wipe-out from $10,000 would be bust).
    localStorage.setItem('dps:pot', '20000');
  });
}

test('borrowed money on a known crash with no taps is wiped out on the margin-called page', async ({ page }) => {
  await unlockBorrowed(page);
  await page.clock.install();
  await page.goto('/?run=c2007');
  // R51: the warning is on the Start screen; the play screen does not lay it over the narrator's line.
  const warning = 'You have borrowed $20,000. Every move is three times bigger. Fall a third and you are wiped out.';
  await expect(page.locator('.intro')).toContainText(warning);
  await pressStart(page);
  await expect(page.locator('.folio')).toContainText('Borrowed money');
  await expect(page.locator('.standfirst')).not.toHaveText(warning);
  // Run the clock a second at a time until the front page prints (the wipe-out comes mid-fall).
  for (let i = 0; i < 150 && (await page.locator('.es-h1').count()) === 0; i++) await page.clock.runFor(1000);
  await expect(page.locator('.es-folio span').first()).toHaveText('Borrowed money');
  await expect(page.locator('.es-h1')).toHaveText('Local investor gets margin called');
  // R40: the pot is hidden. The borrowed money switch lives in the collection (R44: the result fits one screen).
  await expect(page.getByText(/Your pot/)).toHaveCount(0);
  await page.clock.runFor(6_000);
  await page.getByRole('button', { name: 'Your collection' }).click();
  await expect(page.getByRole('switch', { name: /Play with borrowed money/ })).toHaveAttribute('aria-checked', 'true');
});

test('borrowed money on a known scare with no taps finishes ahead', async ({ page }) => {
  await unlockBorrowed(page);
  await page.clock.install();
  await page.goto('/?run=s2018');
  await pressStart(page);
  await expect(page.locator('.folio')).toContainText('Borrowed money');
  await page.clock.runFor(119_000); // R27: s2018 runs about 118 s
  await expect(page.getByText('Late edition')).toBeVisible();
  await page.clock.runFor(6_000);
  await expect(page.locator('.es-lead')).toHaveText(/^\$[\d,]+ ahead of someone who did nothing$/);
  await expect(page.locator('.es-lead')).not.toHaveText(/^\$0 /);
});
