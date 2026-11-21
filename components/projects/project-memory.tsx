"use client";

/* eslint-disable react-hooks/set-state-in-effect -- load notes when the selected project or account changes. */

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MemoryNote = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

const MAX_NOTES = 100;
const localKey = (projectId: string, userId: string | null) =>
  `nexus-ai-memory-v1:${userId ?? "guest"}:${projectId}`;

function isNote(value: unknown): value is MemoryNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === "string" && typeof note.project_id === "string" &&
    typeof note.user_id === "string" && typeof note.title === "string" &&
    typeof note.content === "string" && typeof note.created_at === "string" &&
    typeof note.updated_at === "string";
}

export default function ProjectMemory({
  projectId, projectName, userId, isArabic, onBack,
}: {
  projectId: string;
  projectName: string;
  userId: string | null;
  isArabic: boolean;
  onBack: () => void;
}) {
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const t = (en: string, ar: string) => isArabic ? ar : en;

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    void (async () => {
      try {
        let loaded: MemoryNote[];
        if (userId) {
          const supabase = createClient();
          const { data, error: queryError } = await supabase
            .from("project_memories")
            .select("id,project_id,user_id,title,content,created_at,updated_at")
            .eq("project_id", projectId)
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(MAX_NOTES);
          if (queryError) throw queryError;
          loaded = (data ?? []) as MemoryNote[];
        } else {
          const raw = localStorage.getItem(localKey(projectId, null));
          const parsed: unknown = raw ? JSON.parse(raw) : [];
          loaded = Array.isArray(parsed) && parsed.every(isNote) ? parsed : [];
        }
        if (active) setNotes(loaded);
      } catch (cause) {
        if (active) setError(cause instanceof Error
          ? t("Could not load project memory: ", "تعذر تحميل ذاكرة المشروع: ") + cause.message
          : t("Could not load project memory.", "تعذر تحميل ذاكرة المشروع."));
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, [projectId, userId, isArabic]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || !cleanContent || saving) return;
    if (!editingId && notes.length >= MAX_NOTES) {
      setError(t("This project has reached the 100-note limit.", "وصل المشروع إلى الحد الأقصى وهو 100 ملاحظة."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (userId) {
        const supabase = createClient();
        if (editingId) {
          const { error: updateError } = await supabase.from("project_memories")
            .update({ title: cleanTitle, content: cleanContent })
            .eq("id", editingId).eq("project_id", projectId).eq("user_id", userId);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from("project_memories").insert({
            project_id: projectId, user_id: userId, title: cleanTitle, content: cleanContent,
          });
          if (insertError) throw insertError;
        }
        const { data, error: reloadError } = await supabase.from("project_memories")
          .select("id,project_id,user_id,title,content,created_at,updated_at")
          .eq("project_id", projectId).eq("user_id", userId)
          .order("updated_at", { ascending: false }).limit(MAX_NOTES);
        if (reloadError) throw reloadError;
        setNotes((data ?? []) as MemoryNote[]);
      } else {
        const now = new Date().toISOString();
        const next: MemoryNote[] = editingId
          ? notes.map((note) => note.id === editingId
              ? { ...note, title: cleanTitle, content: cleanContent, updated_at: now } : note)
          : [{ id: crypto.randomUUID(), project_id: projectId, user_id: "guest",
              title: cleanTitle, content: cleanContent, created_at: now, updated_at: now }, ...notes];
        setNotes(next);
        localStorage.setItem(localKey(projectId, null), JSON.stringify(next));
      }
      setTitle("");
      setContent("");
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error
        ? t("Could not save this note: ", "تعذر حفظ الملاحظة: ") + cause.message
        : t("Could not save this note.", "تعذر حفظ الملاحظة."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(note: MemoryNote) {
    if (!window.confirm(t(`Delete "${note.title}"?`, `تحذف "${note.title}"؟`))) return;
    try {
      if (userId) {
        const supabase = createClient();
        const { error: deleteError } = await supabase.from("project_memories")
          .delete().eq("id", note.id).eq("project_id", projectId).eq("user_id", userId);
        if (deleteError) throw deleteError;
      }
      const next = notes.filter((item) => item.id !== note.id);
      setNotes(next);
      if (!userId) localStorage.setItem(localKey(projectId, null), JSON.stringify(next));
      if (editingId === note.id) { setEditingId(null); setTitle(""); setContent(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not delete this note.", "تعذر حذف الملاحظة."));
    }
  }

  function edit(note: MemoryNote) {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="hub-layout project-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("PROJECT MEMORY", "ذاكرة المشروع")}</div>
          <h1>{projectName}</h1>
          <p>{t("Keep decisions, instructions, useful links, and context together.", "احتفظ بالقرارات والتعليمات والروابط والسياق في مكان واحد.")}</p>
        </div>
      </div>
      <form className="project-form" onSubmit={save}>
        <label>{t("Note title", "عنوان الملاحظة")}
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder={t("e.g. Product direction", "مثلاً: توجه المشروع")} />
        </label>
        <label>{t("Memory / note", "الذاكرة / الملاحظة")}
          <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={20000} rows={6} required placeholder={t("Write the important context for this project…", "اكتب المعلومات المهمة لهذا المشروع…")} />
        </label>
        <div className="project-form-actions">
          {editingId && <button type="button" className="back-button" onClick={() => { setEditingId(null); setTitle(""); setContent(""); }}>{t("Cancel edit", "إلغاء التعديل")}</button>}
          <button type="submit" className="project-primary" disabled={!title.trim() || !content.trim() || saving}>
            {saving ? t("Saving…", "جارٍ الحفظ…") : editingId ? t("Update note", "تحديث الملاحظة") : t("Save memory", "حفظ الذاكرة")}
          </button>
        </div>
      </form>
      {error && <p className="notice" role="alert">{error}</p>}
      {busy ? <p className="muted">{t("Loading memory…", "جارٍ تحميل الذاكرة…")}</p> : notes.length ? (
        <div className="project-grid">
          {notes.map((note) => (
            <article className="project-card" key={note.id}>
              <div className="project-card-top"><span className="project-card-icon">✧</span><span className="project-status active">{new Date(note.updated_at).toLocaleDateString(isArabic ? "ar" : "en")}</span></div>
              <h2>{note.title}</h2>
              <p className="memory-content">{note.content}</p>
              <div className="project-card-footer"><span>{t("Saved memory", "ذاكرة محفوظة")}</span><div>
                <button onClick={() => edit(note)}>{t("Edit", "تعديل")}</button>
                <button className="danger-text" onClick={() => void remove(note)}>{t("Delete", "حذف")}</button>
              </div></div>
            </article>
          ))}
        </div>
      ) : !busy ? <div className="project-empty"><div className="placeholder-icon">✧</div><h2>{t("No memory saved yet.", "ما فيه ذاكرة محفوظة للحين.")}</h2><p>{t("Add the first note to give this project a reliable source of context.", "أضف أول ملاحظة عشان يكون للمشروع مرجع ثابت للسياق.")}</p></div> : null}
      <p className="footnote">{userId ? t("This memory is private to your account and stored in Supabase.", "هذه الذاكرة خاصة بحسابك ومحفوظة في Supabase.") : t("This memory is stored only in this browser. Sign in and apply the memory migration to sync it across devices.", "هذه الذاكرة محفوظة في هذا المتصفح فقط. سجّل الدخول وطبّق ترحيل الذاكرة لمزامنتها بين أجهزتك.")}</p>
      <button className="back-button project-back" onClick={onBack}>{t("Back to projects", "العودة للمشاريع")}</button>
    </div>
  );
}
