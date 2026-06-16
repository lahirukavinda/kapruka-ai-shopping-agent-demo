"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  toolInvocations?: unknown[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ChatHistoryContextType {
  sessions: ChatSession[];
  currentSessionId: string | null;
  saveSession: (messages: StoredMessage[]) => void;
  loadSession: (id: string) => ChatSession | null;
  listSessions: () => ChatSession[];
  deleteSession: (id: string) => void;
  clearAll: () => void;
  startNewSession: () => void;
}

const STORAGE_KEY = "aura_chat_history";
const SESSION_ID_KEY = "aura_current_session";

const ChatHistoryContext = createContext<ChatHistoryContextType>({
  sessions: [],
  currentSessionId: null,
  saveSession: () => {},
  loadSession: () => null,
  listSessions: () => [],
  deleteSession: () => {},
  clearAll: () => {},
  startNewSession: () => {},
});

function generateId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateTitle(messages: Array<{ role: string; content: string }>): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg) return "New Chat";
  const text = firstUserMsg.content.slice(0, 50);
  return text.length < firstUserMsg.content.length ? text + "..." : text;
}

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSessions(JSON.parse(stored));
      const storedId = localStorage.getItem(SESSION_ID_KEY);
      if (storedId) setCurrentSessionId(storedId);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch { /* ignore */ }
  }, [sessions]);

  useEffect(() => {
    try {
      if (currentSessionId) {
        localStorage.setItem(SESSION_ID_KEY, currentSessionId);
      } else {
        localStorage.removeItem(SESSION_ID_KEY);
      }
    } catch { /* ignore */ }
  }, [currentSessionId]);

  const saveSession = useCallback(
    (messages: StoredMessage[]) => {
      if (messages.length === 0) return;
      const now = new Date().toISOString();

      setSessions((prev) => {
        if (currentSessionId) {
          const existing = prev.find((s) => s.id === currentSessionId);
          if (existing) {
            return prev.map((s) =>
              s.id === currentSessionId
                ? { ...s, messages, title: generateTitle(messages), updatedAt: now }
                : s
            );
          }
        }
        const newSession: ChatSession = {
          id: currentSessionId || generateId(),
          title: generateTitle(messages),
          messages,
          createdAt: now,
          updatedAt: now,
        };
        if (!currentSessionId) setCurrentSessionId(newSession.id);
        return [newSession, ...prev];
      });
    },
    [currentSessionId]
  );

  const loadSession = useCallback(
    (id: string): ChatSession | null => {
      const session = sessions.find((s) => s.id === id);
      if (session) setCurrentSessionId(id);
      return session || null;
    },
    [sessions]
  );

  const listSessions = useCallback(() => sessions, [sessions]);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setCurrentSessionId((prev) => (prev === id ? null : prev));
  }, []);

  const clearAll = useCallback(() => {
    setSessions([]);
    setCurrentSessionId(null);
  }, []);

  const startNewSession = useCallback(() => {
    setCurrentSessionId(null);
    try { localStorage.removeItem(SESSION_ID_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <ChatHistoryContext.Provider
      value={{
        sessions,
        currentSessionId,
        saveSession,
        loadSession,
        listSessions,
        deleteSession,
        clearAll,
        startNewSession,
      }}
    >
      {children}
    </ChatHistoryContext.Provider>
  );
}

export function useChatHistory() {
  return useContext(ChatHistoryContext);
}
