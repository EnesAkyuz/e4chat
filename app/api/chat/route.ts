import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";

export async function POST(req: Request) {
  const { messages, roomId, modelId } = await req.json();

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

    return Response.json({ success: true });
  } catch (error) {
    console.error("AI Generation Error:", error);
    return Response.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}
