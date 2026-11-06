"use client";

import React, { useEffect } from "react";
import { syncOfflineOrders } from "@/lib/mobile-bridge";
import { toast } from "sonner";

export function MobileAppShell() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Register Offline-Resilient Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ignore SW registration failure in restricted environments
      });
    }

    // 2. Sync any queued offline orders on startup & whenever network reconnects
    const handleOnline = async () => {
      const { synced, remaining } = await syncOfflineOrders();
      if (synced > 0) {
        toast.success(
          `Synced ${synced} offline order${synced > 1 ? "s" : ""} to cloud!${
            remaining > 0 ? ` (${remaining} remaining)` : ""
          }`
        );
      }
    };

    if (navigator.onLine) {
      handleOnline();
    }

    window.addEventListener("online", handleOnline);
    const interval = setInterval(() => {
      if (navigator.onLine) {
        syncOfflineOrders();
      }
    }, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      clearInterval(interval);
    };
  }, []);

  return null;
}

