"use client";

import {
  Activity,
  Check,
  Copy,
  Send,
  ToggleLeft,
  ToggleRight,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

interface Message {
  id: string;
  content: string;
  profile_id: string;
  created_at: string;
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
  created_at: string;
}

export default function ChatRoom({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [roomDetails, setRoomDetails] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

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
      // Supabase join returns an array for one-to-many, even if it's 1:1 in our logic.
      // We cast it or map it.
      // biome-ignore lint/suspicious/noExplicitAny: Supabase join typing can be tricky
      const typedData = data.map((p: any) => ({
        ...p,
        profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
      })) as Participant[];
      setParticipants(typedData);
    }
  }, [roomId, supabase]);

  const fetchInviteCode = useCallback(async () => {
    // Only works if we are admin/owner due to RLS
    const { data } = await supabase
      .from("room_invites")
      .select("code")
      .eq("room_id", roomId)
      .limit(1)
      .single();

    if (data) setInviteCode(data.code);
    else {
      // If no code exists and we are eligible, create one?
      // For now, let's just leave it empty.
      // Or we can add a "Generate Code" button logic here.
    }
  }, [roomId, supabase]);

  // Effects
  useEffect(() => {
    if (!roomId) return;

    fetchRoomDetails();
    fetchMessages();
    fetchParticipants();
    fetchInviteCode();

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

    // 2. Subscribe to Room Updates (e.g. Open/Close Toggle)
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

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [
    roomId,
    fetchRoomDetails,
    fetchMessages,
    fetchParticipants,
    fetchInviteCode,
    fetchMessageSender,
    supabase,
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!newMessage.trim()) return;

    const { error } = await supabase.auth.getUser();
    if (error) return;

    const user = (await supabase.auth.getUser()).data.user;

    await supabase.from("messages").insert({
      room_id: roomId,
      content: newMessage,
      profile_id: user?.id,
    });

    setNewMessage("");
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
      <div className="flex h-full items-center justify-center text-zinc-500">
        Loading room...
      </div>
    );

  // Check if we are owner (simple check, robust check is in DB)
  // We can infer ownership if we can see the toggle button,
  // but let's just check against current user ID for UI logic.
  // (We'd need to store current user in state, doing lazy check here)

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* Top Bar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 px-6">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {roomDetails.slug}
          </h2>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                roomDetails.is_open ? "bg-green-500" : "bg-red-500",
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
          {/* Room Controls (Ideally only visible to owner) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleRoomStatus}
                  className={cn(
                    "text-zinc-400 hover:text-white",
                    !roomDetails.is_open && "text-red-400",
                  )}
                >
                  {roomDetails.is_open ? (
                    <ToggleRight className="h-6 w-6 text-green-500" />
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
            <div className="flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-1.5 border border-zinc-800">
              <span className="text-xs font-mono text-zinc-400 tracking-wider">
                CODE:
              </span>
              <span className="text-sm font-bold text-indigo-400">
                {inviteCode}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 ml-1 text-zinc-500 hover:text-white"
                onClick={copyCode}
              >
                {isCopied ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
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
            <Activity className="h-5 w-5 text-zinc-400" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        <div className="flex flex-col gap-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <Avatar className="mt-1 h-8 w-8 border border-zinc-800">
                <AvatarImage src={msg.profiles?.avatar_url} />
                <AvatarFallback>
                  {msg.profiles?.username?.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {msg.profiles?.username}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-zinc-200 border border-zinc-800">
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950">
        <form
          onSubmit={handleSendMessage}
          className="relative flex items-center gap-2"
        >
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={
              roomDetails.is_open ? "Type a message..." : "Room is closed."
            }
            disabled={!roomDetails.is_open}
            className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-indigo-500 rounded-full pl-6 pr-12 h-12"
          />
          <Button
            type="submit"
            disabled={!roomDetails.is_open || !newMessage.trim()}
            size="icon"
            className="absolute right-2 h-8 w-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
