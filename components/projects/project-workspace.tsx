"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Project = {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused";
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "nexus-ai-projects-v1";

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.description === "string" &&
    (item.status === "active" || item.status === "paused") &&
    typeof item.createdAt === "number" &&
    typeof item.updatedAt === "number";
}

export default function ProjectWorkspace({ isArabic, onBack }: { isArabic: boolean; onBack: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);

  const t = (en: string, ar: string) => (isArabic ? ar : en);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(isProject)) setProjects(parsed);
        else localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setCloudReady(true);
      return;
    }
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setCloudReady(false);
        setUserId(session?.user.id ?? null);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loaded || !userId) {
      if (loaded && !userId) setCloudReady(true);
      return;
    }
    let active = true;
    setCloudReady(false);
    void (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("projects")
          .select("id,name,description,status,created_at,updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        const cloudProjects: Project[] = (data ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          status: item.status,
          createdAt: new Date(item.created_at).getTime(),
          updatedAt: new Date(item.updated_at).getTime(),
        }));
        const localOnly = projects.filter((local) => !cloudProjects.some((cloud) => cloud.id === local.id));
        if (localOnly.length) {
          const { error: uploadError } = await supabase.from("projects").upsert(
            localOnly.map((item) => ({
              id: item.id,
              user_id: userId,
              name: item.name,
              description: item.description,
              status: item.status,
              created_at: new Date(item.createdAt).toISOString(),
              updated_at: new Date(item.updatedAt).toISOString(),
            })),
            { onConflict: "id" },
          );
          if (uploadError) throw uploadError;
        }
        if (!active) return;
        const merged = [...cloudProjects, ...localOnly].sort((a, b) => b.updatedAt - a.updatedAt);
        setProjects(merged);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* Cloud remains source of truth. */ }
      } catch (error) {
        if (active) setStorageWarning(error instanceof Error
          ? t("Cloud sync failed: ", "تعذرت المزامنة السحابية: ") + error.message
          : t("Cloud sync failed.", "تعذرت المزامنة السحابية."));
      } finally {
        if (active) setCloudReady(true);
      }
    })();
    return () => { active = false; };
  // Run once after the initial local load or when the signed-in account changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, userId]);

  async function persist(next: Project[], removedIds: string[] = []) {
    setProjects(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setStorageWarning(t(
        "Changes are visible for this session, but browser storage is unavailable.",
        "التغييرات ظاهرة خلال هذه الجلسة، لكن التخزين في المتصفح غير متاح."
      ));
    }
    if (!userId) return;
    try {
      const supabase = createClient();
      const { error } = next.length ? await supabase.from("projects").upsert(
        next.map((item) => ({
          id: item.id,
          user_id: userId,
          name: item.name,
          description: item.description,
          status: item.status,
          created_at: new Date(item.createdAt).toISOString(),
          updated_at: new Date(item.updatedAt).toISOString(),
        })),
        { onConflict: "id" },
      ) : { error: null };
      if (error) throw error;
      if (removedIds.length) {
        const { error: deleteError } = await supabase.from("projects").delete().in("id", removedIds).eq("user_id", userId);
        if (deleteError) throw deleteError;
      }
      setStorageWarning("");
    } catch (error) {
      setStorageWarning(error instanceof Error
        ? t("Saved on this device; cloud sync failed: ", "حُفظت على الجهاز وتعذرت المزامنة: ") + error.message
        : t("Saved on this device; cloud sync failed.", "حُفظت على الجهاز وتعذرت المزامنة."));
    }
  }

  function createProject(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    const now = Date.now();
    const project: Project = {
      id: crypto.randomUUID(),
      name: cleanName.slice(0, 80),
      description: description.trim().slice(0, 500),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    void persist([project, ...projects]);
    setName("");
    setDescription("");
    setShowForm(false);
  }

  function toggleStatus(project: Project) {
    void persist(projects.map((item) => item.id === project.id
      ? { ...item, status: item.status === "active" ? "paused" : "active", updatedAt: Date.now() }
      : item));
  }

  function deleteProject(project: Project) {
    const confirmed = window.confirm(t(`Delete "${project.name}"? This removes the project from your account and this device.`, `تحذف "${project.name}"؟ سيؤدي هذا إلى حذف المشروع من حسابك وهذا الجهاز.`));
    if (confirmed) void persist(projects.filter((item) => item.id !== project.id), [project.id]);
  }

  const filtered = useMemo(() => projects.filter((project) =>
    `${project.name} ${project.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  ), [projects, query]);

  return (
    <div className="hub-layout project-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("YOUR WORKSPACE", "مساحة عملك")}</div>
          <h1>{t("Projects, kept in one place.", "كل مشاريعك في مكان واحد.")}</h1>
          <p>{t("Create a home for each idea. Your project list is saved on this device.", "أنشئ مساحة لكل فكرة. تُحفظ قائمة مشاريعك على هذا الجهاز.")}</p>
        </div>
        <button className="send-button project-create-trigger" onClick={() => setShowForm((value) => !value)} aria-label={t("Create project", "إنشاء مشروع")}>＋</button>
      </div>

      {showForm && (
        <form className="project-form" onSubmit={createProject}>
          <label>{t("Project name", "اسم المشروع")}
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder={t("e.g. My learning app", "مثلاً: تطبيق تعليمي")} />
          </label>
          <label>{t("Description (optional)", "الوصف (اختياري)")}
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} placeholder={t("What are you building?", "وش تخطط تبني؟")} />
          </label>
          <div className="project-form-actions">
            <button type="button" className="back-button" onClick={() => setShowForm(false)}>{t("Cancel", "إلغاء")}</button>
            <button type="submit" className="project-primary" disabled={!name.trim()}>{t("Create project", "إنشاء المشروع")}</button>
          </div>
        </form>
      )}

      <div className="project-toolbar">
        <input className="project-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search projects…", "ابحث في المشاريع…")} aria-label={t("Search projects", "ابحث في المشاريع")} />
        <span className="project-count">{projects.length} {t("projects", "مشاريع")}</span>
      </div>

      {!loaded || !cloudReady ? <p className="muted">{t("Loading projects…", "جارٍ تحميل المشاريع…")}</p> : filtered.length === 0 ? (
        <div className="project-empty">
          <div className="placeholder-icon">▦</div>
          <h2>{query ? t("No matching projects", "ما لقينا مشاريع مطابقة") : t("Your first project starts here.", "مشروعك الأول يبدأ من هنا.")}</h2>
          <p>{query ? t("Try another search term.", "جرّب كلمة بحث ثانية.") : t("Keep ideas, notes, and future AI context organized as you grow.", "رتّب أفكارك وملاحظاتك وسياق الذكاء الاصطناعي مع توسّع مشاريعك.")}</p>
          {!query && <button className="project-primary" onClick={() => setShowForm(true)}>{t("Create your first project", "أنشئ أول مشروع")}</button>}
        </div>
      ) : (
        <div className="project-grid">
          {filtered.map((project) => (
            <article className="project-card" key={project.id}>
              <div className="project-card-top"><span className="project-card-icon">▦</span><span className={`project-status ${project.status}`}>{project.status === "active" ? t("Active", "نشط") : t("Paused", "متوقف")}</span></div>
              <h2>{project.name}</h2>
              <p>{project.description || t("No description yet.", "ما أضفت وصفاً بعد.")}</p>
              <div className="project-card-footer">
                <span>{new Date(project.updatedAt).toLocaleDateString(isArabic ? "ar" : "en", { month: "short", day: "numeric", year: "numeric" })}</span>
                <div>
                  <button onClick={() => toggleStatus(project)}>{project.status === "active" ? t("Pause", "إيقاف") : t("Resume", "استئناف")}</button>
                  <button className="danger-text" onClick={() => deleteProject(project)}>{t("Delete", "حذف")}</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {storageWarning && <p className="notice" role="alert">{storageWarning}</p>}
      <p className="footnote">{userId ? t("Signed-in projects sync with your Supabase account. Local copies remain available on this device.", "تتزامن المشاريع مع حساب Supabase عند تسجيل الدخول، وتبقى نسخة محلية على هذا الجهاز.") : t("Projects are saved on this device. Sign in and configure Supabase to enable cloud sync.", "تُحفظ المشاريع على هذا الجهاز. سجّل الدخول واضبط Supabase لتفعيل المزامنة.")}</p>
      <button className="back-button project-back" onClick={onBack}>{t("Back to AI Hub", "العودة إلى مركز الذكاء")}</button>
    </div>
  );
}
