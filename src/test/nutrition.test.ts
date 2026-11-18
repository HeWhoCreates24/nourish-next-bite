import { describe, expect, it } from "vitest";
import { calorieTarget, computeTargets, sumNutrients } from "@/lib/nutrition";

const base = { height_cm: 180, weight_kg: 80, age: 30, sex: "male" as const, activity_level: "moderate" as const, goal: "maintain" as const };

describe("daily targets", () => {
  it("uses height, weight, age, sex and activity for calories", () => {
    // (800 + 1125 - 150 + 5) * 1.55 = 2759
    expect(calorieTarget(base)).toBe(2759);
  });
  it("female profile gets a lower energy target", () => {
    expect(calorieTarget({ ...base, sex: "female" })).toBe(2502);
  });
  it("weight-loss goal subtracts 500 kcal", () => {
    expect(calorieTarget({ ...base, goal: "lose" })).toBe(2259);
  });
  it("sets protein from body weight", () => {
    expect(computeTargets(base).protein_g).toBe(128);
  });
  it("menstruating-age women get the higher iron target", () => {
    expect(computeTargets({ ...base, sex: "female" }).iron_mg).toBe(18);
  });
});

describe("daily totals", () => {
  it("adds meals together", () => {
    expect(sumNutrients([{ calories: 300, protein_g: 20 }, { calories: 450.5, protein_g: 10 }]).calories).toBe(750.5);
  });
});
