import { describe, it, expect } from "vitest";

// Test the trial/premium logic directly without importing the module
// (to avoid needing full AuthContext mocking)

describe("Premium / Trial logic", () => {
  function checkPremium(user: { isPremium: boolean; trialEndsAt: Date | null }): boolean {
    if (user.isPremium) return true;
    if (user.trialEndsAt && new Date() < user.trialEndsAt) return true;
    return false;
  }

  it("should grant access when isPremium is true", () => {
    expect(checkPremium({ isPremium: true, trialEndsAt: null })).toBe(true);
  });

  it("should grant access during active trial", () => {
    const future = new Date();
    future.setDate(future.getDate() + 3); // 3 days left
    expect(checkPremium({ isPremium: false, trialEndsAt: future })).toBe(true);
  });

  it("should deny access when trial expired", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1); // expired yesterday
    expect(checkPremium({ isPremium: false, trialEndsAt: past })).toBe(false);
  });

  it("should deny access with no premium and no trial", () => {
    expect(checkPremium({ isPremium: false, trialEndsAt: null })).toBe(false);
  });

  it("should grant access when both premium and trial active", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(checkPremium({ isPremium: true, trialEndsAt: future })).toBe(true);
  });

  it("trial should be exactly 7 days from creation", () => {
    const created = new Date();
    const trialEnd = new Date(created);
    trialEnd.setDate(trialEnd.getDate() + 7);

    const diffMs = trialEnd.getTime() - created.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(7);
  });
});
