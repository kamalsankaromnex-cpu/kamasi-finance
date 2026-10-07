/**
 * AI Natural Language Goal Intent Parser
 * Parses prompts like: "I want to buy a car worth 10 lakhs in December 2026 and save 25k monthly"
 * Strictly generates goal draft inputs.
 * Zero ledger interactions, zero math mutations.
 */

export interface ParsedGoalDraft {
  name: string;
  targetAmount?: number;
  targetDate?: string;
  monthlyContribution?: number;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  deadlineFlexibility?: "STRICT" | "MODERATE" | "FLEXIBLE";
  notes?: string;
  confidence: number;
}

export class AiGoalParser {
  public static parse(prompt: string): ParsedGoalDraft {
    const text = prompt.trim();
    let targetAmount: number | undefined;
    let monthlyContribution: number | undefined;
    let targetDate: string | undefined;
    let priority: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    let deadlineFlexibility: "STRICT" | "MODERATE" | "FLEXIBLE" = "MODERATE";

    // 1. Amount Extraction (Lakhs, Cr, K, thousands, direct numbers)
    const lakhMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:lakh|lac|lacs|lakhs)/i);
    if (lakhMatch) {
      targetAmount = Math.round(parseFloat(lakhMatch[1]) * 100000);
    } else {
      const crMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:crore|cr|crores)/i);
      if (crMatch) {
        targetAmount = Math.round(parseFloat(crMatch[1]) * 10000000);
      } else {
        const directAmount = text.match(/(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})+|\d{4,9})/i);
        if (directAmount) {
          targetAmount = parseInt(directAmount[1].replace(/,/g, ""), 10);
        }
      }
    }

    // 2. Monthly Contribution Extraction
    const monthlyMatch = text.match(/(?:save|invest|contribute|put aside)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:k|thousand|lakh)?\s*(?:per\s*month|monthly|\/mo)/i);
    if (monthlyMatch) {
      let val = parseFloat(monthlyMatch[1]);
      if (/k|thousand/i.test(monthlyMatch[0])) val *= 1000;
      if (/lakh/i.test(monthlyMatch[0])) val *= 100000;
      monthlyContribution = Math.round(val);
    }

    // 3. Target Date / Horizon Extraction
    const yearMatch = text.match(/\b(202[5-9]|203[0-9]|204[0-9])\b/);
    const monthNames: Record<string, number> = {
      january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
      april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
      august: 7, aug: 7, september: 8, sep: 8, sept: 8,
      october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
    };

    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10);
      let month = 11; // default to December of that year
      for (const [mName, mIdx] of Object.entries(monthNames)) {
        if (new RegExp(`\\b${mName}\\b`, "i").test(text)) {
          month = mIdx;
          break;
        }
      }
      const date = new Date(Date.UTC(year, month, 1));
      targetDate = date.toISOString().split("T")[0];
    } else {
      const yearsInMatch = text.match(/(?:in|after)\s*(\d+)\s*years?/i);
      if (yearsInMatch) {
        const y = parseInt(yearsInMatch[1], 10);
        const d = new Date();
        d.setFullYear(d.getFullYear() + y);
        targetDate = d.toISOString().split("T")[0];
      }
    }

    // 4. Priority
    if (/urgent|critical|high priority|must have|essential/i.test(text)) {
      priority = "HIGH";
    } else if (/low priority|optional|leisure|someday/i.test(text)) {
      priority = "LOW";
    }

    // 5. Flexibility
    if (/strict|hard deadline|non-negotiable|fixed date/i.test(text)) {
      deadlineFlexibility = "STRICT";
    } else if (/flexible|can wait|relax|no hurry/i.test(text)) {
      deadlineFlexibility = "FLEXIBLE";
    }

    // 6. Name Guessing
    let name = "New Goal";
    const nameMatch = text.match(/(?:buy|purchase|save for|plan for|fund)\s+(?:a\s+|an\s+)?([a-zA-Z\s]{3,25})(?:\s+worth|\s+by|\s+in|\s+for|\s+of|$)/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }

    return {
      name,
      targetAmount,
      targetDate,
      monthlyContribution,
      priority,
      deadlineFlexibility,
      notes: `Parsed from user prompt: "${text}"`,
      confidence: targetAmount && targetDate ? 0.9 : 0.6,
    };
  }
}
