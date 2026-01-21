// Basic AI Model definitions
export interface AIModel {
  id: string;
  name: string;
  provider: "openai" | "google";
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
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    description: "High-intelligence model.",
    color: "bg-blue-600",
  },
  // Placeholders for future providers
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "Google's latest fast multimodal model.",
    color: "bg-blue-500",
  },
];
