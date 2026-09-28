"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Building,
  Wallet,
  CreditCard,
  TrendingUp,
  PiggyBank,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  Sparkles,
  HelpCircle,
  Lock,
} from "lucide-react";
import { formatINR } from "@/lib/currency";

export default function OnboardingWizardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [isOnboarded, setIsOnboarded] = useState(false);

  // Step 1 State: Preferences / Join
  const [mode, setMode] = useState<"configure" | "join">("configure");
  const [householdName, setHouseholdName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [financialYearStart, setFinancialYearStart] = useState("APRIL");
  const [invitationCode, setInvitationCode] = useState("");

  // Step 2 State: Accounts
  const [accounts, setAccounts] = useState([
    { name: "Primary HDFC Bank", type: "BANK", balance: "50000", creditLimit: "", isShared: true },
    { name: "Cash Wallet", type: "CASH", balance: "5000", creditLimit: "", isShared: true },
  ]);

  // Step 3 State: Income Sources
  const [incomeSources, setIncomeSources] = useState([
    { name: "Primary Monthly Salary", category: "Salary", expectedAmount: "75000", frequency: "MONTHLY", expectedDay: "1" },
  ]);

  // Step 4 State: Categories & Budgets
  const [categories, setCategories] = useState<any[]>([]);
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});

  // Step 5 State: Bills, Goals, Assets
  const [bills, setBills] = useState([
    { name: "Electricity Bill", amount: "2500", frequency: "MONTHLY" },
  ]);
  const [goals, setGoals] = useState([
    { name: "Emergency Savings Fund", targetAmount: "150000", targetDate: "" },
  ]);
  const [assets, setAssets] = useState([
    { name: "Primary Residence Apartment", value: "5000000", type: "REAL_ESTATE" },
  ]);

  useEffect(() => {
    fetchState();
  }, []);

  const fetchState = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/onboarding");
      if (res.ok) {
        const data = await res.json();
        setIsOnboarded(data.user.isOnboarded);
        if (data.user.isOnboarded) {
          router.push("/");
          return;
        }
        if (data.user.onboardingStep) {
          setCurrentStep(data.user.onboardingStep);
        }
        if (data.household) {
          setHouseholdName(data.household.name);
          setCurrency(data.household.currency || "INR");
          setFinancialYearStart(data.household.financialYearStart || "APRIL");
        }
        if (data.categories && Array.isArray(data.categories)) {
          setCategories(data.categories);
          const initialBudgets: Record<string, string> = {};
          data.categories.forEach((cat: any) => {
            if (cat.type === "EXPENSE") {
              const existingB = data.budgets?.find((b: any) => b.categoryId === cat.id);
              initialBudgets[cat.id] = existingB ? String(existingB.amount) : "";
            }
          });
          setBudgetInputs(initialBudgets);
        }
      }
    } catch (err) {
      console.error("Failed to load onboarding info:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = async (stepNumber: number) => {
    try {
      setSubmitting(true);
      setError(null);

      let payload: any = { step: stepNumber };

      if (stepNumber === 1) {
        payload = {
          step: 1,
          action: mode,
          householdName,
          currency,
          financialYearStart,
          invitationCode,
        };
      } else if (stepNumber === 2) {
        payload = { step: 2, accounts };
      } else if (stepNumber === 3) {
        payload = { step: 3, incomeSources };
      } else if (stepNumber === 4) {
        const bList = Object.keys(budgetInputs)
          .filter((catId) => budgetInputs[catId] && parseFloat(budgetInputs[catId]) > 0)
          .map((catId) => ({ categoryId: catId, amount: budgetInputs[catId] }));
        payload = { step: 4, budgets: bList };
      } else if (stepNumber === 5) {
        payload = { step: 5, bills, goals, assets };
      } else if (stepNumber === 6) {
        payload = { step: 6, action: "complete" };
      }

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update step");
      }

      if (stepNumber === 6 || data.isOnboarded) {
        router.push("/");
      } else {
        setCurrentStep(stepNumber + 1);
      }
    } catch (err: any) {
      setError(err.message || "Failed to proceed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Sparkles className="w-10 h-10 text-emerald-400 animate-spin mx-auto" />
          <p className="text-slate-400">Loading your onboarding workspace...</p>
        </div>
      </div>
    );
  }

  const stepsList = [
    { num: 1, title: "Household & Settings", icon: Building },
    { num: 2, title: "Opening Accounts", icon: Wallet },
    { num: 3, title: "Income Sources", icon: TrendingUp },
    { num: 4, title: "Category Budgets", icon: PiggyBank },
    { num: 5, title: "Bills & Goals", icon: CreditCard },
    { num: 6, title: "Summary & Review", icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 md:p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between border-b border-slate-800 pb-4 mb-8">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Kamasi Finance Setup Wizard</h1>
            <p className="text-xs text-slate-400">Step {currentStep} of 6 — First-time Configuration</p>
          </div>
        </div>

        <button
          onClick={() => router.push("/")}
          className="text-xs text-slate-400 hover:text-white transition"
        >
          Save & Exit
        </button>
      </div>

      {/* Progress Bar */}
      <div className="max-w-4xl mx-auto w-full mb-8">
        <div className="grid grid-cols-6 gap-2 mb-4">
          {stepsList.map((s) => {
            const Icon = s.icon;
            const isDone = s.num < currentStep;
            const isCurrent = s.num === currentStep;

            return (
              <div
                key={s.num}
                onClick={() => {
                  if (s.num <= currentStep) setCurrentStep(s.num);
                }}
                className={`cursor-pointer p-3 rounded-xl border flex flex-col items-center justify-center text-center transition ${
                  isCurrent
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                    : isDone
                    ? "bg-slate-900 border-slate-800 text-slate-300"
                    : "bg-slate-950/50 border-slate-900 text-slate-600"
                }`}
              >
                <div className="mb-1">
                  {isDone ? <Check className="w-4 h-4 text-emerald-400" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className="text-[10px] font-medium truncate w-full hidden md:block">{s.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Wizard Step Content */}
      <div className="max-w-3xl mx-auto w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl flex-grow mb-8">
        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* STEP 1: Household Preferences / Join */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Household Setup & Preferences</h2>
              <p className="text-sm text-slate-400">Configure your family workspace preferences or join an existing household.</p>
            </div>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-fit">
              <button
                type="button"
                onClick={() => setMode("configure")}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition ${
                  mode === "configure" ? "bg-emerald-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"
                }`}
              >
                Create / Configure Household
              </button>
              <button
                type="button"
                onClick={() => setMode("join")}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition ${
                  mode === "join" ? "bg-emerald-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"
                }`}
              >
                Join via Invitation Code
              </button>
            </div>

            {mode === "configure" ? (
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Household Name</label>
                  <input
                    type="text"
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                    placeholder="e.g. Kamasi Family Household"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Default Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="INR">INR (₹) Indian Rupee</option>
                      <option value="USD">USD ($) US Dollar</option>
                      <option value="EUR">EUR (€) Euro</option>
                      <option value="GBP">GBP (£) British Pound</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Financial Year Start</label>
                    <select
                      value={financialYearStart}
                      onChange={(e) => setFinancialYearStart(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="APRIL">April – March (India FY)</option>
                      <option value="JANUARY">January – December (Calendar Year)</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Invitation Code</label>
                  <input
                    type="text"
                    value={invitationCode}
                    onChange={(e) => setInvitationCode(e.target.value)}
                    placeholder="Enter 6-character code e.g. ABC123"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Ask your household owner for the invitation code sent to your email.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Accounts & Opening Balances */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Opening Accounts & Balances</h2>
                <p className="text-sm text-slate-400">Add your liquid bank accounts, cash wallets, credit cards, or loans.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setAccounts([
                    ...accounts,
                    { name: "", type: "BANK", balance: "0", creditLimit: "", isShared: true },
                  ])
                }
                className="flex items-center space-x-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Account</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {accounts.map((acc, idx) => (
                <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                  <div className="md:col-span-1">
                    <label className="block text-[10px] text-slate-400 mb-1">Account Name</label>
                    <input
                      type="text"
                      value={acc.name}
                      onChange={(e) => {
                        const newAccs = [...accounts];
                        newAccs[idx].name = e.target.value;
                        setAccounts(newAccs);
                      }}
                      placeholder="e.g. HDFC Salary Bank"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Type</label>
                    <select
                      value={acc.type}
                      onChange={(e) => {
                        const newAccs = [...accounts];
                        newAccs[idx].type = e.target.value;
                        setAccounts(newAccs);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    >
                      <option value="BANK">Bank Account</option>
                      <option value="CASH">Cash Wallet</option>
                      <option value="CREDIT">Credit Card</option>
                      <option value="LOAN">Loan Account</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Opening Balance (₹)</label>
                    <input
                      type="number"
                      value={acc.balance}
                      onChange={(e) => {
                        const newAccs = [...accounts];
                        newAccs[idx].balance = e.target.value;
                        setAccounts(newAccs);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    {acc.type === "CREDIT" && (
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Credit Limit</label>
                        <input
                          type="number"
                          value={acc.creditLimit}
                          onChange={(e) => {
                            const newAccs = [...accounts];
                            newAccs[idx].creditLimit = e.target.value;
                            setAccounts(newAccs);
                          }}
                          placeholder="Limit"
                          className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setAccounts(accounts.filter((_, i) => i !== idx))}
                      className="text-slate-500 hover:text-rose-400 p-1 ml-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: Income Sources */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Income Sources</h2>
                <p className="text-sm text-slate-400">Specify your recurring income stream details (Salary, Agriculture, Business, Rental).</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setIncomeSources([
                    ...incomeSources,
                    { name: "", category: "Salary", expectedAmount: "0", frequency: "MONTHLY", expectedDay: "1" },
                  ])
                }
                className="flex items-center space-x-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Source</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {incomeSources.map((src, idx) => (
                <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Source Name</label>
                    <input
                      type="text"
                      value={src.name}
                      onChange={(e) => {
                        const newSrcs = [...incomeSources];
                        newSrcs[idx].name = e.target.value;
                        setIncomeSources(newSrcs);
                      }}
                      placeholder="e.g. Monthly Salary"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Category</label>
                    <select
                      value={src.category}
                      onChange={(e) => {
                        const newSrcs = [...incomeSources];
                        newSrcs[idx].category = e.target.value;
                        setIncomeSources(newSrcs);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    >
                      <option value="Salary">Salary</option>
                      <option value="Business">Business</option>
                      <option value="Agriculture">Agriculture / Farming</option>
                      <option value="Rental">Rental</option>
                      <option value="Freelance/Consulting">Freelance</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Expected Amount (₹)</label>
                    <input
                      type="number"
                      value={src.expectedAmount}
                      onChange={(e) => {
                        const newSrcs = [...incomeSources];
                        newSrcs[idx].expectedAmount = e.target.value;
                        setIncomeSources(newSrcs);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setIncomeSources(incomeSources.filter((_, i) => i !== idx))}
                      className="text-slate-500 hover:text-rose-400 p-1 ml-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: Category Budgets */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Monthly Category Budgets</h2>
              <p className="text-sm text-slate-400">Set planned monthly limits for your main expense categories.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-1">
              {categories
                .filter((c) => c.type === "EXPENSE")
                .map((cat) => (
                  <div key={cat.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="text-xs font-medium text-slate-200">{cat.name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-slate-500">₹</span>
                      <input
                        type="number"
                        placeholder="Limit"
                        value={budgetInputs[cat.id] || ""}
                        onChange={(e) =>
                          setBudgetInputs({ ...budgetInputs, [cat.id]: e.target.value })
                        }
                        className="w-28 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* STEP 5: Bills, Goals & Assets */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Bills, Goals & Physical Assets</h2>
              <p className="text-sm text-slate-400">Add recurring bills, savings targets, and fixed physical assets.</p>
            </div>

            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              {/* Bills */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-300">Recurring Bills</h3>
                  <button
                    type="button"
                    onClick={() => setBills([...bills, { name: "", amount: "0", frequency: "MONTHLY" }])}
                    className="text-[11px] text-emerald-400 hover:underline"
                  >
                    + Add Bill
                  </button>
                </div>
                {bills.map((b, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Bill Name"
                      value={b.name}
                      onChange={(e) => {
                        const newB = [...bills];
                        newB[i].name = e.target.value;
                        setBills(newB);
                      }}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
                    />
                    <input
                      type="number"
                      placeholder="Amount (₹)"
                      value={b.amount}
                      onChange={(e) => {
                        const newB = [...bills];
                        newB[i].amount = e.target.value;
                        setBills(newB);
                      }}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
                    />
                  </div>
                ))}
              </div>

              {/* Goals */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-300">Savings Goals</h3>
                  <button
                    type="button"
                    onClick={() => setGoals([...goals, { name: "", targetAmount: "0", targetDate: "" }])}
                    className="text-[11px] text-emerald-400 hover:underline"
                  >
                    + Add Goal
                  </button>
                </div>
                {goals.map((g, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Goal Name"
                      value={g.name}
                      onChange={(e) => {
                        const newG = [...goals];
                        newG[i].name = e.target.value;
                        setGoals(newG);
                      }}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
                    />
                    <input
                      type="number"
                      placeholder="Target Amount (₹)"
                      value={g.targetAmount}
                      onChange={(e) => {
                        const newG = [...goals];
                        newG[i].targetAmount = e.target.value;
                        setGoals(newG);
                      }}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: Summary & Confirmation */}
        {currentStep === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Setup Review & Confirmation</h2>
              <p className="text-sm text-slate-400">Verify your financial workspace setup summary before activation.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Opening Liquid Cash</span>
                <p className="text-lg font-bold text-emerald-400">
                  {formatINR(
                    accounts
                      .filter((a) => a.type === "BANK" || a.type === "CASH")
                      .reduce((acc, a) => acc + (parseFloat(a.balance) || 0), 0)
                  )}
                </p>
                <p className="text-xs text-slate-500">{accounts.length} configured account(s)</p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Expected Monthly Income</span>
                <p className="text-lg font-bold text-blue-400">
                  {formatINR(
                    incomeSources.reduce((acc, s) => acc + (parseFloat(s.expectedAmount) || 0), 0)
                  )}
                </p>
                <p className="text-xs text-slate-500">{incomeSources.length} income stream(s)</p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-300">Configuration Details</span>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Household: <strong className="text-slate-200">{householdName || "Family Household"}</strong> ({currency})</li>
                <li>• Financial Year Start: <strong className="text-slate-200">{financialYearStart}</strong></li>
                <li>• Configured Category Budgets: <strong className="text-slate-200">{Object.keys(budgetInputs).filter(k => parseFloat(budgetInputs[k]) > 0).length} category limit(s)</strong></li>
                <li>• Physical Assets Total: <strong className="text-slate-200">{formatINR(assets.reduce((acc, a) => acc + (parseFloat(a.value) || 0), 0))}</strong></li>
              </ul>
            </div>
          </div>
        )}

        {/* Buttons Nav */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-6 mt-8">
          <button
            type="button"
            disabled={currentStep === 1 || submitting}
            onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
            className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border transition ${
              currentStep === 1 || submitting
                ? "opacity-40 cursor-not-allowed bg-slate-950 border-slate-800 text-slate-600"
                : "bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <div className="flex items-center space-x-3">
            {currentStep > 1 && currentStep < 6 && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => setCurrentStep(currentStep + 1)}
                className="text-xs text-slate-400 hover:text-white px-3 py-2 transition"
              >
                Skip Step
              </button>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleNextStep(currentStep)}
              className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-6 py-2.5 rounded-xl text-xs font-semibold shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
            >
              <span>{currentStep === 6 ? "Complete Setup & Launch Dashboard" : "Continue"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
