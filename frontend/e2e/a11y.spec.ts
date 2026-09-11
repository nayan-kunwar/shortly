import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility gate: zero critical or serious violations on the three
 * static shell routes. Dynamic pages (detail, analytics) inherit the same
 * shell + tested components; their data-driven content carries labels
 * asserted in unit tests.
 */
for (const path of ['/', '/create', '/urls']) {
  test(`a11y: ${path} has no critical/serious violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
