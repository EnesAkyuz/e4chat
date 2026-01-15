"use client";

import { Bot, Crown, Users } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { RoomModelsSidebar } from "./RoomModelsSidebar";

interface Participant {
  profile_id: string;
  role: string;
  profiles: {
    username: string;
    avatar_url: string;
  };
}

interface RoomSidebarProps {
  roomId: string;
  participants: Participant[];
  onlineUsers: Set<string>;
  typingUsers: Set<string>;
  ownerId: string;
}

export function RoomSidebar({
  roomId,
  participants,
  onlineUsers,
  typingUsers,
  ownerId,
}: RoomSidebarProps) {
  const [activeTab, setActiveTab] = useState<"members" | "models">("members");

  // Sort: online first, then owner first, then alphabetically
  const sortedParticipants = [...participants].sort((a, b) => {
    const aOnline = onlineUsers.has(a.profile_id);
    const bOnline = onlineUsers.has(b.profile_id);
    const aIsOwner = a.profile_id === ownerId;
    const bIsOwner = b.profile_id === ownerId;

    // Online users first
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;

    // Owner first
    if (aIsOwner) return -1;
    if (bIsOwner) return 1;

    // Alphabetically
    return (a.profiles?.username || "").localeCompare(
      b.profiles?.username || "",
    );
  });

  return (
    <div className="flex h-full w-[260px] flex-col border-l border-border bg-sidebar text-sidebar-foreground">
      <Tabs
        value={activeTab}
        onValueChange={(v: string) => setActiveTab(v as "members" | "models")}
        className="flex h-full flex-col"
      >
        <TabsList className="h-16 w-full justify-start gap-0 rounded-none border-b border-sidebar-border bg-transparent p-0">
          <TabsTrigger
            value="members"
            className="h-full flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Users className="mr-2 h-4 w-4" />
            <span>Members</span>
            <span className="ml-1.5 rounded-full bg-sidebar-accent px-1.5 text-[10px]">
              {participants.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="models"
            className="h-full flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Bot className="mr-2 h-4 w-4" />
            <span>Models</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="members"
          className="mt-0 flex-1 data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="p-3 space-y-1">
              {/* Online section */}
              {onlineUsers.size > 0 && (
                <div className="mb-3">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Online — {onlineUsers.size}
                  </div>
                  {sortedParticipants
                    .filter((p) => onlineUsers.has(p.profile_id))
                    .map((participant) => (
                      <ParticipantItem
                        key={participant.profile_id}
                        participant={participant}
                        isOnline
                        isTyping={typingUsers.has(
                          participant.profiles?.username,
                        )}
                        isOwner={participant.profile_id === ownerId}
                      />
                    ))}
                </div>
              )}

              {/* Offline section */}
              {sortedParticipants.filter((p) => !onlineUsers.has(p.profile_id))
                .length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Offline
                  </div>
                  {sortedParticipants
                    .filter((p) => !onlineUsers.has(p.profile_id))
                    .map((participant) => (
                      <ParticipantItem
                        key={participant.profile_id}
                        participant={participant}
                        isOnline={false}
                        isTyping={false}
                        isOwner={participant.profile_id === ownerId}
                      />
                    ))}
                </div>
              )}

              {participants.length === 0 && (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  No members yet
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="models"
          className="mt-0 flex-1 data-[state=inactive]:hidden"
        >
          <RoomModelsSidebar roomId={roomId} embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ParticipantItem({
  participant,
  isOnline,
  isTyping,
  isOwner,
}: {
  participant: Participant;
  isOnline: boolean;
  isTyping: boolean;
  isOwner: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent",
        !isOnline && "opacity-50",
      )}
    >
      <div className="relative">
        <Avatar className="h-7 w-7 border border-sidebar-border">
          <AvatarImage src={participant.profiles?.avatar_url} />
          <AvatarFallback className="bg-sidebar-accent text-[10px]">
            {participant.profiles?.username?.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Online indicator */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar",
            isOnline ? "bg-emerald-500" : "bg-zinc-500",
          )}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">
            {participant.profiles?.username || "Unknown"}
          </span>
          {isOwner && (
            <span title="Room Owner">
              <Crown className="h-3 w-3 text-amber-500 shrink-0" />
            </span>
          )}
        </div>
        {isTyping && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="animate-pulse">typing...</span>
          </div>
        )}
      </div>
    </div>
  );
}
