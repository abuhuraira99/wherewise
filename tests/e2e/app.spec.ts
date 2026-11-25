import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const fixture = (name: string) => path.join(here, '..', 'fixtures', name);

/** Collect uncaught errors and console errors (ignoring third-party tile noise). */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/tiles\.openfreemap|Failed to load resource|ERR_|net::|AJAXError/i.test(t)) return;
    errors.push(`console: ${t}`);
  });
  return errors;
}

async function noHorizontalOverflow(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, 'page must not scroll sideways').toBeLessThanOrEqual(cw + 1);
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1200) < 720;

test.describe('landing', () => {
  test('first viewport proves the product with live data', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'A heat map is not evidence.' })).toBeVisible();
    await expect(page.getByText('Choose file').first()).toBeVisible();
    await expect(page.locator('.stamp')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.plate-cap')).toContainText('Getis-Ord Gi*');
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('comparison and honesty sections compute from real data', async ({ page }) => {
    await page.goto('/');
    await page.locator('.compare').scrollIntoViewIfNeeded();
    await expect(page.locator('.cplate').nth(1)).toContainText('hot and', { timeout: 60_000 });
    await page.locator('.honesty').scrollIntoViewIfNeeded();
    await expect(page.locator('.hscore-num').first()).toBeVisible();
    const before = Number(await page.locator('.hscore-num').first().innerText());
    const after = Number(await page.locator('.hscore-num').nth(1).innerText());
    expect(after).toBeGreaterThan(before);
    await noHorizontalOverflow(page);
  });

  test('field guide is reachable and readable', async ({ page }) => {
    await page.goto('/guide');
    await expect(page.getByRole('heading', { name: 'The field guide' })).toBeVisible();
    await expect(page.locator('.chapter')).toHaveCount(8);
    await noHorizontalOverflow(page);
  });
});

test.describe('studio', () => {
  test('upload a CSV, profile it, and test for hot spots', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/studio');
    await expect(page.getByRole('heading', { name: 'Start a survey' })).toBeVisible();
    await page.locator('input[type=file]').first().setInputFiles(fixture('clinic_visits.csv'));
    await expect(page.locator('.rail')).toBeVisible();
    await expect(page.locator('.facts')).toContainText('600');
    await expect(page.locator('.fieldlist')).toContainText('visit_date');
    await expect(page.locator('.kind--datetime')).toHaveCount(1);
    await expect(page.locator('.kind--qualitative').first()).toBeVisible();
    // the null island row and the empty row are reported, not silently dropped
    await expect(page.locator('.rail')).toContainText('could not be placed');

    await page.getByRole('button', { name: /Test/ }).first().click();
    await page.getByRole('button', { name: 'Hot spots', exact: true }).click();
    await expect(page.locator('.legend')).toContainText(/Hot spot|Not significant/);
    await expect(page.locator('.facts--tight')).toContainText('Hexagons tested');
    const hot = Number(await page.locator('.facts--tight .hot').innerText());
    expect(hot, 'the planted cluster must be found').toBeGreaterThan(0);
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('a file without coordinates explains itself', async ({ page }) => {
    await page.goto('/studio');
    await page.locator('input[type=file]').first().setInputFiles(fixture('no_coordinates.csv'));
    await expect(page.locator('.error-sheet')).toContainText('No latitude and longitude columns found');
    await page.getByRole('button', { name: 'Try something else' }).click();
    await expect(page.locator('.error-sheet')).toHaveCount(0);
  });

  test('GeoJSON points load', async ({ page }) => {
    await page.goto('/studio');
    await page.locator('input[type=file]').first().setInputFiles(fixture('reports.geojson'));
    await expect(page.locator('.facts')).toContainText('120');
  });

  test('every station works on the London sample', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/studio?sample=lfb');
    await expect(page.locator('.rail-num')).toBeVisible({ timeout: 60_000 });

    const go = async (name: string) => {
      await page.locator('.sta button', { hasText: name }).click();
      await expect(page.locator('.panel-head h2')).toBeVisible();
    };

    await go('Symbolize');
    await page.getByRole('button', { name: 'Graduated', exact: true }).click();
    await page.locator('select').first().selectOption({ label: 'animal · category' });
    await expect(page.locator('.finding--fail')).toContainText('is a category, but it is drawn as an amount');
    await page.getByRole('button', { name: 'Switch to unique values' }).click();
    await expect(page.locator('.finding--fail')).toHaveCount(0);

    await go('Test');
    await page.getByRole('button', { name: 'Heat map', exact: true }).click();
    await expect(page.locator('.finding--warn')).toContainText('density, not significance');
    await page.getByRole('button', { name: 'Test this pattern' }).click();
    await expect(page.locator('.facts--tight')).toBeVisible();

    await go('Time');
    await expect(page.locator('.legend')).toContainText(/rising|consistently high|No significant change/i);
    await page.getByRole('button', { name: 'Multiples', exact: true }).click();
    await expect(page.locator('.multiple').first()).toBeVisible();
    await page.getByText('Same class breaks in every panel').click();
    await expect(page.locator('.finding--fail')).toContainText('own class breaks');
    await page.getByRole('button', { name: 'Lock breaks across panels' }).click();
    await page.getByRole('button', { name: 'Animate', exact: true }).click();
    await expect(page.locator('.frame-label')).toBeVisible();

    await go('Relief');
    await page.getByRole('button', { name: 'Space-time cube' }).click();
    await expect(page.locator('.legend')).toContainText('Space-time cube');
    await page.getByRole('button', { name: 'Extrude', exact: true }).click();

    await go('Chart');
    await expect(page.locator('.chart--clock')).toBeVisible();
    await page.locator('.bar').first().click();
    await expect(page.getByRole('button', { name: 'Clear selection' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear selection' }).click();

    await go('Deliver');
    await page.locator('.product', { hasText: 'Print map' }).click();
    await expect(page.locator('.poster-img')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('.product', { hasText: 'Story brief' }).click();
    await expect(page.locator('.brief-finding').first()).toBeVisible();
    await expect(page.locator('.brief')).toContainText('Mann-Kendall');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('.product', { hasText: 'Dashboard' }).click();
    await expect(page.locator('.dash-side')).toContainText('Hot spot hexagons');
    await page.getByRole('button', { name: 'Back to studio' }).click();
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('calculated field with an expression', async ({ page }) => {
    test.skip(isPhone(page), 'covered on desktop');
    await page.goto('/studio?sample=lfb&sta=symbolize');
    await expect(page.locator('.rail-num')).toBeVisible({ timeout: 60_000 });
    await page.getByLabel('Field name').fill('weekday');
    await page.getByLabel('Expression').fill('Weekday($feature.date_time)');
    await expect(page.locator('.field-hint').filter({ hasText: '→' })).toContainText('day');
    await page.getByRole('button', { name: 'Add field' }).click();
    await page.locator('.sta button', { hasText: 'Survey' }).click();
    await expect(page.locator('.fieldlist')).toContainText('weekday');
  });

  test('live feeds open', async ({ page }) => {
    for (const id of ['usgs', 'chicago']) {
      await page.goto(`/studio?sample=${id}`);
      await expect(page.locator('.rail-num')).toBeVisible({ timeout: 90_000 });
      await expect(page.locator('.facts')).not.toContainText('Events placed\n0');
    }
  });
});

test.describe('edge api', () => {
  test('health, feeds and errors', async ({ request }) => {
    const h = await request.get('/api/health');
    expect(h.ok()).toBeTruthy();
    expect((await h.json()).ok).toBe(true);
    for (const id of ['usgs', 'chicago']) {
      const r = await request.get(`/api/feeds/${id}`);
      expect(r.status(), id).toBe(200);
      expect((await r.body()).byteLength).toBeGreaterThan(10_000);
    }
    expect((await request.get('/api/nope')).status()).toBe(404);
    expect((await request.post('/api/health')).status()).toBe(405);
    const spa = await request.get('/studio/anything');
    expect(spa.status()).toBe(200);
  });
});
