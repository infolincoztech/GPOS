"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Utensils, Users, Clock, CheckCircle2, XCircle, Plus,
  RefreshCw, Trash2, Edit, Flame, Sparkles, Image as ImageIcon,
  PlusCircle, Search
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import axios from "axios";
import { toast } from "sonner";

type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING";

const statusConfig: Record<TableStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  AVAILABLE: { label: "Available", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
  OCCUPIED:  { label: "Occupied",  color: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200",    dot: "bg-rose-500" },
  RESERVED:  { label: "Reserved",  color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200",   dot: "bg-amber-500" },
  CLEANING:  { label: "Cleaning",  color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200",    dot: "bg-blue-500" },
};

export default function RestaurantPage() {
  const [activeTab, setActiveTab] = useState("tables");

  // --- TABLES STATE & ACTIONS ---
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [filter, setFilter] = useState<TableStatus | "ALL">("ALL");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTable, setNewTable] = useState({ name: "", capacity: "4" });
  const [submitting, setSubmitting] = useState(false);

  const fetchTables = useCallback(async () => {
    try {
      const res = await axios.get("/api/tables");
      setTables(res.data);
    } catch {
      toast.error("Failed to load tables");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const updateStatus = async (id: string, status: TableStatus) => {
    try {
      await axios.patch(`/api/tables/${id}`, { status });
      setTables((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
      setSelectedTable(null);
      toast.success(`Table marked as ${status.toLowerCase()}`);
    } catch {
      toast.error("Failed to update table status");
    }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTable.name) return toast.error("Table name is required");
    setSubmitting(true);
    try {
      const res = await axios.post("/api/tables", newTable);
      setTables((prev) => [...prev, res.data]);
      setIsAddOpen(false);
      setNewTable({ name: "", capacity: "4" });
      toast.success("Table added successfully");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to add table");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTable = async (id: string) => {
    if (!confirm("Delete this table?")) return;
    try {
      await axios.delete(`/api/tables/${id}`);
      setTables((prev) => prev.filter((t) => t.id !== id));
      setSelectedTable(null);
      toast.success("Table deleted successfully");
    } catch {
      toast.error("Failed to delete table");
    }
  };

  const counts = {
    total: tables.length,
    available: tables.filter((t) => t.status === "AVAILABLE").length,
    occupied: tables.filter((t) => t.status === "OCCUPIED").length,
    reserved: tables.filter((t) => t.status === "RESERVED").length,
  };

  const filteredTables = filter === "ALL" ? tables : tables.filter((t) => t.status === filter);


  // --- DEALS STATE & ACTIONS ---
  const [deals, setDeals] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [dealLoading, setDealLoading] = useState(false);
  const [dealSubmitting, setDealSubmitting] = useState(false);
  const [isAddDealOpen, setIsAddDealOpen] = useState(false);
  const [isEditDealOpen, setIsEditDealOpen] = useState(false);

  const initialDealState = { name: "", price: "", image: "", items: [{ categoryId: "", quantity: 1 }] };
  const [newDeal, setNewDeal] = useState(initialDealState);
  const [editDeal, setEditDeal] = useState<any>(null);

  const fetchDealsAndProducts = async () => {
    setDealLoading(true);
    try {
      const [dealsRes, productsRes, categoriesRes] = await Promise.all([
        axios.get("/api/deals"),
        axios.get("/api/products"),
        axios.get("/api/categories")
      ]);
      setDeals(Array.isArray(dealsRes.data) ? dealsRes.data : []);
      setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
      // Keep only standard products, avoid listing other deals as combo ingredients
      const standardItems = Array.isArray(productsRes.data) 
        ? productsRes.data.filter((p: any) => p.type !== "DEAL")
        : [];
      setProducts(standardItems);
    } catch (err: any) {
      console.error("Fetch deals error:", err);
      toast.error("Failed to sync deals and inventory catalog.");
    } finally {
      setDealLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "deals") {
      fetchDealsAndProducts();
    }
  }, [activeTab]);

  const handleAddDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeal.name) return toast.error("Deal name is required.");
    if (!newDeal.price || parseFloat(newDeal.price) < 0) return toast.error("A valid special price is required.");

    const validItems = newDeal.items.filter(it => it.categoryId !== "");
    if (validItems.length === 0) return toast.error("Please add at least one category to this deal.");

    setDealSubmitting(true);
    try {
      await axios.post("/api/deals", {
        name: newDeal.name,
        price: parseFloat(newDeal.price),
        image: newDeal.image || null,
        items: validItems.map(it => ({
          productId: null,
          categoryId: it.categoryId,
          sizeName: null,
          quantity: parseInt(String(it.quantity)) || 1
        }))
      });
      toast.success("Combo Deal created successfully!");
      setIsAddDealOpen(false);
      setNewDeal(initialDealState);
      fetchDealsAndProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create deal.");
    } finally {
      setDealSubmitting(false);
    }
  };

  const handleEditDealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDeal) return;
    if (!editDeal.name) return toast.error("Deal name is required.");
    if (!editDeal.price || parseFloat(editDeal.price) < 0) return toast.error("A valid price is required.");

    const validItems = editDeal.items.filter((it: any) => it.categoryId !== "");
    if (validItems.length === 0) return toast.error("Select at least one category for this deal.");

    setDealSubmitting(true);
    try {
      await axios.patch(`/api/deals/${editDeal.id}`, {
        name: editDeal.name,
        price: parseFloat(editDeal.price),
        image: editDeal.image,
        items: validItems.map((it: any) => ({
          productId: null,
          categoryId: it.categoryId,
          sizeName: null,
          quantity: parseInt(String(it.quantity)) || 1
        }))
      });
      toast.success("Combo Deal updated successfully!");
      setIsEditDealOpen(false);
      setEditDeal(null);
      fetchDealsAndProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to update deal.");
    } finally {
      setDealSubmitting(false);
    }
  };

  const handleDeleteDeal = async (id: string, name: string) => {
    if (!confirm(`Delete deal "${name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/deals/${id}`);
      toast.success("Combo Deal deleted successfully");
      fetchDealsAndProducts();
    } catch {
      toast.error("Failed to delete deal");
    }
  };

  // Helper to append a dynamic product ingredient row
  const addIngredientRow = (isEdit: boolean) => {
    if (isEdit) {
      setEditDeal({
        ...editDeal,
        items: [...editDeal.items, { categoryId: "", quantity: 1 }]
      });
    } else {
      setNewDeal({
        ...newDeal,
        items: [...newDeal.items, { categoryId: "", quantity: 1 }]
      });
    }
  };

  // Helper to remove a dynamic product row
  const removeIngredientRow = (index: number, isEdit: boolean) => {
    if (isEdit) {
      const items = [...editDeal.items];
      items.splice(index, 1);
      setEditDeal({ ...editDeal, items });
    } else {
      const items = [...newDeal.items];
      items.splice(index, 1);
      setNewDeal({ ...newDeal, items });
    }
  };

  // Helper to update dynamic product row fields
  const updateIngredientField = (index: number, field: "categoryId" | "quantity", value: any, isEdit: boolean) => {
    if (isEdit) {
      const items = [...editDeal.items];
      items[index] = { ...items[index], [field]: value };
      setEditDeal({ ...editDeal, items });
    } else {
      const items = [...newDeal.items];
      items[index] = { ...items[index], [field]: value };
      setNewDeal({ ...newDeal, items });
    }
  };


  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Utensils className="w-8 h-8 text-blue-600" /> Restaurant Module
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Manage tables floor layouts, customer seatings, and custom deals.</p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === "tables" ? (
            <>
              <Button variant="outline" className="h-12 rounded-xl font-bold bg-white border-slate-200 text-slate-600 hover:bg-slate-50 px-5" onClick={fetchTables}>
                <RefreshCw className="mr-2 w-4 h-4" /> Refresh
              </Button>
              <Button className="h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold shadow-lg shadow-blue-100 text-white px-6 transition-all active:scale-95 animate-in fade-in" onClick={() => setIsAddOpen(true)}>
                <Plus className="mr-2 w-5 h-5" /> Add Table
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="h-12 rounded-xl font-bold bg-white border-slate-200 text-slate-600 hover:bg-slate-50 px-5" onClick={fetchDealsAndProducts}>
                <RefreshCw className="mr-2 w-4 h-4" /> Refresh
              </Button>
              <Button className="h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold shadow-lg shadow-blue-100 text-white px-6 transition-all active:scale-95 animate-in fade-in" onClick={() => setIsAddDealOpen(true)}>
                <Plus className="mr-2 w-5 h-5" /> Create Deal
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100 p-1.5 rounded-2xl mb-8 flex flex-row flex-wrap items-center w-fit h-auto gap-1">
          <TabsTrigger value="tables" className="rounded-xl px-6 py-2.5 font-bold text-sm tracking-tight transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 flex items-center">
            <Utensils className="w-4 h-4 mr-2" /> Tables Layout
          </TabsTrigger>
          <TabsTrigger value="deals" className="rounded-xl px-6 py-2.5 font-bold text-sm tracking-tight transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 flex items-center">
            <Flame className="w-4 h-4 mr-2 text-amber-500" /> Deals
          </TabsTrigger>
        </TabsList>

        {/* TABLES TAB */}
        <TabsContent value="tables" className="space-y-8 animate-in fade-in duration-300">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Tables", value: counts.total, icon: Utensils, color: "slate" },
              { label: "Available", value: counts.available, icon: CheckCircle2, color: "emerald" },
              { label: "Occupied", value: counts.occupied, icon: Users, color: "rose" },
              { label: "Reserved", value: counts.reserved, icon: Clock, color: "amber" },
            ].map((stat, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center gap-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", {
                  "bg-slate-100 text-slate-600": stat.color === "slate",
                  "bg-emerald-50 text-emerald-600": stat.color === "emerald",
                  "bg-rose-50 text-rose-600": stat.color === "rose",
                  "bg-amber-50 text-amber-600": stat.color === "amber",
                })}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">{stat.label}</p>
                  <p className="text-xl font-black text-slate-900">{loading ? "..." : stat.value}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["ALL", "AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING"] as const).map((s) => (
              <Button key={s} variant={filter === s ? "default" : "outline"}
                className={cn("rounded-xl font-bold h-10 px-4", filter === s ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-white text-slate-600 border-slate-200")}
                onClick={() => setFilter(s)}>
                {s === "ALL" ? "All Tables" : s.charAt(0) + s.slice(1).toLowerCase()}
              </Button>
            ))}
          </div>

          {/* Table Grid */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="h-36 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
              <Utensils className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold text-slate-600">No tables found.</p>
              <p className="text-sm text-slate-400 mt-1">Add tables using the button above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {filteredTables.map((table, idx) => {
                const config = statusConfig[table.status as TableStatus] || statusConfig.AVAILABLE;
                return (
                  <motion.div key={table.id}
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.02 }}
                    onClick={() => setSelectedTable(table)}
                    className={cn("p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-lg",
                      config.bg, config.border,
                      selectedTable?.id === table.id && "ring-2 ring-blue-500 ring-offset-2")}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-black text-slate-900">{table.name}</p>
                      <div className={cn("w-3 h-3 rounded-full", config.dot)} />
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 text-xs font-medium mb-3">
                      <Users className="w-3 h-3" />{table.capacity} seats
                    </div>
                    <Badge variant="outline" className={cn("text-xs font-bold border px-2 py-0.5 rounded-lg", config.color, config.border, config.bg)}>
                      {config.label}
                    </Badge>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* COMBO DEALS TAB */}
        <TabsContent value="deals" className="space-y-8 animate-in fade-in duration-300">
          {/* Summary Banner */}
          <div className="p-6 rounded-3xl bg-amber-50/50 border border-amber-200/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Restaurant Special Combo Deals</h3>
                <p className="text-slate-500 text-sm font-medium mt-0.5">Bundle your standard inventory products into customized feast packages with premium base64 photos, custom prices, and automated ingredient stock deductions.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-black px-3 py-1 text-sm rounded-xl">
                {deals.length} Active Deals
              </Badge>
            </div>
          </div>

          {/* Deals Grid */}
          {dealLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => <div key={i} className="h-60 bg-white rounded-3xl border border-slate-200 animate-pulse" />)}
            </div>
          ) : deals.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
              <Flame className="w-12 h-12 mx-auto mb-3 opacity-30 text-amber-500" />
              <p className="font-bold text-slate-600">No combo deals configured yet.</p>
              <p className="text-sm text-slate-400 mt-1">Combine dishes and create your first discount deal using the button above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {deals.map((deal, idx) => (
                <motion.div key={deal.id}
                  initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                  className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-lg transition-all group relative">
                  
                  {/* Deal Header Image or Flame wrapper */}
                  <div className="h-44 w-full bg-slate-50 relative overflow-hidden border-b border-slate-100">
                    {deal.image ? (
                      <img src={deal.image} alt={deal.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 text-amber-500 gap-2">
                        <Flame className="w-12 h-12 animate-pulse" />
                        <span className="text-[10px] font-black text-amber-600/60 uppercase tracking-widest">COMBO PACKAGE</span>
                      </div>
                    )}
                    <div className="absolute bottom-3 right-3 bg-blue-600 text-white font-black px-3.5 py-1.5 rounded-xl shadow-lg text-sm">
                      PKR {deal.price.toLocaleString()}
                    </div>
                  </div>

                  {/* Deal Details */}
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-black text-slate-900 text-lg group-hover:text-blue-600 transition-colors line-clamp-1">{deal.name}</h4>
                      
                      {/* Included Items Container */}
                      <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100/50 space-y-2">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Included Items</p>
                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto scrollbar-hide">
                          {deal.dealItems?.map((di: any) => (
                            <Badge key={di.id} variant="outline" className="bg-white border-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-lg text-[10px]">
                              {di.quantity}x {di.productId ? di.product?.name : `${di.category?.name || "Category"}${di.sizeName ? ` (${di.sizeName})` : ""}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <p className="text-[10px] text-slate-400 font-bold">CREATED: {new Date(deal.createdAt).toLocaleDateString()}</p>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-blue-600 hover:bg-blue-50"
                          onClick={() => {
                            setEditDeal({
                              id: deal.id,
                              name: deal.name,
                              price: String(deal.price),
                              image: deal.image || "",
                              items: deal.dealItems?.map((di: any) => ({
                                categoryId: di.categoryId || "",
                                quantity: di.quantity
                              })) || [{ categoryId: "", quantity: 1 }]
                            });
                            setIsEditDealOpen(true);
                          }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-rose-500 hover:bg-rose-50"
                          onClick={() => handleDeleteDeal(deal.id, deal.name)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* --- TABLE MANAGEMENT DIALOGS --- */}
      {selectedTable && (
        <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto bg-white rounded-3xl border border-slate-200 shadow-2xl p-4 flex flex-col sm:flex-row items-center gap-4 z-50">
          <div className="flex items-center gap-3 w-full sm:w-auto border-b sm:border-b-0 sm:border-r border-slate-100 pb-3 sm:pb-0 sm:pr-4">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", statusConfig[selectedTable.status as TableStatus]?.bg)}>
              <Utensils className={cn("w-5 h-5", statusConfig[selectedTable.status as TableStatus]?.color)} />
            </div>
            <div className="min-w-0">
              <p className="font-black text-slate-900 truncate">{selectedTable.name}</p>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-tight">{statusConfig[selectedTable.status as TableStatus]?.label}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto scrollbar-hide py-1">
            {(["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING"] as TableStatus[]).map((s) => (
              <Button key={s} size="sm"
                className={cn("rounded-xl font-bold text-[10px] uppercase h-9 px-3 shrink-0 transition-all", {
                  "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100 shadow-lg text-white": s === "AVAILABLE" && selectedTable.status !== s,
                  "bg-rose-600 hover:bg-rose-700 shadow-rose-100 shadow-lg text-white": s === "OCCUPIED" && selectedTable.status !== s,
                  "bg-amber-500 hover:bg-amber-600 shadow-amber-100 shadow-lg text-white": s === "RESERVED" && selectedTable.status !== s,
                  "bg-blue-600 hover:bg-blue-700 shadow-blue-100 shadow-lg text-white": s === "CLEANING" && selectedTable.status !== s,
                  "bg-slate-100 text-slate-400 border-none cursor-default": selectedTable.status === s
                })}
                disabled={selectedTable.status === s}
                onClick={() => updateStatus(selectedTable.id, s)}>
                {s}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 sm:border-l sm:pl-4 border-slate-100">
            <Button size="sm" variant="outline" className="rounded-xl font-bold h-9 flex-1 sm:flex-none text-rose-500 hover:bg-rose-50 hover:text-rose-600 border-rose-100"
              onClick={() => handleDeleteTable(selectedTable.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl font-bold h-9 flex-1 sm:flex-none border-slate-200"
              onClick={() => setSelectedTable(null)}>
              <XCircle className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Add Table Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-[32px] p-0 border-none shadow-2xl overflow-hidden">
          <div className="bg-white p-8">
            <DialogHeader className="mb-8 text-left">
              <DialogTitle className="text-3xl font-black text-slate-900 tracking-tight">New Table</DialogTitle>
              <p className="text-slate-500 font-bold mt-1">Add a new table to your restaurant layout.</p>
            </DialogHeader>
            <form onSubmit={handleAddTable} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Table Name *</label>
                <Input className="h-14 rounded-2xl bg-slate-50 border-slate-100 text-lg font-bold px-5" placeholder="e.g. Table 1, VIP-1"
                  value={newTable.name} onChange={(e) => setNewTable({ ...newTable, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Seating Capacity</label>
                <Input type="number" min="1" max="50" className="h-14 rounded-2xl bg-slate-50 border-slate-100 text-lg font-bold px-5"
                  value={newTable.capacity} onChange={(e) => setNewTable({ ...newTable, capacity: e.target.value })} />
              </div>
              <div className="pt-4 flex gap-4">
                <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)} className="flex-1 h-14 rounded-2xl font-black text-slate-500 hover:bg-slate-50">
                  Cancel
                </Button>
                <Button disabled={submitting} className="flex-[2] h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 font-black text-lg shadow-xl shadow-blue-100 text-white">
                  {submitting ? "Processing..." : "Add Table"}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>


      {/* --- DEALS MODALS --- */}
      {/* Create Deal Modal */}
      <Dialog open={isAddDealOpen} onOpenChange={setIsAddDealOpen}>
        <DialogContent className="sm:max-w-[650px] rounded-[32px] p-0 border-none shadow-2xl overflow-hidden">
          <div className="bg-white p-8 overflow-y-auto max-h-[90vh] scrollbar-hide">
            <DialogHeader className="mb-6 text-left">
              <DialogTitle className="text-3xl font-black text-slate-900 tracking-tight">Create Deal</DialogTitle>
              <p className="text-slate-500 font-bold mt-1">Combine standard inventory dishes into a gorgeous special price bundle.</p>
            </DialogHeader>

            <form onSubmit={handleAddDeal} className="space-y-6">
              {/* Image Picker */}
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer relative overflow-hidden group h-40">
                {newDeal.image ? (
                  <>
                    <img src={newDeal.image} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="" />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-all flex items-center justify-center">
                      <PlusCircle className="w-10 h-10 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <ImageIcon className="w-10 h-10 text-slate-300" />
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Upload Deal Photo</p>
                  </div>
                )}
                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setNewDeal({ ...newDeal, image: reader.result as string });
                      };
                      reader.readAsDataURL(file);
                    }
                  }} />
              </div>

              {/* Deal Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Deal Name *</label>
                  <Input required placeholder="e.g. Pizza & Coke Feast" className="h-14 rounded-2xl bg-slate-50 border-slate-100 text-base font-bold px-5"
                    value={newDeal.name} onChange={(e) => setNewDeal({ ...newDeal, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Special Price (PKR) *</label>
                  <Input required type="number" step="0.01" min="0" placeholder="e.g. 1500" className="h-14 rounded-2xl bg-slate-50 border-slate-100 text-base font-bold px-5"
                    value={newDeal.price} onChange={(e) => setNewDeal({ ...newDeal, price: e.target.value })} />
                </div>
              </div>

              {/* Dynamic Products Selection rows */}
              <div className="space-y-3">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Select Constituent Categories *</label>
                  <Button type="button" variant="ghost" size="sm" className="text-blue-600 font-bold hover:bg-blue-50 rounded-lg text-xs"
                    onClick={() => addIngredientRow(false)}>
                    + Add Category Option
                  </Button>
                </div>
                
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                  {newDeal.items.map((item, idx) => (
                    <div key={idx} className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-3 relative group">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category Option #{idx + 1}</span>
                      </div>

                      <div className="flex gap-3 items-center flex-wrap sm:flex-nowrap">
                        {/* Category Selector */}
                        <div className="flex-1 min-w-[200px]">
                          <select 
                            className="w-full h-11 rounded-xl bg-white border border-slate-200 px-3 focus:border-blue-500 transition-all outline-none font-bold text-xs cursor-pointer"
                            value={item.categoryId || ""} 
                            onChange={(e) => updateIngredientField(idx, "categoryId", e.target.value, false)}
                          >
                            <option value="">Select Category...</option>
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Quantity Selector */}
                        <div className="w-20">
                          <Input 
                            type="number" 
                            min="1" 
                            required 
                            placeholder="Qty" 
                            className="h-11 rounded-xl bg-white border-slate-200 text-xs font-bold text-center"
                            value={item.quantity} 
                            onChange={(e) => updateIngredientField(idx, "quantity", e.target.value, false)} 
                          />
                        </div>

                        {/* Remove Row Button */}
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-11 w-11 rounded-xl text-rose-500 hover:bg-rose-50 shrink-0"
                          disabled={newDeal.items.length <= 1} 
                          onClick={() => removeIngredientRow(idx, false)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 flex gap-4 border-t border-slate-100">
                <Button type="button" variant="ghost" onClick={() => setIsAddDealOpen(false)} className="flex-1 h-14 rounded-2xl font-black text-slate-500 hover:bg-slate-50">
                  Cancel
                </Button>
                <Button disabled={dealSubmitting} className="flex-[2] h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 font-black text-lg shadow-xl shadow-blue-100 text-white">
                  {dealSubmitting ? "Processing..." : "Create Deal"}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>


      {/* Edit Deal Modal */}
      <Dialog open={isEditDealOpen} onOpenChange={setIsEditDealOpen}>
        <DialogContent className="sm:max-w-[650px] rounded-[32px] p-0 border-none shadow-2xl overflow-hidden">
          <div className="bg-white p-8 overflow-y-auto max-h-[90vh] scrollbar-hide">
            <DialogHeader className="mb-6 text-left">
              <DialogTitle className="text-3xl font-black text-slate-900 tracking-tight">Edit Deal</DialogTitle>
              <p className="text-slate-500 font-bold mt-1">Modify your pricing, deal images, or constituent dishes.</p>
            </DialogHeader>

            {editDeal && (
              <form onSubmit={handleEditDealSubmit} className="space-y-6">
                {/* Image Picker */}
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer relative overflow-hidden group h-40">
                  {editDeal.image ? (
                    <>
                      <img src={editDeal.image} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="" />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-all flex items-center justify-center">
                        <PlusCircle className="w-10 h-10 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ImageIcon className="w-10 h-10 text-slate-300" />
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Upload Deal Photo</p>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setEditDeal({ ...editDeal, image: reader.result as string });
                        };
                        reader.readAsDataURL(file);
                      }
                    }} />
                </div>

                {/* Deal Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Deal Name *</label>
                    <Input required placeholder="Deal name" className="h-14 rounded-2xl bg-slate-50 border-slate-100 text-base font-bold px-5"
                      value={editDeal.name} onChange={(e) => setEditDeal({ ...editDeal, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Special Price (PKR) *</label>
                    <Input required type="number" step="0.01" min="0" className="h-14 rounded-2xl bg-slate-50 border-slate-100 text-base font-bold px-5"
                      value={editDeal.price} onChange={(e) => setEditDeal({ ...editDeal, price: e.target.value })} />
                  </div>
                </div>

                {/* Dynamic Products Selection rows */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Select Constituent Categories *</label>
                    <Button type="button" variant="ghost" size="sm" className="text-blue-600 font-bold hover:bg-blue-50 rounded-lg text-xs"
                      onClick={() => addIngredientRow(true)}>
                      + Add Category Option
                    </Button>
                  </div>
                  
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {editDeal.items.map((item: any, idx: number) => (
                      <div key={idx} className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-3 relative group">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category Option #{idx + 1}</span>
                        </div>

                        <div className="flex gap-3 items-center flex-wrap sm:flex-nowrap">
                          {/* Category Selector */}
                          <div className="flex-1 min-w-[200px]">
                            <select 
                              className="w-full h-11 rounded-xl bg-white border border-slate-200 px-3 focus:border-blue-500 transition-all outline-none font-bold text-xs cursor-pointer"
                              value={item.categoryId || ""} 
                              onChange={(e) => updateIngredientField(idx, "categoryId", e.target.value, true)}
                            >
                              <option value="">Select Category...</option>
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Quantity Selector */}
                          <div className="w-20">
                            <Input 
                              type="number" 
                              min="1" 
                              required 
                              placeholder="Qty" 
                              className="h-11 rounded-xl bg-white border-slate-200 text-xs font-bold text-center"
                              value={item.quantity} 
                              onChange={(e) => updateIngredientField(idx, "quantity", e.target.value, true)} 
                            />
                          </div>

                          {/* Remove Row Button */}
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-11 w-11 rounded-xl text-rose-500 hover:bg-rose-50 shrink-0"
                            disabled={editDeal.items.length <= 1} 
                            onClick={() => removeIngredientRow(idx, true)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="pt-4 flex gap-4 border-t border-slate-100">
                  <Button type="button" variant="ghost" onClick={() => setIsEditDealOpen(false)} className="flex-1 h-14 rounded-2xl font-black text-slate-500 hover:bg-slate-50">
                    Cancel
                  </Button>
                  <Button disabled={dealSubmitting} className="flex-[2] h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 font-black text-lg shadow-xl shadow-blue-100 text-white">
                    {dealSubmitting ? "Saving..." : "Update Deal"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
