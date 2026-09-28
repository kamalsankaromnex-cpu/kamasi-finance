import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Create Default User
  const passwordHash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.upsert({
    where: { email: "alex@kamasi.com" },
    update: {},
    create: {
      email: "alex@kamasi.com",
      name: "Alex Kamasi",
      passwordHash,
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    },
  });

  const spouse = await prisma.user.upsert({
    where: { email: "priya@kamasi.com" },
    update: {},
    create: {
      email: "priya@kamasi.com",
      name: "Priya Kamasi",
      passwordHash,
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    },
  });

  // 2. Create Household
  let household = await prisma.household.findFirst({
    where: { name: "Kamasi Family Household" },
  });

  if (!household) {
    household = await prisma.household.create({
      data: {
        name: "Kamasi Family Household",
        currency: "INR",
      },
    });
  }

  // 3. Add Memberships
  await prisma.householdMember.upsert({
    where: { householdId_userId: { householdId: household.id, userId: user.id } },
    update: {},
    create: {
      householdId: household.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  await prisma.householdMember.upsert({
    where: { householdId_userId: { householdId: household.id, userId: spouse.id } },
    update: {},
    create: {
      householdId: household.id,
      userId: spouse.id,
      role: "MEMBER",
    },
  });

  // 4. Create Accounts
  const hdfc = await prisma.account.create({
    data: {
      householdId: household.id,
      name: "HDFC Salary Savings",
      type: "BANK",
      balance: 345000.00,
      accountNumber: "**** 4821",
    },
  });

  const iciciCredit = await prisma.account.create({
    data: {
      householdId: household.id,
      name: "ICICI Coral Credit Card",
      type: "CREDIT",
      balance: -24500.00,
      accountNumber: "**** 9012",
    },
  });

  const zerodha = await prisma.account.create({
    data: {
      householdId: household.id,
      name: "Zerodha Demat Brokerage",
      type: "INVESTMENT",
      balance: 850000.00,
      accountNumber: "ZR88192",
    },
  });

  const cashWallet = await prisma.account.create({
    data: {
      householdId: household.id,
      name: "Cash Wallet",
      type: "CASH",
      balance: 12500.00,
    },
  });

  // 5. Create Categories
  const salaryCat = await prisma.category.create({
    data: { householdId: household.id, name: "Salary & Wages", icon: "briefcase", color: "#10b981", type: "INCOME", isDefault: true },
  });
  const invCat = await prisma.category.create({
    data: { householdId: household.id, name: "Investment Dividends", icon: "trending-up", color: "#06b6d4", type: "INCOME" },
  });
  const rentCat = await prisma.category.create({
    data: { householdId: household.id, name: "Rent & Housing", icon: "home", color: "#ef4444", type: "EXPENSE", isDefault: true },
  });
  const groceryCat = await prisma.category.create({
    data: { householdId: household.id, name: "Groceries & Food", icon: "shopping-cart", color: "#f59e0b", type: "EXPENSE", isDefault: true },
  });
  const utilCat = await prisma.category.create({
    data: { householdId: household.id, name: "Utilities & Bills", icon: "zap", color: "#3b82f6", type: "EXPENSE", isDefault: true },
  });
  const diningCat = await prisma.category.create({
    data: { householdId: household.id, name: "Dining & Entertainment", icon: "utensils", color: "#8b5cf6", type: "EXPENSE" },
  });
  const healthCat = await prisma.category.create({
    data: { householdId: household.id, name: "Healthcare & Insurance", icon: "heart-pulse", color: "#ec4899", type: "EXPENSE" },
  });

  // 6. Transactions
  const now = new Date();
  await prisma.transaction.createMany({
    data: [
      {
        householdId: household.id,
        accountId: hdfc.id,
        categoryId: salaryCat.id,
        userId: user.id,
        date: new Date(now.getFullYear(), now.getMonth(), 1),
        amount: 185000.00,
        type: "INCOME",
        description: "Monthly Tech Lead Salary Credit",
        tags: "salary,employment",
      },
      {
        householdId: household.id,
        accountId: hdfc.id,
        categoryId: salaryCat.id,
        userId: spouse.id,
        date: new Date(now.getFullYear(), now.getMonth(), 2),
        amount: 140000.00,
        type: "INCOME",
        description: "Monthly Senior Designer Salary Credit",
        tags: "salary,spouse",
      },
      {
        householdId: household.id,
        accountId: hdfc.id,
        categoryId: rentCat.id,
        userId: user.id,
        date: new Date(now.getFullYear(), now.getMonth(), 5),
        amount: 45000.00,
        type: "EXPENSE",
        description: "Apartment Monthly Rent Payment",
        tags: "rent,housing",
      },
      {
        householdId: household.id,
        accountId: iciciCredit.id,
        categoryId: groceryCat.id,
        userId: spouse.id,
        date: new Date(now.getFullYear(), now.getMonth(), 8),
        amount: 14500.00,
        type: "EXPENSE",
        description: "Nature Basket & Supermarket Groceries",
        tags: "groceries,food",
      },
      {
        householdId: household.id,
        accountId: iciciCredit.id,
        categoryId: diningCat.id,
        userId: user.id,
        date: new Date(now.getFullYear(), now.getMonth(), 12),
        amount: 6800.00,
        type: "EXPENSE",
        description: "Weekend Family Dinner at Olive Bistro",
        tags: "dining,leisure",
      },
      {
        householdId: household.id,
        accountId: hdfc.id,
        categoryId: utilCat.id,
        userId: user.id,
        date: new Date(now.getFullYear(), now.getMonth(), 15),
        amount: 8200.00,
        type: "EXPENSE",
        description: "Electricity Bill & High-Speed Broadband",
        tags: "utilities,bills",
      },
      {
        householdId: household.id,
        accountId: zerodha.id,
        categoryId: invCat.id,
        userId: user.id,
        date: new Date(now.getFullYear(), now.getMonth(), 18),
        amount: 12500.00,
        type: "INCOME",
        description: "Quarterly Stock Dividend Yield",
        tags: "dividend,investments",
      },
    ],
  });

  // 7. Budgets
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  await prisma.budget.createMany({
    data: [
      { householdId: household.id, categoryId: rentCat.id, month: currentMonth, year: currentYear, amount: 45000.00 },
      { householdId: household.id, categoryId: groceryCat.id, month: currentMonth, year: currentYear, amount: 25000.00 },
      { householdId: household.id, categoryId: utilCat.id, month: currentMonth, year: currentYear, amount: 10000.00 },
      { householdId: household.id, categoryId: diningCat.id, month: currentMonth, year: currentYear, amount: 15000.00 },
      { householdId: household.id, categoryId: healthCat.id, month: currentMonth, year: currentYear, amount: 12000.00 },
    ],
  });

  // 8. Goals
  await prisma.goal.createMany({
    data: [
      {
        householdId: household.id,
        name: "Emergency Reserve Fund",
        description: "6 Months of fixed household baseline living expenses",
        targetAmount: 600000.00,
        currentAmount: 420000.00,
        targetDate: new Date(2026, 11, 31),
        category: "Safety Net",
        priority: "HIGH",
      },
      {
        householdId: household.id,
        name: "Villa Down Payment",
        description: "Target savings for purchasing 3BHK row house in 2030",
        targetAmount: 3000000.00,
        currentAmount: 1250000.00,
        targetDate: new Date(2030, 5, 30),
        category: "Real Estate",
        priority: "HIGH",
      },
      {
        householdId: household.id,
        name: "European Family Vacation",
        description: "15-day summer trip around Switzerland & Italy",
        targetAmount: 500000.00,
        currentAmount: 180000.00,
        targetDate: new Date(2027, 4, 15),
        category: "Travel",
        priority: "MEDIUM",
      },
    ],
  });

  // 9. Investments
  await prisma.investment.createMany({
    data: [
      {
        householdId: household.id,
        accountId: zerodha.id,
        name: "UTI Nifty 50 Index Fund",
        symbol: "UTINIFT50",
        type: "MUTUAL_FUND",
        quantity: 1450.2500,
        purchasePrice: 180.50,
        currentPrice: 245.20,
        notes: "Direct Growth Mutual Fund SIP",
      },
      {
        householdId: household.id,
        accountId: zerodha.id,
        name: "Tata Consultancy Services (TCS)",
        symbol: "TCS.NS",
        type: "STOCK",
        quantity: 120.0000,
        purchasePrice: 3400.00,
        currentPrice: 4150.00,
        notes: "Long-term bluechip equity allocation",
      },
      {
        householdId: household.id,
        accountId: hdfc.id,
        name: "Sovereign Gold Bond 2024 Series",
        symbol: "SGB2024",
        type: "GOLD",
        quantity: 50.0000,
        purchasePrice: 6200.00,
        currentPrice: 7450.00,
        notes: "Tax-free capital gains gold bond",
      },
    ],
  });

  // 10. Assets & Liabilities
  await prisma.asset.createMany({
    data: [
      {
        householdId: household.id,
        name: "3BHK Apartment - Whitefield",
        type: "REAL_ESTATE",
        value: 9500000.00,
        notes: "Primary residence property valuation",
      },
      {
        householdId: household.id,
        name: "Hyundai Alcazar SUV",
        type: "VEHICLE",
        value: 1450000.00,
        notes: "Family SUV purchased 2024",
      },
    ],
  });

  await prisma.liability.createMany({
    data: [
      {
        householdId: household.id,
        name: "HDFC Home Loan Mortgage",
        type: "MORTGAGE",
        amount: 4200000.00,
        interestRate: 8.50,
        monthlyPayment: 48500.00,
        notes: "20-year home tenure remaining",
      },
      {
        householdId: household.id,
        name: "ICICI Car Loan",
        type: "CAR_LOAN",
        amount: 450000.00,
        interestRate: 9.20,
        monthlyPayment: 14200.00,
        notes: "3-year tenure remaining",
      },
    ],
  });

  // 11. Forecast Scenario (2026-2050)
  const scenario = await prisma.forecastScenario.create({
    data: {
      householdId: household.id,
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
      milestones: {
        create: [
          { name: "New Villa Construction", targetYear: 2030, estimatedCost: 3500000.00, type: "EXPENSE" },
          { name: "Higher Education Reserve", targetYear: 2036, estimatedCost: 2500000.00, type: "EXPENSE" },
          { name: "Early Retirement Target", targetYear: 2040, estimatedCost: 0.00, type: "RETIREMENT" },
        ],
      },
    },
  });

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
