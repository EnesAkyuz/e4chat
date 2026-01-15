"use client";

import { useState } from "react";
import ChatRoom from "@/components/ChatRoom";
import Sidebar from "@/components/Sidebar";

export default function Home() {
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        currentRoomId={currentRoomId || undefined}
        onRoomSelect={(id) => setCurrentRoomId(id)}
      />
      <main className="flex-1 flex flex-col min-w-0">
        {currentRoomId ? (
          <ChatRoom roomId={currentRoomId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-4">
            <div className="h-16 w-16 rounded-2xl bg-secondary border border-border flex items-center justify-center animate-in zoom-in-50 duration-500">
              <span className="text-2xl">👋</span>
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-medium text-foreground">
                Welcome to E4 Chat
              </h3>
              <p className="text-sm">
                Select a room from the sidebar or join one using a code.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
