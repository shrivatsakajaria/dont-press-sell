import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import { pressStart } from './start';

// The live Content-Security-Policy (public/_headers) is applied to every page here, so a game played end to end
// (start, sell, buy back, result, share) must raise no CSP violation: the policy never breaks the game.
const csp = /Content-Security-Policy:\s*(.+)/.exec(readFileSync('public/_headers', 'utf8'))?.[1].trim() ?? '';

test('the live Content-Security-Policy allows a whole game, the result and sharing', async ({ page }) => {
  expect(csp).toContain("default-src 'self'");
  test.setTimeout(240_000);
  await page.route(/^http:\/\/(localhost|127\.0\.0\.1)/, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } });
  });
  const violations: string[] = [];
  await page.exposeFunction('reportViolation', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { reportViolation(v: string): void }).reportViolation(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await page.goto('/?run=c2020');
  await pressStart(page);
  const act = page.locator('button.act');
  await page.clock.runFor(6000);
  await act.click();
  await page.clock.runFor(6000);
  await act.click();
  await page.clock.runFor(200_000);
  await expect(page.locator('.es-h1')).toBeVisible();
  const reveal = page.getByText('Tap to see what that was');
  if (await reveal.count()) await reveal.click();
  await page.clock.runFor(5000);
  const challenge = page.getByRole('button', { name: /Challenge a friend/ });
  if (await challenge.count()) await challenge.first().click();
  await page.clock.runFor(2000);
  expect(violations, violations.join('\n')).toEqual([]);
});
