"use client";

import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Crown,
  Users,
  UserX,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
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
  isOwner: boolean;
}

export function RoomSidebar({
  roomId,
  participants,
  onlineUsers,
  typingUsers,
  ownerId,
  isOwner,
}: RoomSidebarProps) {
  const supabase = useMemo(() => createClient(), []);

  const handleKickUser = async (participantId: string, username: string) => {
    const { error } = await supabase
      .from("room_participants")
      .delete()
      .eq("room_id", roomId)
      .eq("profile_id", participantId);

    if (error) {
      toast.error(`Failed to kick ${username}: ${error.message}`);
    } else {
      toast.success(`${username} has been kicked from the room.`);
    }
  };
  const [activeTab, setActiveTab] = useState<"members" | "models">("members");
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    <div
      className={cn(
        "relative flex h-full flex-col border-l border-border bg-sidebar text-sidebar-foreground transition-all duration-300",
        isCollapsed ? "w-12" : "w-[260px]",
      )}
    >
      {/* Collapse toggle button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -left-3 top-4 z-10 h-6 w-6 rounded-full border border-border bg-sidebar shadow-sm hover:bg-sidebar-accent"
      >
        {isCollapsed ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </Button>

      {isCollapsed ? (
        // Collapsed state - show icon buttons
        <div className="flex flex-col items-center gap-2 pt-16">
          <Button
            variant={activeTab === "members" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => {
              setActiveTab("members");
              setIsCollapsed(false);
            }}
            className="h-8 w-8"
            title="Members"
          >
            <Users className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTab === "models" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => {
              setActiveTab("models");
              setIsCollapsed(false);
            }}
            className="h-8 w-8"
            title="Models"
          >
            <Bot className="h-4 w-4" />
          </Button>
          <div className="mt-2 text-[10px] text-muted-foreground">
            {onlineUsers.size}
          </div>
        </div>
      ) : (
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
                          canKick={
                            isOwner && participant.profile_id !== ownerId
                          }
                          onKick={() =>
                            handleKickUser(
                              participant.profile_id,
                              participant.profiles?.username || "User",
                            )
                          }
                        />
                      ))}
                  </div>
                )}

                {/* Offline section */}
                {sortedParticipants.filter(
                  (p) => !onlineUsers.has(p.profile_id),
                ).length > 0 && (
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
                          canKick={
                            isOwner && participant.profile_id !== ownerId
                          }
                          onKick={() =>
                            handleKickUser(
                              participant.profile_id,
                              participant.profiles?.username || "User",
                            )
                          }
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
      )}
    </div>
  );
}

function ParticipantItem({
  participant,
  isOnline,
  isTyping,
  isOwner,
  canKick,
  onKick,
}: {
  participant: Participant;
  isOnline: boolean;
  isTyping: boolean;
  isOwner: boolean;
  canKick: boolean;
  onKick?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent",
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

      {/* Kick button - only visible to owner, for non-owner participants */}
      {canKick && onKick && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onKick();
                }}
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <UserX className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Kick from room</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
