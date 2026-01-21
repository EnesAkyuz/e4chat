"use client";

import { useCallback, useRef, useState } from "react";

export type QueueEventType =
  | "user_message"
  | "thinking_start"
  | "thinking_end"
  | "ai_message";

export interface QueueEvent {
  id: string;
  type: QueueEventType;
  payload: unknown;
  timestamp: number;
}

interface QueueState {
  messages: Array<{
    id: string;
    content: string;
    is_ai: boolean;
    ai_model_id?: string;
    profiles?: { username: string; avatar_url?: string };
    created_at: string;
  }>;
  thinkingModels: Set<string>;
}

const DELAYS: Record<QueueEventType, number> = {
  user_message: 0, // Immediate
  thinking_start: 150, // Slight delay after user message
  thinking_end: 0, // Immediate when AI responds
  ai_message: 50, // Tiny delay for smooth transition
};

export function useRenderQueue(debug = false) {
  const [state, setState] = useState<QueueState>({
    messages: [],
    thinkingModels: new Set(),
  });

  const queueRef = useRef<QueueEvent[]>([]);
  const processingRef = useRef(false);
  const logRef = useRef<string[]>([]);

  const log = useCallback(
    (message: string) => {
      const timestamp = new Date().toISOString().split("T")[1];
      const entry = `[${timestamp}] ${message}`;
      logRef.current.push(entry);
      if (debug) {
        console.log(`🎬 RenderQueue: ${entry}`);
      }
    },
    [debug],
  );

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const event = queueRef.current.shift();
      if (!event) break;

      const delay = DELAYS[event.type];
      if (delay > 0) {
        log(`⏳ Waiting ${delay}ms before ${event.type}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      log(`▶️ Processing ${event.type} (id: ${event.id})`);

      switch (event.type) {
        case "user_message": {
          const msg = event.payload as QueueState["messages"][0];
          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, msg],
          }));
          log(`✅ Added user message: "${msg.content.substring(0, 30)}..."`);
          break;
        }

        case "thinking_start": {
          const modelIds = event.payload as string[];
          setState((prev) => ({
            ...prev,
            thinkingModels: new Set([...prev.thinkingModels, ...modelIds]),
          }));
          log(`🤔 Started thinking: ${modelIds.join(", ")}`);
          break;
        }

        case "thinking_end": {
          const modelId = event.payload as string;
          setState((prev) => {
            const next = new Set(prev.thinkingModels);
            next.delete(modelId);
            return { ...prev, thinkingModels: next };
          });
          log(`💭 Stopped thinking: ${modelId}`);
          break;
        }

        case "ai_message": {
          const msg = event.payload as QueueState["messages"][0];
          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, msg],
          }));
          log(`🤖 Added AI message from ${msg.ai_model_id}`);
          break;
        }
      }
    }

    processingRef.current = false;
  }, [log]);

  const enqueue = useCallback(
    (type: QueueEventType, payload: unknown) => {
      const event: QueueEvent = {
        id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        payload,
        timestamp: Date.now(),
      };

      log(`📥 Enqueued ${type}`);
      queueRef.current.push(event);
      processQueue();
    },
    [log, processQueue],
  );

  const enqueueUserMessage = useCallback(
    (message: QueueState["messages"][0], thinkingModelIds?: string[]) => {
      // Only enqueue user message if it has content.
      // This prevents the "empty blob" when using invisible thinking triggers.
      if (message.content && message.content.trim() !== "") {
        enqueue("user_message", message);
      } else {
        log("👻 Skipping empty user message (thinking trigger)");
      }

      // Then enqueue thinking indicators if any
      if (thinkingModelIds && thinkingModelIds.length > 0) {
        enqueue("thinking_start", thinkingModelIds);
      }
    },
    [enqueue, log],
  );

  const enqueueAiMessage = useCallback(
    (message: QueueState["messages"][0]) => {
      // First stop thinking for this model
      if (message.ai_model_id) {
        enqueue("thinking_end", message.ai_model_id);
      }
      // Then add the message
      enqueue("ai_message", message);
    },
    [enqueue],
  );

  const setInitialMessages = useCallback(
    (messages: QueueState["messages"]) => {
      log(`📦 Setting initial messages (${messages.length} items)`);
      setState((prev) => ({ ...prev, messages }));
    },
    [log],
  );

  const clearState = useCallback(() => {
    log("🧹 Clearing state");
    setState({ messages: [], thinkingModels: new Set() });
    queueRef.current = [];
  }, [log]);

  const _getLogs = useCallback(() => logRef.current, []);

  const resolveOptimisticMessage = useCallback(
    (tempId: string, realMessage: QueueState["messages"][0]) => {
      log(`🔄 Resolving optimistic message: ${tempId} -> ${realMessage.id}`);
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) => (m.id === tempId ? realMessage : m)),
      }));
    },
    [log],
  );

  return {
    messages: state.messages,
    thinkingModels: state.thinkingModels,
    enqueueUserMessage,
    enqueueAiMessage,
    setInitialMessages,
    clearState,
    resolveOptimisticMessage,
    startThinking: (modelId: string) => enqueue("thinking_start", [modelId]),
    stopThinking: (modelId: string) => enqueue("thinking_end", modelId),
  };
}
