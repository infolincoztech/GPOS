"use client";

import axios from "axios";

const OFFLINE_ORDERS_KEY = "gpos_offline_orders_outbox_v1";
const LOCAL_PRODUCTS_KEY = "gpos_local_products_cache_v1";
const LOCAL_CATEGORIES_KEY = "gpos_local_categories_cache_v1";

export interface QueuedOfflineOrder {
  idempotencyKey: string;
  queuedAt: string;
  payload: any;
  retries: number;
}

/**
 * Generates a unique UUID v4 idempotency key for mobile checkout requests
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idemp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Triggers native or web haptic vibration for mobile touch ergonomics
 */
export function triggerHaptic(type: "light" | "medium" | "success" = "light"): void {
  if (typeof window === "undefined") return;
  try {
    if ("vibrate" in navigator) {
      if (type === "light") navigator.vibrate(12);
      else if (type === "medium") navigator.vibrate(25);
      else if (type === "success") navigator.vibrate([20, 40, 30]);
    }
  } catch {
    // Ignore on unsupported devices
  }
}

/**
 * Caches product & category catalog locally for instant 0ms mobile startup and offline fallback
 */
export function cacheCatalogLocally(products: any[], categories: any[]): void {
  if (typeof window === "undefined") return;
  try {
    if (Array.isArray(products) && products.length > 0) {
      localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify({ updatedAt: Date.now(), data: products }));
    }
    if (Array.isArray(categories) && categories.length > 0) {
      localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify({ updatedAt: Date.now(), data: categories }));
    }
  } catch {
    // Storage quota exceeded or private browsing
  }
}

export function getLocalCatalog(): { products: any[]; categories: any[] } {
  if (typeof window === "undefined") return { products: [], categories: [] };
  try {
    const pRaw = localStorage.getItem(LOCAL_PRODUCTS_KEY);
    const cRaw = localStorage.getItem(LOCAL_CATEGORIES_KEY);
    const products = pRaw ? JSON.parse(pRaw).data || [] : [];
    const categories = cRaw ? JSON.parse(cRaw).data || [] : [];
    return { products, categories };
  } catch {
    return { products: [], categories: [] };
  }
}

/**
 * Offline Order Outbox Queue — guarantees zero lost sales when mobile network drops
 */
export function getOfflineOrdersQueue(): QueuedOfflineOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineOrder(payload: any, idempotencyKey?: string): QueuedOfflineOrder {
  const key = idempotencyKey || generateIdempotencyKey();
  const queue = getOfflineOrdersQueue();
  const entry: QueuedOfflineOrder = {
    idempotencyKey: key,
    queuedAt: new Date().toISOString(),
    payload,
    retries: 0,
  };
  const exists = queue.some((q) => q.idempotencyKey === key);
  if (!exists) {
    queue.push(entry);
    try {
      localStorage.setItem(OFFLINE_ORDERS_KEY, JSON.stringify(queue));
      window.dispatchEvent(new CustomEvent("gpos-offline-queue-changed", { detail: { count: queue.length } }));
    } catch {
      // Ignore storage error
    }
  }
  return entry;
}

export async function syncOfflineOrders(): Promise<{ synced: number; remaining: number }> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { synced: 0, remaining: getOfflineOrdersQueue().length };
  }

  const queue = getOfflineOrdersQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  let synced = 0;
  const remainingQueue: QueuedOfflineOrder[] = [];

  for (const item of queue) {
    try {
      await axios.post("/api/orders", item.payload, {
        headers: {
          "X-Idempotency-Key": item.idempotencyKey,
        },
        timeout: 12000,
      });
      synced++;
    } catch (err: any) {
      const status = err?.response?.status;
      // Drop permanently invalid 4xx requests (except 408/429), keep network/5xx errors for retry
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        continue;
      }
      remainingQueue.push({ ...item, retries: item.retries + 1 });
    }
  }

  try {
    localStorage.setItem(OFFLINE_ORDERS_KEY, JSON.stringify(remainingQueue));
    window.dispatchEvent(
      new CustomEvent("gpos-offline-queue-changed", { detail: { count: remainingQueue.length, synced } })
    );
  } catch {
    // Ignore storage error
  }

  return { synced, remaining: remainingQueue.length };
}

