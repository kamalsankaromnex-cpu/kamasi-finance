"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/currency";
import { Calculator, Landmark, Building2 } from "lucide-react";

export function LoanFdCalculator() {
  const [activeMode, setActiveMode] = useState<"LOAN" | "FD">("LOAN");

  // Loan State
  const [loanPrincipal, setLoanPrincipal] = useState("2500000"); // 25 Lakhs
  const [loanRate, setLoanRate] = useState("8.5");             // 8.5% p.a.
  const [loanTenureYears, setLoanTenureYears] = useState("15");  // 15 Years

  // FD State
  const [fdPrincipal, setFdPrincipal] = useState("500000");     // 5 Lakhs
  const [fdRate, setFdRate] = useState("7.1");                // 7.1% p.a.
  const [fdTenureYears, setFdTenureYears] = useState("5");      // 5 Years
  const [fdCompounding, setFdCompounding] = useState("4");     // Quarterly (4 times a year)

  // LOAN CALCULATION (Equated Monthly Installment)
  const p = parseFloat(loanPrincipal) || 0;
  const r = (parseFloat(loanRate) || 0) / 12 / 100;
  const n = (parseFloat(loanTenureYears) || 0) * 12;

  let emi = 0;
  let totalLoanPayment = 0;
  let totalInterestPayable = 0;

  if (p > 0 && r > 0 && n > 0) {
    emi = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    totalLoanPayment = emi * n;
    totalInterestPayable = totalLoanPayment - p;
  }

  // FD CALCULATION (Compound Interest A = P(1 + r/n)^(nt))
  const fdP = parseFloat(fdPrincipal) || 0;
  const fdR = (parseFloat(fdRate) || 0) / 100;
  const fdT = parseFloat(fdTenureYears) || 0;
  const fdN = parseFloat(fdCompounding) || 4;

  let fdMaturityValue = 0;
  let fdInterestEarned = 0;

  if (fdP > 0 && fdR > 0 && fdT > 0) {
    fdMaturityValue = fdP * Math.pow(1 + fdR / fdN, fdN * fdT);
    fdInterestEarned = fdMaturityValue - fdP;
  }

  return (
    <Card className="shadow-xs border-muted">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calculator className="w-5 h-5 text-emerald-600" /> Loan EMI & Fixed Deposit Calculator
            </CardTitle>
            <CardDescription className="text-xs">
              Simulate loan repayment amortization, interest cost, and fixed deposit compound interest yield.
            </CardDescription>
          </div>
          <div className="flex gap-1 border rounded-lg p-1 text-xs font-semibold bg-muted/40">
            <button
              onClick={() => setActiveMode("LOAN")}
              className={`px-3 py-1 rounded-md transition-all ${activeMode === "LOAN" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"}`}
            >
              Loan EMI
            </button>
            <button
              onClick={() => setActiveMode("FD")}
              className={`px-3 py-1 rounded-md transition-all ${activeMode === "FD" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"}`}
            >
              FD Maturity
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeMode === "LOAN" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Loan Amount (Principal ₹)</label>
                <Input type="number" value={loanPrincipal} onChange={(e) => setLoanPrincipal(e.target.value)} placeholder="2500000" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Interest Rate (% p.a.)</label>
                <Input type="number" step="0.1" value={loanRate} onChange={(e) => setLoanRate(e.target.value)} placeholder="8.5" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Tenure (Years)</label>
                <Input type="number" value={loanTenureYears} onChange={(e) => setLoanTenureYears(e.target.value)} placeholder="15" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 p-4 bg-muted/30 rounded-xl border text-center text-xs">
              <div>
                <div className="text-muted-foreground font-medium">Monthly EMI</div>
                <div className="text-lg font-bold text-rose-600 mt-0.5">{formatINR(Math.round(emi))}</div>
              </div>
              <div>
                <div className="text-muted-foreground font-medium">Total Interest Payable</div>
                <div className="text-base font-bold text-amber-600 mt-0.5">{formatINR(Math.round(totalInterestPayable))}</div>
              </div>
              <div>
                <div className="text-muted-foreground font-medium">Total Outflow</div>
                <div className="text-base font-bold text-foreground mt-0.5">{formatINR(Math.round(totalLoanPayment))}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">FD Principal Amount (₹)</label>
                <Input type="number" value={fdPrincipal} onChange={(e) => setFdPrincipal(e.target.value)} placeholder="500000" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Interest Rate (% p.a.)</label>
                <Input type="number" step="0.1" value={fdRate} onChange={(e) => setFdRate(e.target.value)} placeholder="7.1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Tenure (Years)</label>
                <Input type="number" value={fdTenureYears} onChange={(e) => setFdTenureYears(e.target.value)} placeholder="5" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 p-4 bg-muted/30 rounded-xl border text-center text-xs">
              <div>
                <div className="text-muted-foreground font-medium">Invested Principal</div>
                <div className="text-base font-bold text-foreground mt-0.5">{formatINR(Math.round(fdP))}</div>
              </div>
              <div>
                <div className="text-muted-foreground font-medium">Guaranteed Interest Earned</div>
                <div className="text-base font-bold text-emerald-600 mt-0.5">{formatINR(Math.round(fdInterestEarned))}</div>
              </div>
              <div>
                <div className="text-muted-foreground font-medium">Total Maturity Value</div>
                <div className="text-lg font-bold text-emerald-700 mt-0.5">{formatINR(Math.round(fdMaturityValue))}</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
