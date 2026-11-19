import { describe, expect, it } from "vitest";
import { AI_PROVIDERS, validateAiBaseUrl } from "@/lib/ai-provider";

describe("AI provider choices", () => {
  it("offers popular OpenAI-compatible providers and a custom URL", () => {
    expect(AI_PROVIDERS.map((provider) => provider.id)).toEqual([
      "openai", "openrouter", "groq", "together", "deepseek", "mistral", "gemini", "xai", "custom",
    ]);
  });

  it("accepts secure public provider URLs and normalizes trailing slashes", () => {
    expect(validateAiBaseUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
  });

  it.each([
    "http://api.example.com/v1",
    "https://localhost/v1",
    "https://127.0.0.1/v1",
    "https://10.1.2.3/v1",
    "https://192.168.1.10/v1",
    "https://service.internal/v1",
    "https://api.example.com:8443/v1",
    "https://user:pass@api.example.com/v1",
  ])("rejects unsafe provider URLs: %s", (url) => {
    expect(() => validateAiBaseUrl(url)).toThrow();
  });
});