const errorHandler = require('../../src/middleware/errorHandler');
const { ApiError } = require('../../src/lib/errors');

function makeRes() {
  const res = { headersSent: false };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const req = { id: 'req-1', log: { error: jest.fn(), debug: jest.fn() } };

test('exposes client error messages', () => {
  const res = makeRes();
  errorHandler(new ApiError('Wallet not found', 404), req, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Wallet not found', requestId: 'req-1' });
});

test('hides internal error details and logs them', () => {
  const res = makeRes();
  errorHandler(new Error('connection string leaked'), req, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json.mock.calls[0][0].error).toBe('Internal server error');
  expect(req.log.error).toHaveBeenCalled();
});

test('maps body parser errors', () => {
  const res = makeRes();
  errorHandler(Object.assign(new Error('x'), { type: 'entity.too.large', status: 413 }), req, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(413);
});

test('does nothing when headers were already sent', () => {
  const res = makeRes();
  res.headersSent = true;
  errorHandler(new Error('late'), req, res, jest.fn());
  expect(res.status).not.toHaveBeenCalled();
});
