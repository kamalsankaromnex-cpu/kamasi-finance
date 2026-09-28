"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
import {
  Briefcase,
  PlusCircle,
  CheckCircle2,
  Calendar,
  Building,
  User,
  Users,
  CreditCard,
  Clock,
  ArrowRight,
  FileText,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  AlertCircle,
  Filter,
} from "lucide-react";

export default function SalaryPage() {
  const [employments, setEmployments] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Workflow Modals
  const [isAddEmploymentOpen, setIsAddEmploymentOpen] = useState(false);
  const [isGeneratePayslipOpen, setIsGeneratePayslipOpen] = useState(false);
  const [isConfirmCreditOpen, setIsConfirmCreditOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);

  // Form State - Add Employment
  const [employmentForm, setEmploymentForm] = useState({
    userId: "",
    employerName: "",
    designation: "",
    employmentType: "FULL_TIME",
    joiningDate: new Date().toISOString().split("T")[0],
    salaryFrequency: "MONTHLY",
    salaryCreditDate: "1",
    status: "ACTIVE",
    expectedMonthlySalary: "",
    defaultAccountId: "",
  });

  // Form State - Monthly Payslip Inputs
  const [payslipForm, setPayslipForm] = useState({
    employmentId: "",
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
    // Earnings
    basicSalary: "",
    hra: "",
    otherAllowances: "",
    bonusIncentives: "",
    overtimeArrears: "",
    // Deductions
    pfDeduction: "",
    esiDeduction: "",
    professionalTax: "",
    tdsTax: "",
    otherDeductions: "",
  });

  // Form State - Bank Credit Confirmation
  const [creditForm, setCreditForm] = useState({
    accountId: "",
    actualCreditDate: new Date().toISOString().split("T")[0],
    actualAmountCredited: "",
    transactionRef: "",
    notes: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [empRes, payRes, memRes, accRes] = await Promise.all([
        fetch("/api/employments"),
        fetch("/api/payslips"),
        fetch("/api/household/members"),
        fetch("/api/accounts"),
      ]);

      if (empRes.ok) setEmployments(await empRes.json());
      if (payRes.ok) setPayslips(await payRes.json());
      if (memRes.ok) setMembers(await memRes.json());
      if (accRes.ok) setAccounts(await accRes.json());
    } catch (err) {
      console.error("Failed to load salary data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Derived Calculations
  const calcGross = () => {
    const b = parseFloat(payslipForm.basicSalary) || 0;
    const h = parseFloat(payslipForm.hra) || 0;
    const a = parseFloat(payslipForm.otherAllowances) || 0;
    const bon = parseFloat(payslipForm.bonusIncentives) || 0;
    const ov = parseFloat(payslipForm.overtimeArrears) || 0;
    return b + h + a + bon + ov;
  };

  const calcDeductions = () => {
    const pf = parseFloat(payslipForm.pfDeduction) || 0;
    const esi = parseFloat(payslipForm.esiDeduction) || 0;
    const pt = parseFloat(payslipForm.professionalTax) || 0;
    const tds = parseFloat(payslipForm.tdsTax) || 0;
    const oth = parseFloat(payslipForm.otherDeductions) || 0;
    return pf + esi + pt + tds + oth;
  };

  const calcNet = () => calcGross() - calcDeductions();

  // Handlers
  const handleCreateEmployment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employmentForm.employerName) return;

    try {
      const res = await fetch("/api/employments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employmentForm),
      });

      if (res.ok) {
        setIsAddEmploymentOpen(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to add employment");
      }
    } catch (err) {
      console.error("Error creating employment:", err);
    }
  };

  const handleGeneratePayslip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payslipForm.employmentId) return;

    try {
      const res = await fetch("/api/payslips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payslipForm),
      });

      if (res.ok) {
        setIsGeneratePayslipOpen(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to generate payslip");
      }
    } catch (err) {
      console.error("Error generating payslip:", err);
    }
  };

  const openConfirmCreditModal = (ps: any) => {
    setSelectedPayslip(ps);
    setCreditForm({
      accountId: ps.accountId || ps.employment?.incomeSource?.defaultAccountId || accounts[0]?.id || "",
      actualCreditDate: new Date().toISOString().split("T")[0],
      actualAmountCredited: String(ps.netSalary),
      transactionRef: "",
      notes: "",
    });
    setIsConfirmCreditOpen(true);
  };

  const handleConfirmCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayslip || !creditForm.accountId) return;

    try {
      const res = await fetch("/api/payslips/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payslipId: selectedPayslip.id,
          ...creditForm,
        }),
      });

      if (res.ok) {
        setIsConfirmCreditOpen(false);
        setSelectedPayslip(null);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to confirm salary credit");
      }
    } catch (err) {
      console.error("Error confirming credit:", err);
    }
  };

  // Metrics
  const activeEmployments = employments.filter((e) => e.status === "ACTIVE");
  const pendingPayslips = payslips.filter((p) => p.status === "GENERATED");
  const confirmedPayslips = payslips.filter((p) => p.status === "CONFIRMED_CREDITED");

  const totalNetCredited = confirmedPayslips.reduce((sum, p) => sum + Number(p.actualAmountCredited || p.netSalary), 0);
  const totalPendingCredited = pendingPayslips.reduce((sum, p) => sum + Number(p.netSalary), 0);

  return (
    <AppLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Briefcase className="h-7 w-7 text-emerald-600" />
              Salary Income & Payslip Tracker
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track employer profiles, itemized payslip earnings & deductions, and verify bank credits with zero duplicate income entries.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddEmploymentOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
            >
              <PlusCircle className="h-4 w-4" />
              1. Add Employment
            </button>
            <button
              onClick={() => {
                setPayslipForm({
                  employmentId: employments[0]?.id || "",
                  month: String(new Date().getMonth() + 1),
                  year: String(new Date().getFullYear()),
                  basicSalary: "",
                  hra: "",
                  otherAllowances: "",
                  bonusIncentives: "",
                  overtimeArrears: "",
                  pfDeduction: "",
                  esiDeduction: "",
                  professionalTax: "",
                  tdsTax: "",
                  otherDeductions: "",
                });
                setIsGeneratePayslipOpen(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-500 transition-all"
            >
              <FileText className="h-4 w-4" />
              2. Enter Payslip
            </button>
          </div>
        </div>

        {/* Workflow Overview Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Active Employments
              </CardTitle>
              <Briefcase className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{activeEmployments.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Full-time / Contract family jobs</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Salary Credited
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{formatINR(totalNetCredited)}</div>
              <p className="text-xs text-muted-foreground mt-1">Confirmed bank credits in ledger</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Awaiting Bank Credit
              </CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{formatINR(totalPendingCredited)}</div>
              <p className="text-xs text-muted-foreground mt-1">{pendingPayslips.length} payslip(s) generated</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Ledger Integrity
              </CardTitle>
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-bold text-indigo-600">Atomic 1-Balance Increment</div>
              <p className="text-xs text-muted-foreground mt-1">Expected vs received separation</p>
            </CardContent>
          </Card>
        </div>

        {/* Section 1: Employment Profiles */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold">1. Family Member Employment Profiles</CardTitle>
              <CardDescription>Configured employer details, designations, and salary credit dates.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {employments.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No employment profiles setup yet. Click &quot;Add Employment&quot; to register employer details.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {employments.map((emp) => (
                  <div key={emp.id} className="rounded-xl border p-4 space-y-3 bg-card hover:shadow-xs transition-all">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                          {emp.employmentType}
                        </span>
                        <h3 className="font-bold text-base text-foreground mt-1">{emp.employerName}</h3>
                        <p className="text-xs text-muted-foreground">{emp.designation || "Executive"}</p>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                        <Building className="h-4 w-4" />
                      </div>
                    </div>

                    <div className="space-y-1 text-xs border-t pt-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Family Member:</span>
                        <span className="font-semibold text-foreground">{emp.user?.name || "Kamalsankar"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Credit Date:</span>
                        <span className="font-semibold text-foreground">{emp.salaryCreditDate ? `${emp.salaryCreditDate}th of month` : "1st"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <span className="font-bold text-emerald-600 uppercase">{emp.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 2: Payslips & Bank Credit Reconciliation */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold">2. Monthly Payslips & Bank Credit Verification</CardTitle>
              <CardDescription>
                Compare expected Net Salary payslips against actual bank account credits.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {payslips.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No payslips generated yet. Click &quot;Enter Payslip&quot; above to record monthly earnings & deductions.
              </div>
            ) : (
              <div className="divide-y border rounded-xl overflow-hidden">
                {payslips.map((ps) => {
                  const isConfirmed = ps.status === "CONFIRMED_CREDITED";

                  return (
                    <div key={ps.id} className="p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-xl p-2.5 ${isConfirmed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm">{ps.employment?.employerName}</span>
                            <span className="text-xs text-muted-foreground">({ps.payPeriod})</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isConfirmed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                            }`}>
                              {isConfirmed ? "CREDITED TO BANK" : "AWAITING CREDIT"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Member: <span className="font-semibold text-foreground">{ps.user?.name}</span> • Basic: {formatINR(ps.basicSalary)} | HRA: {formatINR(ps.hra)} | PF: {formatINR(ps.pfDeduction)} | TDS: {formatINR(ps.tdsTax)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between lg:justify-end gap-6 border-t pt-2 lg:border-0 lg:pt-0">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Gross: {formatINR(ps.grossSalary)} | Deductions: -{formatINR(ps.totalDeductions)}</p>
                          <p className="text-base font-extrabold text-emerald-600">Net Salary: {formatINR(ps.netSalary)}</p>
                        </div>

                        {!isConfirmed ? (
                          <button
                            onClick={() => openConfirmCreditModal(ps)}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 transition-all"
                          >
                            <CheckCircle2 className="h-4 w-4" /> Confirm Bank Credit
                          </button>
                        ) : (
                          <div className="text-xs text-right text-emerald-600 font-semibold">
                            Credited: {formatINR(ps.actualAmountCredited)}
                            {ps.account && <p className="text-[10px] text-muted-foreground">{ps.account.name}</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal 1: Add Employment */}
      {isAddEmploymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold">1. Setup Family Member Employment Profile</h2>
            <form onSubmit={handleCreateEmployment} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Family Member *</label>
                  <select
                    value={employmentForm.userId}
                    onChange={(e) => setEmploymentForm({ ...employmentForm, userId: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  >
                    <option value="">Current User</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user?.name || m.userId} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Employer Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Karur Vysya Bank"
                    value={employmentForm.employerName}
                    onChange={(e) => setEmploymentForm({ ...employmentForm, employerName: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Branch Sales & Service Executive"
                    value={employmentForm.designation}
                    onChange={(e) => setEmploymentForm({ ...employmentForm, designation: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Employment Type</label>
                  <select
                    value={employmentForm.employmentType}
                    onChange={(e) => setEmploymentForm({ ...employmentForm, employmentType: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  >
                    <option value="FULL_TIME">Full-time</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="PART_TIME">Part-time</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Joining Date</label>
                  <input
                    type="date"
                    value={employmentForm.joiningDate}
                    onChange={(e) => setEmploymentForm({ ...employmentForm, joiningDate: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Salary Credit Day</label>
                  <input
                    type="number"
                    placeholder="1st"
                    value={employmentForm.salaryCreditDate}
                    onChange={(e) => setEmploymentForm({ ...employmentForm, salaryCreditDate: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Expected Salary (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 55000"
                    value={employmentForm.expectedMonthlySalary}
                    onChange={(e) => setEmploymentForm({ ...employmentForm, expectedMonthlySalary: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddEmploymentOpen(false)}
                  className="rounded-md border px-3 py-1.5 font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-1.5 font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Save Employment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Monthly Payslip Inputs */}
      {isGeneratePayslipOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-background p-6 shadow-xl space-y-4 overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-bold">2. Enter Monthly Payslip Earnings & Deductions</h2>
            <form onSubmit={handleGeneratePayslip} className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Employment *</label>
                  <select
                    required
                    value={payslipForm.employmentId}
                    onChange={(e) => setPayslipForm({ ...payslipForm, employmentId: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  >
                    <option value="">Select Employment</option>
                    {employments.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employerName} ({emp.user?.name})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Pay Month *</label>
                  <select
                    value={payslipForm.month}
                    onChange={(e) => setPayslipForm({ ...payslipForm, month: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2026, i, 1).toLocaleString("default", { month: "long" })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Pay Year *</label>
                  <input
                    type="number"
                    required
                    value={payslipForm.year}
                    onChange={(e) => setPayslipForm({ ...payslipForm, year: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
              </div>

              {/* Earnings Column */}
              <div className="rounded-lg border p-3 bg-emerald-50/30 space-y-2">
                <h3 className="font-bold text-emerald-700 text-xs uppercase tracking-wider">Earnings (Gross Salary Components)</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-medium block mb-1">Basic Salary *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 25000"
                      value={payslipForm.basicSalary}
                      onChange={(e) => setPayslipForm({ ...payslipForm, basicSalary: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-medium block mb-1">HRA *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 10000"
                      value={payslipForm.hra}
                      onChange={(e) => setPayslipForm({ ...payslipForm, hra: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-medium block mb-1">Other Allowances</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 8000"
                      value={payslipForm.otherAllowances}
                      onChange={(e) => setPayslipForm({ ...payslipForm, otherAllowances: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="font-medium block mb-1">Bonus / Incentives</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 5000"
                      value={payslipForm.bonusIncentives}
                      onChange={(e) => setPayslipForm({ ...payslipForm, bonusIncentives: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-medium block mb-1">Overtime / Arrears</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 2000"
                      value={payslipForm.overtimeArrears}
                      onChange={(e) => setPayslipForm({ ...payslipForm, overtimeArrears: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                </div>
                <div className="text-right font-bold text-emerald-700 text-xs pt-1">
                  Auto-Calculated Gross Salary: {formatINR(calcGross())}
                </div>
              </div>

              {/* Deductions Column */}
              <div className="rounded-lg border p-3 bg-rose-50/30 space-y-2">
                <h3 className="font-bold text-rose-700 text-xs uppercase tracking-wider">Deductions</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-medium block mb-1">PF Deduction</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 1800"
                      value={payslipForm.pfDeduction}
                      onChange={(e) => setPayslipForm({ ...payslipForm, pfDeduction: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-medium block mb-1">ESI Deduction</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 0"
                      value={payslipForm.esiDeduction}
                      onChange={(e) => setPayslipForm({ ...payslipForm, esiDeduction: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-medium block mb-1">Professional Tax (PT)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 200"
                      value={payslipForm.professionalTax}
                      onChange={(e) => setPayslipForm({ ...payslipForm, professionalTax: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="font-medium block mb-1">TDS / Income Tax</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 1500"
                      value={payslipForm.tdsTax}
                      onChange={(e) => setPayslipForm({ ...payslipForm, tdsTax: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-medium block mb-1">Other Deductions</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 0"
                      value={payslipForm.otherDeductions}
                      onChange={(e) => setPayslipForm({ ...payslipForm, otherDeductions: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                </div>
                <div className="text-right font-bold text-rose-700 text-xs pt-1">
                  Total Deductions: -{formatINR(calcDeductions())}
                </div>
              </div>

              {/* Net Salary Summary */}
              <div className="rounded-lg border p-3 bg-muted/40 flex justify-between items-center">
                <span className="font-bold text-sm">Calculated Net Salary:</span>
                <span className="font-extrabold text-lg text-emerald-600">{formatINR(calcNet())}</span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGeneratePayslipOpen(false)}
                  className="rounded-md border px-4 py-2 font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500"
                >
                  Generate Payslip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Confirm Bank Credit */}
      {isConfirmCreditOpen && selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold">3 & 4. Confirm Bank Credit Matching</h2>
            <p className="text-xs text-muted-foreground">
              Confirming salary credit for <span className="font-semibold text-foreground">{selectedPayslip.employment?.employerName} ({selectedPayslip.payPeriod})</span>.
              Calculated Net Salary is {formatINR(selectedPayslip.netSalary)}.
            </p>

            <form onSubmit={handleConfirmCredit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Receiving Bank Account *</label>
                <select
                  required
                  value={creditForm.accountId}
                  onChange={(e) => setCreditForm({ ...creditForm, accountId: e.target.value })}
                  className="w-full rounded-md border p-2 text-xs bg-background"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatINR(acc.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Actual Credit Date *</label>
                  <input
                    type="date"
                    required
                    value={creditForm.actualCreditDate}
                    onChange={(e) => setCreditForm({ ...creditForm, actualCreditDate: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Actual Amount Credited (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={creditForm.actualAmountCredited}
                    onChange={(e) => setCreditForm({ ...creditForm, actualAmountCredited: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background font-bold text-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Transaction Ref / UTR (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. KVB1829031892"
                  value={creditForm.transactionRef}
                  onChange={(e) => setCreditForm({ ...creditForm, transactionRef: e.target.value })}
                  className="w-full rounded-md border p-2 text-xs bg-background"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmCreditOpen(false)}
                  className="rounded-md border px-4 py-2 font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500"
                >
                  Confirm & Update Bank Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
