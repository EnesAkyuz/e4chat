import {
  Activity,
  Bot,
  Check,
  Copy,
  Lock,
  LockOpen,
  RefreshCcw,
  Reply,
  Send,
  ToggleLeft,
  ToggleRight,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MarkdownContent } from "@/components/MarkdownContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRenderQueue } from "@/hooks/useRenderQueue";
import { AVAILABLE_MODELS } from "@/lib/models";
import { cn, getBotAvatarUrl } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { RoomSidebar } from "./RoomSidebar";

interface Message {
  id: string;
  content: string;
  profile_id: string | null;
  reply_to_id?: string | null;
  created_at: string;
  is_ai?: boolean;
  ai_model_id?: string;
  profiles?: {
    username: string;
    avatar_url: string;
  };
}

interface Participant {
  profile_id: string;
  role: string;
  profiles: {
    username: string;
    avatar_url: string;
  };
}

interface Room {
  id: string;
  slug: string;
  name?: string;
  created_by: string;
  is_open: boolean;
  password?: string;
  created_at: string;
  ai_tokens?: number;
  ai_tokens_max?: number;
}

interface RoomModel {
  id: string;
  model_id: string;
  room_id: string;
}

interface ChatRoomProps {
  roomId: string;
  initialThinkingModels?: string[];
  initialMessage?: string;
  onThinkingModelsConsumed?: () => void;
  onKicked?: () => void;
}

export default function ChatRoom({
  roomId,
  initialThinkingModels = [],
  initialMessage,
  onThinkingModelsConsumed,
  onKicked,
}: ChatRoomProps) {
  // Use the render queue for sequenced message/thinking state
  const {
    messages: queuedMessages,
    thinkingModels,
    enqueueUserMessage,
    enqueueAiMessage,
    setInitialMessages,
    clearState: clearQueue,
    resolveOptimisticMessage,
    startThinking,
    stopThinking,
  } = useRenderQueue(true); // Enable debug logging

  // Convert queued messages to full Message type for rendering
  const messages = queuedMessages as unknown as Message[];

  const [newMessage, setNewMessage] = useState("");
  const [roomDetails, setRoomDetails] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [roomModels, setRoomModels] = useState<RoomModel[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const roomModelsRef = useRef(roomModels);

  useEffect(() => {
    roomModelsRef.current = roomModels;
  }, [roomModels]);

  const animatedMessagesRef = useRef<Set<string>>(new Set());
  // Map content -> tempId for resolving optimistic updates
  const pendingOptimisticMessages = useRef<Map<string, string>>(new Map());

  // AI Request Queue: modelId -> Array of pending payloads
  // biome-ignore lint/suspicious/noExplicitAny: Payload type
  const pendingAiRequests = useRef<Map<string, any[]>>(new Map());

  // Track if this is a fresh room with initial data to enqueue
  const initialDataEnqueued = useRef(false);

  // Track messages since last AI response for unprompted participation
  const [messagesSinceLastAi, setMessagesSinceLastAi] = useState(0);

  // Synchronous Global Lock to prevent race conditions
  const isGlobalBusyRef = useRef(false);

  useEffect(() => {
    // Sync ref with state for React reactivity, but use ref for logic
    isGlobalBusyRef.current = thinkingModels.size > 0;
  }, [thinkingModels]);

  useEffect(() => {
    // Recalculate whenever messages change
    let count = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].is_ai) break;
      count++;
    }
    setMessagesSinceLastAi(count);
  }, [messages]);

  // Presence state
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<
    { username: string; timestamp: number }[]
  >([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  // Check if user is owner
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(
    null,
  );

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const userId = data.user?.id || null;
      setCurrentUserId(userId);

      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("id", userId)
          .single();
        setCurrentUsername(profile?.username || null);
        setCurrentUserAvatar(profile?.avatar_url || null);
      }
    });
  }, [supabase]);

  const isOwner = roomDetails && currentUserId === roomDetails.created_by;
  const canSend = roomDetails && (roomDetails.is_open || isOwner);

  useEffect(() => {
    if (roomDetails && currentUserId && !roomDetails.is_open && !isOwner) {
      toast.error("Room has been closed.");
      onKicked?.();
    }
  }, [roomDetails, currentUserId, isOwner, onKicked]);

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const handleSetPassword = async () => {
    // Allow empty to remove password (set to null)
    const passwordValue = newPassword.trim() || null;

    const { error } = await supabase
      .from("rooms")
      .update({ password: passwordValue })
      .eq("id", roomId);

    if (error) {
      toast.error(`Error setting password: ${error.message}`);
    } else {
      setNewPassword("");
      setIsPasswordDialogOpen(false);
      toast.success(
        passwordValue ? "Password set successfully!" : "Password removed!",
      );
    }
  };

  const fetchRoomDetails = useCallback(async () => {
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (data) {
      setRoomDetails(data);
    } else {
      // If data is null, it means the room doesn't exist or RLS hid it (closed)
      // Check if we previously had details (meaning we were kicked)
      setRoomDetails((prev) => {
        if (prev) {
          toast.error("Room unavailable.");
          onKicked?.();
        }
        return null; // Update state to null regardless
      });
    }
  }, [roomId, supabase, onKicked]);

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("*, profiles(username, avatar_url)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (data) {
      // Use the queue's setInitialMessages for proper sequencing
      setInitialMessages(data);
    }
  }, [roomId, supabase, setInitialMessages]);

  const getMentionedModelIds = useCallback(
    (content: string) => {
      const lowerContent = content.toLowerCase();

      // Find matched models in the room
      let mentionedModels = roomModelsRef.current.filter((rm) => {
        const modelDef = AVAILABLE_MODELS.find((m) => m.id === rm.model_id);
        if (!modelDef) return false;
        const nameMatch = lowerContent.includes(
          `@${modelDef.name.toLowerCase()}`,
        );
        const idMatch = lowerContent.includes(`@${modelDef.id.toLowerCase()}`);
        return nameMatch || idMatch;
      });

      // Deduplicate/Filter shadowed matches
      mentionedModels = mentionedModels.filter((rm) => {
        const myModel = AVAILABLE_MODELS.find((m) => m.id === rm.model_id);
        if (!myModel) return false;

        const isShadowed = mentionedModels.some((other) => {
          if (other.id === rm.id) return false;
          const otherModel = AVAILABLE_MODELS.find(
            (m) => m.id === other.model_id,
          );
          if (!otherModel) return false;

          if (
            otherModel.name
              .toLowerCase()
              .includes(myModel.name.toLowerCase()) ||
            otherModel.id.toLowerCase().includes(myModel.id.toLowerCase())
          ) {
            return true;
          }
          return false;
        });

        return !isShadowed;
      });

      return mentionedModels;
    },
    [], // stable reference now
  );

  const fetchRoomModels = useCallback(async () => {
    const { data } = await supabase
      .from("room_models")
      .select("*")
      .eq("room_id", roomId);
    if (data) setRoomModels(data);
  }, [roomId, supabase]);

  const fetchMessageSender = useCallback(
    async (messageId: string) => {
      const { data } = await supabase
        .from("messages")
        .select("*, profiles(username, avatar_url)")
        .eq("id", messageId)
        .single();
      return data;
    },
    [supabase],
  );

  const fetchParticipants = useCallback(async () => {
    const { data } = await supabase
      .from("room_participants")
      .select("role, profile_id, profiles(username, avatar_url)")
      .eq("room_id", roomId);

    if (data) {
      // biome-ignore lint/suspicious/noExplicitAny: Supabase join typing can be tricky
      const typedData = data.map((p: any) => ({
        ...p,
        profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
      })) as Participant[];
      setParticipants(typedData);
    }
  }, [roomId, supabase]);

  const fetchInviteCode = useCallback(async () => {
    const { data } = await supabase
      .from("room_invites")
      .select("code")
      .eq("room_id", roomId)
      .limit(1)
      .single();

    if (data) setInviteCode(data.code);
  }, [roomId, supabase]);

  // Mention Helpers
  const insertMention = (model: (typeof AVAILABLE_MODELS)[0]) => {
    const lastAtPos = newMessage.lastIndexOf("@");
    if (lastAtPos !== -1) {
      const before = newMessage.substring(0, lastAtPos);
      const after = newMessage.substring(
        lastAtPos + 1 + (mentionQuery || "").length,
      );
      setNewMessage(`${before}@${model.name} ${after}`);
      setMentionQuery(null);
    }
  };

  const filteredModels =
    mentionQuery !== null
      ? roomModels
          .map((rm) => AVAILABLE_MODELS.find((m) => m.id === rm.model_id))
          .filter(
            (m): m is (typeof AVAILABLE_MODELS)[0] =>
              !!m &&
              (m.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                m.id.toLowerCase().includes(mentionQuery.toLowerCase())),
          )
      : [];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewMessage(val);

    // Broadcast typing status
    if (currentUserId && currentUsername) {
      const presenceChannel = supabase.channel(`presence:${roomId}`);

      // If text is not empty and we haven't sent "typing: true" yet (or effectively recently)
      if (val.trim()) {
        if (!isTypingRef.current) {
          presenceChannel.track({
            user_id: currentUserId,
            username: currentUsername,
            is_typing: true,
            typing_timestamp: Date.now(),
          });
          isTypingRef.current = true;
        }

        // Clear previous "stop typing" timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        // Set timeout to stop typing after 2 seconds of inactivity
        typingTimeoutRef.current = setTimeout(() => {
          presenceChannel.track({
            user_id: currentUserId,
            username: currentUsername,
            is_typing: false,
          });
          isTypingRef.current = false;
        }, 2000);
      } else {
        // If message is cleared, stop typing immediately
        if (isTypingRef.current) {
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          presenceChannel.track({
            user_id: currentUserId,
            username: currentUsername,
            is_typing: false,
          });
          isTypingRef.current = false;
        }
      }
    }

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

  // Effects
  // biome-ignore lint/correctness/useExhaustiveDependencies: initialMessage and initialThinkingModels are intentionally excluded to restrict initialization logic to room changes
  useEffect(() => {
    if (!roomId) return;

    // Reset state for new room
    clearQueue();
    setRoomDetails(null);
    setParticipants([]);
    setInviteCode(null);
    setRoomModels([]);
    setIsCopied(false);
    initialDataEnqueued.current = false;

    fetchRoomDetails();
    fetchMessages().then(() => {
      // After fetching messages, if we have initial data from NewChatView, enqueue it
      if (!initialDataEnqueued.current && initialMessage) {
        initialDataEnqueued.current = true;
        // The user's message should already be in DB (fetched above)
        // Now enqueue thinking indicators with a delay
        if (initialThinkingModels.length > 0) {
          // Small delay to ensure the message is visually present first
          setTimeout(() => {
            enqueueUserMessage(
              {
                id: "thinking-trigger",
                content: "",
                is_ai: false,
                created_at: new Date().toISOString(),
              },
              initialThinkingModels,
            );
          }, 100);
        }
      }
    });
    fetchParticipants();
    fetchInviteCode();
    fetchRoomModels();

    // 1. Subscribe to Messages
    const msgChannel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          // Fetch sender details for the new message
          fetchMessageSender(newMsg.id).then((fullMsg) => {
            if (fullMsg) {
              if (fullMsg.is_ai) {
                // Use queue for AI messages - this handles thinking→message transition
                enqueueAiMessage({
                  id: fullMsg.id,
                  content: fullMsg.content,
                  is_ai: true,
                  ai_model_id: fullMsg.ai_model_id,
                  profiles: fullMsg.profiles,
                  created_at: fullMsg.created_at,
                });

                // Trigger AI-to-AI mentions
                // We check if the AI mentioned anyone else
                const mentions = getMentionedModelIds(fullMsg.content);
                if (mentions.length > 0) {
                  // We need to trigger the mentioned AIs
                  // Crucial: Use DB for context to avoid stale state in this callback
                  const triggerAi = async () => {
                    // Fetch latest context from DB
                    const { data: recentMessages } = await supabase
                      .from("messages")
                      .select("content, is_ai")
                      .eq("room_id", roomId)
                      .order("created_at", { ascending: false })
                      .limit(10);

                    if (!recentMessages) return;

                    const contextMessages = recentMessages
                      .reverse()
                      .map((m) => ({
                        role: m.is_ai ? "assistant" : "user",
                        content: m.content,
                      }));

                    // Trigger each mentioned model
                    await Promise.all(
                      mentions.map(async (rm) => {
                        // Prevent self-loops if AI somehow mentions itself
                        if (rm.model_id === fullMsg.ai_model_id) return;

                        await triggerAiRequest(rm.model_id, {
                          messages: contextMessages,
                          roomId: roomId,
                          modelId: rm.model_id,
                        });
                      }),
                    );
                  };
                  triggerAi();
                }
              } else {
                // User Message Logic

                // 1. Check if it's OUR message that we already rendered optimistically
                if (fullMsg.profile_id === currentUserId) {
                  const tempId = pendingOptimisticMessages.current.get(
                    fullMsg.content,
                  );
                  if (tempId) {
                    // Prevent double animation (blink) by marking new ID as already animated
                    animatedMessagesRef.current.add(fullMsg.id);

                    // Found it! Seamlessly replace the temp ID with real ID
                    resolveOptimisticMessage(tempId, {
                      ...fullMsg,
                      is_ai: false, // ensure boolean
                    } as any);
                    pendingOptimisticMessages.current.delete(fullMsg.content);
                    return;
                  }
                }

                // 2. If not optimized (or from another user), enqueue it
                // AND check for mentions to show thinking indicators for OTHERS
                const mentions = getMentionedModelIds(fullMsg.content);
                const mentionIds = mentions.map((rm) => rm.model_id);

                enqueueUserMessage(
                  {
                    id: fullMsg.id,
                    content: fullMsg.content,
                    is_ai: false,
                    profiles: fullMsg.profiles,
                    created_at: fullMsg.created_at,
                  },
                  mentionIds,
                );
              }
            }
          });
        },
      )
      .subscribe();

    // 2. Subscribe to Room Updates
    const roomChannel = supabase
      .channel(`room_meta:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        async (payload) => {
          // If we have payload, use it for immediate feedback
          if (payload.new) {
            setRoomDetails(payload.new as Room);
          }
          // Also fetch fresh details to ensure consistency (and hit RLS if access lost)
          await fetchRoomDetails();
        },
      )
      .subscribe();

    // 3. Subscribe to Room Models (to keep mention list fresh)
    const modelsChannel = supabase
      .channel(`room_models_chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_models",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchRoomModels();
        },
      )
      .subscribe();

    // 4. Subscribe to Room Participants (to keep member list fresh and detect kicks)
    const participantsChannel = supabase
      .channel(`room_participants_chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "room_participants",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          // If the deleted participant is the current user, they were kicked
          const deleted = payload.old as { profile_id?: string };
          if (deleted?.profile_id === currentUserId) {
            toast.error("You have been removed from this room.");
            onKicked?.();
            return;
          }
          // Otherwise, just refresh the participant list
          fetchParticipants();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_participants",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchParticipants();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(modelsChannel);
      supabase.removeChannel(participantsChannel);
    };
  }, [
    roomId,
    fetchRoomDetails,
    fetchMessages,
    fetchParticipants,
    fetchInviteCode,
    fetchRoomModels,
    fetchMessageSender,
    supabase,
    clearQueue,
    enqueueUserMessage,
    enqueueAiMessage,
    currentUserId,
    getMentionedModelIds,
    resolveOptimisticMessage,
    onKicked,
    // initialMessage and initialThinkingModels are purposely excluded
    // We only want to process them on MOUNT/ROOM CHANGE, not when parent clears them.
  ]);

  // Process AI Request (Queue aware + Lazy Context)
  // Process AI Request (Queue aware + Lazy Context)
  const triggerAiRequest = useCallback(
    async (modelId: string, payloadOrIntent: any) => {
      // 1. Synchronous Global Check
      if (isGlobalBusyRef.current) {
        console.log(
          `[Queue] Global Lock Busy. Queuing request for ${modelId}.`,
        );

        // DEDUPLICATION: "Cancel the first one, return the second one."
        // We overwrite any existing queued item for this model.
        const currentQueue = pendingAiRequests.current.get(modelId) || [];
        if (currentQueue.length > 0) {
          console.log(
            `[Queue] Overwriting previous request for ${modelId} (deduplication).`,
          );
        }
        // Set queue to ONLY contain this latest request (Last One Wins)
        pendingAiRequests.current.set(modelId, [
          { ...payloadOrIntent, _needsFreshContext: true },
        ]);
        return;
      }

      // 2. Lock immediately
      isGlobalBusyRef.current = true; // Optimistic lock

      try {
        // Show thinking state immediately
        startThinking(modelId);

        let finalPayload = payloadOrIntent;

        // Smart Queue: Refresh context if needed
        // If we marked it as needing fresh context (queued item), fetch from DB.
        if (payloadOrIntent._needsFreshContext) {
          console.log(`[SmartQueue] Fetching fresh context for ${modelId}...`);
          // Fetch latest 10 messages from DB to ensure we see interruptions
          const { data: recentMessages } = await supabase
            .from("messages")
            .select("content, is_ai")
            .eq("room_id", roomId)
            .order("created_at", { ascending: false })
            .limit(10);

          if (recentMessages) {
            const contextMessages = recentMessages.reverse().map((m) => ({
              role: m.is_ai ? "assistant" : "user",
              content: m.content,
            }));

            finalPayload = {
              ...payloadOrIntent,
              messages: contextMessages,
            };
            // Remove internal flag
            delete finalPayload._needsFreshContext;
          }
        }

        const response = await fetch("/api/chat", {
          method: "POST",
          body: JSON.stringify(finalPayload),
        });

        // Log results for debugging
        const data = await response
          .clone()
          .json()
          .catch(() => ({}));
        console.log(`[AI-Request] Sent to ${modelId}`, data);

        if (!response.ok) {
          // CRITICAL: Handle errors by stopping thinking
          stopThinking(modelId);

          if (response.status === 429) {
            console.warn(`[AI-Request] Rate limited: ${modelId}`);
          } else {
            console.error(`[AI-Request] Failed: ${modelId} ${response.status}`);
          }
        }
      } catch (err) {
        console.error(`[AI-Request] Error calling ${modelId}`, err);
        // Ensure we stop thinking on network error
        stopThinking(modelId);
      }
      // Note: We do NOT unlock here. unlocking happens when 'thinking_end' event is processed
      // via realtime/useRenderQueue effects.
    },
    [roomId, supabase, startThinking, stopThinking],
  );

  // Handle Auto-Reply (Unprompted Participation)
  const handleAutoReply = useCallback(async () => {
    // 1. Check if we should try to auto-reply
    // Logic: Pick a random model that is NOT currently thinking
    const availableModels = roomModelsRef.current.filter(
      (rm) => !thinkingModels.has(rm.model_id),
    );

    console.log("[AutoReply Debug] Triggered.", {
      roomModels: roomModelsRef.current.length,
      availableModels: availableModels.length,
      thinkingModels: thinkingModels.size,
      messagesSinceLastAi,
      roomId,
    });

    if (availableModels.length === 0) {
      console.log("[AutoReply Debug] No available models.");
      return;
    }

    // simplistic random selection
    const randomModel =
      availableModels[Math.floor(Math.random() * availableModels.length)];

    // trigger API call with isAutoReply flag
    const contextMessages = messages.slice(-10).map((m) => ({
      role: m.is_ai ? "assistant" : "user",
      content: m.content,
    }));

    await triggerAiRequest(randomModel.model_id, {
      messages: contextMessages,
      roomId: roomId,
      modelId: randomModel.model_id,
      isAutoReply: true,
      messagesSinceLastAi: messagesSinceLastAi,
    });
  }, [messages, roomId, thinkingModels, messagesSinceLastAi, triggerAiRequest]);

  // Separate effect to handle thinking completion AND Queue Processing
  const prevThinkingSize = useRef(thinkingModels.size);
  const prevThinkingModels = useRef(new Set(thinkingModels));

  useEffect(() => {
    // Detect which models stopped thinking
    if (prevThinkingSize.current > thinkingModels.size) {
      // Find the diff
      const stoppedModels = Array.from(prevThinkingModels.current).filter(
        (m) => !thinkingModels.has(m),
      );

      stoppedModels.forEach((_modelId) => {
        // No-op loop for per-model queue, we handle global queue below
      });

      // Global Queue Check
      // If thinkingModels is EMPTY (room free), process NEXT item from ANY queue
      if (thinkingModels.size === 0) {
        console.log("[Queue] Room free. Checking for pending requests...");
        isGlobalBusyRef.current = false; // Unlock

        // Find first non-empty queue
        // Priority: Just iterate order of keys for now
        for (const [mId, queue] of pendingAiRequests.current.entries()) {
          if (queue.length > 0) {
            const nextRequest = queue.shift();
            console.log(
              `[Queue] Popped request for ${mId}. Executing with fresh context.`,
            );
            triggerAiRequest(mId, nextRequest); // This will re-lock
            break; // Only one at a time
          }
        }
      }
    }

    // Call deprecated callback if needed (legacy)
    if (prevThinkingSize.current > 0 && thinkingModels.size === 0) {
      if (onThinkingModelsConsumed) {
        onThinkingModelsConsumed();
      }
    }
    prevThinkingSize.current = thinkingModels.size;
    prevThinkingModels.current = new Set(thinkingModels);
  }, [thinkingModels, onThinkingModelsConsumed, triggerAiRequest]);

  // check inside subscription removed since we use this effect now

  // biome-ignore lint/correctness/useExhaustiveDependencies: Need to scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingModels]);

  // Presence channel for online status and typing indicators
  useEffect(() => {
    if (!roomId || !currentUserId || !currentUsername) return;

    const presenceChannel = supabase.channel(`presence:${roomId}`, {
      config: { presence: { key: currentUserId } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const online = new Set<string>();
        const typingMap = new Map<string, number>(); // username -> timestamp

        for (const presences of Object.values(state)) {
          for (const p of presences) {
            const presence = p as unknown as {
              user_id: string;
              username: string;
              is_typing: boolean;
              typing_timestamp?: number;
            };
            online.add(presence.user_id);
            if (presence.is_typing && presence.user_id !== currentUserId) {
              const ts = presence.typing_timestamp || 0;
              // Keep only the latest timestamp if multiple presences for same user (unlikely but safe)
              const existing = typingMap.get(presence.username) || 0;
              if (ts >= existing) {
                typingMap.set(presence.username, ts);
              }
            }
          }
        }

        setOnlineUsers(online);
        setTypingUsers(
          Array.from(typingMap.entries())
            .map(([username, timestamp]) => ({ username, timestamp }))
            .sort((a, b) => a.timestamp - b.timestamp), // Sort by timestamp ascending (oldest first, so last is newest)
        );
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        for (const p of newPresences) {
          const presence = p as unknown as { user_id: string };
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            next.add(presence.user_id);
            return next;
          });
        }
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        for (const p of leftPresences) {
          const presence = p as unknown as {
            user_id: string;
            username: string;
          };
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            next.delete(presence.user_id);
            return next;
          });
          setTypingUsers((prev) =>
            prev.filter((u) => u.username !== presence.username),
          );
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: currentUserId,
            username: currentUsername,
            is_typing: false,
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [roomId, currentUserId, currentUsername, supabase]);

  // Reply State
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Trigger auto-reply check after user messages
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && !lastMsg.is_ai && !initialDataEnqueued.current) {
      // Only trigger if NO mentions were present in the last message
      // (If mentions were present, explicit AI logic would have run)
      const mentions = getMentionedModelIds(lastMsg.content);
      if (mentions.length === 0) {
        // Small delay to let things settle and feel natural
        const timer = setTimeout(() => {
          handleAutoReply();
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [messages, handleAutoReply, getMentionedModelIds]);

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!newMessage.trim()) return;

    const messageContent = newMessage; // capture for async use
    setNewMessage(""); // Clear input immediately
    const currentReplyTo = replyingTo; // capture reply state
    setReplyingTo(null); // Clear reply state

    // 0. Optimistic Render
    const tempId = `optimistic-${Date.now()}`;
    const mentionedModels = getMentionedModelIds(messageContent);
    const mentionedModelIds = mentionedModels.map((rm) => rm.model_id);

    // Store in pending map for deduplication when realtime arrives
    pendingOptimisticMessages.current.set(messageContent, tempId);

    enqueueUserMessage(
      {
        id: tempId,
        content: messageContent,
        profile_id: currentUserId, // Use current user ID for avatar
        created_at: new Date().toISOString(),
        is_ai: false,
        profiles: {
          username: currentUsername || "You",
          avatar_url: currentUserAvatar || "",
        },
        reply_to_id: currentReplyTo?.id, // Add reply info
      } as any,
      mentionedModelIds,
    );

    const { error } = await supabase.auth.getUser();
    if (error) return;

    const user = (await supabase.auth.getUser()).data.user;

    // 1. Insert User Message
    await supabase.from("messages").insert({
      room_id: roomId,
      content: messageContent,
      profile_id: user?.id,
      reply_to_id: currentReplyTo?.id,
    });

    // 2. Trigger AI logic if mentions exist
    if (mentionedModels.length > 0) {
      // We already enqueued thinking indicators via enqueueUserMessage above

      // Trigger AI for each mentioned model (could be multiple!)
      // We'll run them in parallel
      await Promise.all(
        mentionedModels.map(async (rm) => {
          try {
            // Prepare context: last 10 messages
            const contextMessages = messages.slice(-10).map((m) => ({
              role: m.is_ai ? "assistant" : "user",
              content: m.content,
            }));
            // Add the new message we just sent (it might not be in state yet if realtime is slow)
            contextMessages.push({ role: "user", content: messageContent });

            const response = await fetch("/api/chat", {
              method: "POST",
              body: JSON.stringify({
                messages: contextMessages,
                roomId: roomId,
                modelId: rm.model_id,
              }),
            });

            if (!response.ok) {
              throw new Error("AI request failed");
            }
            // Server inserts response, realtime subscription will call enqueueAiMessage
          } catch (err) {
            console.error("AI Error:", err);
          }
        }),
      );
    }
  }

  // ... (toggleRoomStatus, generateInviteCode, copyCode implementation omitted for brevity as they are unchanged)

  async function toggleRoomStatus() {
    if (!roomDetails || !currentUserId) return;
    const newStatus = !roomDetails.is_open;

    const { error } = await supabase
      .from("rooms")
      .update({ is_open: newStatus })
      .eq("id", roomId);

    if (error) {
      alert(`Error toggling room: ${error.message}`);
    } else {
      setRoomDetails({ ...roomDetails, is_open: newStatus });

      // If closing the room, kick everyone else out
      if (!newStatus) {
        await supabase
          .from("room_participants")
          .delete()
          .eq("room_id", roomId)
          .neq("profile_id", currentUserId); // Keep the owner
      }
    }
  }

  async function generateInviteCode() {
    // Delete old codes to ideally keep only one valid code
    await supabase.from("room_invites").delete().eq("room_id", roomId);

    const code = `INV-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;
    const user = (await supabase.auth.getUser()).data.user;

    const { data } = await supabase
      .from("room_invites")
      .insert({
        room_id: roomId,
        code: code,
        created_by: user?.id,
      })
      .select()
      .single();

    if (data) setInviteCode(data.code);
  }

  function copyCode() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  if (!roomDetails)
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading room...
      </div>
    );

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Top Bar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {roomDetails.name || roomDetails.slug}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                roomDetails.is_open ? "bg-emerald-500" : "bg-destructive",
              )}
            />
            {roomDetails.is_open ? "Open" : "Closed"}
            <span>•</span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {participants.length} members
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-500">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {onlineUsers.size} online
            </span>
            {/* Display AI Tokens (Debugging/Visibility) */}
            {process.env.NODE_ENV === "development" && (
              <>
                <span>•</span>
                <span className="text-xs font-mono opacity-50">
                  Gap: {messagesSinceLastAi} | Tokens:{" "}
                  {roomDetails.ai_tokens ?? "?"}/
                  {roomDetails.ai_tokens_max ?? "?"}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Room Controls - Set Password */}
          {isOwner && (
            <>
              <Dialog
                open={isPasswordDialogOpen}
                onOpenChange={setIsPasswordDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "text-muted-foreground hover:text-foreground",
                      roomDetails.password && "text-emerald-500",
                    )}
                  >
                    {roomDetails.password ? (
                      <Lock className="h-5 w-5" />
                    ) : (
                      <LockOpen className="h-5 w-5" />
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Set Room Password</DialogTitle>
                    <DialogDescription>
                      Require a password for new members to join this room.
                      Leave empty to remove.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="password" className="text-right">
                        Password
                      </Label>
                      <Input
                        id="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="col-span-3"
                        type="password"
                        placeholder="Enter new password (or blank to remove)"
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    {roomDetails.password && (
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setNewPassword("");
                          handleSetPassword();
                        }}
                      >
                        Remove Password
                      </Button>
                    )}
                    <Button
                      onClick={handleSetPassword}
                      disabled={!newPassword.trim()}
                    >
                      {roomDetails.password
                        ? "Update Password"
                        : "Set Password"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleRoomStatus}
                      className={cn(
                        "text-muted-foreground hover:text-foreground",
                        !roomDetails.is_open && "text-destructive",
                      )}
                    >
                      {roomDetails.is_open ? (
                        <ToggleRight className="h-6 w-6 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-6 w-6" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {roomDetails.is_open
                        ? "Close Room (Lock Access)"
                        : "Open Room (Allow Access)"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Invite Code Display */}
              {inviteCode ? (
                <div className="group flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5">
                  <span className="text-xs font-mono tracking-wider text-muted-foreground">
                    CODE:
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {inviteCode}
                  </span>
                  <div className="ml-1 flex items-center border-l border-border pl-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      onClick={copyCode}
                      title="Copy Code"
                      type="button"
                    >
                      {isCopied ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      onClick={generateInviteCode}
                      title="Regenerate Code"
                      type="button"
                    >
                      <RefreshCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateInviteCode}
                  className="h-8 text-xs"
                >
                  Generate Code
                </Button>
              )}
            </>
          )}

          <Button variant="ghost" size="icon">
            <Activity className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="flex h-full min-h-0">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            <div className="flex flex-col gap-1">
              {messages
                .filter((m) => m.content?.trim())
                .map((msg, index, arr) => {
                  const isAi = msg.is_ai;
                  const aiModel = isAi
                    ? AVAILABLE_MODELS.find((m) => m.id === msg.ai_model_id)
                    : null;

                  // Consecutive Message Logic
                  const prevMsg = arr[index - 1];
                  const isConsecutive =
                    prevMsg &&
                    ((isAi &&
                      prevMsg.is_ai &&
                      prevMsg.ai_model_id === msg.ai_model_id) ||
                      (!isAi &&
                        !prevMsg.is_ai &&
                        prevMsg.profile_id === msg.profile_id));

                  // If time gap is large (>5 mins), don't group
                  const timeGap = prevMsg
                    ? new Date(msg.created_at).getTime() -
                      new Date(prevMsg.created_at).getTime()
                    : 0;
                  const isGrouped = isConsecutive && timeGap < 5 * 60 * 1000;

                  return (
                    <div
                      key={msg.id}
                      id={`message-${msg.id}`}
                      ref={() => {
                        animatedMessagesRef.current.add(msg.id);
                      }}
                      className={cn(
                        "flex gap-3 transition-opacity duration-500 group relative pr-10", // Added pr-10 for reply button space
                        !animatedMessagesRef.current.has(msg.id) &&
                          "animate-in fade-in duration-500",
                        isGrouped ? "mt-0.5" : "mt-4",
                      )}
                    >
                      {!isGrouped ? (
                        <Avatar
                          className={cn(
                            "mt-1 h-8 w-8 border border-border shrink-0",
                            isAi && "ring-1 ring-primary/50",
                          )}
                        >
                          {isAi ? (
                            <>
                              <AvatarImage
                                src={getBotAvatarUrl(msg.ai_model_id || "bot")}
                              />
                              <AvatarFallback
                                className={cn(
                                  "flex h-full w-full items-center justify-center bg-secondary text-secondary-foreground",
                                  aiModel?.color,
                                )}
                              >
                                <Bot className="h-4 w-4 text-white" />
                              </AvatarFallback>
                            </>
                          ) : (
                            <>
                              <AvatarImage src={msg.profiles?.avatar_url} />
                              <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                                {msg.profiles?.username
                                  ?.substring(0, 2)
                                  .toUpperCase()}
                              </AvatarFallback>
                            </>
                          )}
                        </Avatar>
                      ) : (
                        <div className="w-8 shrink-0" /> // Spacer for grouped messages
                      )}

                      <div className="flex flex-col gap-1 max-w-[80%]">
                        {!isGrouped && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {isAi
                                ? aiModel?.name || "AI Assistant"
                                : msg.profiles?.username}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {isAi && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                AI
                              </span>
                            )}
                          </div>
                        )}

                        {/* Quoted Message (Reply Preview) - Only show if current message is a reply */}
                        {msg.reply_to_id &&
                          (() => {
                            const parentMsg = messages.find(
                              (m) => m.id === msg.reply_to_id,
                            );
                            if (!parentMsg) return null;
                            const parentIsAi = parentMsg.is_ai;
                            const parentName = parentIsAi
                              ? AVAILABLE_MODELS.find(
                                  (m) => m.id === parentMsg.ai_model_id,
                                )?.name || "AI"
                              : parentMsg.profiles?.username || "User";

                            return (
                              // biome-ignore lint/a11y/useSemanticElements: Content may contain interactive elements like links
                              <div
                                role="button"
                                tabIndex={0}
                                className={cn(
                                  "relative mt-1 mb-2 rounded-md border-l-2 pl-3 py-1.5 text-xs opacity-90 transition-colors hover:bg-black/5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  isAi
                                    ? "border-primary/40 bg-primary/5 text-foreground/80"
                                    : "border-primary/40 bg-secondary/50 text-secondary-foreground/80",
                                )}
                                onClick={() => {
                                  const el = document.getElementById(
                                    `message-${parentMsg.id}`,
                                  );
                                  if (el)
                                    el.scrollIntoView({
                                      behavior: "smooth",
                                      block: "center",
                                    });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    const el = document.getElementById(
                                      `message-${parentMsg.id}`,
                                    );
                                    if (el)
                                      el.scrollIntoView({
                                        behavior: "smooth",
                                        block: "center",
                                      });
                                  }
                                }}
                              >
                                <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-l-md bg-primary/40" />
                                <div className="flex items-center gap-1 mb-0.5 text-[10px] font-semibold opacity-70">
                                  <Reply className="h-3 w-3" />
                                  {parentName}
                                </div>
                                <div className="line-clamp-2">
                                  <MarkdownContent
                                    content={parentMsg.content}
                                  />
                                </div>
                              </div>
                            );
                          })()}

                        {/* Main Message Content */}
                        <div
                          className={cn(
                            "rounded-lg px-4 py-2 text-sm border relative",
                            isAi
                              ? "bg-primary/5 border-primary/20 text-foreground"
                              : "bg-secondary text-secondary-foreground border-border",
                            isGrouped && "rounded-tl-sm", // Visual tweak for grouping
                          )}
                        >
                          <MarkdownContent content={msg.content} />
                        </div>
                      </div>

                      {/* Reply Action */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                        onClick={() => setReplyingTo(msg as any)}
                        title="Reply"
                      >
                        <Reply className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}

              {thinkingModels.size > 0 &&
                Array.from(thinkingModels).map((modelId) => {
                  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
                  if (!model) return null;
                  return (
                    <div
                      key={modelId}
                      className="flex gap-3 animate-in fade-in duration-300 mt-4"
                    >
                      <Avatar
                        className={cn("mt-1 h-8 w-8 ring-1 ring-primary/50")}
                      >
                        <AvatarImage src={getBotAvatarUrl(modelId)} />
                        <AvatarFallback
                          className={cn(
                            "flex h-full w-full items-center justify-center",
                            model.color,
                          )}
                        >
                          <Bot className="h-4 w-4 text-white" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {model.name}
                          </span>
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            AI
                          </span>
                        </div>
                        <div className="rounded-lg px-4 py-2 text-sm border bg-primary/5 border-primary/20 text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                            <span className="ml-2 text-xs">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground animate-in fade-in mt-2 ml-12">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span>
                    {/* Last one wins: show only the most recent typist */}
                    {typingUsers[typingUsers.length - 1].username} is typing...
                  </span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-border bg-background relative flex flex-col gap-2">
            {/* Replying Banner */}
            {replyingTo && (
              <div className="flex items-center justify-between mx-4 mb-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 shadow-sm animate-in slide-in-from-bottom-2 fade-in">
                <div className="flex flex-col gap-0.5 truncate pr-8">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                    <div className="h-3 w-3 -scale-x-100">➥</div>
                    Replying to{" "}
                    {replyingTo.profiles?.username ||
                      (replyingTo.is_ai ? "AI" : "User")}
                  </span>
                  <span className="truncate text-xs text-muted-foreground font-medium">
                    {replyingTo.content}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary shrink-0"
                  onClick={() => setReplyingTo(null)}
                >
                  <span className="sr-only">Close</span>
                  <div className="h-3 w-3">✕</div>
                </Button>
              </div>
            )}

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
                      <div
                        className={cn("h-2 w-2 rounded-full", model.color)}
                      />
                      <span>{model.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form
              onSubmit={handleSendMessage}
              className="relative flex items-center gap-2"
            >
              <Input
                value={newMessage}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder={
                  canSend
                    ? "Type a message... (Tip: @GPT to chat)"
                    : "Room is closed."
                }
                disabled={!canSend}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary rounded-full pl-6 pr-12 h-12"
              />
              <Button
                type="submit"
                disabled={!canSend || !newMessage.trim()}
                size="icon"
                className="absolute right-2 h-8 w-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* Right Sidebar - Members & Models */}
        <RoomSidebar
          roomId={roomId}
          participants={participants}
          onlineUsers={onlineUsers}
          typingUsers={new Set(typingUsers.map((u) => u.username))}
          ownerId={roomDetails.created_by}
          isOwner={isOwner || false}
        />
      </div>
    </div>
  );
}
