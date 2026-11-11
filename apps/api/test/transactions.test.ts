import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Transaction } from "@blunter-bills/enable-banking";
import { isInDateRange, normalizeTransaction, transactionDate } from "../src/lib/transactions.js";

describe("transactionDate", () => {
  it("prefers booking_date, then value_date, then transaction_date", () => {
    assert.equal(
      transactionDate({
        booking_date: "2026-11-03",
        value_date: "2026-11-02",
        transaction_date: "2026-11-01",
      }),
      "2026-11-03",
    );
    assert.equal(transactionDate({ value_date: "2026-11-02" }), "2026-11-02");
    assert.equal(transactionDate({}), null);
  });
});

describe("isInDateRange", () => {
  it("is inclusive on both ends", () => {
    const transaction: Transaction = { booking_date: "2026-11-06" };
    assert.equal(isInDateRange(transaction, "2026-11-06", "2026-11-11"), true);
    assert.equal(isInDateRange(transaction, "2026-11-07", "2026-11-11"), false);
  });

  it("drops transactions without a usable date", () => {
    assert.equal(isInDateRange({}, "2026-11-01", "2026-11-11"), false);
  });
});

describe("normalizeTransaction", () => {
  it("normalizes a debit to a negative amount", () => {
    const normalized = normalizeTransaction({
      transaction_id: "tx-1",
      transaction_amount: { amount: "49.90", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: "2026-11-10",
      creditor: { name: "K-Market" },
      remittance_information: ["Card payment"],
      entry_reference: "240412-000017",
    });

    assert.deepEqual(normalized, {
      id: "tx-1",
      date: "2026-11-10",
      amount: -49.9,
      currency: "EUR",
      direction: "debit",
      status: "BOOK",
      counterparty: "K-Market",
      description: "Card payment",
      reference: "240412-000017",
      balance_after: null,
    });
  });

  it("keeps already-signed debit amounts intact", () => {
    const normalized = normalizeTransaction({
      transaction_amount: { amount: "-12.50", currency: "EUR" },
      credit_debit_indicator: "DBIT",
    });
    assert.equal(normalized.amount, -12.5);
  });

  it("does not flip credit amounts", () => {
    const normalized = normalizeTransaction({
      transaction_amount: { amount: "2450.00", currency: "EUR" },
      credit_debit_indicator: "CRDT",
      debtor: { name: "Acme Oy" },
    });
    assert.equal(normalized.amount, 2450);
    assert.equal(normalized.direction, "credit");
    assert.equal(normalized.counterparty, "Acme Oy");
  });

  it("joins array remittance information", () => {
    const normalized = normalizeTransaction({
      remittance_information: ["RF07850352502356628678117", "Gift for Alex"],
    });
    assert.equal(normalized.description, "RF07850352502356628678117 Gift for Alex");
  });
});
