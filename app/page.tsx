"use client";

import { useCallback, useState } from "react";
import ChatRoom from "@/components/ChatRoom";
import { NewChatView } from "@/components/NewChatView";
import Sidebar from "@/components/Sidebar";

export default function Home() {
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [pendingModelIds, setPendingModelIds] = useState<string[]>([]);
  const [initialMessage, setInitialMessage] = useState<string | null>(null);

  const handleRoomCreated = useCallback(
    (roomId: string, modelIds: string[], message: string) => {
      setPendingModelIds(modelIds);
      setInitialMessage(message);
      setCurrentRoomId(roomId);
    },
    [],
  );

  const handleRoomSelect = useCallback((roomId: string) => {
    setPendingModelIds([]);
    setInitialMessage(null);
    setCurrentRoomId(roomId);
  }, []);

  const handleNewChat = useCallback(() => {
    setPendingModelIds([]);
    setInitialMessage(null);
    setCurrentRoomId(null);
  }, []);

  const handleThinkingModelsConsumed = useCallback(() => {
    setPendingModelIds([]);
    // Don't clear message here, as it might still be needed for optimistic display
    // until fetching catches up. Or better, clear it once ChatRoom confirms receipt.
    // For now, let ChatRoom handle the optimistic logic internally using the prop.
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        currentRoomId={currentRoomId || undefined}
        onRoomSelect={handleRoomSelect}
        onNewChat={handleNewChat}
      />
      <main className="flex-1 flex flex-col min-w-0">
        {currentRoomId ? (
          <ChatRoom
            roomId={currentRoomId}
            initialThinkingModels={pendingModelIds}
            initialMessage={initialMessage || undefined}
            onThinkingModelsConsumed={handleThinkingModelsConsumed}
            onKicked={handleNewChat}
          />
        ) : (
          <NewChatView onRoomCreated={handleRoomCreated} />
        )}
      </main>
    </div>
  );
}
