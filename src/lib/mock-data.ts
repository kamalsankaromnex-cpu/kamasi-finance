export interface MockUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  passwordHash: string;
}

export interface MockHousehold {
  id: string;
  name: string;
  currency: string;
}

export interface MockAccount {
  id: string;
  householdId: string;
  name: string;
  type: "BANK" | "CREDIT" | "CASH" | "INVESTMENT" | "LOAN";
  balance: number;
  accountNumber?: string;
  currency: string;
  isArchived: boolean;
}

export interface MockCategory {
  id: string;
  householdId: string;
  name: string;
  icon: string;
  color: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  isDefault: boolean;
}

export interface MockTransaction {
  id: string;
  householdId: string;
  accountId: string;
  categoryId?: string;
  userId?: string;
  date: string;
  amount: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  transferAccountId?: string;
  isRecurring: boolean;
  description: string;
  notes?: string;
  tags?: string;
}

export interface MockBudget {
  id: string;
  householdId: string;
  categoryId?: string;
  month: number;
  year: number;
  amount: number;
}

export interface MockGoal {
  id: string;
  householdId: string;
  name: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category?: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
}

export interface MockInvestment {
  id: string;
  householdId: string;
  accountId?: string;
  name: string;
  symbol?: string;
  type: "STOCK" | "MUTUAL_FUND" | "FIXED_DEPOSIT" | "GOLD" | "EPF_PPF" | "OTHER";
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  lastUpdated: string;
  notes?: string;
}

export interface MockAsset {
  id: string;
  householdId: string;
  name: string;
  type: "REAL_ESTATE" | "VEHICLE" | "GOLD" | "JEWELRY" | "ELECTRONICS" | "OTHER";
  value: number;
  purchaseDate?: string;
  notes?: string;
}

export interface MockLiability {
  id: string;
  householdId: string;
  name: string;
  type: "MORTGAGE" | "PERSONAL_LOAN" | "CAR_LOAN" | "EDUCATION_LOAN" | "CREDIT_CARD_DEBT" | "OTHER";
  amount: number;
  interestRate?: number;
  monthlyPayment?: number;
  dueDate?: string;
  notes?: string;
}

export interface MockForecastScenario {
  id: string;
  householdId: string;
  name: string;
  isDefault: boolean;
  startYear: number;
  endYear: number;
  inflationRate: number;
  salaryGrowthRate: number;
  investmentReturnRate: number;
  retirementAge: number;
  baselineMonthlySavings: number;
  notes?: string;
  milestones: {
    id: string;
    name: string;
    targetYear: number;
    estimatedCost: number;
    type: "EXPENSE" | "INCOME_BOOST" | "RETIREMENT";
  }[];
}

// Initial Mock Data Store
export const initialMockUsers: MockUser[] = [
  {
    id: "usr-1",
    email: "alex@kamasi.com",
    name: "Alex Kamasi",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    passwordHash: "$2a$10$w8T9Hl3wz.WnL6U8L3H3uO21bH/K0xV5E9v7l7Kz1j5r3Q3G1bH2W", // password123
  },
  {
    id: "usr-2",
    email: "priya@kamasi.com",
    name: "Priya Kamasi",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    passwordHash: "$2a$10$w8T9Hl3wz.WnL6U8L3H3uO21bH/K0xV5E9v7l7Kz1j5r3Q3G1bH2W", // password123
  },
];

export const initialMockHousehold: MockHousehold = {
  id: "hh-1",
  name: "Kamasi Family Household",
  currency: "INR",
};

export const initialMockAccounts: MockAccount[] = [
  {
    id: "acc-1",
    householdId: "hh-1",
    name: "HDFC Salary Savings",
    type: "BANK",
    balance: 345000.00,
    accountNumber: "**** 4821",
    currency: "INR",
    isArchived: false,
  },
  {
    id: "acc-2",
    householdId: "hh-1",
    name: "ICICI Coral Credit Card",
    type: "CREDIT",
    balance: -24500.00,
    accountNumber: "**** 9012",
    currency: "INR",
    isArchived: false,
  },
  {
    id: "acc-3",
    householdId: "hh-1",
    name: "Zerodha Demat Brokerage",
    type: "INVESTMENT",
    balance: 850000.00,
    accountNumber: "ZR88192",
    currency: "INR",
    isArchived: false,
  },
  {
    id: "acc-4",
    householdId: "hh-1",
    name: "Cash Wallet",
    type: "CASH",
    balance: 12500.00,
    currency: "INR",
    isArchived: false,
  },
];

export const initialMockCategories: MockCategory[] = [
  { id: "cat-1", householdId: "hh-1", name: "Salary & Wages", icon: "briefcase", color: "#10b981", type: "INCOME", isDefault: true },
  { id: "cat-2", householdId: "hh-1", name: "Investment Dividends", icon: "trending-up", color: "#06b6d4", type: "INCOME", isDefault: false },
  { id: "cat-3", householdId: "hh-1", name: "Rent & Housing", icon: "home", color: "#ef4444", type: "EXPENSE", isDefault: true },
  { id: "cat-4", householdId: "hh-1", name: "Groceries & Food", icon: "shopping-cart", color: "#f59e0b", type: "EXPENSE", isDefault: true },
  { id: "cat-5", householdId: "hh-1", name: "Utilities & Bills", icon: "zap", color: "#3b82f6", type: "EXPENSE", isDefault: true },
  { id: "cat-6", householdId: "hh-1", name: "Dining & Entertainment", icon: "utensils", color: "#8b5cf6", type: "EXPENSE", isDefault: false },
  { id: "cat-7", householdId: "hh-1", name: "Healthcare & Insurance", icon: "heart-pulse", color: "#ec4899", type: "EXPENSE", isDefault: false },
];

export const initialMockTransactions: MockTransaction[] = [
  {
    id: "txn-1",
    householdId: "hh-1",
    accountId: "acc-1",
    categoryId: "cat-1",
    userId: "usr-1",
    date: new Date(2026, 8, 1).toISOString(),
    amount: 185000.00,
    type: "INCOME",
    isRecurring: true,
    description: "Monthly Tech Lead Salary Credit",
    tags: "salary,tech",
  },
  {
    id: "txn-2",
    householdId: "hh-1",
    accountId: "acc-1",
    categoryId: "cat-1",
    userId: "usr-2",
    date: new Date(2026, 8, 2).toISOString(),
    amount: 140000.00,
    type: "INCOME",
    isRecurring: true,
    description: "Monthly Senior Designer Salary Credit",
    tags: "salary,design",
  },
  {
    id: "txn-3",
    householdId: "hh-1",
    accountId: "acc-1",
    categoryId: "cat-3",
    userId: "usr-1",
    date: new Date(2026, 8, 5).toISOString(),
    amount: 45000.00,
    type: "EXPENSE",
    isRecurring: true,
    description: "Apartment Monthly Rent Payment",
    tags: "rent,housing",
  },
  {
    id: "txn-4",
    householdId: "hh-1",
    accountId: "acc-2",
    categoryId: "cat-4",
    userId: "usr-2",
    date: new Date(2026, 8, 8).toISOString(),
    amount: 14500.00,
    type: "EXPENSE",
    isRecurring: false,
    description: "Nature Basket & Supermarket Groceries",
    tags: "groceries,food",
  },
  {
    id: "txn-5",
    householdId: "hh-1",
    accountId: "acc-2",
    categoryId: "cat-6",
    userId: "usr-1",
    date: new Date(2026, 8, 12).toISOString(),
    amount: 6800.00,
    type: "EXPENSE",
    isRecurring: false,
    description: "Weekend Family Dinner at Olive Bistro",
    tags: "dining,leisure",
  },
  {
    id: "txn-6",
    householdId: "hh-1",
    accountId: "acc-1",
    categoryId: "cat-5",
    userId: "usr-1",
    date: new Date(2026, 8, 15).toISOString(),
    amount: 8200.00,
    type: "EXPENSE",
    isRecurring: true,
    description: "Electricity Bill & Broadband Connection",
    tags: "utilities",
  },
  {
    id: "txn-7",
    householdId: "hh-1",
    accountId: "acc-3",
    categoryId: "cat-2",
    userId: "usr-1",
    date: new Date(2026, 8, 18).toISOString(),
    amount: 12500.00,
    type: "INCOME",
    isRecurring: false,
    description: "Quarterly Stock Dividend Yield",
    tags: "dividend,investments",
  },
];

export const initialMockBudgets: MockBudget[] = [
  { id: "bdg-1", householdId: "hh-1", categoryId: "cat-3", month: 9, year: 2026, amount: 45000.00 },
  { id: "bdg-2", householdId: "hh-1", categoryId: "cat-4", month: 9, year: 2026, amount: 25000.00 },
  { id: "bdg-3", householdId: "hh-1", categoryId: "cat-5", month: 9, year: 2026, amount: 10000.00 },
  { id: "bdg-4", householdId: "hh-1", categoryId: "cat-6", month: 9, year: 2026, amount: 15000.00 },
  { id: "bdg-5", householdId: "hh-1", categoryId: "cat-7", month: 9, year: 2026, amount: 12000.00 },
];

export const initialMockGoals: MockGoal[] = [
  {
    id: "gl-1",
    householdId: "hh-1",
    name: "Emergency Reserve Fund",
    description: "6 Months of fixed household baseline living expenses",
    targetAmount: 600000.00,
    currentAmount: 420000.00,
    targetDate: new Date(2026, 11, 31).toISOString(),
    category: "Safety Net",
    priority: "HIGH",
  },
  {
    id: "gl-2",
    householdId: "hh-1",
    name: "Villa Down Payment",
    description: "Target savings for purchasing 3BHK row house in 2030",
    targetAmount: 3000000.00,
    currentAmount: 1250000.00,
    targetDate: new Date(2030, 5, 30).toISOString(),
    category: "Real Estate",
    priority: "HIGH",
  },
  {
    id: "gl-3",
    householdId: "hh-1",
    name: "European Family Vacation",
    description: "15-day summer trip around Switzerland & Italy",
    targetAmount: 500000.00,
    currentAmount: 180000.00,
    targetDate: new Date(2027, 4, 15).toISOString(),
    category: "Travel",
    priority: "MEDIUM",
  },
];

export const initialMockInvestments: MockInvestment[] = [
  {
    id: "inv-1",
    householdId: "hh-1",
    accountId: "acc-3",
    name: "UTI Nifty 50 Index Fund",
    symbol: "UTINIFT50",
    type: "MUTUAL_FUND",
    quantity: 1450.25,
    purchasePrice: 180.50,
    currentPrice: 245.20,
    lastUpdated: new Date().toISOString(),
    notes: "Direct Growth Mutual Fund SIP",
  },
  {
    id: "inv-2",
    householdId: "hh-1",
    accountId: "acc-3",
    name: "Tata Consultancy Services (TCS)",
    symbol: "TCS.NS",
    type: "STOCK",
    quantity: 120.00,
    purchasePrice: 3400.00,
    currentPrice: 4150.00,
    lastUpdated: new Date().toISOString(),
    notes: "Long-term bluechip equity allocation",
  },
  {
    id: "inv-3",
    householdId: "hh-1",
    accountId: "acc-1",
    name: "Sovereign Gold Bond 2024 Series",
    symbol: "SGB2024",
    type: "GOLD",
    quantity: 50.00,
    purchasePrice: 6200.00,
    currentPrice: 7450.00,
    lastUpdated: new Date().toISOString(),
    notes: "Tax-free capital gains gold bond",
  },
];

export const initialMockAssets: MockAsset[] = [
  {
    id: "ast-1",
    householdId: "hh-1",
    name: "3BHK Apartment - Whitefield",
    type: "REAL_ESTATE",
    value: 9500000.00,
    purchaseDate: "2021-04-10",
    notes: "Primary residence property valuation",
  },
  {
    id: "ast-2",
    householdId: "hh-1",
    name: "Hyundai Alcazar SUV",
    type: "VEHICLE",
    value: 1450000.00,
    purchaseDate: "2024-02-15",
    notes: "Family SUV purchased 2024",
  },
];

export const initialMockLiabilities: MockLiability[] = [
  {
    id: "lia-1",
    householdId: "hh-1",
    name: "HDFC Home Loan Mortgage",
    type: "MORTGAGE",
    amount: 4200000.00,
    interestRate: 8.50,
    monthlyPayment: 48500.00,
    notes: "20-year home tenure remaining",
  },
  {
    id: "lia-2",
    householdId: "hh-1",
    name: "ICICI Car Loan",
    type: "CAR_LOAN",
    amount: 450000.00,
    interestRate: 9.20,
    monthlyPayment: 14200.00,
    notes: "3-year tenure remaining",
  },
];

export const initialMockForecastScenario: MockForecastScenario = {
  id: "fsc-1",
  householdId: "hh-1",
  name: "Baseline Financial Freedom Plan (2026-2050)",
  isDefault: true,
  startYear: 2026,
  endYear: 2050,
  inflationRate: 6.00,
  salaryGrowthRate: 8.00,
  investmentReturnRate: 11.00,
  retirementAge: 55,
  baselineMonthlySavings: 85000.00,
  notes: "Projected 25-year roadmap with 6% inflation and 11% CAGR equity returns",
  milestones: [
    { id: "mls-1", name: "New Villa Construction", targetYear: 2030, estimatedCost: 3500000.00, type: "EXPENSE" },
    { id: "mls-2", name: "Higher Education Reserve", targetYear: 2036, estimatedCost: 2500000.00, type: "EXPENSE" },
    { id: "mls-3", name: "Early Retirement Target", targetYear: 2040, estimatedCost: 0.00, type: "RETIREMENT" },
  ],
};
