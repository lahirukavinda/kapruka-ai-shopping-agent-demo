"use client";

import ProductCarousel from "@/components/products/ProductCarousel";
import ProductCardSkeleton from "@/components/products/ProductCardSkeleton";
import CategoryTiles from "@/components/products/CategoryTiles";
import ComparisonView from "@/components/comparison/ComparisonView";
import OrderTimeline from "@/components/tracking/OrderTimeline";
import OrderConfirmation from "@/components/checkout/OrderConfirmation";
import DeliveryInfo from "@/components/delivery/DeliveryInfo";
import CityList from "@/components/delivery/CityList";
import type { Product, Category, OrderTracking, OrderResult, DeliveryResult, City } from "@/types";

interface ToolResultRendererProps {
  toolName: string;
  result: unknown;
  isLoading?: boolean;
  onViewProduct?: (product: Product) => void;
  onSelectCategory?: (category: Category) => void;
  onSelectCity?: (cityName: string) => void;
}

function parseProducts(data: unknown): Product[] {
  try {
    const obj = typeof data === "string" ? JSON.parse(data) : data;
    const content = obj?.content;
    let parsed = obj;

    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find(
        (c: { type: string }) => c.type === "text"
      );
      if (textItem?.text) {
        parsed = JSON.parse(textItem.text);
      }
    }

    const products = parsed?.products || parsed?.results || parsed?.items;
    if (Array.isArray(products)) {
      return products.map((p: Record<string, unknown>) => {
        const priceObj = p.price as { amount?: number; currency?: string } | number | null;
        const price = typeof priceObj === "object" && priceObj !== null
          ? Number(priceObj.amount || 0)
          : Number(priceObj || p.selling_price || 0);
        const currency = typeof priceObj === "object" && priceObj !== null
          ? String(priceObj.currency || "LKR")
          : String(p.currency || "LKR");
        const catObj = p.category as { name?: string } | string | null;
        const category = typeof catObj === "object" && catObj !== null
          ? String(catObj.name || "")
          : catObj ? String(catObj) : undefined;

        return {
          id: String(p.id || p.product_id || ""),
          name: String(p.name || p.title || ""),
          price,
          currency: currency as "LKR" | "USD",
          imageUrl: String(p.image_url || p.imageUrl || p.image || ""),
          images: Array.isArray(p.images) ? p.images.map(String) : undefined,
          description: p.description ? String(p.description) : p.summary ? String(p.summary) : undefined,
          category,
          inStock: p.in_stock !== false && p.inStock !== false,
          stockLevel: p.stock_level ? String(p.stock_level) as "high" | "medium" | "low" : undefined,
          rating: p.rating ? Number(p.rating) : undefined,
          url: p.url ? String(p.url) : undefined,
          variants: Array.isArray(p.variants)
            ? p.variants.map((v: Record<string, unknown>) => ({
                id: String(v.id || ""),
                name: String(v.name || ""),
                value: String(v.value || ""),
              }))
            : undefined,
        };
      });
    }
    return [];
  } catch {
    return [];
  }
}

function parseCategories(data: unknown): Category[] {
  try {
    const obj = typeof data === "string" ? JSON.parse(data) : data;
    const content = obj?.content;
    let parsed = obj;

    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find(
        (c: { type: string }) => c.type === "text"
      );
      if (textItem?.text) {
        parsed = JSON.parse(textItem.text);
      }
    }

    const categories = parsed?.categories || parsed?.results || parsed;
    if (Array.isArray(categories)) {
      return categories.map((c: Record<string, unknown>) => ({
        id: String(c.id || c.name || ""),
        name: String(c.name || c.title || ""),
        url: c.url ? String(c.url) : undefined,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

function parseTracking(data: unknown): OrderTracking | null {
  try {
    const obj = typeof data === "string" ? JSON.parse(data) : data;
    const content = obj?.content;
    let parsed = obj;

    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find(
        (c: { type: string }) => c.type === "text"
      );
      if (textItem?.text) {
        parsed = JSON.parse(textItem.text);
      }
    }

    if (parsed?.order_id || parsed?.orderId || parsed?.status) {
      return {
        orderId: String(parsed.order_id || parsed.orderId || ""),
        status: String(parsed.status || ""),
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

function extractParsed(data: unknown): unknown {
  const obj = typeof data === "string" ? JSON.parse(data) : data;
  const content = obj?.content;
  if (Array.isArray(content) && content.length > 0) {
    const textItem = content.find((c: { type: string }) => c.type === "text");
    if (textItem?.text) return JSON.parse(textItem.text);
  }
  return obj;
}

function parseOrder(data: unknown): OrderResult | null {
  try {
    const parsed = extractParsed(data) as Record<string, unknown>;
    // Accept order if we have an order_id OR a pay_url/checkout_url
    const hasOrderId = !!(parsed?.order_id || parsed?.orderId);
    const hasPayUrl = !!(parsed?.pay_url || parsed?.payUrl || parsed?.checkout_url || parsed?.checkoutUrl);
    if (!hasOrderId && !hasPayUrl) return null;
    const items = Array.isArray(parsed.items)
      ? parsed.items.map((it: Record<string, unknown>) => ({
          productId: String(it.product_id || it.productId || ""),
          name: String(it.name || ""),
          quantity: Number(it.quantity || 1),
          price: Number(it.price || 0),
        }))
      : [];
    const checkoutUrl = parsed.checkout_url || parsed.checkoutUrl;
    const orderRef = parsed.order_ref || parsed.orderRef;
    const summaryRaw = parsed.summary as Record<string, unknown> | undefined;
    const summary = summaryRaw
      ? {
          items_total: Number(summaryRaw.items_total || 0),
          delivery_fee: Number(summaryRaw.delivery_fee || 0),
          addons_total: Number(summaryRaw.addons_total || 0),
          grand_total: Number(summaryRaw.grand_total || 0),
          currency: String(summaryRaw.currency || "LKR"),
        }
      : undefined;
    // Derive total from summary.grand_total if top-level total is missing
    const total = Number(parsed.total || (summaryRaw ? summaryRaw.grand_total : 0) || 0);
    const currency = String(parsed.currency || (summaryRaw ? summaryRaw.currency : "LKR") || "LKR");
    return {
      orderId: String(parsed.order_id || parsed.orderId || parsed.order_ref || parsed.orderRef || ""),
      orderRef: orderRef ? String(orderRef) : undefined,
      payUrl: String(parsed.pay_url || parsed.payUrl || parsed.checkout_url || parsed.checkoutUrl || ""),
      checkoutUrl: checkoutUrl ? String(checkoutUrl) : undefined,
      total,
      currency: currency as "LKR" | "USD",
      items,
      summary,
      expiresAt: String(parsed.expires_at || parsed.expiresAt || new Date(Date.now() + 3600000).toISOString()),
    };
  } catch {
    return null;
  }
}

function parseDelivery(data: unknown): DeliveryResult | null {
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

function parseCities(data: unknown): City[] {
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

export default function ToolResultRenderer({
  toolName,
  result,
  isLoading = false,
  onViewProduct,
  onSelectCategory,
  onSelectCity,
}: ToolResultRendererProps) {
  if (isLoading) {
    const toolLabels: Record<string, { icon: string; label: string }> = {
      kapruka_list_categories: { icon: "📦", label: "Loading categories..." },
      kapruka_track_order: { icon: "📍", label: "Tracking your order..." },
      kapruka_list_delivery_cities: { icon: "🗺️", label: "Looking up delivery cities..." },
      kapruka_search_products: { icon: "🔍", label: "Searching Kapruka for the best products..." },
      kapruka_get_product: { icon: "📋", label: "Fetching product details..." },
      kapruka_check_delivery: { icon: "🚚", label: "Checking delivery availability..." },
      kapruka_create_order: { icon: "📝", label: "Placing your order..." },
    };
    const { icon, label } = toolLabels[toolName] ?? { icon: "⚙️", label: "Working on it..." };
    const showSkeleton = toolName === "kapruka_search_products" || toolName === "kapruka_get_product";
    return (
      <div className="ml-10 my-2">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
          <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>{icon}</span>
          {label}
        </div>
        {showSkeleton && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {[1, 2, 3].map((i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (toolName === "kapruka_search_products" || toolName === "kapruka_get_product") {
    const products = parseProducts(result);
    if (products.length === 0) return null;

    if (products.length === 1 && toolName === "kapruka_get_product") {
      return (
        <ProductCarousel
          products={products}
          onViewDetails={onViewProduct}
        />
      );
    }

    return (
      <ProductCarousel
        products={products}
        title={products.length > 1 ? `Found ${products.length} products` : undefined}
        onViewDetails={onViewProduct}
      />
    );
  }

  if (toolName === "kapruka_list_categories") {
    const allCategories = parseCategories(result);
    if (allCategories.length === 0) return null;
    const displayCategories = allCategories.length > 10 ? allCategories.slice(0, 10) : allCategories;
    const showMoreMessage = allCategories.length > 10
      ? `...and ${allCategories.length - 10} more! Just ask me 😊`
      : undefined;
    return <CategoryTiles categories={displayCategories} onSelect={onSelectCategory || (() => {})} showMoreMessage={showMoreMessage} />;
  }

  if (toolName === "kapruka_track_order") {
    const tracking = parseTracking(result);
    if (!tracking) return null;
    return <OrderTimeline tracking={tracking} />;
  }

  if (toolName === "kapruka_create_order") {
    const order = parseOrder(result);
    if (!order) return null;
    return <OrderConfirmation order={order} />;
  }

  if (toolName === "kapruka_check_delivery") {
    const delivery = parseDelivery(result);
    if (!delivery) return null;
    return <DeliveryInfo delivery={delivery} />;
  }

  if (toolName === "kapruka_list_delivery_cities") {
    const cities = parseCities(result);
    if (cities.length === 0) return null;
    return <CityList cities={cities} onSelectCity={onSelectCity} />;
  }

  // For comparison scenarios: if multiple products detected
  if (toolName === "comparison") {
    const products = parseProducts(result);
    if (products.length < 2) return null;
    return <ComparisonView products={products} />;
  }

  return null;
}
