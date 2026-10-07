"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/currency";
import { Calculator, ShieldCheck, HelpCircle } from "lucide-react";

export function TaxCalculator({ defaultGrossSalary }: { defaultGrossSalary?: number }) {
  const [grossAnnualSalary, setGrossAnnualSalary] = useState<string>(
    defaultGrossSalary ? String(defaultGrossSalary * 12) : "1500000"
  );
  const [section80C, setSection80C] = useState<string>("150000"); // PF, PPF, ELSS, Insurance
  const [section80D, setSection80D] = useState<string>("25000");  // Health Insurance
  const [hraExemption, setHraExemption] = useState<string>("100000");
  const [otherDeductions, setOtherDeductions] = useState<string>("50000"); // NPS, LTA, PT

  const gross = parseFloat(grossAnnualSalary) || 0;
  const s80c = Math.min(150000, parseFloat(section80C) || 0);
  const s80d = parseFloat(section80D) || 0;
  const hra = parseFloat(hraExemption) || 0;
  const otherDed = parseFloat(otherDeductions) || 0;

  // 1. NEW REGIME CALCULATION
  const newStdDeduction = 75000;
  const newTaxableIncome = Math.max(0, gross - newStdDeduction);
  let newTax = 0;

  if (newTaxableIncome > 1500000) {
    newTax += (newTaxableIncome - 1500000) * 0.3;
    newTax += 300000 * 0.2;
    newTax += 200000 * 0.15;
    newTax += 300000 * 0.1;
    newTax += 400000 * 0.05;
  } else if (newTaxableIncome > 1200000) {
    newTax += (newTaxableIncome - 1200000) * 0.2;
    newTax += 200000 * 0.15;
    newTax += 300000 * 0.1;
    newTax += 400000 * 0.05;
  } else if (newTaxableIncome > 1000000) {
    newTax += (newTaxableIncome - 1000000) * 0.15;
    newTax += 300000 * 0.1;
    newTax += 400000 * 0.05;
  } else if (newTaxableIncome > 700000) {
    newTax += (newTaxableIncome - 700000) * 0.1;
    newTax += 400000 * 0.05;
  } else if (newTaxableIncome > 300000) {
    newTax += (newTaxableIncome - 300000) * 0.05;
  }

  // Section 87A Rebate New Regime (up to 7 Lakhs taxable)
  if (newTaxableIncome <= 700000) {
    newTax = 0;
  }

  const newCess = newTax * 0.04;
  const totalNewTax = Math.round(newTax + newCess);

  // 2. OLD REGIME CALCULATION
  const oldStdDeduction = 50000;
  const totalOldDeductions = oldStdDeduction + s80c + s80d + hra + otherDed;
  const oldTaxableIncome = Math.max(0, gross - totalOldDeductions);
  let oldTax = 0;

  if (oldTaxableIncome > 1000000) {
    oldTax += (oldTaxableIncome - 1000000) * 0.3;
    oldTax += 500000 * 0.2;
    oldTax += 250000 * 0.05;
  } else if (oldTaxableIncome > 500000) {
    oldTax += (oldTaxableIncome - 500000) * 0.2;
    oldTax += 250000 * 0.05;
  } else if (oldTaxableIncome > 250000) {
    oldTax += (oldTaxableIncome - 250000) * 0.05;
  }

  // Section 87A Rebate Old Regime (up to 5 Lakhs taxable)
  if (oldTaxableIncome <= 500000) {
    oldTax = 0;
  }

  const oldCess = oldTax * 0.04;
  const totalOldTax = Math.round(oldTax + oldCess);

  const savings = Math.abs(totalOldTax - totalNewTax);
  const recommendedRegime = totalNewTax <= totalOldTax ? "NEW" : "OLD";

  return (
    <Card className="shadow-xs border-muted">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-500" /> Indian Income Tax Regime Simulator (FY 2026-27)
        </CardTitle>
        <CardDescription className="text-xs">
          Compare Old Tax Regime vs New Tax Regime based on your Annual CTC, 80C investments, HRA, and health insurance deductions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Gross Annual Income (₹)</label>
            <Input
              type="number"
              value={grossAnnualSalary}
              onChange={(e) => setGrossAnnualSalary(e.target.value)}
              placeholder="1500000"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Section 80C Investments (Max ₹1.5L)</label>
            <Input
              type="number"
              value={section80C}
              onChange={(e) => setSection80C(e.target.value)}
              placeholder="150000"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Section 80D Health Insurance (₹)</label>
            <Input
              type="number"
              value={section80D}
              onChange={(e) => setSection80D(e.target.value)}
              placeholder="25000"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">HRA Exemption Claimed (₹)</label>
            <Input
              type="number"
              value={hraExemption}
              onChange={(e) => setHraExemption(e.target.value)}
              placeholder="100000"
            />
          </div>
        </div>

        {/* Comparison Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* New Regime Card */}
          <div className={`p-4 rounded-xl border ${recommendedRegime === "NEW" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/30"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">New Tax Regime</span>
              {recommendedRegime === "NEW" && (
                <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  RECOMMENDED
                </span>
              )}
            </div>
            <div className="text-xs space-y-1.5 text-muted-foreground">
              <div className="flex justify-between">
                <span>Standard Deduction:</span>
                <span className="font-semibold text-foreground">₹75,000</span>
              </div>
              <div className="flex justify-between">
                <span>Net Taxable Income:</span>
                <span className="font-semibold text-foreground">{formatINR(newTaxableIncome)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-bold text-foreground text-sm">
                <span>Total Annual Tax:</span>
                <span className="text-emerald-600">{formatINR(totalNewTax)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Monthly TDS: {formatINR(Math.round(totalNewTax / 12))}</div>
            </div>
          </div>

          {/* Old Regime Card */}
          <div className={`p-4 rounded-xl border ${recommendedRegime === "OLD" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/30"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">Old Tax Regime</span>
              {recommendedRegime === "OLD" && (
                <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  RECOMMENDED
                </span>
              )}
            </div>
            <div className="text-xs space-y-1.5 text-muted-foreground">
              <div className="flex justify-between">
                <span>Total Exemptions & Deductions:</span>
                <span className="font-semibold text-foreground">{formatINR(totalOldDeductions)}</span>
              </div>
              <div className="flex justify-between">
                <span>Net Taxable Income:</span>
                <span className="font-semibold text-foreground">{formatINR(oldTaxableIncome)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-bold text-foreground text-sm">
                <span>Total Annual Tax:</span>
                <span className="text-emerald-600">{formatINR(totalOldTax)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Monthly TDS: {formatINR(Math.round(totalOldTax / 12))}</div>
            </div>
          </div>
        </div>

        {/* Recommendation Summary */}
        <div className="p-3 bg-muted/40 rounded-xl border text-xs flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>
            <strong>Tax Savings Insight:</strong> Choosing the <strong>{recommendedRegime === "NEW" ? "New Tax Regime" : "Old Tax Regime"}</strong> saves you approximately <strong>{formatINR(savings)}</strong> annually in income tax.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
