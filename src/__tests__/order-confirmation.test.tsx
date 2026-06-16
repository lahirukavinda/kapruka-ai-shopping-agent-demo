import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import OrderConfirmation from "@/components/checkout/OrderConfirmation";
import type { OrderResult } from "@/types";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props;
      void initial; void animate; void exit; void transition; void whileHover; void whileTap;
      return <div {...rest}>{children as React.ReactNode}</div>;
    },
    a: ({ children, ...props }: Record<string, unknown>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props;
      void initial; void animate; void exit; void transition; void whileHover; void whileTap;
      return <a {...rest}>{children as React.ReactNode}</a>;
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

describe("OrderConfirmation", () => {
  const futureDate = new Date(Date.now() + 3600000).toISOString();
  const order: OrderResult = {
    orderId: "ORD-TEST-123",
    payUrl: "https://pay.example.com/ORD-TEST-123",
    total: 12270,
    currency: "LKR",
    items: [
      { productId: "p1", name: "Birthday Cake", quantity: 1, price: 5770 },
      { productId: "p2", name: "Flower Bouquet", quantity: 1, price: 6500 },
    ],
    expiresAt: futureDate,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders order ID", () => {
    render(<OrderConfirmation order={order} />);
    expect(screen.getByText(/ORD-TEST-123/)).toBeInTheDocument();
  });

  it("renders total amount", () => {
    render(<OrderConfirmation order={order} />);
    expect(screen.getByText(/12,270/)).toBeInTheDocument();
  });

  it("renders item count", () => {
    render(<OrderConfirmation order={order} />);
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
  });

  it("renders payment button", () => {
    render(<OrderConfirmation order={order} />);
    const payButton = screen.getByText(/Complete Payment/i);
    expect(payButton.closest("button")).toBeInTheDocument();
  });

  it("renders countdown timer", () => {
    render(<OrderConfirmation order={order} />);
    // Should show "Price locked for MM:SS"
    expect(screen.getByText(/Price locked for/)).toBeInTheDocument();
  });
});
