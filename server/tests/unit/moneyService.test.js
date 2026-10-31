jest.mock("../../src/config/db", () => ({ connect: jest.fn() }));

const pool = require("../../src/config/db");
const { ApiError, normalizeAmount, withTransaction, adjustBalance } = require("../../src/services/moneyService");

describe("money service", () => {
  beforeEach(() => pool.connect.mockReset());

  test.each([["0.01"], ["1"], ["1000000.00"], [2.5]])(
    "accepts valid amount %s",
    (amount) => {
      expect(normalizeAmount(amount)).toBe(String(amount));
    },
  );

  test.each(["0", "0.00", "-1", "1.001", "1e3", "1000000.01", "10000000000000"])(
    "rejects invalid amount %s",
    (amount) => {
      expect(() => normalizeAmount(amount)).toThrow(ApiError);
    },
  );

  test.each(["40001", "40P01"])("retries PostgreSQL error %s", async (code) => {
    const client = { query: jest.fn().mockResolvedValue({}), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    const conflict = Object.assign(new Error("retryable database failure"), { code });
    const operation = jest.fn().mockImplementationOnce(() => { throw conflict; }).mockResolvedValue("committed");

    await expect(withTransaction(operation)).resolves.toBe("committed");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  test("applies balances with a NUMERIC SQL delta", async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ balance: "7.25" }] }) };
    await expect(adjustBalance(client, { id: "wallet-id" }, "2.75", "debit")).resolves.toBe("7.25");
    expect(client.query.mock.calls[0][0]).toContain("balance = balance + ($1::numeric * $2)");
    expect(client.query.mock.calls[0][1]).toEqual(["2.75", -1, "wallet-id"]);
  });
});