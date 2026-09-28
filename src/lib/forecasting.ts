export interface ForecastMilestoneItem {
  id?: string;
  name: string;
  targetYear: number;
  estimatedCost: number;
  type: "EXPENSE" | "INCOME_BOOST" | "RETIREMENT";
}

export interface ForecastInput {
  startYear?: number; // Default 2026
  endYear?: number;   // Default 2050
  initialLiquidInvestments: number; // Cash, Bank, Demat Mutual Funds & Stocks
  initialPhysicalAssets?: number;    // Real Estate Property & Vehicles
  initialLiabilities?: number;       // Outstanding Home Mortgage & Debt
  realEstateAppreciationRate?: number; // e.g. 5.0 (% p.a.)
  initialAnnualIncome: number;
  initialAnnualExpenses: number;
  inflationRate: number;        // e.g. 6.0 (%)
  salaryGrowthRate: number;     // e.g. 8.0 (%)
  investmentReturnRate: number; // e.g. 11.0 (%)
  retirementAge?: number;       // e.g. 60
  currentAge?: number;          // e.g. 32
  milestones?: ForecastMilestoneItem[];
}

export interface ForecastYearResult {
  year: number;
  age: number;
  projectedIncome: number;
  projectedExpenses: number;
  annualSavings: number;
  milestoneExpenses: number;
  netCashflow: number;
  investmentReturns: number;
  liquidInvestments: number;
  physicalAssetsValue: number;
  liabilitiesValue: number;
  endNetWorth: number;
  isRetired: boolean;
}

export interface ForecastSummary {
  years: ForecastYearResult[];
  terminalNetWorth2050: number;
  totalInvestedCapital: number;
  financialIndependenceYear?: number; // Year where passive liquid investment returns >= annual expenses
  lowestCashflowYear?: number;
}

export function runForecastSimulation(input: ForecastInput): ForecastSummary {
  const startYear = input.startYear || 2026;
  const endYear = input.endYear || 2050;
  const currentAge = input.currentAge || 30;
  const retirementAge = input.retirementAge || 60;

  const inflation = input.inflationRate / 100;
  const salaryGrowth = input.salaryGrowthRate / 100;
  const returnRate = input.investmentReturnRate / 100;
  const assetAppreciation = (input.realEstateAppreciationRate ?? 5.0) / 100;

  let currentLiquid = Math.max(0, input.initialLiquidInvestments);
  let currentPhysicalAssets = Math.max(0, input.initialPhysicalAssets || 0);
  let currentLiabilities = Math.max(0, input.initialLiabilities || 0);

  let currentIncome = input.initialAnnualIncome;
  let currentExpenses = input.initialAnnualExpenses;

  const years: ForecastYearResult[] = [];
  let fiYear: number | undefined = undefined;
  let totalSavings = 0;

  for (let year = startYear; year <= endYear; year++) {
    const t = year - startYear;
    const age = currentAge + t;
    const isRetired = age >= retirementAge;

    // Income calculations (0 if retired, otherwise growing by salary growth rate)
    const projectedIncome = isRetired ? 0 : Math.round(currentIncome * Math.pow(1 + salaryGrowth, t));

    // Expenses inflated over time
    const projectedExpenses = Math.round(currentExpenses * Math.pow(1 + inflation, t));

    // Calculate milestone cost in target year
    const yearMilestones = (input.milestones || []).filter((m) => m.targetYear === year);
    const milestoneExpenses = yearMilestones.reduce((acc, m) => {
      if (m.type === "EXPENSE" || m.type === "RETIREMENT") {
        return acc + m.estimatedCost;
      }
      return acc;
    }, 0);

    const milestoneIncomeBoost = yearMilestones.reduce((acc, m) => {
      if (m.type === "INCOME_BOOST") {
        return acc + m.estimatedCost;
      }
      return acc;
    }, 0);

    const effectiveIncome = projectedIncome + milestoneIncomeBoost;
    const annualSavings = effectiveIncome - projectedExpenses;
    const netCashflow = annualSavings - milestoneExpenses;

    // Liquid investment growth applies ONLY to liquid investable assets (not physical real estate)
    const investmentReturns = Math.round(currentLiquid * returnRate);

    // Physical assets appreciate separately at property growth rate (e.g. 5% p.a.)
    if (t > 0) {
      currentPhysicalAssets = Math.round(currentPhysicalAssets * (1 + assetAppreciation));
      // Pay down liabilities over 20-year schedule
      currentLiabilities = Math.max(0, Math.round(currentLiabilities * 0.95));
    }

    // Financial Independence Check: passive liquid investment returns >= annual expenses
    if (!fiYear && investmentReturns >= projectedExpenses && currentLiquid > 0) {
      fiYear = year;
    }

    // Update liquid portfolio with returns and net cashflow
    currentLiquid = Math.max(0, currentLiquid + investmentReturns + netCashflow);
    if (netCashflow > 0) {
      totalSavings += netCashflow;
    }

    const endNetWorth = currentLiquid + currentPhysicalAssets - currentLiabilities;

    years.push({
      year,
      age,
      projectedIncome: effectiveIncome,
      projectedExpenses,
      annualSavings,
      milestoneExpenses,
      netCashflow,
      investmentReturns,
      liquidInvestments: currentLiquid,
      physicalAssetsValue: currentPhysicalAssets,
      liabilitiesValue: currentLiabilities,
      endNetWorth,
      isRetired,
    });
  }

  return {
    years,
    terminalNetWorth2050: years.length > 0 ? years[years.length - 1].endNetWorth : 0,
    totalInvestedCapital: totalSavings,
    financialIndependenceYear: fiYear,
  };
}
