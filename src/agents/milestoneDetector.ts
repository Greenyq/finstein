import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";
import { MILESTONE_CELEBRATION_SYSTEM_PROMPT } from "../utils/prompts.js";

export type MilestoneKey =
  | "first_positive_balance"
  | "first_tfsa_contribution"
  | "first_rrsp_contribution"
  | "first_401k_contribution"
  | "first_ira_contribution"
  | "no_overdraft_streak_3"
  | "immigration_fees_cleared"
  | "emergency_fund_started"
  | "savings_goal_halfway";

export interface MilestoneInput {
  userName: string;
  milestoneKey: MilestoneKey;
  amount?: number;
  lang: string;
}

export async function generateMilestoneCelebration(input: MilestoneInput): Promise<string> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: MILESTONE_CELEBRATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) throw new Error("MilestoneDetector agent returned empty response");
  return text;
}

/**
 * Determine which milestones (if any) the user has newly hit this month.
 * Returns milestone keys that are NOT already in celebratedMilestones.
 */
export function detectNewMilestones(params: {
  celebratedMilestones: MilestoneKey[];
  currentBalance: number;
  balanceHistory: number[];        // past N months balances (oldest first)
  categoriesThisMonth: string[];   // categories with transactions this month
  categoriesAllTime: string[];     // all categories ever transacted
  immigrationFeesThisMonth: number;
  immigrationFeesPrevMonths: number;
  positiveMonthsStreak: number;    // consecutive months with balance > 0
  goalProgress?: { current: number; target: number }; // optional active goal
}): MilestoneKey[] {
  const {
    celebratedMilestones,
    currentBalance,
    balanceHistory,
    categoriesThisMonth,
    categoriesAllTime,
    immigrationFeesThisMonth,
    immigrationFeesPrevMonths,
    positiveMonthsStreak,
    goalProgress,
  } = params;

  const already = new Set(celebratedMilestones);
  const newMilestones: MilestoneKey[] = [];

  const check = (key: MilestoneKey, condition: boolean) => {
    if (!already.has(key) && condition) newMilestones.push(key);
  };

  // First month with positive balance
  check(
    "first_positive_balance",
    currentBalance > 0 && balanceHistory.every((b) => b <= 0),
  );

  // First contributions to savings categories
  const hadCategoryBefore = (cat: string) => categoriesAllTime.includes(cat) && !categoriesThisMonth.includes(cat);
  const firstTimeCategory = (cat: string) =>
    categoriesThisMonth.includes(cat) && !categoriesAllTime.filter(c => c !== cat || categoriesThisMonth.filter(x => x === cat).length > 1).includes(cat);

  // Simpler: milestone fires if category appears in THIS month but NOT in the history (all time minus this month)
  const prevCategories = new Set(categoriesAllTime);
  const isFirstEver = (cat: string) => categoriesThisMonth.includes(cat) && !prevCategories.has(cat);

  check("first_tfsa_contribution", isFirstEver("TFSA"));
  check("first_rrsp_contribution", isFirstEver("RRSP"));
  check("first_401k_contribution", isFirstEver("401(k)"));
  check("first_ira_contribution", isFirstEver("IRA") || isFirstEver("Roth IRA"));
  check("emergency_fund_started", isFirstEver("Emergency Fund"));

  // 3 consecutive positive months
  check("no_overdraft_streak_3", positiveMonthsStreak >= 3);

  // Immigration fees paid off: had fees before, none this month
  check(
    "immigration_fees_cleared",
    immigrationFeesPrevMonths > 500 && immigrationFeesThisMonth === 0,
  );

  // Savings goal halfway
  if (goalProgress) {
    check(
      "savings_goal_halfway",
      goalProgress.target > 0 && goalProgress.current / goalProgress.target >= 0.5,
    );
  }

  return newMilestones;
}
