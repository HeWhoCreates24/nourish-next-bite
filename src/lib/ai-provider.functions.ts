import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AI_PROVIDERS } from "@/lib/ai-provider";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerIds = AI_PROVIDERS.map((provider) => provider.id) as [string, ...string[]];
const providerInput = z.object({
  providerId: z.enum(providerIds),
  baseUrl: z.string().trim().min(8).max(500),
  apiKey: z.string().trim().max(4000).optional(),
});

export const getAiProviderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readAiSettings } = await import("@/lib/ai-provider.server");
    const row = await readAiSettings(context.supabase, context.userId);
    return row ? { providerId: row.provider_id, baseUrl: row.base_url, modelId: row.model_id, hasKey: true } : null;
  });

export const getAiProviderModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => providerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { fetchProviderModels, readAiSettings, decryptProviderKey, validateProviderUrl } = await import("@/lib/ai-provider.server");
    const baseUrl = validateProviderUrl(data.providerId as import("@/lib/ai-provider").AIProviderId, data.baseUrl);
    let apiKey = data.apiKey?.trim() ?? "";
    if (!apiKey) {
      const saved = await readAiSettings(context.supabase, context.userId);
      if (!saved || saved.base_url !== baseUrl || saved.provider_id !== data.providerId) {
        throw new Error("Enter your provider key to load its models.");
      }
      apiKey = await decryptProviderKey(saved);
    }
    if (!apiKey) throw new Error("Enter your provider key to load its models.");
    return { models: await fetchProviderModels(baseUrl, apiKey) };
  });

export const saveAiProviderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    ...providerInput.shape,
    modelId: z.string().trim().min(1).max(300),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { encryptProviderKey, readAiSettings, validateProviderUrl } = await import("@/lib/ai-provider.server");
    const providerId = data.providerId as import("@/lib/ai-provider").AIProviderId;
    const baseUrl = validateProviderUrl(providerId, data.baseUrl);
    let encrypted = null;
    if (data.apiKey?.trim()) encrypted = await encryptProviderKey(data.apiKey.trim());
    const existing = encrypted ? null : await readAiSettings(context.supabase, context.userId);
    if (!encrypted && (!existing || existing.base_url !== baseUrl || existing.provider_id !== data.providerId)) {
      throw new Error("Enter a key for this provider before saving.");
    }
    const payload = {
      user_id: context.userId,
      provider_id: data.providerId,
      base_url: baseUrl,
      model_id: data.modelId,
      encrypted_api_key: encrypted?.encryptedApiKey ?? existing?.encrypted_api_key ?? "",
      encryption_iv: encrypted?.iv ?? existing?.encryption_iv ?? "",
      updated_at: new Date().toISOString(),
    };
    const { error } = await context.supabase.from("ai_provider_settings").upsert(payload);
    if (error) throw new Error("Could not save your AI settings.");
    return { ok: true, hasKey: true };
  });

export const removeAiProviderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("ai_provider_settings").delete().eq("user_id", context.userId);
    if (error) throw new Error("Could not remove your AI settings.");
    return { ok: true };
  });