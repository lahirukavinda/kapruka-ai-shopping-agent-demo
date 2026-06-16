"use client";

import { useState, useEffect } from "react";
import AuraAvatar from "./AuraAvatar";
import { useTheme } from "@/contexts/ThemeContext";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AvatarState } from "@/types";

interface ChatHeaderProps {
  avatarState: AvatarState;
  onCartOpen: () => void;
  onHistoryOpen?: () => void;
}

export default function ChatHeader({ avatarState, onCartOpen, onHistoryOpen }: ChatHeaderProps) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { totalItems } = useCart();
  const { language } = useLanguage();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <header className="glass-header flex items-center justify-between px-4 py-3 z-20 relative">
      <div className="flex items-center gap-3">
        <div className="avatar-glow rounded-full">
          <AuraAvatar state={avatarState} size={44} />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-aura-gold via-aura-halo to-aura-emerald bg-clip-text text-transparent">
            {process.env.NEXT_PUBLIC_APP_NAME || "Aura ඔරා"}
          </h1>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shadow-sm animate-pulse ${
              avatarState === "idle" || avatarState === "excited" || avatarState === "celebrating"
                ? "bg-emerald-400 shadow-emerald-400/50"
                : avatarState === "thinking"
                  ? "bg-amber-400 shadow-amber-400/50"
                  : "bg-emerald-400 shadow-emerald-400/50"
            }`} />
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              {language === "si" ? "Online — ඔබට උදව් කරන්න මෙහි" : "Online — here to help you shine"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Chat history */}
        {onHistoryOpen && (
          <button
            onClick={onHistoryOpen}
            className="header-btn touch-target w-10 h-10 flex items-center justify-center rounded-full text-lg"
            aria-label="Chat history"
          >
            📋
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="header-btn touch-target w-10 h-10 flex items-center justify-center rounded-full text-lg"
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {hasMounted ? (theme === "light" ? "🌙" : "☀️") : "🌙"}
        </button>

        {/* Cart button */}
        <button
          onClick={onCartOpen}
          className="header-btn touch-target relative w-10 h-10 flex items-center justify-center rounded-full text-lg"
          aria-label={`Cart with ${totalItems} ${totalItems === 1 ? "item" : "items"}`}
        >
          🛒
          {hasMounted && totalItems > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-gradient-to-r from-aura-gold to-aura-emerald text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
              {totalItems > 9 ? "9+" : totalItems}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
