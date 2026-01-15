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
import { AVAILABLE_MODELS } from "@/lib/models";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { RoomModelsSidebar } from "./RoomModelsSidebar";

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

export default function ChatRoom({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [roomDetails, setRoomDetails] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [roomModels, setRoomModels] = useState<RoomModel[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  // Check if user is owner
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, [supabase]);

  const isOwner = roomDetails && currentUserId === roomDetails.created_by;
  const canSend = roomDetails && (roomDetails.is_open || isOwner);

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const handleSetPassword = async () => {
    if (!newPassword.trim()) return;

    const { error } = await supabase
      .from("rooms")
      .update({ password: newPassword })
      .eq("id", roomId);

    if (error) {
      toast.error(`Error setting password: ${error.message}`);
    } else {
      setNewPassword("");
      setIsPasswordDialogOpen(false);
      toast.success("Password set successfully!");
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

    if (data) setMessages(data);
  }, [roomId, supabase]);

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
  useEffect(() => {
    if (!roomId) return;

    // Reset state for new room
    setMessages([]);
    setRoomDetails(null);
    setParticipants([]);
    setInviteCode(null);
    setRoomModels([]);
    setIsCopied(false);

    fetchRoomDetails();
    fetchMessages();
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
            if (fullMsg) setMessages((prev) => [...prev, fullMsg as Message]);
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
        (payload) => {
          setRoomDetails(payload.new as Room);
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
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Need to scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAiThinking]);

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!newMessage.trim()) return;

    const messageContent = newMessage; // capture for async use
    setNewMessage(""); // Clear input immediately

    const { error } = await supabase.auth.getUser();
    if (error) return;

    const user = (await supabase.auth.getUser()).data.user;

    // 1. Insert User Message
    await supabase.from("messages").insert({
      room_id: roomId,
      content: messageContent,
      profile_id: user?.id,
    });

    // 2. Check for AI Mentions
    // We look for patterns like "@GPT-4o" or "@Claude"
    // Case insensitive match against available room models
    const lowerContent = messageContent.toLowerCase();

    // Find matched models in the room
    // Sort logic: Check longest names first to prevent "GPT-4o" triggering "GPT-4o Mini" if not careful,
    // though here we are just collecting *all* that match.
    // The issue is likely: "@GPT-4o" is found. "GPT-4o Mini" contains "GPT-4o"? No, "GPT-4o Mini" contains "GPT-4o".
    // Wait, if I type "@GPT-4o", does it match "@GPT-4o Mini"?
    // Name: "GPT-4o Mini", ID: "gpt-4o-mini"
    // Name: "GPT-4o", ID: "gpt-4o"
    // Content: "@GPT-4o hello"
    // includes checks:
    // "gpt-4o mini".includes("gpt-4o")? YES.

    // Fix: Improve matching to be stricter.
    // We should check if the content contains `@${name}` where name is the full name,
    // AND ensuring it's not a substring of another longer mentioned model or followed by other characters if possible.
    // A simple heuristic: Sort candidates by name length (descending). If a longer one matches, mark that span as 'consumed' or just rely on the fact that the user intentionally typed it.

    // Actually, simpler fix for now involves checking exact ID or Name with boundary safety or just iterating carefully.
    // But if both respond, it means the logic `lowerContent.includes(...)` is true for both.
    // lowerContent = "@gpt-4o hello"
    // model A: "gpt-4o" -> includes("@gpt-4o") -> TRUE
    // model B: "gpt-4o mini" -> includes("@gpt-4o mini") -> FALSE

    // Wait, if content is "@GPT-4o", Model B (Mini) would NOT match because content doesn't have "@GPT-4o Mini".
    // BUT if content is "@GPT-4o Mini", Model A (4o) WOULD match because "@GPT-4o" is a substring of "@GPT-4o Mini".

    // SO: If I type "@GPT-4o Mini", BOTH reply.
    // FIX: We need to filter out 'substring' matches if a longer match exists.

    let mentionedModels = roomModels.filter((rm) => {
      const modelDef = AVAILABLE_MODELS.find((m) => m.id === rm.model_id);
      if (!modelDef) return false;
      const nameMatch = lowerContent.includes(
        `@${modelDef.name.toLowerCase()}`,
      );
      const idMatch = lowerContent.includes(`@${modelDef.id.toLowerCase()}`);
      return nameMatch || idMatch;
    });

    // Deduplicate/Filter: If we have multiple matches, and one model's name is a substring of another's, and both are 'mentioned',
    // likely the user meant the longer specific one.
    // Example: User typed "@GPT-4o Mini".
    // Matches: [GPT-4o, GPT-4o Mini].
    // We want to keep ONLY GPT-4o Mini.

    mentionedModels = mentionedModels.filter((rm) => {
      const myModel = AVAILABLE_MODELS.find((m) => m.id === rm.model_id);
      if (!myModel) return false;

      // Check if there is another matched model that is "longer" (more specific) and contains my name
      // effectively rendering me a 'false positive' substring match.
      const isShadowed = mentionedModels.some((other) => {
        if (other.id === rm.id) return false;
        const otherModel = AVAILABLE_MODELS.find(
          (m) => m.id === other.model_id,
        );
        if (!otherModel) return false;

        // Does the other model's name contain my name?
        // e.g. "GPT-4o Mini" contains "GPT-4o"
        if (
          otherModel.name.toLowerCase().includes(myModel.name.toLowerCase()) ||
          otherModel.id.toLowerCase().includes(myModel.id.toLowerCase())
        ) {
          // And was the strictly longer one actually fully present?
          // Yes, because it's in 'mentionedModels', so it passed the inclusion check.
          return true;
        }
        return false;
      });

      return !isShadowed;
    });

    if (mentionedModels.length > 0) {
      setIsAiThinking(true);

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
            // Server inserts response, realtime updates UI
          } catch (err) {
            console.error("AI Error:", err);
          }
        }),
      );

      setIsAiThinking(false);
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
            {roomDetails.slug}
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
                <DialogFooter>
                  <Button onClick={handleSetPassword}>Save Password</Button>
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
                    className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    <Avatar
                      className={cn(
                        "mt-1 h-8 w-8 border border-border",
                        isAi && "ring-1 ring-primary/50",
                      )}
                    >
                      {isAi ? (
                        <div
                          className={cn(
                            "flex h-full w-full items-center justify-center bg-secondary text-secondary-foreground",
                            aiModel?.color,
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
                            : "bg-secondary text-secondary-foreground border-border",
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isAiThinking && (
                <div className="flex gap-3 animate-pulse">
                  <div className="mt-1 h-8 w-8 rounded-full bg-secondary" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 rounded bg-secondary" />
                    <div className="h-10 w-48 rounded bg-secondary" />
                  </div>
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

        {/* Right Sidebar - Room Models */}
        <RoomModelsSidebar roomId={roomId} />
      </div>
    </div>
  );
}
