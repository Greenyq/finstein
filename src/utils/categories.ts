export const CATEGORIES = {
  income: [
    "Paycheck",
    "Child Benefits",
    "EI",
    "Soccer/Business",
    "Social Security",
    "SNAP/EBT",
    "Tax Refund",
    "1099 Income",
    "Cashback",
    "Return",
    "Other Income",
  ],
  needs: [
    "Groceries",
    "Utilities",
    "Fuel",
    "Health",
    "Transportation",
    "Pets",
    "Children",
    "Immigration Fees",
    "Remittance",
    "Other Needs",
  ],
  fixed: [
    "Mortgage",
    "Rent",
    "Car Insurance",
    "Cell",
    "Wifi",
    "Subscriptions",
    "Condo Fee",
    "Property Tax",
    "Offerings",
    "Car Loan",
  ],
  wants: [
    "Restaurant",
    "Entertainment",
    "Beauty",
    "Clothing",
    "Coffee",
    "Gifts",
    "Shopping",
    "Travel",
    "Leisure",
    "Workout",
    "Liquor",
    "Other Wants",
  ],
  savings: ["TFSA", "RRSP", "Emergency Fund", "401(k)", "IRA", "Roth IRA", "HSA", "Other Savings"],
} as const;

export type CategoryGroup = keyof typeof CATEGORIES;
export type Category = (typeof CATEGORIES)[CategoryGroup][number];

export function getAllCategories(): string[] {
  return Object.values(CATEGORIES).flat();
}

export function findCategoryGroup(category: string): CategoryGroup | null {
  for (const [group, cats] of Object.entries(CATEGORIES)) {
    if ((cats as readonly string[]).includes(category)) {
      return group as CategoryGroup;
    }
  }
  return null;
}
