"use client";

import {
  ChevronLeft,
  ChevronRight,
  DoorClosed,
  DoorOpen,
  Key,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  Sun,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

interface Room {
  id: string;
  slug: string;
  name?: string;
  created_by: string;
  is_open: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  username: string;
  avatar_url: string;
}

export default function Sidebar({
  currentRoomId,
  onRoomSelect,
  onNewChat,
}: {
  currentRoomId?: string;
  onRoomSelect?: (roomId: string) => void;
  onNewChat?: () => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { setTheme } = useTheme();

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const fetchProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(data);
    }
  }, [supabase]);

  const fetchRooms = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // We need to fetch rooms that we either created OR are a participant in.
    // 1. Get my participations
    const { data: participations } = await supabase
      .from("room_participants")
      .select("room_id")
      .eq("profile_id", user.id);

    const myRoomIds = new Set(participations?.map((p) => p.room_id) || []);

    // 2. Get rooms
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      const visibleRooms = data.filter(
        (r) => r.created_by === user.id || myRoomIds.has(r.id),
      );
      setRooms(visibleRooms);
    }
  }, [supabase]);

  useEffect(() => {
    fetchProfile();
    fetchRooms();

    // Subscribe to realtime changes for rooms/access
    const channel = supabase
      .channel("room_updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_participants",
          filter: `profile_id=eq.${profile?.id}`,
        },
        () => {
          fetchRooms();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
        },
        () => {
          // On any room change (that we have permission to see/receieve), refresh.
          fetchRooms();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    profile?.id,
    fetchProfile,
    fetchRooms,
    supabase.channel,
    supabase.removeChannel,
  ]);

  async function handleJoinRoom() {
    if (!inviteCode) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase.rpc("join_room_by_code", {
        invite_code: inviteCode,
        supplied_password: roomPassword || null,
      });

      if (error) throw error;

      // Check if password is required or incorrect
      if (!data.success && data.password_required) {
        setIsPasswordRequired(true);
        // Clear password field for retry (handles edge case of password change while joining)
        if (roomPassword) {
          setRoomPassword("");
          toast.error("Incorrect password. Please try again.");
        }
        setIsLoading(false);
        return;
      }

      if (!data.success) throw new Error(data.error);

      // Success - reset state
      setInviteCode("");
      setRoomPassword("");
      setIsPasswordRequired(false);
      setIsJoinDialogOpen(false);
      fetchRooms(); // Refresh list
      toast.success("Successfully joined the room!");

      if (onRoomSelect) onRoomSelect(data.room_id);
    } catch (err: unknown) {
      let errorMessage = "An unknown error occurred";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "object" && err !== null && "message" in err) {
        errorMessage = (err as { message: string }).message;
      }
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteRoom(roomId: string) {
    // Optimistic update
    setRooms(rooms.filter((r) => r.id !== roomId));

    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) {
      toast.error(`Error deleting room: ${error.message}`);
      fetchRooms(); // Rollback if failed
    } else {
      toast.success("Room deleted successfully");
      if (currentRoomId === roomId) {
        window.location.reload();
      }
    }
    setRoomToDelete(null);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300",
        isCollapsed ? "w-16" : "w-[280px]",
      )}
    >
      {/* Collapse toggle button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-4 z-10 h-6 w-6 rounded-full border border-border bg-sidebar shadow-sm hover:bg-sidebar-accent"
      >
        {isCollapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </Button>

      {/* Header */}
      <div
        className={cn(
          "flex items-center border-b border-sidebar-border",
          isCollapsed
            ? "h-auto flex-col gap-3 py-3 px-2"
            : "h-14 flex-row justify-between px-4",
        )}
      >
        <div className="flex items-center gap-2 font-semibold">
          <MessageSquare className="h-5 w-5 text-primary shrink-0" />
          {!isCollapsed && <span>E4 Chat</span>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
            >
              <Avatar className="h-8 w-8 border border-sidebar-border">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback className="bg-sidebar-accent text-xs">
                  {profile?.username?.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={isCollapsed ? "start" : "end"}
            side={isCollapsed ? "right" : "bottom"}
            className="w-56 border-sidebar-border bg-sidebar text-sidebar-foreground"
          >
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-sidebar-border" />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Theme
            </DropdownMenuLabel>
            <div className="flex px-2 py-1 gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 flex-1 justify-start gap-2 text-xs"
                onClick={() => setTheme("light")}
              >
                <Sun className="h-3 w-3" /> Light
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 flex-1 justify-start gap-2 text-xs"
                onClick={() => setTheme("dark")}
              >
                <Moon className="h-3 w-3" /> Dark
              </Button>
            </div>
            <DropdownMenuSeparator className="bg-sidebar-border" />
            <DropdownMenuItem className="text-muted-foreground focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Actions - hidden when collapsed */}
      {!isCollapsed ? (
        <div className="p-4 space-y-2">
          <Dialog
            open={isJoinDialogOpen}
            onOpenChange={(open) => {
              setIsJoinDialogOpen(open);
              if (!open) {
                // Reset state when dialog closes
                setInviteCode("");
                setRoomPassword("");
                setIsPasswordRequired(false);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-dashed border-sidebar-border bg-transparent text-muted-foreground hover:border-sidebar-foreground/20 hover:text-sidebar-foreground"
              >
                <Key className="h-4 w-4" />
                Join with Code
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Join a Room</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Input
                    placeholder="Enter invite code (e.g. X92-B88)"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    disabled={isPasswordRequired}
                    className="border-input bg-secondary text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
                  />
                </div>
                {isPasswordRequired && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      This room requires a password to join.
                    </p>
                    <Input
                      type="password"
                      placeholder="Enter room password"
                      value={roomPassword}
                      onChange={(e) => setRoomPassword(e.target.value)}
                      autoFocus
                      className="border-input bg-secondary text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleJoinRoom}
                  disabled={
                    isLoading ||
                    !inviteCode ||
                    (isPasswordRequired && !roomPassword)
                  }
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isLoading
                    ? "Joining..."
                    : isPasswordRequired
                      ? "Submit Password"
                      : "Join Room"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => onNewChat?.()}
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
      ) : (
        // Collapsed state - show icon buttons
        <div className="flex flex-col items-center gap-2 p-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsJoinDialogOpen(true)}
            className="h-10 w-10 border-dashed"
            title="Join with Code"
          >
            <Key className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            onClick={() => onNewChat?.()}
            className="h-10 w-10"
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Room List */}
      <div
        className={cn("flex-1 overflow-y-auto", isCollapsed ? "p-1" : "p-2")}
      >
        {!isCollapsed && (
          <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
            YOUR ROOMS
          </div>
        )}
        <div
          className={cn(
            "space-y-1",
            isCollapsed && "flex flex-col items-center",
          )}
        >
          {rooms.map((room) => (
            // biome-ignore lint/a11y/useSemanticElements: specialized button container to avoid nesting
            <div
              key={room.id}
              role="button"
              tabIndex={0}
              onClick={() => onRoomSelect?.(room.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onRoomSelect?.(room.id);
                }
              }}
              title={
                isCollapsed
                  ? `${room.name || room.slug} (${
                      room.is_open ? "Open" : "Closed"
                    })`
                  : undefined
              }
              className={cn(
                "group flex cursor-pointer items-center rounded-lg transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isCollapsed
                  ? "h-10 w-10 justify-center"
                  : "w-full gap-2 px-2 py-2 text-sm font-medium",
                currentRoomId === room.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              {room.is_open ? (
                <DoorOpen className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <DoorClosed className="h-4 w-4 shrink-0 text-destructive/70" />
              )}
              {!isCollapsed && (
                <>
                  <span className="truncate flex-1 text-left">
                    {room.name || room.slug}
                  </span>
                  {rooms.find((r) => r.id === room.id)?.created_by ===
                    profile?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all ml-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRoomToDelete(room.id);
                      }}
                      title="Delete Room"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
          {rooms.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No rooms yet. Join one or create your own!
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={roomToDelete !== null}
        onOpenChange={(open) => !open && setRoomToDelete(null)}
      >
        <AlertDialogContent className="border-border bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              room and all associated messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-transparent hover:bg-sidebar-accent">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => roomToDelete && handleDeleteRoom(roomToDelete)}
            >
              Delete Room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
