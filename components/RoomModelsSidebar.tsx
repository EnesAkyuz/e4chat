"use client";

import { Bot, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type AIModel, AVAILABLE_MODELS } from "@/lib/models";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

interface RoomModel {
  id: string; // The DB record ID
  model_id: string; // The Model ID (e.g. gpt-4o)
  room_id: string;
}

export function RoomModelsSidebar({ roomId }: { roomId: string }) {
  const [activeModels, setActiveModels] = useState<RoomModel[]>([]);
  const supabase = useMemo(() => createClient(), []);

  const fetchRoomModels = useCallback(async () => {
    const { data } = await supabase
      .from("room_models")
      .select("*")
      .eq("room_id", roomId);
    if (data) setActiveModels(data);
  }, [roomId, supabase]);

  useEffect(() => {
    fetchRoomModels();

    // Subscribe to changes
    const channel = supabase
      .channel(`room_models:${roomId}`)
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
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchRoomModels, supabase]);

  async function addModel(model: AIModel) {
    if (activeModels.some((m) => m.model_id === model.id)) {
      return;
    }

    const user = (await supabase.auth.getUser()).data.user;

    await supabase.from("room_models").insert({
      room_id: roomId,
      model_id: model.id,
      added_by: user?.id,
    });
  }

  async function removeModel(id: string) {
    // Optimistic update
    setActiveModels((prev) => prev.filter((m) => m.id !== id));
    await supabase.from("room_models").delete().eq("id", id);
  }

  const availableToAdd = AVAILABLE_MODELS.filter(
    (m) => !activeModels.some((am) => am.model_id === m.id),
  );

  return (
    <div className="flex h-full w-[240px] flex-col border-l border-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex items-center gap-2 font-semibold">
          <Bot className="h-4 w-4 text-primary" />
          <span>Models</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-popover border-border"
          >
            {availableToAdd.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground text-center">
                All available models added.
              </div>
            ) : (
              availableToAdd.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => addModel(model)}
                  className="flex items-center gap-2 cursor-pointer focus:bg-accent focus:text-accent-foreground"
                >
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      model.color || "bg-zinc-500",
                    )}
                  />
                  <span>{model.name}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {activeModels.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-10">
              No AI models in this room.
              <br />
              Click + to add one.
            </div>
          )}
          {activeModels.map((rm) => {
            const modelDef = AVAILABLE_MODELS.find((m) => m.id === rm.model_id);
            if (!modelDef) return null;

            return (
              <div
                key={rm.id}
                className="group flex items-center justify-between rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-2 text-sm transition-colors hover:bg-sidebar-accent"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <Avatar className="h-6 w-6 border border-sidebar-border">
                    <AvatarFallback
                      className={cn("text-[10px] text-white", modelDef.color)}
                    >
                      {modelDef.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate font-medium">{modelDef.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  onClick={() => removeModel(rm.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
