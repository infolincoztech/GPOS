"use client";

import React, { useState, useEffect, useRef } from "react";
import { Utensils, CheckSquare, Clock, RefreshCw, CheckCircle, ChefHat, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import axios from "axios";
import { cn } from "@/lib/utils";

export default function KitchenKDSPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<{ [key: string]: boolean }>({});
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Sync ref to avoid stale closures in polling interval
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Tone 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain1.gain.setValueAtTime(0.15, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.15);
      
      // Tone 2
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880, ctx.currentTime); // A5
        gain2.gain.setValueAtTime(0.2, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.3);
      }, 120);
    } catch (e) {
      console.warn("Audio chime context failed:", e);
    }
  };

  const handlePrintKOT = (order: any) => {
    const win = window.open("", "_blank");
    if (!win) return;
    
    let itemsHtml = order.items.map((it: any) => `
      <div class="row">
        <span class="item-qty">${it.quantity} x</span>
        <span class="item-name">${it.product?.name || "Product"} ${it.notes ? `(${it.notes})` : ""}</span>
      </div>
    `).join("");

    win.document.write(`
      <html><head><title>KOT - ${order.orderNumber}</title>
      <style>
        @page { margin: 0; }
        body { 
          font-family: 'Courier New', Courier, monospace; 
          font-size: 14px; 
          padding: 15px; 
          width: 300px; 
          margin: 0 auto; 
          background-color: #ffffff; 
          color: #000000; 
        }
        .center { text-align: center; }
        .bold { font-weight: 800; }
        .title { font-size: 18px; font-weight: 900; margin-bottom: 5px; text-transform: uppercase; }
        .line { border-top: 1px dashed #000; margin: 10px 0; }
        .row { display: flex; font-size: 15px; margin-bottom: 6px; }
        .item-qty { font-weight: bold; margin-right: 10px; width: 45px; }
        .item-name { flex: 1; font-weight: bold; }
        .meta-info { font-size: 12px; margin-bottom: 10px; }
      </style></head><body onload="window.print(); window.close();">
        <div class="center">
          <div class="title">KITCHEN TICKET</div>
          <div class="meta-info">
            Order: <span class="bold">${order.orderNumber}</span><br/>
            Time: ${new Date(order.createdAt).toLocaleString()}<br/>
            Type: <span class="bold">${order.orderType.replace("_", " ")}</span>
            ${order.orderType === "DINE_IN" && order.table ? `<br/>Location: <span class="bold">TABLE ${order.table.name}</span>` : ""}
            ${order.orderType === "DELIVERY" && order.notes ? `<br/>Address: <span class="bold">${order.notes.replace(/\n/g, ", ")}</span>` : ""}
          </div>
        </div>
        
        <div class="line"></div>
        <div class="bold" style="font-size: 11px; margin-bottom: 5px;">
          QTY & ITEM
        </div>
        <div class="line"></div>
        
        ${itemsHtml}
        
        <div class="line"></div>
        <div class="center bold" style="font-size: 12px; margin-top: 15px;">
          LINCOZ KITCHEN DISPATCH
        </div>
      </body></html>
    `);
    win.document.close();
  };

  const fetchKitchenOrders = async () => {
    try {
      const res = await axios.get("/api/orders?limit=50");
      const list = Array.isArray(res.data.orders) ? res.data.orders : [];
      // Filter out completed and cancelled orders - only show kitchen active orders
      const kitchenActive = list.filter((ord: any) => 
        ord.status === "PENDING" || ord.status === "PREPARING" || ord.status === "READY"
      );
      
      // Play alert chime if a new order arrives
      if (ordersRef.current.length > 0 && kitchenActive.length > ordersRef.current.length) {
        playAlertSound();
      }
      setOrders(kitchenActive);
    } catch {
      toast.error("KDS sync issue: Failed to fetch active kitchen orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKitchenOrders();
  }, []);

  // Poll for new orders every 10 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchKitchenOrders();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await axios.patch(`/api/orders/${orderId}`, { status: newStatus });
      toast.success(`Order marked as ${newStatus}`);
      fetchKitchenOrders();
    } catch {
      toast.error("Failed to update kitchen order status");
    }
  };

  const toggleCheckItem = (orderId: string, itemId: string) => {
    const key = `${orderId}-${itemId}`;
    setCheckedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getElapsedTime = (createdAt: string) => {
    const elapsedMs = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(elapsedMs / 60000);
    if (mins < 1) return "Just now";
    return `${mins} min${mins > 1 ? "s" : ""} ago`;
  };

  return (
    <div className="space-y-8 h-[calc(100vh-140px)] flex flex-col overflow-hidden">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <ChefHat className="w-8 h-8 text-blue-600 animate-pulse" /> Kitchen Display System (KDS)
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Real-time incoming orders, preparation checklists, and dispatcher.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn("rounded-xl h-11 px-4 font-bold border-slate-200", autoRefresh ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "text-slate-500")}
          >
            {autoRefresh ? "Auto-Sync Enabled" : "Auto-Sync Paused"}
          </Button>

          <Button
            variant="outline"
            onClick={fetchKitchenOrders}
            className="rounded-xl h-11 px-4 font-bold border-slate-200 text-slate-600 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm">
          <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
          <h3 className="mt-4 text-lg font-bold text-slate-900">Loading Kitchen Orders...</h3>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mb-6">
            <Utensils className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">No Orders in Queue</h3>
          <p className="text-slate-500 mt-2 max-w-sm">All incoming kitchen orders have been prepared and successfully dispatched!</p>
        </div>
      ) : (
        /* Orders Grid */
        <div className="flex-1 overflow-y-auto min-h-0 pb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 scrollbar-hide">
          {orders.map((order) => {
            const isPreparing = order.status === "PREPARING";
            const isReady = order.status === "READY";
            
            return (
              <Card 
                key={order.id} 
                className={cn(
                  "rounded-3xl border-slate-200/80 shadow-md flex flex-col overflow-hidden transition-all duration-300",
                  isPreparing && "border-blue-300 ring-2 ring-blue-50 bg-blue-50/10",
                  isReady && "border-emerald-300 ring-2 ring-emerald-50 bg-emerald-50/10"
                )}
              >
                {/* Card Header */}
                <CardHeader className="p-5 border-b border-slate-100/80 flex flex-row items-start justify-between shrink-0">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-black text-slate-900">
                      Order #{order.orderNumber}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-slate-100 text-slate-600 font-bold border-none text-[10px]">
                        {order.orderType.replace("_", " ")}
                      </Badge>
                      {order.orderType === "DINE_IN" && order.table && (
                        <span className="text-xs font-black text-blue-600">Table: {order.table.name}</span>
                      )}
                      {order.orderType === "DELIVERY" && order.riderName && (
                        <span className="text-xs font-black text-amber-600">Rider: {order.riderName}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-xl border-slate-200 bg-white"
                        onClick={() => handlePrintKOT(order)}>
                        <Printer className="w-4 h-4 text-slate-500" />
                      </Button>
                      <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> {getElapsedTime(order.createdAt)}
                      </span>
                    </div>
                    <Badge className={cn(
                      "font-black border px-2.5 py-0.5 rounded-lg text-[10px]",
                      order.status === "PENDING" && "bg-blue-50 text-blue-700 border-blue-100 animate-pulse",
                      order.status === "PREPARING" && "bg-amber-50 text-amber-700 border-amber-100",
                      order.status === "READY" && "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      {order.status}
                    </Badge>
                  </div>
                </CardHeader>

                {/* Items List Checklist */}
                <CardContent className="p-5 flex-1 overflow-y-auto space-y-3 min-h-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Preparation Checklist</p>
                  
                  <div className="space-y-2">
                    {order.items?.map((item: any) => {
                      const isItemChecked = !!checkedItems[`${order.id}-${item.id}`];
                      return (
                        <div 
                          key={item.id}
                          onClick={() => toggleCheckItem(order.id, item.id)}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/50 cursor-pointer transition-all hover:bg-slate-50",
                            isItemChecked && "bg-emerald-50/30 border-emerald-100 opacity-60"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-5 h-5 rounded-lg border border-slate-300 flex items-center justify-center bg-white transition-all",
                              isItemChecked && "bg-emerald-500 border-emerald-500 text-white"
                            )}>
                              {isItemChecked && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div>
                              <p className={cn("font-bold text-sm text-slate-900", isItemChecked && "line-through text-slate-400")}>
                                {item.product?.name || "Product Item"}
                              </p>
                              {item.notes && (
                                <Badge variant="outline" className="border-blue-100 bg-blue-50/30 text-blue-600 font-bold text-[9px] mt-0.5">
                                  Variant: {item.notes}
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <span className="font-black text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">
                            QTY: {item.quantity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>

                {/* Dispatch Controls */}
                <div className="p-5 border-t border-slate-100 shrink-0 bg-slate-50/50 flex gap-2">
                  {order.status === "PENDING" && (
                    <Button 
                      className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 shadow-md shadow-blue-100"
                      onClick={() => updateOrderStatus(order.id, "PREPARING")}
                    >
                      Start Preparing
                    </Button>
                  )}
                  {order.status === "PREPARING" && (
                    <Button 
                      className="flex-1 h-11 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 shadow-md shadow-amber-100"
                      onClick={() => updateOrderStatus(order.id, "READY")}
                    >
                      Mark Ready / Preparation Done
                    </Button>
                  )}
                  <Button 
                    className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 shadow-md shadow-emerald-100"
                    onClick={() => updateOrderStatus(order.id, "COMPLETED")}
                  >
                    <CheckCircle className="w-4 h-4" /> Dispatch Completed
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
