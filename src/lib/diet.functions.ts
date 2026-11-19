import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeTargets, normalizeNutrients, sumNutrients, type BodyProfile } from "@/lib/nutrition";

const dayInput = z.object({ dayStart: z.string(), dayEnd: z.string() });

type ProfileRow = {
  height_cm: number | null; weight_kg: number | null; age: number | null; sex: string | null;
  activity_level: string; goal: string; dietary_notes: string | null; display_name: string | null;
};

function toBody(p: ProfileRow | null): BodyProfile | null {
  if (!p || !p.height_cm || !p.weight_kg || !p.age || !p.sex) return null;
  return {
    height_cm: Number(p.height_cm), weight_kg: Number(p.weight_kg), age: p.age,
    sex: p.sex as BodyProfile["sex"], activity_level: p.activity_level as BodyProfile["activity_level"],
    goal: p.goal as BodyProfile["goal"],
  };
}

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => dayInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: meals, error }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("meal_logs").select("*").eq("user_id", userId)
        .gte("logged_at", data.dayStart).lt("logged_at", data.dayEnd).order("logged_at", { ascending: false }),
    ]);
    if (error) throw new Error("Could not load your meals.");
    const body = toBody(profile as ProfileRow | null);
    const list = (meals ?? []).map((m) => ({
      id: m.id, raw_text: m.raw_text, summary: m.meal_summary, advice: m.advice, logged_at: m.logged_at,
      items: (Array.isArray(m.items) ? m.items : []) as { name: string; quantity: string; calories: number }[],
      nutrients: normalizeNutrients(m.nutrients),
    }));
    return {
      profile: profile ? {
        display_name: profile.display_name, height_cm: profile.height_cm, weight_kg: profile.weight_kg,
        age: profile.age, sex: profile.sex, activity_level: profile.activity_level, goal: profile.goal,
        dietary_notes: profile.dietary_notes,
      } : null,
      targets: body ? computeTargets(body) : null,
      eaten: sumNutrients(list.map((m) => m.nutrients)),
      meals: list,
    };
  });

const profileInput = z.object({
  display_name: z.string().max(80).nullable(),
  height_cm: z.number().min(100).max(250),
  weight_kg: z.number().min(30).max(350),
  age: z.number().int().min(14).max(110),
  sex: z.enum(["male", "female", "other"]),
  activity_level: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  goal: z.enum(["lose", "maintain", "gain"]),
  dietary_notes: z.string().max(500).nullable(),
});

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => profileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles")
      .upsert({ id: context.userId, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error("Could not save your profile.");
    return { ok: true };
  });

export const logMeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => dayInput.extend({ text: z.string().trim().min(2).max(1500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: meals }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("meal_logs").select("nutrients").eq("user_id", userId)
        .gte("logged_at", data.dayStart).lt("logged_at", data.dayEnd),
    ]);
    const body = toBody(profile as ProfileRow | null);
    if (!body) return { error: "Please complete your profile first so targets can be set." };
    const { analyzeMeal, MealAiError } = await import("@/lib/server/meal-ai.server");
    const { providerKeyForRequest } = await import("@/lib/ai-provider.server");
    const settings = await context.supabase.from("ai_provider_settings").select("*").eq("user_id", userId).maybeSingle();
    if (settings.error) throw new Error("Could not load your AI provider settings.");
    if (!settings.data) return { error: "Connect an AI provider in settings before logging a meal." };
    try {
      const analysis = await analyzeMeal({
        provider: await providerKeyForRequest(settings.data),
        mealText: data.text,
        targets: computeTargets(body),
        eatenBefore: sumNutrients((meals ?? []).map((m) => m.nutrients)),
        dietaryNotes: profile?.dietary_notes ?? null,
      });
      const { error } = await supabase.from("meal_logs").insert({
        user_id: userId, raw_text: data.text, meal_summary: analysis.summary,
        items: analysis.items as unknown as Json, nutrients: analysis.nutrients as unknown as Json, advice: analysis.advice,
      });
      if (error) return { error: "The meal was analyzed but could not be saved." };
      return { error: null, summary: analysis.summary };
    } catch (e) {
      return { error: e instanceof MealAiError ? e.message : "Meal analysis failed. Please try again." };
    }
  });

export const deleteMeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("meal_logs").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error("Could not delete that meal.");
    return { ok: true };
  });
