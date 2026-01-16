"use client";

import { Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AVAILABLE_MODELS } from "@/lib/models";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

interface NewChatViewProps {
  onRoomCreated: (roomId: string, modelIds: string[], message: string) => void;
}

export function NewChatView({ onRoomCreated }: NewChatViewProps) {
  const [message, setMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  // Filter models based on mention query
  const filteredModels =
    mentionQuery !== null
      ? AVAILABLE_MODELS.filter(
          (m) =>
            m.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
            m.id.toLowerCase().includes(mentionQuery.toLowerCase()),
        )
      : [];

  // Insert a mention into the message
  const insertMention = (model: (typeof AVAILABLE_MODELS)[0]) => {
    const lastAtPos = message.lastIndexOf("@");
    if (lastAtPos !== -1) {
      const before = message.substring(0, lastAtPos);
      const after = message.substring(
        lastAtPos + 1 + (mentionQuery || "").length,
      );
      setMessage(`${before}@${model.name} ${after}`);
      setMentionQuery(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessage(val);

    const lastAtPos = val.lastIndexOf("@");
    if (lastAtPos !== -1) {
      const query = val.substring(lastAtPos + 1);
      if (!query.includes(" ")) {
        setMentionQuery(query);
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery !== null && filteredModels.length > 0) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) =>
          prev > 0 ? prev - 1 : filteredModels.length - 1,
        );
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) =>
          prev < filteredModels.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredModels[mentionIndex]);
      } else if (e.key === "Escape") {
        setMentionQuery(null);
      }
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || isCreating) return;

    setIsCreating(true);

    try {
      // 1. Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to create a room");
        return;
      }

      // 2. Generate title from first message
      const titleRes = await fetch("/api/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      const { title } = await titleRes.json();

      // 3. Create the room with generated title
      const slug =
        (title || "chat")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .substring(0, 30) +
        "-" +
        Math.random().toString(36).substring(7);

      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .insert({
          slug,
          name: title || "New Chat",
          created_by: user.id,
          is_open: false,
        })
        .select()
        .single();

      if (roomError || !room) {
        throw new Error(roomError?.message || "Failed to create room");
      }

      // 4. Add ALL available models to the room
      const modelInserts = AVAILABLE_MODELS.map((model) => ({
        room_id: room.id,
        model_id: model.id,
        added_by: user.id,
      }));

      const { data: insertedModels, error: modelsError } = await supabase
        .from("room_models")
        .insert(modelInserts)
        .select();

      if (modelsError) {
        console.error("Error adding models:", modelsError);
      }

      // 5. Parse @mentions and keep only mentioned models
      const lowerMessage = message.toLowerCase();
      const mentionedModelIds = AVAILABLE_MODELS.filter((model) => {
        const nameMatch = lowerMessage.includes(`@${model.name.toLowerCase()}`);
        const idMatch = lowerMessage.includes(`@${model.id.toLowerCase()}`);
        return nameMatch || idMatch;
      }).map((m) => m.id);

      // 6. Remove non-mentioned models (if any were mentioned)
      if (mentionedModelIds.length > 0 && insertedModels) {
        const modelsToRemove = insertedModels.filter(
          (rm) => !mentionedModelIds.includes(rm.model_id),
        );

        if (modelsToRemove.length > 0) {
          await supabase
            .from("room_models")
            .delete()
            .in(
              "id",
              modelsToRemove.map((m) => m.id),
            );
        }
      }

      // 7. Insert the first message
      const { error: msgError } = await supabase.from("messages").insert({
        room_id: room.id,
        content: message.trim(),
        profile_id: user.id,
      });

      if (msgError) {
        throw new Error(msgError.message);
      }

      // 8. Trigger AI responses for mentioned models (don't await - let them run in background)
      if (mentionedModelIds.length > 0) {
        const contextMessages = [
          { role: "user" as const, content: message.trim() },
        ];

        // Fire off AI requests - they'll complete and insert via realtime
        for (const modelId of mentionedModelIds) {
          fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: contextMessages,
              roomId: room.id,
              modelId: modelId,
            }),
          }).catch((err) => console.error("AI request error:", err));
        }
      }

      // 9. Navigate to the new room (pass pending model IDs for smooth transition)
      onRoomCreated(room.id, mentionedModelIds, message.trim());
    } catch (err) {
      console.error("Error creating room:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="relative flex h-full flex-col bg-background text-foreground">
      {/* Top Progress Bar */}
      {isCreating && (
        <div className="absolute top-0 left-0 right-0 z-50">
          <div className="h-1 w-full bg-primary/20 overflow-hidden">
            <div className="h-full w-1/3 bg-primary animate-[progress_1s_ease-in-out_infinite]" />
          </div>
        </div>
      )}

      {/* Empty State Header */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
            <Sparkles className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">
              Start a new conversation
            </h2>
            <p className="text-muted-foreground">
              Mention an AI model with{" "}
              <span className="font-mono text-primary">@</span> to chat with it.
              Type <span className="font-mono text-primary">@</span> to see
              available models.
            </p>
          </div>

          {/* Available models display */}
          <div className="flex flex-wrap justify-center gap-2">
            {AVAILABLE_MODELS.map((model) => (
              <button
                type="button"
                key={model.id}
                onClick={() => setMessage((prev) => `${prev}@${model.name} `)}
                disabled={isCreating}
                className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className={cn("h-2 w-2 rounded-full", model.color)} />
                <span>@{model.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input Area - matches ChatRoom styling */}
      <div className="p-4 border-t border-border bg-background relative">
        {/* Mention Suggestions */}
        {mentionQuery !== null && filteredModels.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-md animate-in fade-in slide-in-from-bottom-2">
            <div className="p-1">
              {filteredModels.map((model, idx) => (
                <button
                  type="button"
                  key={model.id}
                  onClick={() => insertMention(model)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors text-left",
                    idx === mentionIndex
                      ? "bg-accent text-accent-foreground"
                      : "text-popover-foreground hover:bg-accent/50",
                  )}
                >
                  <div className={cn("h-2 w-2 rounded-full", model.color)} />
                  <span>{model.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {model.provider}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="relative flex items-center gap-2"
        >
          <Input
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Type @ to mention an AI model..."
            disabled={isCreating}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary rounded-full pl-6 pr-12 h-12"
          />
          <Button
            type="submit"
            disabled={!message.trim() || isCreating}
            size="icon"
            className="absolute right-2 h-8 w-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isCreating ? (
              <div className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
