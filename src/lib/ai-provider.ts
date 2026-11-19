export const AI_PROVIDERS = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "together", label: "Together AI", baseUrl: "https://api.together.xyz/v1" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  { id: "mistral", label: "Mistral AI", baseUrl: "https://api.mistral.ai/v1" },
  { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "xai", label: "xAI", baseUrl: "https://api.x.ai/v1" },
  { id: "custom", label: "Custom OpenAI-compatible URL", baseUrl: "" },
] as const;

export type AIProviderId = (typeof AI_PROVIDERS)[number]["id"];

export type AIModel = { id: string; name: string };

export function providerBaseUrl(providerId: AIProviderId): string {
  return AI_PROVIDERS.find((provider) => provider.id === providerId)?.baseUrl ?? "";
}

export function validateAiBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid provider URL beginning with https://.");
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || url.search || url.hash) {
    throw new Error("Use a secure HTTPS provider URL without a username, password, or query string.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.includes(":")) {
    throw new Error("That provider address is not allowed.");
  }
  if (host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid") || host.endsWith(".example")) {
    throw new Error("That provider address is not allowed.");
  }
  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first, second] = octets;
    if (first !== undefined && (first === 0 || first === 10 || first === 127 || first >= 224 || (first === 169 && second === 254) || (first === 172 && second !== undefined && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 100 && second !== undefined && second >= 64 && second <= 127))) {
      throw new Error("That provider address is not allowed.");
    }
  }
  return url.toString().replace(/\/$/, "");
}