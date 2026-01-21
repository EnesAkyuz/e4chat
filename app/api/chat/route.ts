import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";

export async function POST(req: Request) {
  const { messages, roomId, modelId, isAutoReply, messagesSinceLastAi } =
    await req.json();

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    return Response.json(
      {
        error: "Server Configuration Error: Missing SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 500 },
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
    return Response.json(
      {
        error: "Server Configuration Error: Missing NEXT_PUBLIC_SUPABASE_URL",
      },
      { status: 500 },
    );
  }

  // Initialize Supabase Admin client with Service Role Key
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  try {
    // 1. Check Rate Limits (Tokens)
    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("ai_tokens, ai_tokens_max")
      .eq("id", roomId)
      .single();

    if (roomError || !roomData) {
      throw new Error("Failed to fetch room data");
    }

    if (roomData.ai_tokens <= 0) {
      // If auto-reply, just silently skip
      if (isAutoReply) {
        return Response.json({ skipped: true, reason: "no_tokens" });
      }
      // If manual mention, error out? Or just warn? Let's error for now so UI knows.
      return Response.json(
        { error: "AI token limit reached. Chat more to refill." },
        { status: 429 },
      );
    }

    // 2. Unprompted Participation Probability Check
    if (isAutoReply) {
      // Formula: min(0.8, messages_since_last_ai * 0.15)
      // Example: 1 msg gap = 15%, 3 msg gap = 45%
      const probability = Math.min(0.8, (messagesSinceLastAi || 0) * 0.15);
      const roll = Math.random();

      console.log(
        `[Auto-Reply Check] Model: ${modelId}, Gap: ${messagesSinceLastAi}, Prob: ${probability.toFixed(2)}, Roll: ${roll.toFixed(2)}`,
      );

      if (roll > probability) {
        return Response.json({ skipped: true, reason: "rng_check_failed" });
      }
    }

    // 3. Fetch Context (Other Models in Room)
    const { data: roomModels } = await supabase
      .from("room_models")
      .select("model_id")
      .eq("room_id", roomId);

    const otherModels = (roomModels || [])
      // biome-ignore lint/suspicious/noExplicitAny: Supabase return type
      .map((rm: any) => rm.model_id)
      .filter((id: string) => id !== modelId);

    const contextSystemPrompt = `
You are an AI assistant in "E4Chat".
Your Identity: **${modelId}**
Other AIs in this room: ${otherModels.length > 0 ? otherModels.join(", ") : "None"}

Context:
- You are participating in a group chat with human users and potentially other AIs.
- Users (and other AIs) can address you using "@${modelId}".
- You can address other AIs by mentioning them (e.g., "@gpt-4o", "@gemini-2.5-flash").
- **CRITICAL RULES for Mentions**:
  - ONLY mention another AI if you explicitly need their input or if the user asked for a debate.
  - Do NOT mention others just to say "good point" or "your turn".
  - Use mentions SPARINGLY. Infinite loops are bad.
- **Conversation Flow**:
  - If the topic seems covered, STOP. Do not feel obligated to have the last word.
  - If you are "jumping in" (auto-reply), ensure your contribution is unique and valuable.
  - Be concise and conversational.
- Use Markdown for formatting.
`;

    // Map friendly model IDs to provider specific IDs if necessary
    let providerModel = modelId;
    if (modelId === "gemini-2.5-flash") {
      providerModel = "models/gemini-2.5-flash";
    }

    const model = modelId.startsWith("gemini")
      ? google(providerModel)
      : openai(modelId);

    const response = await generateText({
      model: model,
      messages: messages,
      system: contextSystemPrompt,
    });

    const aiText = response.text;

    // Securely insert the AI message from the server
    const { error } = await supabase.from("messages").insert({
      room_id: roomId,
      content: aiText,
      is_ai: true,
      ai_model_id: modelId,
      profile_id: null, // AI has no profile
    });

    if (error) {
      console.error("Supabase Write Error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // 4. Decrement Token (Cost of doing business)
    await supabase.rpc("decrement_ai_token", { room_id_input: roomId });

    // 5. Check for AI Mentions (Looping)
    // Simple regex to find @mentions of known models
    const mentionedModels = otherModels.filter((otherId: string) =>
      aiText.toLowerCase().includes(`@${otherId.toLowerCase()}`),
    );

    // TODO: We could trigger the next AI here recursively or return a flag for the client to handle.
    // For safety and simpler architecture, returning a flag is often better,
    // BUT since we are server-side, we can just spawn the next request nicely or let the client's realtime subscription handle it.
    // The client's `ChatRoom.tsx` listens to INSERTs. When this message is inserted,
    // the client will see it, parse mentions, and trigger the next AI.
    // So we DON'T need to do anything here! The ecosystem is reactive.

    return Response.json({ success: true, mentionedModels });
  } catch (error) {
    console.error("AI Generation Error:", error);
    return Response.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}
