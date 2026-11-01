const { test, expect } = require('@playwright/test');
const { pool, resetDatabase } = require('../helpers/db');

const API = 'http://127.0.0.1:3000/api/v1';

test.beforeAll(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await pool.end();
});

test('register, log in, top up, transfer, view history and log out', async ({ page }) => {
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const recipientResponse = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `recipient-${Date.now()}@example.com`, password: 'Password123', fullName: 'Smoke Recipient' }),
  });
  expect(recipientResponse.status).toBe(201);
  const recipient = (await recipientResponse.json()).data.wallet;
  const email = `smoke-${Date.now()}@example.com`;

  // Register (the client enforces the same password policy as the API).
  await page.goto('/#/register');
  await page.locator('#register-name').fill('Smoke User');
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill('weakpass');
  await page.locator('#register-submit-btn').click();
  await expect(page.locator('#register-error')).toContainText('letter and a number');
  await page.locator('#register-password').fill('Password123');
  await page.locator('#register-submit-btn').click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.locator('#dash-wallet-number')).toContainText('PAYNX-');
  await expect(page.locator('#dash-user-email')).toHaveText(email);

  // Log out, then log back in.
  await page.locator('#logout-button').click();
  await expect(page).toHaveURL(/#\/login$/);
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill('WrongPass1');
  await page.locator('#login-submit-btn').click();
  await expect(page.locator('#login-error')).toContainText('Invalid email or password');
  await page.locator('#login-password').fill('Password123');
  await page.locator('#login-submit-btn').click();
  await expect(page).toHaveURL(/#\/dashboard$/);

  // Top up: the balance is re-fetched from the server after the mutation.
  await page.locator('#topup-amount').fill('25.00');
  await page.locator('#topup-submit-btn').click();
  await expect(page.locator('#dash-wallet-balance')).toContainText('25.00');

  // A failed transfer shows an error and leaves the UI usable.
  await page.locator('#transfer-to-wallet').fill(recipient.wallet_number);
  await page.locator('#transfer-amount').fill('500.00');
  await page.locator('#transfer-submit-btn').click();
  await expect(page.locator('#transfer-error')).toContainText('Insufficient funds');
  await expect(page.locator('#transfer-submit-btn')).toBeEnabled();

  await page.locator('#transfer-amount').fill('5.00');
  await page.locator('#transfer-submit-btn').click();
  await expect(page.locator('#dash-wallet-balance')).toContainText('20.00');

  // History shows both movements.
  await expect(page.locator('#transactions-container')).toContainText('TRANSFER OUT');
  await expect(page.locator('#transactions-container')).toContainText('TOP UP');

  // A reload restores the session via the refresh cookie.
  await page.reload();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.locator('#dash-wallet-balance')).toContainText('20.00');

  await page.locator('#logout-button').click();
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.locator('#nav-auth')).toBeHidden();

  // After logout the session cannot be restored.
  await page.goto('/#/dashboard');
  await expect(page).toHaveURL(/#\/login$/);

  expect(consoleErrors).toEqual([]);
});
