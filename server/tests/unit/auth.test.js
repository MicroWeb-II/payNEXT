const jwt = require("jsonwebtoken");
const { requireAuth, signToken } = require("../../src/middleware/auth");

function response() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("auth middleware", () => {
  test("rejects requests without a bearer token", () => {
    const res = response();
    const next = jest.fn();
    requireAuth({ headers: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("accepts a signed user token", () => {
    const token = signToken({ id: "user-1", email: "user@example.com", role: "user" });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();
    requireAuth(req, response(), next);
    expect(req.user.sub).toBe("user-1");
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("rejects invalid tokens", () => {
    const res = response();
    requireAuth({ headers: { authorization: `Bearer ${jwt.sign({}, "wrong")}` } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});