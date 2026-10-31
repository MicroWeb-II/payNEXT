const { test, expect } = require("@playwright/test");
const pool = require("../../src/config/db");

test.afterAll(async () => {
  await pool.end();
});

test("registers, logs in, tops up, transfers, views history, and logs out", async ({ page }) => {
  await pool.query(`TRUNCATE TABLE idempotency_keys, merchant_payments, merchants,
    gateway_transactions, payment_requests, transfers, transactions, wallets, users
    RESTART IDENTITY CASCADE`);

  const recipientResponse = await fetch("http://127.0.0.1:3000/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `recipient-${Date.now()}@example.com`,
      password: "Password123",
      fullName: "Smoke Recipient",
    }),
  });
  expect(recipientResponse.status).toBe(201);
  const recipient = (await recipientResponse.json()).data.wallet;
  const email = `smoke-${Date.now()}@example.com`;

  await page.goto("/#/register");
  await page.locator("#register-name").fill("Smoke User");
  await page.locator("#register-email").fill(email);
  await page.locator("#register-password").fill("Password123");
  await page.locator("#register-submit-btn").click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.locator("#dash-wallet-number")).toContainText("PAYNX-");

  await page.locator("#logout-button").click();
  await expect(page).toHaveURL(/#\/login$/);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill("Password123");
  await page.locator("#login-submit-btn").click();
  await expect(page).toHaveURL(/#\/dashboard$/);

  await page.locator("#topup-amount").fill("25.00");
  await page.locator("#topup-submit-btn").click();
  await expect(page.locator("#dash-wallet-balance")).toContainText("25.00");

  await page.locator("#transfer-to-wallet").fill(recipient.wallet_number);
  await page.locator("#transfer-amount").fill("5.00");
  await page.locator("#transfer-submit-btn").click();
  await expect(page.locator("#dash-wallet-balance")).toContainText("20.00");
  await expect(page.locator("#transactions-container")).toContainText("TRANSFER OUT");
  await expect(page.locator("#transactions-container")).toContainText("TOP UP");

  await page.locator("#logout-button").click();
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.locator("#nav-auth")).toBeHidden();
});