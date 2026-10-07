"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  Tag,
  FolderTree,
  MapPin,
  Search,
  Plus,
  Edit2,
  Trash2,
  Eye,
  Power,
  RotateCcw,
  Check,
  X,
  AlertCircle,
  ArrowUpDown,
  Filter,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Info,
  Database,
  ArrowLeft,
} from "lucide-react";

export type ReferenceType = "scopes" | "categories" | "subcategories" | "facilities";

interface ReferenceTabConfig {
  id: ReferenceType;
  label: string;
  singularLabel: string;
  description: string;
  icon: any;
}

const TABS: ReferenceTabConfig[] = [
  {
    id: "scopes",
    label: "Financial Scopes",
    singularLabel: "Financial Scope",
    description: "Operational context or business domain (Family, Agriculture, Sericulture, etc.)",
    icon: Layers,
  },
  {
    id: "categories",
    label: "Categories",
    singularLabel: "Category",
    description: "High-level classification of income, expense, and transfer transactions",
    icon: Tag,
  },
  {
    id: "subcategories",
    label: "Subcategories",
    singularLabel: "Subcategory",
    description: "Granular classification nested under a parent category",
    icon: FolderTree,
  },
  {
    id: "facilities",
    label: "Facilities / Cost Centers",
    singularLabel: "Facility / Cost Center",
    description: "Physical or operational consuming locations associated with a scope",
    icon: MapPin,
  },
];

const PRESET_COLORS = [
  "#0d9488", "#2563eb", "#7c3aed", "#db2777",
  "#ea580c", "#16a34a", "#0284c7", "#64748b",
];

export default function ReferenceDataPage() {
  const [activeTab, setActiveTab] = useState<ReferenceType>("scopes");
  const [userRole, setUserRole] = useState<string>("MEMBER");

  // Data sets from Authoritative APIs
  const [scopes, setScopes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "SYSTEM" | "HOUSEHOLD">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [parentFilter, setParentFilter] = useState<string>("ALL");

  // Pagination & Sorting
  const [sortField, setSortField] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Modals
  const [detailModalItem, setDetailModalItem] = useState<any | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    item: any;
    title: string;
    description: string;
  } | null>(null);

  // Form States
  const [scopeForm, setScopeForm] = useState({ name: "", icon: "layers", color: "#0d9488", sortOrder: 0 });
  const [categoryForm, setCategoryForm] = useState({ name: "", type: "EXPENSE", icon: "tag", color: "#2563eb", scopeIds: [] as string[] });
  const [subcategoryForm, setSubcategoryForm] = useState({ categoryId: "", name: "", sortOrder: 0 });
  const [facilityForm, setFacilityForm] = useState({ scopeId: "", name: "", type: "", description: "", icon: "map-pin", color: "#ea580c", sortOrder: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const [sRes, cRes, subRes, fRes, meRes] = await Promise.all([
        fetch("/api/scopes"),
        fetch("/api/categories"),
        fetch("/api/subcategories"),
        fetch("/api/cost-centers"),
        fetch("/api/auth/me"),
      ]);

      if (sRes.ok) setScopes(await sRes.json());
      if (cRes.ok) setCategories(await cRes.json());
      if (subRes.ok) setSubcategories(await subRes.json());
      if (fRes.ok) setFacilities(await fRes.json());
      if (meRes.ok) {
        const meData = await meRes.json();
        setUserRole(meData.user?.role || meData.role || "MEMBER");
      }
    } catch (err) {
      setErrorMessage("Unable to load reference data. Please check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Reset page when tab or filters change
  useEffect(() => {
    setCurrentPage(1);
    setParentFilter("ALL");
    setSearchQuery("");
  }, [activeTab]);

  const activeTabConfig = useMemo(() => {
    return TABS.find((t) => t.id === activeTab) || TABS[0];
  }, [activeTab]);

  // Current dataset based on active tab
  const rawData = useMemo(() => {
    switch (activeTab) {
      case "scopes": return scopes;
      case "categories": return categories;
      case "subcategories": return subcategories;
      case "facilities": return facilities;
      default: return [];
    }
  }, [activeTab, scopes, categories, subcategories, facilities]);

  // Filtered & Sorted dataset
  const filteredData = useMemo(() => {
    return rawData.filter((item) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.name?.toLowerCase().includes(q);
        const matchesDesc = item.description?.toLowerCase().includes(q);
        const matchesCategory = item.category?.name?.toLowerCase().includes(q);
        const matchesScope = item.scope?.name?.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesCategory && !matchesScope) return false;
      }

      // Source Filter
      if (sourceFilter === "SYSTEM") {
        if (!item.isSystem && !item.isDefault) return false;
      } else if (sourceFilter === "HOUSEHOLD") {
        if (item.isSystem || item.isDefault) return false;
      }

      // Status Filter
      if (statusFilter === "ACTIVE") {
        if (item.isActive === false) return false;
      } else if (statusFilter === "INACTIVE") {
        if (item.isActive !== false) return false;
      }

      // Parent Filter
      if (parentFilter !== "ALL") {
        if (activeTab === "subcategories" && item.categoryId !== parentFilter) return false;
        if (activeTab === "facilities" && item.scopeId !== parentFilter) return false;
        if (activeTab === "categories") {
          const mappedScopes = item.scopeCategories || [];
          if (!mappedScopes.some((sc: any) => sc.scopeId === parentFilter || sc.scope?.id === parentFilter)) return false;
        }
      }

      return true;
    }).sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === "source") {
        aVal = a.isSystem || a.isDefault ? "SYSTEM" : "HOUSEHOLD";
        bVal = b.isSystem || b.isDefault ? "SYSTEM" : "HOUSEHOLD";
      }

      if (typeof aVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal || "")
          : (bVal || "").localeCompare(aVal);
      }
      if (typeof aVal === "number") {
        return sortOrder === "asc" ? (aVal - (bVal || 0)) : ((bVal || 0) - aVal);
      }
      return 0;
    });
  }, [rawData, searchQuery, sourceFilter, statusFilter, parentFilter, sortField, sortOrder, activeTab]);

  // Pagination calculation
  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingItem(null);
    if (activeTab === "scopes") {
      setScopeForm({ name: "", icon: "layers", color: PRESET_COLORS[0], sortOrder: scopes.length + 1 });
    } else if (activeTab === "categories") {
      setCategoryForm({ name: "", type: "EXPENSE", icon: "tag", color: PRESET_COLORS[1], scopeIds: [] });
    } else if (activeTab === "subcategories") {
      setSubcategoryForm({ categoryId: categories[0]?.id || "", name: "", sortOrder: 0 });
    } else if (activeTab === "facilities") {
      setFacilityForm({ scopeId: scopes[0]?.id || "", name: "", type: "", description: "", icon: "map-pin", color: PRESET_COLORS[4], sortOrder: 0 });
    }
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    if (activeTab === "scopes") {
      setScopeForm({
        name: item.name || "",
        icon: item.icon || "layers",
        color: item.color || "#0d9488",
        sortOrder: item.sortOrder || 0,
      });
    } else if (activeTab === "categories") {
      const currentScopeIds = (item.scopeCategories || []).map((sc: any) => sc.scopeId || sc.scope?.id);
      setCategoryForm({
        name: item.name || "",
        type: item.type || "EXPENSE",
        icon: item.icon || "tag",
        color: item.color || "#2563eb",
        scopeIds: currentScopeIds,
      });
    } else if (activeTab === "subcategories") {
      setSubcategoryForm({
        categoryId: item.categoryId || "",
        name: item.name || "",
        sortOrder: item.sortOrder || 0,
      });
    } else if (activeTab === "facilities") {
      setFacilityForm({
        scopeId: item.scopeId || "",
        name: item.name || "",
        type: item.type || "",
        description: item.description || "",
        icon: item.icon || "map-pin",
        color: item.color || "#ea580c",
        sortOrder: item.sortOrder || 0,
      });
    }
    setIsFormModalOpen(true);
  };

  // Save (Create or Update)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let endpoint = "";
      let method = editingItem ? "PATCH" : "POST";
      let payload: any = {};

      if (activeTab === "scopes") {
        endpoint = editingItem ? `/api/scopes/${editingItem.id}` : "/api/scopes";
        payload = { ...scopeForm };
      } else if (activeTab === "categories") {
        endpoint = editingItem ? `/api/categories/${editingItem.id}` : "/api/categories";
        payload = { ...categoryForm };
      } else if (activeTab === "subcategories") {
        endpoint = editingItem ? `/api/subcategories/${editingItem.id}` : "/api/subcategories";
        payload = { ...subcategoryForm };
      } else if (activeTab === "facilities") {
        endpoint = editingItem ? `/api/cost-centers/${editingItem.id}` : "/api/cost-centers";
        payload = { ...facilityForm };
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsFormModalOpen(false);
        setSuccessMessage(`${activeTabConfig.singularLabel} saved successfully.`);
        setTimeout(() => setSuccessMessage(null), 3500);
        await fetchAllData();
      } else {
        const err = await res.json();
        setErrorMessage(err.error || "Failed to save reference data");
      }
    } catch {
      setErrorMessage("Network error while saving reference data.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Active/Inactive (Deactivate / Reactivate)
  const handleToggleActive = async (item: any) => {
    const isCurrentlyActive = item.isActive !== false;
    const newActiveState = !isCurrentlyActive;
    setErrorMessage(null);

    let endpoint = "";
    if (activeTab === "scopes") endpoint = `/api/scopes/${item.id}`;
    else if (activeTab === "categories") endpoint = `/api/categories/${item.id}`;
    else if (activeTab === "subcategories") endpoint = `/api/subcategories/${item.id}`;
    else if (activeTab === "facilities") endpoint = `/api/cost-centers/${item.id}`;

    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newActiveState }),
      });

      if (res.ok) {
        setSuccessMessage(`${item.name} ${newActiveState ? "reactivated" : "deactivated"} successfully.`);
        setTimeout(() => setSuccessMessage(null), 3000);
        await fetchAllData();
      } else {
        const err = await res.json();
        setErrorMessage(err.error || "Failed to change status.");
      }
    } catch {
      setErrorMessage("Network error updating status.");
    }
  };

  // Safe Delete (Checks references)
  const handleConfirmDelete = async () => {
    if (!confirmDeleteModal) return;
    const item = confirmDeleteModal.item;
    setErrorMessage(null);

    let endpoint = "";
    if (activeTab === "scopes") endpoint = `/api/scopes/${item.id}`;
    else if (activeTab === "categories") endpoint = `/api/categories/${item.id}`;
    else if (activeTab === "subcategories") endpoint = `/api/subcategories/${item.id}`;
    else if (activeTab === "facilities") endpoint = `/api/cost-centers/${item.id}`;

    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json();

      if (res.ok) {
        setConfirmDeleteModal(null);
        if (data.message && data.message.includes("deactivated")) {
          setSuccessMessage(data.message);
        } else {
          setSuccessMessage(`${item.name} deleted successfully.`);
        }
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchAllData();
      } else {
        setErrorMessage(data.error || "Cannot delete reference item.");
      }
    } catch {
      setErrorMessage("Network error executing deletion.");
    }
  };

  const isViewer = userRole === "VIEWER";

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/settings" className="hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Settings</span>
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground">Reference Data</span>
        </div>

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reference Data</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage the master classification data used across your financial system.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAllData}
              disabled={loading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            {!isViewer && (
              <Button
                variant="default"
                size="sm"
                onClick={handleOpenAdd}
                className="gap-1.5 text-xs font-semibold"
              >
                <Plus className="h-4 w-4" />
                Add {activeTabConfig.singularLabel}
              </Button>
            )}
          </div>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="border-b flex gap-2 overflow-x-auto pb-px">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            let count = 0;
            if (tab.id === "scopes") count = scopes.length;
            else if (tab.id === "categories") count = categories.length;
            else if (tab.id === "subcategories") count = subcategories.length;
            else if (tab.id === "facilities") count = facilities.length;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-bold">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Section Description & Context */}
        <div className="rounded-lg bg-card/60 border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div>
            <p className="font-semibold text-foreground">{activeTabConfig.label}</p>
            <p className="text-muted-foreground text-[11px] mt-0.5">{activeTabConfig.description}</p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Classification Layer (No financial mutations)</span>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <Card className="shadow-2xs">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={`Search ${activeTabConfig.label.toLowerCase()}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-9"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Source Filter */}
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as any)}
                  aria-label="Filter by Source"
                  className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary h-9"
                >
                  <option value="ALL">All Sources</option>
                  <option value="SYSTEM">System (Default)</option>
                  <option value="HOUSEHOLD">Household (Custom)</option>
                </select>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  aria-label="Filter by Status"
                  className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary h-9"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active Only</option>
                  <option value="INACTIVE">Inactive Only</option>
                </select>

                {/* Contextual Parent Filter */}
                {activeTab === "subcategories" && (
                  <select
                    value={parentFilter}
                    onChange={(e) => setParentFilter(e.target.value)}
                    aria-label="Filter by Category"
                    className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary h-9 max-w-[180px] truncate"
                  >
                    <option value="ALL">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}

                {(activeTab === "facilities" || activeTab === "categories") && (
                  <select
                    value={parentFilter}
                    onChange={(e) => setParentFilter(e.target.value)}
                    aria-label="Filter by Scope"
                    className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary h-9 max-w-[180px] truncate"
                  >
                    <option value="ALL">All Scopes</option>
                    {scopes.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Authoritative Data Table */}
        <Card className="overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                  <th className="p-3 pl-4">Name</th>
                  {activeTab === "categories" && <th className="p-3">Type</th>}
                  {activeTab === "categories" && <th className="p-3">Related Scopes</th>}
                  {activeTab === "subcategories" && <th className="p-3">Parent Category</th>}
                  {activeTab === "facilities" && <th className="p-3">Scope</th>}
                  {activeTab === "facilities" && <th className="p-3">Type / Details</th>}
                  <th className="p-3">Source</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Usage</th>
                  <th className="p-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="p-3 pl-4"><div className="h-4 w-32 bg-muted rounded" /></td>
                      {activeTab === "categories" && <td className="p-3"><div className="h-4 w-16 bg-muted rounded" /></td>}
                      {activeTab === "categories" && <td className="p-3"><div className="h-4 w-28 bg-muted rounded" /></td>}
                      {activeTab === "subcategories" && <td className="p-3"><div className="h-4 w-24 bg-muted rounded" /></td>}
                      {activeTab === "facilities" && <td className="p-3"><div className="h-4 w-20 bg-muted rounded" /></td>}
                      {activeTab === "facilities" && <td className="p-3"><div className="h-4 w-20 bg-muted rounded" /></td>}
                      <td className="p-3"><div className="h-4 w-16 bg-muted rounded" /></td>
                      <td className="p-3"><div className="h-4 w-14 bg-muted rounded" /></td>
                      <td className="p-3"><div className="h-4 w-12 bg-muted rounded" /></td>
                      <td className="p-3 pr-4 text-right"><div className="h-4 w-16 bg-muted rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center">
                      <div className="mx-auto max-w-sm space-y-2">
                        <Database className="h-8 w-8 mx-auto text-muted-foreground/60" />
                        <p className="text-sm font-semibold text-foreground">
                          No {activeTabConfig.label.toLowerCase()} found
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {searchQuery || sourceFilter !== "ALL" || statusFilter !== "ALL" || parentFilter !== "ALL"
                            ? "Try adjusting your filters or search keywords."
                            : `No custom ${activeTabConfig.label.toLowerCase()} have been created yet.`}
                        </p>
                        {!isViewer && (
                          <div className="pt-2">
                            <Button size="sm" variant="outline" onClick={handleOpenAdd} className="text-xs">
                              <Plus className="h-3.5 w-3.5 mr-1" /> Add {activeTabConfig.singularLabel}
                            </Button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item) => {
                    const isSystem = Boolean(item.isSystem || item.isDefault);
                    const isActive = item.isActive !== false;
                    const totalUsage = (item._count?.transactions || 0) + (item._count?.budgets || 0) + (item._count?.assets || 0) + (item._count?.liabilities || 0);

                    return (
                      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                        {/* Name Column */}
                        <td className="p-3 pl-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="h-3 w-3 rounded-full shrink-0 shadow-2xs"
                              style={{ backgroundColor: item.color || "#0d9488" }}
                            />
                            <span className="font-semibold text-foreground">{item.name}</span>
                          </div>
                        </td>

                        {/* Category Type */}
                        {activeTab === "categories" && (
                          <td className="p-3">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              item.type === "INCOME"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : item.type === "TRANSFER"
                                ? "bg-blue-500/10 text-blue-600"
                                : "bg-purple-500/10 text-purple-600"
                            }`}>
                              {item.type || "EXPENSE"}
                            </span>
                          </td>
                        )}

                        {/* Category Related Scopes */}
                        {activeTab === "categories" && (
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {item.scopeCategories && item.scopeCategories.length > 0 ? (
                                item.scopeCategories.map((sc: any) => (
                                  <span
                                    key={sc.scope?.id || sc.scopeId}
                                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium"
                                  >
                                    {sc.scope?.name || "Scope"}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">All Scopes</span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Subcategory Parent Category */}
                        {activeTab === "subcategories" && (
                          <td className="p-3">
                            <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                              {item.category?.name || "—"}
                            </span>
                          </td>
                        )}

                        {/* Facility Scope */}
                        {activeTab === "facilities" && (
                          <td className="p-3">
                            <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                              {item.scope?.name || "—"}
                            </span>
                          </td>
                        )}

                        {/* Facility Type/Description */}
                        {activeTab === "facilities" && (
                          <td className="p-3 text-muted-foreground text-[11px]">
                            {item.description || item.type || "—"}
                          </td>
                        )}

                        {/* Source Column */}
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-bold ${
                              isSystem
                                ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20"
                                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                            }`}
                          >
                            {isSystem ? "SYSTEM" : "HOUSEHOLD"}
                          </Badge>
                        </td>

                        {/* Status Column */}
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isActive
                                ? "bg-emerald-500/15 text-emerald-600"
                                : "bg-gray-500/15 text-gray-500"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-600" : "bg-gray-400"}`} />
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>

                        {/* Usage Count */}
                        <td className="p-3">
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {totalUsage > 0 ? `${totalUsage} ref${totalUsage === 1 ? "" : "s"}` : "0"}
                          </span>
                        </td>

                        {/* Action Buttons */}
                        <td className="p-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Details */}
                            <button
                              onClick={() => setDetailModalItem(item)}
                              title="View details"
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>

                            {/* Edit (Household only or permitted) */}
                            {!isViewer && (
                              <button
                                onClick={() => handleOpenEdit(item)}
                                disabled={isSystem}
                                title={isSystem ? "System records are protected from edit" : "Edit record"}
                                className={`p-1 rounded transition-colors ${
                                  isSystem
                                    ? "text-muted-foreground/40 cursor-not-allowed"
                                    : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                                }`}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Deactivate / Reactivate Toggle */}
                            {!isViewer && (
                              <button
                                onClick={() => handleToggleActive(item)}
                                title={isActive ? "Deactivate" : "Reactivate"}
                                className={`p-1 rounded transition-colors ${
                                  isActive
                                    ? "text-amber-600 hover:bg-amber-500/10"
                                    : "text-emerald-600 hover:bg-emerald-500/10"
                                }`}
                              >
                                <Power className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Safe Delete */}
                            {!isViewer && (
                              <button
                                onClick={() =>
                                  setConfirmDeleteModal({
                                    item,
                                    title: `Delete ${item.name}`,
                                    description: isSystem
                                      ? "System items are protected and cannot be deleted."
                                      : totalUsage > 0
                                      ? `"${item.name}" is referenced by ${totalUsage} record(s). It cannot be deleted to preserve financial history, but it will be safely deactivated.`
                                      : `Are you sure you want to permanently delete "${item.name}"? This item is unused.`,
                                  })
                                }
                                disabled={isSystem}
                                title={isSystem ? "System records cannot be deleted" : "Delete record"}
                                className={`p-1 rounded transition-colors ${
                                  isSystem
                                    ? "text-muted-foreground/40 cursor-not-allowed"
                                    : "text-red-500 hover:bg-red-500/10"
                                }`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground bg-card">
              <div>
                Showing {Math.min((currentPage - 1) * pageSize + 1, totalItems)} to{" "}
                {Math.min(currentPage * pageSize, totalItems)} of {totalItems} items
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 font-medium text-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Modal: View Details */}
        {detailModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in-50">
            <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded-full"
                    style={{ backgroundColor: detailModalItem.color || "#0d9488" }}
                  />
                  <div>
                    <h2 className="text-base font-bold">{detailModalItem.name}</h2>
                    <p className="text-[11px] text-muted-foreground">{activeTabConfig.singularLabel}</p>
                  </div>
                </div>
                <button onClick={() => setDetailModalItem(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Source / Ownership:</span>
                  <Badge variant="outline" className="text-[10px] font-bold">
                    {detailModalItem.isSystem || detailModalItem.isDefault ? "SYSTEM" : "HOUSEHOLD"}
                  </Badge>
                </div>

                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Lifecycle Status:</span>
                  <span className="font-semibold">{detailModalItem.isActive !== false ? "Active" : "Inactive"}</span>
                </div>

                {detailModalItem.type && (
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-semibold">{detailModalItem.type}</span>
                  </div>
                )}

                {detailModalItem.description && (
                  <div className="py-1 border-b">
                    <span className="text-muted-foreground block mb-0.5">Description:</span>
                    <p className="text-foreground italic">{detailModalItem.description}</p>
                  </div>
                )}

                {detailModalItem.category && (
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Parent Category:</span>
                    <span className="font-semibold">{detailModalItem.category.name}</span>
                  </div>
                )}

                {detailModalItem.scope && (
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Assigned Scope:</span>
                    <span className="font-semibold">{detailModalItem.scope.name}</span>
                  </div>
                )}

                {detailModalItem.createdAt && (
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Created:</span>
                    <span>{new Date(detailModalItem.createdAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" variant="outline" onClick={() => setDetailModalItem(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Add / Edit Form */}
        {isFormModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in-50">
            <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="text-base font-bold">
                  {editingItem ? `Edit ${activeTabConfig.singularLabel}` : `Add ${activeTabConfig.singularLabel}`}
                </h2>
                <button onClick={() => setIsFormModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
                {/* 1. Scopes Form */}
                {activeTab === "scopes" && (
                  <>
                    <div>
                      <label className="font-semibold block mb-1">Scope Name *</label>
                      <Input
                        required
                        placeholder="e.g. Real Estate, Solar, Dairy"
                        value={scopeForm.name}
                        onChange={(e) => setScopeForm({ ...scopeForm, name: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1.5">Color</label>
                      <div className="flex items-center gap-2">
                        {PRESET_COLORS.map((c) => (
                          <button
                            type="button"
                            key={c}
                            onClick={() => setScopeForm({ ...scopeForm, color: c })}
                            className={`h-6 w-6 rounded-full transition-transform ${
                              scopeForm.color === c ? "ring-2 ring-primary ring-offset-2 scale-110" : ""
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* 2. Categories Form */}
                {activeTab === "categories" && (
                  <>
                    <div>
                      <label className="font-semibold block mb-1">Category Name *</label>
                      <Input
                        required
                        placeholder="e.g. Packaging, Machinery Fuel"
                        value={categoryForm.name}
                        onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Transaction Type</label>
                      <select
                        value={categoryForm.type}
                        onChange={(e) => setCategoryForm({ ...categoryForm, type: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      >
                        <option value="EXPENSE">EXPENSE</option>
                        <option value="INCOME">INCOME</option>
                        <option value="TRANSFER">TRANSFER</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Compatible Scopes</label>
                      <div className="max-h-32 overflow-y-auto rounded border p-2 space-y-1 bg-background">
                        {scopes.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={categoryForm.scopeIds.includes(s.id)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setCategoryForm((prev) => ({
                                  ...prev,
                                  scopeIds: checked
                                    ? [...prev.scopeIds, s.id]
                                    : prev.scopeIds.filter((id) => id !== s.id),
                                }));
                              }}
                              className="rounded border"
                            />
                            <span>{s.name}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Leave unselected to make available to all scopes.</p>
                    </div>
                    <div>
                      <label className="font-semibold block mb-1.5">Color</label>
                      <div className="flex items-center gap-2">
                        {PRESET_COLORS.map((c) => (
                          <button
                            type="button"
                            key={c}
                            onClick={() => setCategoryForm({ ...categoryForm, color: c })}
                            className={`h-6 w-6 rounded-full transition-transform ${
                              categoryForm.color === c ? "ring-2 ring-primary ring-offset-2 scale-110" : ""
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* 3. Subcategories Form */}
                {activeTab === "subcategories" && (
                  <>
                    <div>
                      <label className="font-semibold block mb-1">Parent Category *</label>
                      <select
                        required
                        value={subcategoryForm.categoryId}
                        onChange={(e) => setSubcategoryForm({ ...subcategoryForm, categoryId: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      >
                        <option value="">Select Category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Subcategory Name *</label>
                      <Input
                        required
                        placeholder="e.g. Fresh Vegetables, Dairy Milk"
                        value={subcategoryForm.name}
                        onChange={(e) => setSubcategoryForm({ ...subcategoryForm, name: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                  </>
                )}

                {/* 4. Facilities Form */}
                {activeTab === "facilities" && (
                  <>
                    <div>
                      <label className="font-semibold block mb-1">Operating Scope *</label>
                      <select
                        required
                        value={facilityForm.scopeId}
                        onChange={(e) => setFacilityForm({ ...facilityForm, scopeId: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      >
                        <option value="">Select Scope</option>
                        {scopes.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Facility / Cost Center Name *</label>
                      <Input
                        required
                        placeholder="e.g. North Warehouse, Farm Plot A"
                        value={facilityForm.name}
                        onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Description (Optional)</label>
                      <Input
                        placeholder="Physical address or location details"
                        value={facilityForm.description}
                        onChange={(e) => setFacilityForm({ ...facilityForm, description: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFormModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="default"
                    size="sm"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Saving..." : editingItem ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Confirm Deletion / Deactivation Dialog */}
        {confirmDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in-50">
            <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl border space-y-4">
              <h2 className="text-base font-bold">{confirmDeleteModal.title}</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {confirmDeleteModal.description}
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDeleteModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleConfirmDelete}
                >
                  Proceed
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
