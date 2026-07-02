"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  collection, addDoc, getDocs, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy, query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";
import {
  KanbanSquare, Plus, Trash2, ExternalLink, Clock,
  DollarSign, Building2, MapPin, Loader2, Edit3, X, Check,
  MoreHorizontal, Link2,
} from "lucide-react";
import { clsx } from "clsx";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Status = "wishlist" | "applied" | "interview" | "offer" | "rejected";

interface JobApplication {
  id: string;
  company: string;
  role: string;
  location: string;
  salary: string;
  url: string;
  status: Status;
  appliedDate: string;
  notes: string;
  priority: "high" | "medium" | "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// Kanban column config
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS: { id: Status; label: string; color: string; bg: string; dot: string }[] = [
  { id: "wishlist",  label: "Wishlist",   color: "text-gray-600",   bg: "bg-gray-50",   dot: "bg-gray-400"   },
  { id: "applied",   label: "Applied",    color: "text-blue-700",   bg: "bg-blue-50",   dot: "bg-blue-500"   },
  { id: "interview", label: "Interview",  color: "text-purple-700", bg: "bg-purple-50", dot: "bg-purple-500" },
  { id: "offer",     label: "Offer 🎉",   color: "text-green-700",  bg: "bg-green-50",  dot: "bg-green-500"  },
  { id: "rejected",  label: "Rejected",   color: "text-red-600",    bg: "bg-red-50",    dot: "bg-red-400"    },
];

const PRIORITY_COLORS = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-gray-100 text-gray-500",
};

const EMPTY_FORM: Omit<JobApplication, "id"> = {
  company: "", role: "", location: "", salary: "", url: "",
  status: "wishlist", appliedDate: new Date().toISOString().split("T")[0],
  notes: "", priority: "medium",
};

// ─────────────────────────────────────────────────────────────────────────────
// Add/Edit modal
// ─────────────────────────────────────────────────────────────────────────────

function JobModal({ initial, onSave, onClose }: {
  initial: Omit<JobApplication, "id">;
  onSave: (data: Omit<JobApplication, "id">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">
            {initial.company ? "Edit Application" : "Add Application"}
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Company *</label>
              <input value={form.company} onChange={e => set("company", e.target.value)} placeholder="Acme Corp"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Job Title *</label>
              <input value={form.role} onChange={e => set("role", e.target.value)} placeholder="Frontend Engineer"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Location</label>
              <input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Remote"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Salary</label>
              <input value={form.salary} onChange={e => set("salary", e.target.value)} placeholder="$120k – $160k"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Job URL</label>
              <input value={form.url} onChange={e => set("url", e.target.value)} placeholder="https://..."
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Priority</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value as JobApplication["priority"])}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Applied Date</label>
              <input type="date" value={form.appliedDate} onChange={e => set("appliedDate", e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
              <textarea rows={3} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Interview tips, contacts, follow-ups…"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button
              onClick={() => { if (!form.company || !form.role) { toast.error("Company and role are required"); return; } onSave(form); }}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Check className="h-4 w-4" /> Save Application
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Application card
// ─────────────────────────────────────────────────────────────────────────────

function AppCard({ app, onEdit, onDelete, onMove }: {
  app: JobApplication;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (status: Status) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const col = COLUMNS.find(c => c.id === app.status)!;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 group hover:shadow-md hover:border-gray-200 transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-900 truncate">{app.role}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Building2 className="h-3 w-3 text-gray-400 flex-shrink-0" />
            <p className="text-[11px] text-gray-500 truncate">{app.company}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded-full", PRIORITY_COLORS[app.priority])}>
            {app.priority}
          </span>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(m => !m)}
              className="p-1 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-6 z-20 w-36 bg-white border border-gray-100 rounded-xl shadow-lg py-1">
                <button onClick={() => { onEdit(); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </button>
                {app.url && (
                  <a href={app.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    <ExternalLink className="h-3.5 w-3.5" /> View Job
                  </a>
                )}
                <div className="border-t border-gray-100 my-1" />
                <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Move to</p>
                {COLUMNS.filter(c => c.id !== app.status).map(c => (
                  <button key={c.id} onClick={() => { onMove(c.id); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    <span className={clsx("h-2 w-2 rounded-full", c.dot)} /> {c.label}
                  </button>
                ))}
                <div className="border-t border-gray-100 my-1" />
                <button onClick={() => { onDelete(); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {(app.location || app.salary) && (
        <div className="flex gap-3 mb-2">
          {app.location && <span className="flex items-center gap-1 text-[10px] text-gray-400"><MapPin className="h-3 w-3" />{app.location}</span>}
          {app.salary   && <span className="flex items-center gap-1 text-[10px] text-gray-400"><DollarSign className="h-3 w-3" />{app.salary}</span>}
        </div>
      )}

      {app.notes && (
        <p className="text-[10px] text-gray-400 line-clamp-2 mb-2 leading-relaxed">{app.notes}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] text-gray-400">
          <Clock className="h-3 w-3" /> {app.appliedDate}
        </span>
        {app.url && (
          <a href={app.url} target="_blank" rel="noreferrer" className="p-1 text-gray-300 hover:text-blue-600 transition-colors">
            <Link2 className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function JobTrackerPage() {
  const { user } = useAuth();
  const [apps, setApps]             = useState<JobApplication[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editApp, setEditApp]       = useState<JobApplication | null>(null);

  // ── Load from Firestore ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const ref = collection(db, "users", user.uid, "jobApplications");
    getDocs(query(ref, orderBy("createdAt", "desc")))
      .then(snap => setApps(snap.docs.map(d => ({ id: d.id, ...d.data() } as JobApplication))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // ── Save new ───────────────────────────────────────────────────────────────
  const handleSave = async (data: Omit<JobApplication, "id">) => {
    if (!user) return;
    if (editApp) {
      // Update
      try {
        await updateDoc(doc(db, "users", user.uid, "jobApplications", editApp.id), { ...data, updatedAt: serverTimestamp() });
        setApps(prev => prev.map(a => a.id === editApp.id ? { ...data, id: editApp.id } : a));
        toast.success("Application updated!");
      } catch { toast.error("Failed to update."); }
    } else {
      // Create
      try {
        const ref = await addDoc(collection(db, "users", user.uid, "jobApplications"), { ...data, createdAt: serverTimestamp() });
        setApps(prev => [{ ...data, id: ref.id }, ...prev]);
        toast.success("Application added!");
      } catch { toast.error("Failed to add."); }
    }
    setModalOpen(false);
    setEditApp(null);
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "jobApplications", id));
      setApps(prev => prev.filter(a => a.id !== id));
      toast.success("Deleted.");
    } catch { toast.error("Failed to delete."); }
  };

  const handleMove = async (id: string, status: Status) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid, "jobApplications", id), { status, updatedAt: serverTimestamp() });
      setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    } catch { toast.error("Failed to update status."); }
  };

  const stats = COLUMNS.map(c => ({ ...c, count: apps.filter(a => a.status === c.id).length }));

  return (
    <>
      {/* Modal */}
      {(modalOpen || editApp) && (
        <JobModal
          initial={editApp ?? EMPTY_FORM}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditApp(null); }}
        />
      )}

      <div className="space-y-5">
        {/* Header + stats */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <KanbanSquare className="h-5 w-5 text-blue-600" />
            <div>
              <h1 className="text-base font-bold text-gray-900">Job Tracker</h1>
              <p className="text-xs text-gray-500">{apps.length} application{apps.length !== 1 ? "s" : ""} tracked</p>
            </div>
          </div>
          <button
            onClick={() => { setEditApp(null); setModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Application
          </button>
        </div>

        {/* Stat pills */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {stats.map(s => (
            <div key={s.id} className={clsx("rounded-xl border p-3 text-center", s.bg, "border-transparent")}>
              <p className={clsx("text-2xl font-black", s.color)}>{s.count}</p>
              <p className="text-[11px] text-gray-500 font-medium mt-0.5 truncate">{s.label.replace(" 🎉","")}</p>
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        )}

        {/* Kanban board */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {COLUMNS.map(col => {
              const colApps = apps.filter(a => a.status === col.id);
              return (
                <div key={col.id} className="flex flex-col gap-2">
                  {/* Column header */}
                  <div className={clsx("flex items-center gap-2 px-3 py-2 rounded-xl", col.bg)}>
                    <span className={clsx("h-2 w-2 rounded-full", col.dot)} />
                    <span className={clsx("text-xs font-bold flex-1", col.color)}>{col.label}</span>
                    <span className="text-xs font-bold text-gray-400 bg-white/70 px-1.5 py-0.5 rounded-full">{colApps.length}</span>
                  </div>

                  {/* Cards */}
                  {colApps.map(app => (
                    <AppCard
                      key={app.id} app={app}
                      onEdit={() => setEditApp(app)}
                      onDelete={() => handleDelete(app.id)}
                      onMove={(status) => handleMove(app.id, status)}
                    />
                  ))}

                  {/* Add to column */}
                  <button
                    onClick={() => { setEditApp({ ...EMPTY_FORM, status: col.id, id: "" } as JobApplication); setModalOpen(true); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-gray-200 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add here
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && apps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <KanbanSquare className="h-12 w-12 text-gray-200 mb-4" />
            <h3 className="text-base font-bold text-gray-700 mb-1">No applications yet</h3>
            <p className="text-sm text-gray-400 mb-4">Start tracking your job search by adding your first application.</p>
            <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
              <Plus className="h-4 w-4" /> Add First Application
            </button>
          </div>
        )}
      </div>
    </>
  );
}
