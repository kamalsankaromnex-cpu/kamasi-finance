import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!file.includes("node_modules") && !file.includes(".next") && !file.includes(".git")) {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

describe("Static Architecture Verification — No Direct Balance Mutation", () => {
  it("enforces LedgerService as sole authoritative balance mutation path", () => {
    const rootDir = path.resolve(__dirname, "../../..");
    const srcDir = path.join(rootDir, "src");
    const allFiles = getAllFiles(srcDir);

    const forbiddenPatterns = [
      /balance\.increment/,
      /balance\.decrement/,
      /balance\.update/,
      /account\.balance\s*=/,
      /prisma\.account\.update\s*\(\s*\{\s*data\s*:\s*\{\s*balance/,
      /debitAccountWithinLimit/,
    ];

    const violations: { file: string; line: number; content: string; pattern: string }[] = [];

    const approvedLedgerFile = path.normalize(path.join(srcDir, "finance", "ledger.service.ts"));
    const noMutationTestFile = path.normalize(__filename);

    for (const file of allFiles) {
      const normalized = path.normalize(file);

      // Exempt the sole approved ledger engine and this test file
      if (normalized === approvedLedgerFile || normalized === noMutationTestFile) {
        continue;
      }

      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      lines.forEach((lineText, index) => {
        // Skip comment lines or test docstrings if any
        if (lineText.trim().startsWith("//") || lineText.trim().startsWith("*")) {
          return;
        }

        for (const pattern of forbiddenPatterns) {
          if (pattern.test(lineText)) {
            violations.push({
              file: path.relative(rootDir, file),
              line: index + 1,
              content: lineText.trim(),
              pattern: pattern.toString(),
            });
          }
        }
      });
    }

    if (violations.length > 0) {
      console.error("Direct balance mutation violations found:", violations);
    }

    expect(violations, `Found ${violations.length} direct balance mutation violations outside LedgerService`).toEqual([]);
  });
});
