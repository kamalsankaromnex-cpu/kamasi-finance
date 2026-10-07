/**
 * Pure TypeScript utility for converting financial amounts into words using the Indian Numbering System (INR).
 * Nomenclature: Rupees, Paise, Thousand, Lakh, Crore.
 */

const UNITS = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function convertTwoDigits(n: number): string {
  if (n === 0) return "";
  if (n < 20) return UNITS[n];
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  return `${TENS[ten]}${unit ? "-" + UNITS[unit] : ""}`;
}

function convertThreeDigits(n: number): string {
  if (n === 0) return "";
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;
  const hundredStr = hundred ? `${UNITS[hundred]} Hundred` : "";
  const remainderStr = convertTwoDigits(remainder);

  if (hundredStr && remainderStr) return `${hundredStr} ${remainderStr}`;
  return hundredStr || remainderStr;
}

function convertIntegerToWords(n: number): string {
  if (n === 0) return "Zero";

  let num = n;
  const parts: string[] = [];

  // Crores (1,00,00,000)
  const crores = Math.floor(num / 10000000);
  if (crores > 0) {
    parts.push(`${convertIntegerToWords(crores)} Crore`);
    num %= 10000000;
  }

  // Lakhs (1,00,000)
  const lakhs = Math.floor(num / 100000);
  if (lakhs > 0) {
    parts.push(`${convertTwoDigits(lakhs)} Lakh`);
    num %= 100000;
  }

  // Thousands (1,000)
  const thousands = Math.floor(num / 1000);
  if (thousands > 0) {
    parts.push(`${convertTwoDigits(thousands)} Thousand`);
    num %= 1000;
  }

  // Hundreds, Tens & Units
  if (num > 0) {
    parts.push(convertThreeDigits(num));
  }

  return parts.join(" ");
}

export interface AmountToWordsResult {
  words: string;
  isValid: boolean;
  error?: string;
}

export function amountToWordsINR(amountInput: number | string | null | undefined): AmountToWordsResult {
  if (amountInput === null || amountInput === undefined) {
    return { words: "", isValid: false, error: "Amount input is empty" };
  }

  const strVal = String(amountInput).trim().replace(/[₹,\s]/g, "");
  if (!strVal) {
    return { words: "", isValid: false, error: "Amount input is empty" };
  }

  const numVal = Number(strVal);
  if (isNaN(numVal) || !isFinite(numVal)) {
    return { words: "", isValid: false, error: "Invalid numeric amount" };
  }

  if (numVal < 0) {
    return { words: "", isValid: false, error: "Amount cannot be negative" };
  }

  // Maximum supported limit: 99,999 Crore (999,999,999,999.99)
  if (numVal > 999999999999.99) {
    return { words: "", isValid: false, error: "Amount exceeds maximum supported limit" };
  }

  // Split into integer and paise (up to 2 decimal places)
  const parts = strVal.split(".");
  const intPart = parseInt(parts[0] || "0", 10);
  let paisePart = 0;

  if (parts.length > 1 && parts[1]) {
    const rawPaiseStr = parts[1].slice(0, 2).padEnd(2, "0");
    paisePart = parseInt(rawPaiseStr, 10);
  }

  const rupeeWords = intPart > 0 || paisePart === 0 ? convertIntegerToWords(intPart) : "";
  const paiseWords = paisePart > 0 ? convertTwoDigits(paisePart) : "";

  let resultWords = "";

  if (rupeeWords && paiseWords) {
    resultWords = `${rupeeWords} Rupees and ${paiseWords} Paise Only`;
  } else if (rupeeWords) {
    resultWords = `${rupeeWords} Rupees Only`;
  } else if (paiseWords) {
    resultWords = `${paiseWords} Paise Only`;
  } else {
    resultWords = "Zero Rupees Only";
  }

  return { words: resultWords, isValid: true };
}
