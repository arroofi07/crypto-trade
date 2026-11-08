import { expect, test } from '@playwright/test';
import { testToken } from '../fixtures/session.js';

test('bootstraps a session, removes the fragment, and preserves the session on reload', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`/#session=${testToken}`);
  await expect(page.getByRole('status')).toHaveText('Backend lokal terhubung');
  await expect(page).toHaveURL('http://127.0.0.1:14317/');
  expect(await page.evaluate(() => sessionStorage.getItem('memecoin.session'))).toBe(testToken);
  expect(requests.every((url) => !url.includes(testToken))).toBe(true);
  await expect(page.getByRole('button', { name: 'Buat eksperimen', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Backend lokal terhubung');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('onboarding, watchlist, signal, preview, next-observation fill and confirmed exit', async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${testToken}`, Origin: 'http://127.0.0.1:14317' };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/#session=${testToken}`);
  await page.getByRole('button', { name: 'Buat eksperimen', exact: true }).click();
  await page.getByLabel('Kurs USD/IDR').fill('16000');
  await page.getByRole('button', { name: 'Simpan eksperimen' }).click();
  await expect(page.getByText('Eksperimen dibuat.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Watchlist', exact: true }).click();
  await page.getByLabel('Alamat mint', { exact: true }).fill('So11111111111111111111111111111111111111112');
  await page.getByRole('button', { name: 'Tambah watchlist' }).click();
  await expect(page.getByText('Mint ditambahkan.', { exact: false })).toBeVisible();
  const warmup = await request.post('/api/v1/__fixture/warmup', { headers, data: {} });
  expect(warmup.ok(), await warmup.text()).toBe(true);
  await page.getByRole('button', { name: 'Periksa ulang' }).click();
  await page.getByRole('button', { name: 'Detail token' }).click();
  await expect(page.getByRole('link', { name: 'TradingView Lightweight Charts™', exact: true })).toBeVisible();
  await page.route('**/api/v1/events', (route) => route.abort()); await page.reload();
  await page.getByRole('button', { name: 'Sinyal', exact: true }).click();
  await page.locator('.signal-item').first().click();
  await expect(page.getByRole('button', { name: 'Hitung preview' })).toBeDisabled();
  await page.unroute('**/api/v1/events');
  await expect(page.getByRole('status')).toHaveText('Backend lokal terhubung', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Sinyal', exact: true }).click();
  await page.locator('.signal-item').first().click();
  await page.getByRole('button', { name: 'Hitung preview' }).click();
  await expect(page.getByRole('heading', { name: 'Preview simulasi' })).toBeVisible();
  await page.getByRole('button', { name: 'Simulasikan masuk' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByText('SIMULASI PENDING:', { exact: false })).toBeVisible();
  expect((await request.post('/api/v1/__fixture/observe', { headers, data: { price: '1.066' } })).ok()).toBe(true);
  await page.getByRole('button', { name: 'Posisi', exact: true }).click();
  await expect(page.getByText('OPEN', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tutup simulasi' }).click();
  await page.getByRole('button', { name: 'Konfirmasi exit' }).click();
  await expect(page.getByText('Exit intent tersimpan;', { exact: false })).toBeVisible();
  expect((await request.post('/api/v1/__fixture/observe', { headers, data: { price: '1.1' } })).ok()).toBe(true);
  await expect(page.getByText('CLOSED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Jurnal', exact: true }).click();
  await expect(page.getByText('1 closed', { exact: false })).toBeVisible();
  await expect(page.getByTestId('journal-pnl')).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Ekspor CSV' }).click();
  expect((await download).suggestedFilename()).toBe('simulasi-jurnal.csv');
  await page.getByRole('button', { name: 'Berita', exact: true }).click();
  await page.getByLabel('Judul', { exact: true }).fill('Fixture <img src=x onerror="window.injected=true"> berita');
  await page.getByLabel('URL sumber').fill('https://example.com/news');
  await page.getByRole('button', { name: 'Simpan link' }).click();
  await expect(page.getByRole('link', { name: 'Fixture  berita' })).toBeVisible();
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('shows a missing-session message without requesting protected data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Sesi belum tersedia');
  await expect(page.getByRole('button', { name: 'Periksa ulang' })).toBeDisabled();
});

test('clears a rejected session and hides health status', async ({ page }) => {
  await page.goto(`/#session=${'x'.repeat(43)}`);
  await expect(page.getByRole('status')).toContainText('Sesi kedaluwarsa');
  expect(await page.evaluate(() => sessionStorage.getItem('memecoin.session'))).toBeNull();
  await expect(page.getByText('Belum dikonfigurasi')).toHaveCount(0);
});

test('shows a connection failure and recovers when retried', async ({ page }) => {
  await page.route('**/api/v1/health', (route) => route.abort());
  await page.goto(`/#session=${testToken}`);
  await expect(page.getByRole('status')).toContainText('Backend tidak terjangkau');
  await page.unroute('**/api/v1/health');
  await page.getByRole('button', { name: 'Periksa ulang' }).click();
  await expect(page.getByRole('status')).toHaveText('Backend lokal terhubung');
});
