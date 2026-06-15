import type { Product, Category, OrderTracking, OrderResult, DeliveryResult, City } from "@/types";

export function extractParsed(data: unknown): unknown {
  const obj = typeof data === "string" ? JSON.parse(data) : data;
  const content = (obj as Record<string, unknown>)?.content;
  if (Array.isArray(content) && content.length > 0) {
    const textItem = content.find((c: { type: string }) => c.type === "text");
    if (textItem?.text) return JSON.parse(textItem.text);
  }
  return obj;
}

export function parseProducts(data: unknown): Product[] {
  try {
    const obj = typeof data === "string" ? JSON.parse(data) : data;
    const content = (obj as Record<string, unknown>)?.content;
    let parsed = obj as Record<string, unknown>;

    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find(
        (c: { type: string }) => c.type === "text"
      );
      if (textItem?.text) {
        parsed = JSON.parse(textItem.text) as Record<string, unknown>;
      }
    }

    const products = parsed?.products || parsed?.results || parsed;
    if (Array.isArray(products)) {
      return products
        .map((p: Record<string, unknown>) => {
          const price = parseFloat(
            String(p.price || "0").replace(/[^0-9.]/g, "")
          );
          return {
            id: String(p.id || p.product_id || ""),
            name: String(p.name || p.title || ""),
            price,
            currency: String(p.currency || "LKR") as "LKR" | "USD",
            imageUrl: String(p.image || p.image_url || p.thumbnail || ""),
            description: p.description ? String(p.description) : undefined,
            category: p.category ? String(p.category) : undefined,
            inStock:
              p.in_stock !== false && p.inStock !== false,
            stockLevel: p.stock_level ? String(p.stock_level) as "high" | "medium" | "low" : undefined,
            url: p.url ? String(p.url) : undefined,
          };
        })
        .filter((p) => p.name && p.id) as Product[];
    }
    return [];
  } catch {
    return [];
  }
}

export function parseCategories(data: unknown): Category[] {
  try {
    const obj = typeof data === "string" ? JSON.parse(data) : data;
    const content = (obj as Record<string, unknown>)?.content;
    let parsed = obj as Record<string, unknown>;

    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find(
        (c: { type: string }) => c.type === "text"
      );
      if (textItem?.text) {
        parsed = JSON.parse(textItem.text) as Record<string, unknown>;
      }
    }

    const categories = parsed?.categories || parsed?.results || parsed;
    if (Array.isArray(categories)) {
      return categories
        .map((c: Record<string, unknown>) => ({
          id: String(c.id || c.name || ""),
          name: String(c.name || ""),
          url: c.url ? String(c.url) : undefined,
        }))
        .filter((c) => c.name) as Category[];
    }
    return [];
  } catch {
    return [];
  }
}

export function parseTracking(data: unknown): OrderTracking | null {
  try {
    const obj = typeof data === "string" ? JSON.parse(data) : data;
    const content = (obj as Record<string, unknown>)?.content;
    let parsed = obj as Record<string, unknown>;

    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find(
        (c: { type: string }) => c.type === "text"
      );
      if (textItem?.text) {
        parsed = JSON.parse(textItem.text) as Record<string, unknown>;
      }
    }

    if (parsed?.order_id || parsed?.tracking_number || parsed?.status) {
      return {
        orderId: String(parsed.order_id || ""),
        status: String(parsed.status || "processing"),

        steps: Array.isArray(parsed.steps)
          ? parsed.steps.map((s: Record<string, unknown>) => ({
              title: String(s.title || s.name || ""),
              description: s.description ? String(s.description) : undefined,
              timestamp: s.timestamp ? String(s.timestamp) : undefined,
              completed: Boolean(s.completed),
              current: Boolean(s.current),
            }))
          : [],
        estimatedDelivery: parsed.estimated_delivery
          ? String(parsed.estimated_delivery)
          : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function parseOrder(data: unknown): OrderResult | null {
  try {
    const parsed = extractParsed(data) as Record<string, unknown>;
    // Accept order if we have an order_id/order_ref OR a pay_url/checkout_url
    const hasId = !!(parsed?.order_id || parsed?.orderId || parsed?.order_ref || parsed?.orderRef);
    const hasUrl = !!(parsed?.pay_url || parsed?.payUrl || parsed?.checkout_url || parsed?.checkoutUrl);
    if (!hasId && !hasUrl) return null;
    const items = Array.isArray(parsed.items)
      ? parsed.items.map((it: Record<string, unknown>) => ({
          productId: String(it.product_id || it.productId || ""),
          name: String(it.name || ""),
          quantity: Number(it.quantity || 1),
          price: Number(it.price || 0),
        }))
      : [];
    const summary = parsed.summary as Record<string, unknown> | undefined;
    const total = summary
      ? Number(summary.grand_total || 0)
      : Number(parsed.total || 0);
    const currency = summary
      ? String(summary.currency || "LKR")
      : String(parsed.currency || "LKR");
    return {
      orderId: String(parsed.order_id || parsed.orderId || parsed.order_ref || parsed.orderRef || ""),
      orderRef: parsed.order_ref ? String(parsed.order_ref) : undefined,
      payUrl: String(parsed.pay_url || parsed.payUrl || parsed.checkout_url || parsed.checkoutUrl || ""),
      checkoutUrl: parsed.checkout_url ? String(parsed.checkout_url) : undefined,
      total,
      currency,
      items,
      summary: summary ? {
        items_total: Number(summary.items_total || 0),
        delivery_fee: Number(summary.delivery_fee || 0),
        addons_total: Number(summary.addons_total || 0),
        grand_total: Number(summary.grand_total || 0),
        currency: String(summary.currency || "LKR"),
      } : undefined,
      expiresAt: String(parsed.expires_at || parsed.expiresAt || new Date(Date.now() + 3600000).toISOString()),
    };
  } catch {
    return null;
  }
}

export function parseDelivery(data: unknown): DeliveryResult | null {
  try {
    const parsed = extractParsed(data) as Record<string, unknown>;
    if (parsed?.available === undefined && parsed?.city === undefined) return null;
    return {
      city: String(parsed.city || ""),
      available: Boolean(parsed.available),
      deliveryDate: String(parsed.delivery_date || parsed.deliveryDate || parsed.estimated_date || ""),
      rate: Number(parsed.rate || parsed.delivery_rate || 0),
      currency: String(parsed.currency || "LKR"),
      perishableWarning: parsed.perishable_warning
        ? String(parsed.perishable_warning)
        : parsed.perishableWarning
          ? String(parsed.perishableWarning)
          : undefined,
    };
  } catch {
    return null;
  }
}

export function parseCities(data: unknown): City[] {
  try {
    const parsed = extractParsed(data) as Record<string, unknown>;
    const cities = parsed?.cities || parsed?.results || parsed;
    if (Array.isArray(cities)) {
      return cities.map((c: Record<string, unknown>) => ({
        name: String(c.name || c.city || ""),
        aliases: Array.isArray(c.aliases) ? c.aliases.map(String) : undefined,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Format a price value in Sri Lankan Rupees.
 * Displays as "Rs. X,XXX" which is the common Sri Lankan format.
 */
export function formatLKR(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-LK")}`;
}
