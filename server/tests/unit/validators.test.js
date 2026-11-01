const { validationResult } = require('express-validator');
const v = require('../../src/middleware/validators');

async function run(chains, req) {
  const request = { body: {}, params: {}, query: {}, headers: {}, ...req };
  for (const chain of [].concat(chains)) {
    // eslint-disable-next-line no-await-in-loop
    await chain.run(request);
  }
  return { ok: validationResult(request).isEmpty(), req: request };
}

describe('amount', () => {
  test.each([['12.34', true], ['0.01', true], [5, true], ['1000000', true], ['0', false], ['1.001', false], ['1000000.01', false], ['1e2', false], [null, false], [true, false]])(
    'validates %p -> %p',
    async (amount, valid) => {
      expect((await run(v.amount('amount'), { body: { amount } })).ok).toBe(valid);
    },
  );
});

describe('identity fields', () => {
  test('email is trimmed and lower-cased', async () => {
    const { ok, req } = await run(v.email(), { body: { email: '  Mixed.Case@Example.COM ' } });
    expect(ok).toBe(true);
    expect(req.body.email).toBe('mixed.case@example.com');
  });

  test.each(['nope', '', 'a@b', 42])('rejects email %p', async (email) => {
    expect((await run(v.email(), { body: { email } })).ok).toBe(false);
  });

  test.each([
    ['Password123', true],
    ['abcdefg1', true],
    ['short1', false],
    ['allletters', false],
    ['12345678', false],
    [`a1${'x'.repeat(71)}`, false],
  ])('password %p -> %p', async (password, valid) => {
    expect((await run(v.newPassword(), { body: { password } })).ok).toBe(valid);
  });

  test('phone is optional but must look like a phone number', async () => {
    expect((await run(v.phone, { body: {} })).ok).toBe(true);
    expect((await run(v.phone, { body: { phone: '+880 1700-000000' } })).ok).toBe(true);
    expect((await run(v.phone, { body: { phone: 'call me' } })).ok).toBe(false);
  });

  test('free text rejects control characters and enforces length', async () => {
    expect((await run(v.note, { body: { note: 'Lunch & coffee' } })).ok).toBe(true);
    expect((await run(v.note, { body: { note: 'bad\u0000byte' } })).ok).toBe(false);
    expect((await run(v.note, { body: { note: 'x'.repeat(501) } })).ok).toBe(false);
  });
});

describe('money and routing fields', () => {
  test('wallet numbers are normalised to upper case', async () => {
    const { ok, req } = await run(v.walletNumber('to'), { body: { to: 'paynx-123456' } });
    expect(ok).toBe(true);
    expect(req.body.to).toBe('PAYNX-123456');
    expect((await run(v.walletNumber('to'), { body: { to: 'PAYNX-12' } })).ok).toBe(false);
  });

  test('currency must be supported', async () => {
    expect((await run(v.currency, { body: { currency: 'bdt' } })).ok).toBe(true);
    expect((await run(v.currency, { body: { currency: 'EUR' } })).ok).toBe(false);
  });

  test('provider must be on the allow list', async () => {
    expect((await run(v.provider, { body: { provider: 'card' } })).ok).toBe(true);
    expect((await run(v.provider, { body: { provider: 'paypal' } })).ok).toBe(false);
  });

  test('UUID params and bodies', async () => {
    expect((await run(v.uuidParam('id'), { params: { id: 'not-a-uuid' } })).ok).toBe(false);
    expect((await run(v.uuidBody('w'), { body: { w: '6f1c1d2e-6a0f-4f7e-9d43-2b4b8d8f6a10' } })).ok).toBe(true);
    expect((await run(v.uuidBody('w'), { body: { w: 123 } })).ok).toBe(false);
    expect((await run(v.uuidBody('w', { optional: true }), { body: {} })).ok).toBe(true);
  });

  test('pagination and transaction type', async () => {
    expect((await run([...v.pagination, v.transactionType], { query: { limit: '10', offset: '0', type: 'merchant_payment' } })).ok).toBe(true);
    expect((await run(v.pagination, { query: { limit: '500' } })).ok).toBe(false);
    expect((await run(v.transactionType, { query: { type: 'bogus' } })).ok).toBe(false);
  });
});
