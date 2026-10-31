jest.mock("../../src/config/db", () => ({ query: jest.fn() }));

const pool = require("../../src/config/db");
const { stableStringify, createRequestHash, begin } = require("../../src/services/idempotencyStore");

describe("idempotency store", () => {
  beforeEach(() => pool.query.mockReset());

  test("creates stable hashes independent of object key order", () => {
    expect(stableStringify({ amount: "5.00", wallet: { id: 2 } })).toBe(
      stableStringify({ wallet: { id: 2 }, amount: "5.00" }),
    );
    const hash = createRequestHash({ method: "POST", originalUrl: "/pay", body: { amount: "5.00" } });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("recognizes existing records as replay or payload conflict", async () => {
    pool.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ request_hash: `${"a".repeat(64)} `, response_status: 201, response_body: { ok: true } }] });
    await expect(begin("user", "key", "/pay", "a".repeat(64))).resolves.toEqual({
      state: "replay", status: 201, body: { ok: true },
    });

    pool.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ request_hash: "b".repeat(64), response_status: null }] });
    await expect(begin("user", "key", "/pay", "a".repeat(64))).resolves.toEqual({ state: "conflict" });
  });
});