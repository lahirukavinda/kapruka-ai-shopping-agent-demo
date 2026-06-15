"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { OrderResult } from "@/types";

interface OrderConfirmationProps {
  order: OrderResult;
}

const CONFETTI_COLORS = [
  "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6",
  "#ef4444", "#06b6d4", "#f97316",
];

function ConfettiParticle({ index }: { index: number }) {
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const left = 10 + Math.random() * 80;
  const delay = Math.random() * 0.5;
  const duration = 1.5 + Math.random() * 1;
  const size = 6 + Math.random() * 6;

  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        left: `${left}%`,
        top: -10,
      }}
      initial={{ opacity: 1, y: 0, rotate: 0 }}
      animate={{
        opacity: 0,
        y: 200 + Math.random() * 100,
        x: (Math.random() - 0.5) * 80,
        rotate: 360 + Math.random() * 360,
      }}
      transition={{ duration, delay, ease: "easeOut" }}
    />
  );
}

function useCountdown(expiresAt: string) {
  const calcRemaining = useCallback(() => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  }, [expiresAt]);

  const [remaining, setRemaining] = useState(calcRemaining);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(calcRemaining());
    }, 1000);
    return () => clearInterval(timer);
  }, [calcRemaining]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return { minutes, seconds, expired: remaining <= 0 };
}

export default function OrderConfirmation({ order }: OrderConfirmationProps) {
  const reducedMotion = useReducedMotion();
  const { minutes, seconds, expired } = useCountdown(order.expiresAt);
  const [showConfetti, setShowConfetti] = useState(!reducedMotion);

  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showConfetti]);

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl border border-green-200 dark:border-green-800
        bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40
        p-5 shadow-sm"
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Confetti */}
      <AnimatePresence>
        {showConfetti && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 15 }).map((_, i) => (
              <ConfettiParticle key={i} index={i} />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl" role="img" aria-label="Party">🎉</span>
        <h3 className="text-lg font-bold text-green-800 dark:text-green-200">
          Order Confirmed!
        </h3>
      </div>

      {/* Order details */}
      <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
        {order.orderId && (
          <div className="flex justify-between">
            <span className="font-medium">Order ID</span>
            <span className="font-mono text-green-700 dark:text-green-300">{order.orderId}</span>
          </div>
        )}
        {order.orderRef && (
          <div className="flex justify-between">
            <span className="font-medium">Reference</span>
            <span className="font-mono text-green-700 dark:text-green-300">{order.orderRef}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="font-medium">Items</span>
          <span>{order.items.length} item{order.items.length !== 1 ? "s" : ""}</span>
        </div>
        {order.summary && (
          <>
            <div className="border-t border-green-200 dark:border-green-800 pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span>Subtotal</span>
                <span>{order.summary.currency} {order.summary.items_total.toLocaleString()}</span>
              </div>
              {order.summary.delivery_fee > 0 && (
                <div className="flex justify-between text-xs">
                  <span>Delivery</span>
                  <span>{order.summary.currency} {order.summary.delivery_fee.toLocaleString()}</span>
                </div>
              )}
              {order.summary.addons_total > 0 && (
                <div className="flex justify-between text-xs">
                  <span>Add-ons</span>
                  <span>{order.summary.currency} {order.summary.addons_total.toLocaleString()}</span>
                </div>
              )}
            </div>
          </>
        )}
        <div className="flex justify-between pt-1 border-t border-green-200 dark:border-green-800">
          <span className="font-semibold">Total</span>
          <span className="font-bold text-lg text-gray-900 dark:text-gray-100">
            {order.currency} {order.total.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Countdown */}
      <div className={`mt-3 flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2
        ${expired
          ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
          : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
        }`}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {expired
          ? "Price lock expired — please reorder"
          : `Price locked for ${minutes}:${String(seconds).padStart(2, "0")}`
        }
      </div>

      {/* Pay button — prominent CTA */}
      <a
        href={order.checkoutUrl || order.payUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-4 flex items-center justify-center gap-2.5 w-full py-4 rounded-xl
          font-bold text-white text-lg tracking-wide transition-all
          ${expired
            ? "bg-gray-400 dark:bg-gray-600 cursor-not-allowed pointer-events-none"
            : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-xl shadow-green-500/30 hover:shadow-green-500/50 hover:scale-[1.02] active:scale-[0.98]"
          }`}
        aria-disabled={expired}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        {expired ? "Link Expired" : "Complete Payment →"}
      </a>
    </motion.div>
  );
}
