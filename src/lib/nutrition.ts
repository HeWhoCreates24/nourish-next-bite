export type Sex = "male" | "female" | "other";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export type NutrientKey =
  | "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g" | "sugar_g" | "saturated_fat_g"
  | "cholesterol_mg" | "sodium_mg" | "potassium_mg" | "calcium_mg" | "iron_mg" | "magnesium_mg"
  | "zinc_mg" | "copper_mg" | "selenium_mcg" | "phosphorus_mg" | "iodine_mcg" | "choline_mg"
  | "vitamin_a_mcg" | "vitamin_c_mg" | "vitamin_d_mcg" | "vitamin_e_mg" | "vitamin_k_mcg"
  | "thiamin_mg" | "riboflavin_mg" | "niacin_mg" | "vitamin_b6_mg" | "vitamin_b12_mcg" | "folate_mcg";

export type Nutrients = Record<NutrientKey, number>;

export const NUTRIENTS: { key: NutrientKey; label: string; unit: string; group: "energy" | "macro" | "micro"; limit?: boolean }[] = [
  { key: "calories", label: "Calories", unit: "kcal", group: "energy" },
  { key: "protein_g", label: "Protein", unit: "g", group: "macro" },
  { key: "carbs_g", label: "Carbs", unit: "g", group: "macro" },
  { key: "fat_g", label: "Fat", unit: "g", group: "macro" },
  { key: "fiber_g", label: "Fiber", unit: "g", group: "macro" },
  { key: "sugar_g", label: "Sugar", unit: "g", group: "macro", limit: true },
  { key: "saturated_fat_g", label: "Saturated fat", unit: "g", group: "macro", limit: true },
  { key: "cholesterol_mg", label: "Cholesterol", unit: "mg", group: "micro", limit: true },
  { key: "sodium_mg", label: "Sodium", unit: "mg", group: "micro", limit: true },
  { key: "potassium_mg", label: "Potassium", unit: "mg", group: "micro" },
  { key: "calcium_mg", label: "Calcium", unit: "mg", group: "micro" },
  { key: "iron_mg", label: "Iron", unit: "mg", group: "micro" },
  { key: "magnesium_mg", label: "Magnesium", unit: "mg", group: "micro" },
  { key: "zinc_mg", label: "Zinc", unit: "mg", group: "micro" },
  { key: "copper_mg", label: "Copper", unit: "mg", group: "micro" },
  { key: "selenium_mcg", label: "Selenium", unit: "mcg", group: "micro" },
  { key: "phosphorus_mg", label: "Phosphorus", unit: "mg", group: "micro" },
  { key: "iodine_mcg", label: "Iodine", unit: "mcg", group: "micro" },
  { key: "choline_mg", label: "Choline", unit: "mg", group: "micro" },
  { key: "vitamin_a_mcg", label: "Vitamin A", unit: "mcg", group: "micro" },
  { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg", group: "micro" },
  { key: "vitamin_d_mcg", label: "Vitamin D", unit: "mcg", group: "micro" },
  { key: "vitamin_e_mg", label: "Vitamin E", unit: "mg", group: "micro" },
  { key: "vitamin_k_mcg", label: "Vitamin K", unit: "mcg", group: "micro" },
  { key: "thiamin_mg", label: "Thiamin (B1)", unit: "mg", group: "micro" },
  { key: "riboflavin_mg", label: "Riboflavin (B2)", unit: "mg", group: "micro" },
  { key: "niacin_mg", label: "Niacin (B3)", unit: "mg", group: "micro" },
  { key: "vitamin_b6_mg", label: "Vitamin B6", unit: "mg", group: "micro" },
  { key: "vitamin_b12_mcg", label: "Vitamin B12", unit: "mcg", group: "micro" },
  { key: "folate_mcg", label: "Folate", unit: "mcg", group: "micro" },
];

export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};
export const GOAL_ADJUST: Record<Goal, number> = { lose: -500, maintain: 0, gain: 300 };

export interface BodyProfile {
  height_cm: number; weight_kg: number; age: number; sex: Sex; activity_level: Activity; goal: Goal;
}

export function emptyNutrients(): Nutrients {
  return Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0])) as Nutrients;
}

export function normalizeNutrients(raw: unknown): Nutrients {
  const out = emptyNutrients();
  if (raw && typeof raw === "object") {
    for (const n of NUTRIENTS) {
      const v = Number((raw as Record<string, unknown>)[n.key]);
      out[n.key] = Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : 0;
    }
  }
  return out;
}

export function sumNutrients(list: unknown[]): Nutrients {
  const total = emptyNutrients();
  for (const item of list) {
    const n = normalizeNutrients(item);
    for (const k of Object.keys(total) as NutrientKey[]) total[k] = Math.round((total[k] + n[k]) * 10) / 10;
  }
  return total;
}

/** Mifflin-St Jeor resting energy, times activity, plus goal adjustment. */
export function calorieTarget(p: BodyProfile): number {
  const base = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age;
  const sexOffset = p.sex === "male" ? 5 : p.sex === "female" ? -161 : -78;
  const tdee = (base + sexOffset) * ACTIVITY_FACTORS[p.activity_level];
  return Math.max(1200, Math.round(tdee + GOAL_ADJUST[p.goal]));
}

export function computeTargets(p: BodyProfile): Nutrients {
  const calories = calorieTarget(p);
  const proteinPerKg = p.goal === "maintain" ? 1.6 : 1.8;
  const protein_g = Math.round(p.weight_kg * proteinPerKg);
  const fat_g = Math.round((calories * 0.3) / 9);
  const carbs_g = Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));
  const male = p.sex === "male";
  const female = p.sex === "female";
  const pick = (m: number, f: number) => (male ? m : female ? f : Math.round((m + f) / 2));
  return {
    calories, protein_g, carbs_g, fat_g,
    fiber_g: Math.round((calories / 1000) * 14),
    sugar_g: Math.round((calories * 0.1) / 4),
    saturated_fat_g: Math.round((calories * 0.1) / 9),
    cholesterol_mg: 300,
    sodium_mg: 2300,
    potassium_mg: pick(3400, 2600),
    calcium_mg: female && p.age > 50 ? 1200 : p.age > 70 ? 1200 : 1000,
    iron_mg: female && p.age <= 50 ? 18 : pick(8, 8),
    magnesium_mg: pick(420, 320),
    zinc_mg: pick(11, 8),
    copper_mg: 0.9,
    selenium_mcg: 55,
    phosphorus_mg: 700,
    iodine_mcg: 150,
    choline_mg: pick(550, 425),
    vitamin_a_mcg: pick(900, 700),
    vitamin_c_mg: pick(90, 75),
    vitamin_d_mcg: p.age > 70 ? 20 : 15,
    vitamin_e_mg: 15,
    vitamin_k_mcg: pick(120, 90),
    thiamin_mg: pick(1.2, 1.1),
    riboflavin_mg: pick(1.3, 1.1),
    niacin_mg: pick(16, 14),
    vitamin_b6_mg: p.age > 50 ? pick(1.7, 1.5) : 1.3,
    vitamin_b12_mcg: 2.4,
    folate_mcg: 400,
  };
}

export function remaining(targets: Nutrients, eaten: Nutrients): Nutrients {
  const out = emptyNutrients();
  for (const k of Object.keys(out) as NutrientKey[]) out[k] = Math.round((targets[k] - eaten[k]) * 10) / 10;
  return out;
}
