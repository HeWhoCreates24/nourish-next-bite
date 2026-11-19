import { AI_PROVIDERS, validateAiBaseUrl, type AIModel, type AIProviderId } from "@/lib/ai-provider";

type SettingsRow = {
  provider_id: string;
  base_url: string;
  model_id: string;
  encrypted_api_key: string;
  encryption_iv: string;
};

function encryptionSecret(): string {
  const secret = process.env["USER_AI_KEY_ENCRYPTION_KEY"];
  if (!secret) throw new Error("Private AI key storage is not configured.");
  return secret;
}

async function aesKey(secret = encryptionSecret()): Promise<CryptoKey> {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function encryptProviderKey(apiKey: string, secret?: string): Promise<{ encryptedApiKey: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(iv) }, await aesKey(secret), asArrayBuffer(new TextEncoder().encode(apiKey)));
  return { encryptedApiKey: encodeBase64(new Uint8Array(encrypted)), iv: encodeBase64(iv) };
}

export async function decryptProviderKey(row: Pick<SettingsRow, "encrypted_api_key" | "encryption_iv">): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(decodeBase64(row.encryption_iv)) },
    await aesKey(),
    asArrayBuffer(decodeBase64(row.encrypted_api_key)),
  );
  return new TextDecoder().decode(decrypted);
}

export async function readAiSettings(supabase: { from: (table: "ai_provider_settings") => any }, userId: string) {
  const { data, error } = await supabase.from("ai_provider_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Could not load your AI settings.");
  const row = data as SettingsRow | null;
  return row;
}

export function validateProviderUrl(providerId: AIProviderId, input: string): string {
  const normalized = validateAiBaseUrl(input);
  const provider = AI_PROVIDERS.find((item) => item.id === providerId);
  if (!provider) throw new Error("Choose a supported AI provider.");
  if (provider.id !== "custom" && validateAiBaseUrl(provider.baseUrl) !== normalized) {
    throw new Error("Use the listed URL for this provider, or select Custom.");
  }
  return normalized;
}

export async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<AIModel[]> {
  const response = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("The provider rejected that key. Check it and try again.");
    if (response.status >= 300 && response.status < 400) throw new Error("The provider redirected the model request. Check the URL and try again.");
    throw new Error("Could not load models from that provider. Check the URL and key.");
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("That provider did not return a compatible model list.");
  }
  const models = (payload as { data: unknown[] }).data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { id?: unknown; name?: unknown };
    if (typeof candidate.id !== "string" || !candidate.id.trim()) return [];
    const id = candidate.id.trim().slice(0, 300);
    const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim().slice(0, 300) : id;
    return [{ id, name }];
  });
  if (!models.length) throw new Error("No models were found for this key.");
  return models.slice(0, 1000);
}

export async function providerKeyForRequest(row: SettingsRow): Promise<{ apiKey: string; baseUrl: string; modelId: string }> {
  return { apiKey: await decryptProviderKey(row), baseUrl: validateAiBaseUrl(row.base_url), modelId: row.model_id };
}