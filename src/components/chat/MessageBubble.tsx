"use client";

import { useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import AuraAvatar from "./AuraAvatar";
import type { AvatarState } from "@/types";

/** Detect payment-related URLs that should not be sent as chat messages */
const PAYMENT_URL_RE = /kapruka\.com\/tools\/continue_order|payment|checkout/i;

/** Graceful payment button: shows processing → error instead of exposing internals */
function PaymentButton({ label }: { label: string }) {
  const [state, setState] = useState<"idle" | "processing" | "error">("idle");

  const handleClick = () => {
    if (state !== "idle") return;
    setState("processing");
    setTimeout(() => setState("error"), 2500);
  };

  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
        bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300
        border border-amber-200 dark:border-amber-700">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        Payment gateway busy — try again shortly. Keep shopping! 🛍️
      </span>
    );
  }

  if (state === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
        bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300
        border border-blue-200 dark:border-blue-700 animate-pulse">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Processing payment...
      </span>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-sm font-medium
        bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-300
        border border-green-500/20 dark:border-green-500/25
        hover:bg-green-500/20 dark:hover:bg-green-500/25 hover:border-green-500/40
        transition-all duration-200 cursor-pointer"
      onClick={handleClick}
    >
      {label}
      <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  avatarState?: AvatarState;
  onAction?: (text: string) => void;
}

function formatInline(text: string, onAction?: (text: string) => void): React.ReactNode[] {
  // Split by bold, links, and images
  return text.split(/(\*\*[^*]+\*\*|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g).map((part, j) => {
    // Bold
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    // Image ![alt](url) — render as link text since images in chat are noisy
    const imgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      return (
        <a
          key={j}
          href={imgMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-aura-gold dark:text-aura-goldenLight underline decoration-aura-gold/30 hover:decoration-aura-gold transition-colors"
        >
          {imgMatch[1] || "View image"}
        </a>
      );
    }
    // Link [text](url) — render as styled chip if onAction available
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      // Payment URLs get a special graceful button (no chat message sent)
      if (PAYMENT_URL_RE.test(linkMatch[2])) {
        return <PaymentButton key={j} label={linkMatch[1]} />;
      }
      if (onAction) {
        return (
          <button
            key={j}
            type="button"
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-sm font-medium
              bg-aura-gold/10 dark:bg-aura-gold/15 text-aura-gold dark:text-aura-goldenLight
              border border-aura-gold/20 dark:border-aura-gold/25
              hover:bg-aura-gold/20 dark:hover:bg-aura-gold/25 hover:border-aura-gold/40
              transition-all duration-200 cursor-pointer"
            onClick={() => onAction(`Show me ${linkMatch[1]}`)}
          >
            {linkMatch[1]}
            <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        );
      }
      return (
        <a
          key={j}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-aura-gold dark:text-aura-goldenLight underline decoration-aura-gold/30 hover:decoration-aura-gold transition-colors"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

/** Check if a numbered list item is primarily a markdown link (e.g., "1. [Cakes](url) - description") */
const LINK_LIST_ITEM_RE = /^\[([^\]]+)\]\(([^)]+)\)\s*[-–—:]?\s*(.*)/;

interface LinkChip {
  label: string;
  url: string;
  description: string;
}

function renderMarkdown(text: string, onAction?: (text: string) => void) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Headings (### ## #)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls = level === 1
        ? "text-base font-bold mt-2 mb-1"
        : level === 2
          ? "text-sm font-bold mt-2 mb-0.5"
          : "text-sm font-semibold mt-1.5 mb-0.5 text-aura-gold dark:text-aura-goldenLight";
      elements.push(<div key={i} className={cls}>{formatInline(headingMatch[2], onAction)}</div>);
      i++;
      continue;
    }

    // Numbered list — look ahead to detect consecutive link-list items for chip rendering
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch && onAction) {
      const linkItemMatch = numMatch[2].match(LINK_LIST_ITEM_RE);
      if (linkItemMatch) {
        // Collect consecutive numbered list items that contain links
        const chips: LinkChip[] = [];
        let j = i;
        while (j < lines.length) {
          const nMatch = lines[j].match(/^\d+\.\s+(.+)/);
          if (!nMatch) break;
          const lMatch = nMatch[1].match(LINK_LIST_ITEM_RE);
          if (!lMatch) break;
          chips.push({ label: lMatch[1], url: lMatch[2], description: lMatch[3] });
          j++;
        }

        if (chips.length >= 2) {
          // Render as chip grid
          elements.push(
            <div key={`chip-grid-${i}`} className="flex flex-wrap gap-2 py-2">
              {chips.map((chip, ci) => (
                <button
                  key={ci}
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium
                    bg-aura-gold/10 dark:bg-aura-gold/15 text-gray-800 dark:text-gray-100
                    border border-aura-gold/25 dark:border-aura-gold/30
                    hover:bg-aura-gold/20 dark:hover:bg-aura-gold/25 hover:border-aura-gold/50
                    hover:shadow-md hover:shadow-aura-gold/10
                    active:scale-[0.97]
                    transition-all duration-200 cursor-pointer"
                  onClick={() => onAction(`Show me ${chip.label}`)}
                  title={chip.description || `Browse ${chip.label}`}
                >
                  <span className="text-aura-gold dark:text-aura-goldenLight font-semibold">{chip.label}</span>
                  <svg className="w-3.5 h-3.5 text-aura-gold/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          );
          i = j;
          continue;
        }
      }
    }

    // Regular numbered list item
    if (numMatch) {
      elements.push(
        <div key={i} className="flex gap-2 py-0.5">
          <span className="text-aura-gold dark:text-aura-goldenLight font-semibold text-xs min-w-[18px] text-right mt-0.5">
            {numMatch[1]}.
          </span>
          <span className="flex-1">{formatInline(numMatch[2], onAction)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Bullet list
    if (line.startsWith("- ") || line.startsWith("• ")) {
      const content = line.slice(2);
      elements.push(
        <div key={i} className="flex gap-2 py-0.5">
          <span className="text-aura-gold dark:text-aura-goldenLight mt-1">•</span>
          <span className="flex-1">{formatInline(content, onAction)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Empty line = paragraph break
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    elements.push(<div key={i}>{formatInline(line, onAction)}</div>);
    i++;
  }

  return elements;
}

export default function MessageBubble({
  role,
  content,
  isStreaming = false,
  avatarState = "idle",
  onAction,
}: MessageBubbleProps) {
  const prefersReducedMotion = useReducedMotion();
  const isAssistant = role === "assistant";

  const variants: Variants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.15 } },
      }
    : {
        hidden: { opacity: 0, y: 12, scale: 0.97 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: "spring" as const, damping: 20, stiffness: 300 },
        },
      };

  return (
    <motion.div
      className={`flex gap-2.5 ${isAssistant ? "justify-start" : "justify-end"} mb-4`}
      variants={variants}
      initial="hidden"
      animate="visible"
      role="article"
      aria-label={
        isAssistant
          ? `Aura says: ${content.slice(0, 100)}`
          : `You said: ${content.slice(0, 100)}`
      }
      aria-busy={isStreaming}
    >
      {isAssistant && <AuraAvatar state={avatarState} size={32} />}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words ${
          isAssistant
            ? "assistant-bubble text-gray-800 dark:text-gray-100"
            : "user-bubble text-white shadow-lg"
        } ${isStreaming ? "streaming-text" : ""}`}
      >
        {isAssistant ? renderMarkdown(content, onAction) : content}
        {isStreaming && <span className="streaming-cursor" />}
      </div>
    </motion.div>
  );
}
