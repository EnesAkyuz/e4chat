import {
  Activity,
  Bot,
  Check,
  Copy,
  Lock,
  LockOpen,
  RefreshCcw,
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
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { RoomSidebar } from "./RoomSidebar";

interface Message {
  id: string;
  content: string;
  profile_id: string | null;
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
}

export default function ChatRoom({
  roomId,
  initialThinkingModels = [],
  initialMessage,
  onThinkingModelsConsumed,
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

  // Track if this is a fresh room with initial data to enqueue
  const initialDataEnqueued = useRef(false);

  // Presence state
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  // Check if user is owner
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(
    null
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
        passwordValue ? "Password set successfully!" : "Password removed!"
      );
    }
  };

  const fetchRoomDetails = useCallback(async () => {
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    setRoomDetails(data);
  }, [roomId, supabase]);

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
          `@${modelDef.name.toLowerCase()}`
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
            (m) => m.id === other.model_id
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
    [] // stable reference now
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
    [supabase]
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
        lastAtPos + 1 + (mentionQuery || "").length
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
                m.id.toLowerCase().includes(mentionQuery.toLowerCase()))
          )
      : [];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewMessage(val);

    // Broadcast typing status
    if (val.trim() && currentUserId && currentUsername) {
      const presenceChannel = supabase.channel(`presence:${roomId}`);
      presenceChannel.track({
        user_id: currentUserId,
        username: currentUsername,
        is_typing: true,
      });

      // Clear previous timeout
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
      }, 2000);
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
          prev > 0 ? prev - 1 : filteredModels.length - 1
        );
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) =>
          prev < filteredModels.length - 1 ? prev + 1 : 0
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
              initialThinkingModels
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
                // Notify parent if all thinking is done - handled by useEffect now
              } else {
                // User Message Logic

                // 1. Check if it's OUR message that we already rendered optimistically
                if (fullMsg.profile_id === currentUserId) {
                  const tempId = pendingOptimisticMessages.current.get(
                    fullMsg.content
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
                  mentionIds
                );
              }
            }
          });
        }
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
        (payload) => {
          setRoomDetails(payload.new as Room);
        }
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(modelsChannel);
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
    // initialMessage and initialThinkingModels are purposely excluded
    // We only want to process them on MOUNT/ROOM CHANGE, not when parent clears them.
  ]);

  // Separate effect to handle thinking completion
  const prevThinkingSize = useRef(thinkingModels.size);
  useEffect(() => {
    // Only trigger if we went from >0 to 0
    if (prevThinkingSize.current > 0 && thinkingModels.size === 0) {
      if (onThinkingModelsConsumed) {
        onThinkingModelsConsumed();
      }
    }
    prevThinkingSize.current = thinkingModels.size;
  }, [thinkingModels.size, onThinkingModelsConsumed]);

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
        const typing = new Set<string>();

        for (const presences of Object.values(state)) {
          for (const p of presences) {
            const presence = p as unknown as {
              user_id: string;
              username: string;
              is_typing: boolean;
            };
            online.add(presence.user_id);
            if (presence.is_typing && presence.user_id !== currentUserId) {
              typing.add(presence.username);
            }
          }
        }

        setOnlineUsers(online);
        setTypingUsers(typing);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        for (const p of newPresences) {
          const presence = p as unknown as { user_id: string };
          setOnlineUsers((prev) => new Set(prev).add(presence.user_id));
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
          setTypingUsers((prev) => {
            const next = new Set(prev);
            next.delete(presence.username);
            return next;
          });
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

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!newMessage.trim()) return;

    const messageContent = newMessage; // capture for async use
    setNewMessage(""); // Clear input immediately

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
      } as any, // Cast to any to avoid strict type mismatch with queue
      mentionedModelIds
    );

    const { error } = await supabase.auth.getUser();
    if (error) return;

    const user = (await supabase.auth.getUser()).data.user;

    // 1. Insert User Message
    await supabase.from("messages").insert({
      room_id: roomId,
      content: messageContent,
      profile_id: user?.id,
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
        })
      );
    }
  }

  async function toggleRoomStatus() {
    if (!roomDetails) return;
    const newStatus = !roomDetails.is_open;

    const { error } = await supabase
      .from("rooms")
      .update({ is_open: newStatus })
      .eq("id", roomId);

    if (error) {
      alert(`Error toggling room: ${error.message}`);
    } else {
      setRoomDetails({ ...roomDetails, is_open: newStatus });
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
                roomDetails.is_open ? "bg-emerald-500" : "bg-destructive"
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
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Room Controls */}
          {/* Room Controls - Set Password */}
          {isOwner && (
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
                    roomDetails.password && "text-emerald-500"
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
                    Require a password for new members to join this room. Leave
                    empty to remove.
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
                    {roomDetails.password ? "Update Password" : "Set Password"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleRoomStatus}
                  className={cn(
                    "text-muted-foreground hover:text-foreground",
                    !roomDetails.is_open && "text-destructive"
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
            <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 border border-border group">
              <span className="text-xs font-mono text-muted-foreground tracking-wider">
                CODE:
              </span>
              <span className="text-sm font-bold text-primary">
                {inviteCode}
              </span>
              <div className="flex items-center border-l border-border pl-1 ml-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={copyCode}
                  title="Copy Code"
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
                  className="h-5 w-5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={generateInviteCode}
                  title="Regenerate Code"
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

          <Button variant="ghost" size="icon">
            <Activity className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="flex h-full min-h-0">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            <div className="flex flex-col gap-4">
              {messages.map((msg) => {
                const isAi = msg.is_ai;
                const aiModel = isAi
                  ? AVAILABLE_MODELS.find((m) => m.id === msg.ai_model_id)
                  : null;

                return (
                  <div
                    key={msg.id}
                    ref={() => {
                      animatedMessagesRef.current.add(msg.id);
                    }}
                    className={cn(
                      "flex gap-3 transition-opacity duration-500",
                      !animatedMessagesRef.current.has(msg.id) &&
                        "animate-in fade-in duration-500"
                    )}
                  >
                    <Avatar
                      className={cn(
                        "mt-1 h-8 w-8 border border-border",
                        isAi && "ring-1 ring-primary/50"
                      )}
                    >
                      {isAi ? (
                        <div
                          className={cn(
                            "flex h-full w-full items-center justify-center bg-secondary text-secondary-foreground",
                            aiModel?.color
                          )}
                        >
                          <Bot className="h-4 w-4 text-white" />
                        </div>
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
                    <div className="flex flex-col gap-1 max-w-[80%]">
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
                      <div
                        className={cn(
                          "rounded-lg px-4 py-2 text-sm border",
                          isAi
                            ? "bg-primary/5 border-primary/20 text-foreground"
                            : "bg-secondary text-secondary-foreground border-border"
                        )}
                      >
                        <MarkdownContent content={msg.content} />
                      </div>
                    </div>
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
                      className="flex gap-3 animate-in fade-in duration-300"
                    >
                      <div
                        className={cn(
                          "mt-1 h-8 w-8 rounded-full flex items-center justify-center ring-1 ring-primary/50",
                          model.color
                        )}
                      >
                        <Bot className="h-4 w-4 text-white" />
                      </div>
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
              {typingUsers.size > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground animate-in fade-in">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span>
                    {Array.from(typingUsers).join(", ")}{" "}
                    {typingUsers.size === 1 ? "is" : "are"} typing...
                  </span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input Area */}
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
                          : "text-popover-foreground hover:bg-accent/50"
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
          typingUsers={typingUsers}
          ownerId={roomDetails.created_by}
        />
      </div>
    </div>
  );
}
