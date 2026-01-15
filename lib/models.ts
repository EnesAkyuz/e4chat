// Basic AI Model definitions
export interface AIModel {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google";
  description: string;
  avatar_url?: string;
  color: string; // Tailored color for UI
}

export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "OpenAI's most advanced model.",
    color: "bg-green-500",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast and cost-effective model.",
    color: "bg-emerald-400",
  },
  {
    id: "o1-preview",
    name: "OpenAI o1",
    provider: "openai",
    description: "Advanced reasoning model.",
    color: "bg-blue-600",
  },
  // Placeholders for future providers
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    description: "Anthropic's intelligent and fast model. (Requires Key)",
    color: "bg-orange-500",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "google",
    description: "Google's highly capable multimodal model.",
    color: "bg-blue-500",
  },
];
