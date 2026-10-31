const { validationResult } = require("express-validator");
const { amount, uuidParam } = require("../../src/middleware/validators");

describe("request validators", () => {
  test.each([["12.34", true], ["0.01", true], ["0", false], ["1.001", false]])(
    "validates amount %s",
    async (value, valid) => {
      const req = { body: { amount: value }, params: {} };
      await amount("amount").run(req);
      expect(validationResult(req).isEmpty()).toBe(valid);
    },
  );

  test("validates UUID route parameters", async () => {
    const req = { body: {}, params: { id: "not-a-uuid" } };
    await uuidParam("id").run(req);
    expect(validationResult(req).isEmpty()).toBe(false);
  });
});