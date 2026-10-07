import { describe, it, expect } from "vitest";
import { amountToWordsINR } from "../amount-to-words";

describe("INR Amount-to-Words Converter — Unit Test Suite", () => {
  it("converts zero correctly", () => {
    const res = amountToWordsINR(0);
    expect(res.isValid).toBe(true);
    expect(res.words).toBe("Zero Rupees Only");

    const resStr = amountToWordsINR("0.00");
    expect(resStr.isValid).toBe(true);
    expect(resStr.words).toBe("Zero Rupees Only");
  });

  it("converts simple whole numbers in Indian numbering system", () => {
    expect(amountToWordsINR(1).words).toBe("One Rupees Only");
    expect(amountToWordsINR(50).words).toBe("Fifty Rupees Only");
    expect(amountToWordsINR(1250).words).toBe("One Thousand Two Hundred Fifty Rupees Only");
    expect(amountToWordsINR("8500").words).toBe("Eight Thousand Five Hundred Rupees Only");
  });

  it("converts Thousands, Lakhs, and Crores correctly", () => {
    // 50,000
    expect(amountToWordsINR(50000).words).toBe("Fifty Thousand Rupees Only");

    // 25,00,000 (25 Lakhs)
    expect(amountToWordsINR(2500000).words).toBe("Twenty-Five Lakh Rupees Only");

    // 1,00,00,000 (1 Crore)
    expect(amountToWordsINR(10000000).words).toBe("One Crore Rupees Only");

    // 1,05,43,210 (1 Crore 5 Lakh 43 Thousand 2 Hundred 10)
    expect(amountToWordsINR("10543210").words).toBe(
      "One Crore Five Lakh Forty-Three Thousand Two Hundred Ten Rupees Only"
    );
  });

  it("converts Paise / decimals up to 2 decimal places accurately", () => {
    // ₹106.25
    const res1 = amountToWordsINR(106.25);
    expect(res1.isValid).toBe(true);
    expect(res1.words).toBe("One Hundred Six Rupees and Twenty-Five Paise Only");

    // ₹0.50
    const res2 = amountToWordsINR("0.50");
    expect(res2.isValid).toBe(true);
    expect(res2.words).toBe("Fifty Paise Only");

    // ₹1500.75
    const res3 = amountToWordsINR("1500.75");
    expect(res3.isValid).toBe(true);
    expect(res3.words).toBe("One Thousand Five Hundred Rupees and Seventy-Five Paise Only");
  });

  it("rejects negative amounts gracefully with clear validation state", () => {
    const res = amountToWordsINR(-500);
    expect(res.isValid).toBe(false);
    expect(res.words).toBe("");
    expect(res.error).toBe("Amount cannot be negative");
  });

  it("rejects non-numeric inputs and empty values cleanly", () => {
    const res1 = amountToWordsINR("abc");
    expect(res1.isValid).toBe(false);
    expect(res1.error).toBe("Invalid numeric amount");

    const res2 = amountToWordsINR("");
    expect(res2.isValid).toBe(false);

    const res3 = amountToWordsINR(null);
    expect(res3.isValid).toBe(false);

    const res4 = amountToWordsINR(undefined);
    expect(res4.isValid).toBe(false);
  });

  it("rejects values exceeding maximum supported limit", () => {
    const res = amountToWordsINR("99999999999999999");
    expect(res.isValid).toBe(false);
    expect(res.error).toBe("Amount exceeds maximum supported limit");
  });
});
