jest.mock('../../src/models/userModel', () => ({ findById: jest.fn() }));

const jwt = require('jsonwebtoken');
const userModel = require('../../src/models/userModel');
const config = require('../../src/config/env');
const { requireAuth, requireRole, signToken, verifyToken } = require('../../src/middleware/auth');

function response() {
  const res = { status: jest.fn(), json: jest.fn(), set: jest.fn() };
  res.status.mockReturnValue(res);
  res.set.mockReturnValue(res);
  return res;
}

const request = (token) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });
const activeUser = { id: 'user-1', email: 'user@example.com', role: 'user', status: 'active', full_name: 'User' };

beforeEach(() => userModel.findById.mockReset());

describe('signToken / verifyToken', () => {
  test('issues short-lived HS256 access tokens with issuer and audience', () => {
    const token = signToken(activeUser);
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded.header.alg).toBe('HS256');
    expect(decoded.payload).toMatchObject({ sub: 'user-1', typ: 'access', iss: 'paynext-api', aud: 'paynext-client' });
    expect(decoded.payload.exp - decoded.payload.iat).toBe(config.auth.accessTokenTtlSeconds);
    expect(verifyToken(token).sub).toBe('user-1');
  });

  test('rejects tokens with another algorithm, audience or type', () => {
    const none = jwt.sign({ sub: 'x', typ: 'access' }, '', { algorithm: 'none' });
    expect(() => verifyToken(none)).toThrow();
    const wrongAudience = jwt.sign({ sub: 'x', typ: 'access' }, config.auth.jwtSecret, { issuer: 'paynext-api', audience: 'other' });
    expect(() => verifyToken(wrongAudience)).toThrow();
    const notAccess = jwt.sign({ sub: 'x', typ: 'refresh' }, config.auth.jwtSecret, { issuer: 'paynext-api', audience: 'paynext-client' });
    expect(() => verifyToken(notAccess)).toThrow('Not an access token');
  });
});

describe('requireAuth', () => {
  test('rejects requests without a bearer token', async () => {
    const res = response();
    const next = jest.fn();
    await requireAuth(request(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.set).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects invalid tokens', async () => {
    const res = response();
    await requireAuth(request(jwt.sign({}, 'wrong-secret')), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(userModel.findById).not.toHaveBeenCalled();
  });

  test('loads the current user from the database', async () => {
    userModel.findById.mockResolvedValue({ ...activeUser, role: 'admin' });
    const req = request(signToken(activeUser));
    const next = jest.fn();
    await requireAuth(req, response(), next);
    expect(next).toHaveBeenCalledWith();
    // The role comes from the database, not the (stale) token.
    expect(req.user).toEqual({ sub: 'user-1', email: 'user@example.com', role: 'admin', status: 'active', fullName: 'User' });
  });

  test('rejects deleted and suspended accounts', async () => {
    userModel.findById.mockResolvedValueOnce(undefined);
    const gone = response();
    await requireAuth(request(signToken(activeUser)), gone, jest.fn());
    expect(gone.status).toHaveBeenCalledWith(401);

    userModel.findById.mockResolvedValueOnce({ ...activeUser, status: 'suspended' });
    const suspended = response();
    await requireAuth(request(signToken(activeUser)), suspended, jest.fn());
    expect(suspended.status).toHaveBeenCalledWith(403);
  });

  test('passes database errors to the error handler', async () => {
    const failure = new Error('db down');
    userModel.findById.mockRejectedValue(failure);
    const next = jest.fn();
    await requireAuth(request(signToken(activeUser)), response(), next);
    expect(next).toHaveBeenCalledWith(failure);
  });
});

describe('requireRole', () => {
  test('allows listed roles and forbids others', () => {
    const next = jest.fn();
    requireRole('admin')({ user: { role: 'admin' } }, response(), next);
    expect(next).toHaveBeenCalled();
    const res = response();
    requireRole('admin')({ user: { role: 'user' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
