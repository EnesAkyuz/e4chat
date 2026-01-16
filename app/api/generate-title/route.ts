import { google } from "@ai-sdk/google";
import { generateText } from "ai";

export async function POST(req: Request) {
  const { message } = await req.json();

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  try {
    const response = await generateText({
      model: google("models/gemini-2.5-flash"),
      messages: [
        {
          role: "user",
          content: `Generate a very short title (2-4 words max) for a chat conversation that starts with this message. Return ONLY the title, no quotes, no explanation:

"${message}"`,
        },
      ],
    });

    const title = response.text.trim().replace(/^["']|["']$/g, "");

    return Response.json({ title });
  } catch (error) {
    console.error("Title generation error:", error);
    // Fallback to first few words of the message
    const fallbackTitle = message.split(" ").slice(0, 4).join(" ");
    return Response.json({ title: fallbackTitle || "New Chat" });
  }
}
