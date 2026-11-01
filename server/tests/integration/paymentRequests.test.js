const { api, register, topUp, balance } = require('../helpers/api');
const { pool, resetDatabase } = require('../helpers/db');
const { resetAll } = require('../../src/middleware/rateLimiter');

beforeEach(async () => {
  await resetDatabase();
  await resetAll();
});

afterAll(() => pool.end());

async function setup() {
  const requester = await register();
  const payer = await register();
  const outsider = await register();
  await topUp(payer, '20.00');
  const created = await api('post', '/api/v1/payment-requests').set(requester.auth).send({
    requesterWalletId: requester.wallet.id,
    payerEmail: payer.user.email.toUpperCase(),
    amount: '5.25',
    note: 'Dinner',
  });
  expect(created.status).toBe(201);
  return { requester, payer, outsider, request: created.body.data };
}

test('payer approves once; a duplicate approval is rejected', async () => {
  const { requester, payer, request } = await setup();
  const approve = () => api('post', `/api/v1/payment-requests/${request.id}/approve`).set(payer.auth).send({ fromWalletId: payer.wallet.id });

  const paid = await approve();
  expect(paid.status).toBe(200);
  expect(paid.body.data.paymentRequest.status).toBe('paid');
  expect(await balance(payer)).toBe('14.75');
  expect(await balance(requester)).toBe('5.25');

  const again = await approve();
  expect(again.status).toBe(409);
  expect(await balance(payer)).toBe('14.75');
});

test('only participants can read a request', async () => {
  const { requester, payer, outsider, request } = await setup();
  expect((await api('get', `/api/v1/payment-requests/${request.id}`).set(requester.auth)).status).toBe(200);
  expect((await api('get', `/api/v1/payment-requests/${request.id}`).set(payer.auth)).status).toBe(200);
  expect((await api('get', `/api/v1/payment-requests/${request.id}`).set(outsider.auth)).status).toBe(404);
  const list = await api('get', '/api/v1/payment-requests').set(payer.auth);
  expect(list.body.count).toBe(1);
});

test('only the requester can edit or cancel; the payer cannot change the amount', async () => {
  const { requester, payer, request } = await setup();
  expect((await api('put', `/api/v1/payment-requests/${request.id}`).set(payer.auth).send({ amount: '0.01' })).status).toBe(404);
  const edited = await api('put', `/api/v1/payment-requests/${request.id}`).set(requester.auth).send({ amount: '6.00' });
  expect(edited.status).toBe(200);
  expect(edited.body.data.amount).toBe('6.00');

  expect((await api('delete', `/api/v1/payment-requests/${request.id}`).set(payer.auth)).status).toBe(404);
  const cancelled = await api('delete', `/api/v1/payment-requests/${request.id}`).set(requester.auth);
  expect(cancelled.body.data.status).toBe('cancelled');
  const approve = await api('post', `/api/v1/payment-requests/${request.id}/approve`).set(payer.auth).send({ fromWalletId: payer.wallet.id });
  expect(approve.status).toBe(409);
});

test('payer can decline; others cannot approve or decline', async () => {
  const { payer, outsider, request } = await setup();
  const outsiderApprove = await api('post', `/api/v1/payment-requests/${request.id}/approve`)
    .set(outsider.auth).send({ fromWalletId: outsider.wallet.id });
  expect(outsiderApprove.status).toBe(404);
  expect((await api('post', `/api/v1/payment-requests/${request.id}/decline`).set(outsider.auth)).status).toBe(404);
  const declined = await api('post', `/api/v1/payment-requests/${request.id}/decline`).set(payer.auth);
  expect(declined.body.data.status).toBe('declined');
});

test('rejects requesting money from yourself and paying with an unfunded wallet', async () => {
  const requester = await register();
  const self = await api('post', '/api/v1/payment-requests').set(requester.auth).send({
    requesterWalletId: requester.wallet.id,
    payerEmail: requester.user.email,
    amount: '1.00',
  });
  expect(self.status).toBe(400);

  const payer = await register();
  const created = await api('post', '/api/v1/payment-requests').set(requester.auth).send({
    requesterWalletId: requester.wallet.id,
    payerEmail: payer.user.email,
    amount: '1.00',
  });
  const res = await api('post', `/api/v1/payment-requests/${created.body.data.id}/approve`).set(payer.auth).send({ fromWalletId: payer.wallet.id });
  expect(res.status).toBe(400);
});
