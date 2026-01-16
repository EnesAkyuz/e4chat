import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getBotAvatarUrl(modelId: string) {
  return `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${modelId}`;
}
