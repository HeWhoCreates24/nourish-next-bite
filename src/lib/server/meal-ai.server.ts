import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { NUTRIENTS, normalizeNutrients, type Nutrients } from "@/lib/nutrition";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openrouter/free";

export interface MealItem { name: string; quantity: string; calories: number }
export interface MealAnalysis { summary: string; items: MealItem[]; nutrients: Nutrients; advice: string }

export class MealAiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new MealAiError("The AI reply could not be read. Please try again.");
  return JSON.parse(body.slice(start, end + 1));
}

function friendlyError(error: unknown): MealAiError {
  const status = (error as { statusCode?: number })?.statusCode;
  if (status === 401) return new MealAiError("The OpenRouter key was rejected. Please update it.", 401);
  if (status === 402) return new MealAiError("OpenRouter reports the account needs credits.", 402);
  if (status === 429) return new MealAiError("The free AI models are busy right now. Please try again shortly.", 429);
  if (error instanceof MealAiError) return error;
  console.error("Meal analysis failed", error);
  return new MealAiError("Meal analysis failed. Please try again.", status);
}

export async function analyzeMeal(input: {
  mealText: string;
  targets: Nutrients;
  eatenBefore: Nutrients;
  dietaryNotes: string | null;
}): Promise<MealAnalysis> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new MealAiError("OpenRouter is not connected yet.");

  const provider = createOpenAICompatible({
    name: "openrouter",
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    headers: { "X-Title": "Ember Nutrition Tracker" },
  });

  const keys = NUTRIENTS.map((n) => `${n.key} (${n.unit})`).join(", ");
  const instructions = `You are a precise registered-dietitian nutrition analyst. Estimate nutrition for the meal the user describes, using typical portion sizes when amounts are missing and standard food composition data (USDA-style).
Respond with ONLY one JSON object, no prose, in this exact shape:
{"summary": string (short meal name), "items": [{"name": string, "quantity": string, "calories": number}], "nutrients": {<every key below>: number}, "advice": string}
Nutrient keys (totals for the whole meal): ${keys}.
"advice": 2-4 short sentences telling the user which specific foods to prioritize in their NEXT meal to close today's gaps (and what to go easy on if a limit is near/exceeded), based on the remaining-targets data provided. Be concrete and friendly.`;

  const prompt = `Meal: ${input.mealText}
Dietary notes/preferences: ${input.dietaryNotes || "none"}
Daily targets: ${JSON.stringify(input.targets)}
Already eaten today before this meal: ${JSON.stringify(input.eatenBefore)}
(Compute remaining = targets - already eaten - this meal for your advice. Items marked as limits: sugar_g, saturated_fat_g, cholesterol_mg, sodium_mg.)`;

  try {
    const result = streamText({
      model: provider.chatModel(process.env["OPENROUTER_MODEL"] || DEFAULT_MODEL),
      instructions,
      prompt,
      maxRetries: 1,
    });
    const text = await result.text;
    if (!text.trim()) throw new MealAiError("The AI returned an empty answer. Please try again.");
    const parsed = extractJson(text) as Record<string, unknown>;
    const items = Array.isArray(parsed["items"])
      ? parsed["items"].slice(0, 30).map((i) => {
          const it = i as Record<string, unknown>;
          return { name: String(it["name"] ?? "Food"), quantity: String(it["quantity"] ?? ""), calories: Math.max(0, Math.round(Number(it["calories"]) || 0)) };
        })
      : [];
    return {
      summary: String(parsed["summary"] ?? "Meal").slice(0, 120),
      items,
      nutrients: normalizeNutrients(parsed["nutrients"]),
      advice: String(parsed["advice"] ?? "").slice(0, 1200),
    };
  } catch (error) {
    throw friendlyError(error);
  }
}
