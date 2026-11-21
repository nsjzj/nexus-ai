"use client";

/* eslint-disable react-hooks/set-state-in-effect -- hydrate browser-only workflow storage. */

import { FormEvent, useEffect, useState } from "react";

type Workflow = { id: string; name: string; prompt: string; updatedAt: number };
type Run = { id: string; workflowName: string; status: "success" | "failed"; output: string; createdAt: number };
const WORKFLOWS_KEY = "nexus-ai-workflows-v1";
const RUNS_KEY = "nexus-ai-workflow-runs-v1";
const isWorkflow = (value: unknown): value is Workflow => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.name === "string" &&
    typeof item.prompt === "string" && typeof item.updatedAt === "number";
};
const isRun = (value: unknown): value is Run => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.workflowName === "string" &&
    (item.status === "success" || item.status === "failed") &&
    typeof item.output === "string" && typeof item.createdAt === "number";
};

export default function AutomationLab({ isArabic }: { isArabic: boolean }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const t = (en: string, ar: string) => isArabic ? ar : en;

  useEffect(() => {
    try {
      const savedWorkflows: unknown = JSON.parse(localStorage.getItem(WORKFLOWS_KEY) || "[]");
      const savedRuns: unknown = JSON.parse(localStorage.getItem(RUNS_KEY) || "[]");
      setWorkflows(Array.isArray(savedWorkflows) ? savedWorkflows.filter(isWorkflow).slice(0, 50) : []);
      setRuns(Array.isArray(savedRuns) ? savedRuns.filter(isRun).slice(0, 30) : []);
    } catch {
      setWorkflows([]);
      setRuns([]);
      setNotice("Saved workflows could not be read. You can create them again.");
    }
  }, []);

  function saveWorkflows(next: Workflow[]) {
    setWorkflows(next);
    try { localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(next)); }
    catch { setNotice(t("Browser storage is unavailable. Changes may not survive closing this tab.", "تخزين المتصفح غير متاح؛ قد لا تبقى التغييرات بعد إغلاق الصفحة.")); }
  }
  function saveRuns(next: Run[]) {
    setRuns(next);
    try { localStorage.setItem(RUNS_KEY, JSON.stringify(next)); } catch { /* Keep current-session history visible. */ }
  }
  function createWorkflow(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanPrompt = prompt.trim();
    if (!cleanName || !cleanPrompt) return;
    saveWorkflows([{ id: crypto.randomUUID(), name: cleanName.slice(0, 60), prompt: cleanPrompt.slice(0, 6000), updatedAt: Date.now() }, ...workflows].slice(0, 50));
    setName("");
    setPrompt("");
    setShowForm(false);
    setNotice("");
  }

  async function runWorkflow(workflow: Workflow) {
    if (runningId) return;
    setRunningId(workflow.id);
    setNotice("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: workflow.prompt }] }),
        signal: AbortSignal.timeout(65_000),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || t("The workflow could not run.", "تعذر تشغيل مسار العمل."));
      }
      let output = "";
      if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";
          for (const event of events) {
            const data = event.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
            if (!data || data === "[DONE]") continue;
            const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === "string") output += delta;
          }
          if (done) break;
        }
        if (buffer.trim()) {
          const data = buffer.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
          if (data && data !== "[DONE]") {
            const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === "string") output += delta;
          }
        }
      } else {
        const data = await response.json() as { message?: { content?: unknown } };
        if (typeof data.message?.content === "string") output = data.message.content;
      }
      if (!output.trim()) throw new Error(t("The AI provider returned an empty response.", "مزوّد الذكاء الاصطناعي أعاد إجابة فارغة."));
      const run: Run = { id: crypto.randomUUID(), workflowName: workflow.name, status: "success", output, createdAt: Date.now() };
      saveRuns([run, ...runs].slice(0, 30));
      setSelectedRun(run);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("Unknown workflow error.", "حدث خطأ غير معروف.");
      const run: Run = { id: crypto.randomUUID(), workflowName: workflow.name, status: "failed", output: message.slice(0, 2000), createdAt: Date.now() };
      saveRuns([run, ...runs].slice(0, 30));
      setSelectedRun(run);
      setNotice(message);
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="hub-layout automation-lab">
      <div className="page-heading">
        <div><div className="eyebrow">{t("REUSABLE AI WORKFLOWS", "مسارات ذكاء اصطناعي قابلة لإعادة الاستخدام")}</div>
          <h1>{t("Automate repeatable thinking.", "خلّ المهام المتكررة أسهل.")}</h1>
          <p>{t("Save a prompt once, then run it whenever you need it. Each run is started manually and recorded here.", "احفظ تعليماتك مرة وشغّلها وقت ما تحتاج. كل تشغيل يدوي وتُحفظ نتيجته هنا.")}</p>
        </div>
        <button className="project-primary" onClick={() => setShowForm(value => !value)}>{showForm ? t("Close", "إغلاق") : t("＋ New workflow", "＋ مسار جديد")}</button>
      </div>

      <div className="automation-notice">{t("Manual runs only · No background scheduler is connected yet · AI provider usage limits and costs may apply.", "تشغيل يدوي فقط · لا يوجد مجدول يعمل في الخلفية حالياً · قد تنطبق حدود وتكاليف مزوّد الذكاء الاصطناعي.")}</div>
      {showForm && <form className="project-form" onSubmit={createWorkflow}>
        <label>{t("Workflow name", "اسم المسار")}<input value={name} onChange={event => setName(event.target.value)} maxLength={60} required placeholder={t("e.g. Summarize meeting notes", "مثلاً: تلخيص ملاحظات اجتماع")} /></label>
        <label>{t("Instructions for the AI", "تعليمات الذكاء الاصطناعي")}<textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={6000} rows={6} required placeholder={t("Describe the task and the format you want…", "اشرح المهمة والتنسيق المطلوب...")} /></label>
        <div className="project-form-actions"><button type="button" className="back-button" onClick={() => setShowForm(false)}>{t("Cancel", "إلغاء")}</button><button type="submit" className="project-primary" disabled={!name.trim() || !prompt.trim()}>{t("Save workflow", "حفظ المسار")}</button></div>
      </form>}

      {notice && <p className="notice" role="alert">{notice}</p>}
      <div className="automation-section-title"><h2>{t("Your workflows", "مساراتك")}</h2><span>{workflows.length}/50</span></div>
      {workflows.length === 0 ? <div className="project-empty"><div className="placeholder-icon">↻</div><h2>{t("No workflows yet", "ما عندك مسارات بعد")}</h2><p>{t("Create a reusable AI task to get started.", "أنشئ مهمة ذكاء اصطناعي قابلة لإعادة الاستخدام للبدء.")}</p></div> :
        <div className="automation-list">{workflows.map(workflow => <article className="automation-card" key={workflow.id}>
          <div><h3>{workflow.name}</h3><p>{workflow.prompt}</p><small>{new Date(workflow.updatedAt).toLocaleString(isArabic ? "ar" : "en")}</small></div>
          <div className="automation-actions"><button className="project-primary" disabled={!!runningId} onClick={() => void runWorkflow(workflow)}>{runningId === workflow.id ? t("Running…", "جارٍ التشغيل…") : t("▶ Run now", "▶ شغّل الآن")}</button><button className="danger-text" onClick={() => { if (window.confirm(t("Delete this workflow?", "تحذف هذا المسار؟"))) saveWorkflows(workflows.filter(item => item.id !== workflow.id)); }}>{t("Delete", "حذف")}</button></div>
        </article>)}</div>}
      <div className="automation-section-title"><h2>{t("Run history", "سجل التشغيل")}</h2><button className="back-button" onClick={() => { if (window.confirm(t("Clear run history?", "تمسح سجل التشغيل؟"))) { saveRuns([]); setSelectedRun(null); } }} disabled={!runs.length}>{t("Clear history", "مسح السجل")}</button></div>
      {runs.length === 0 ? <p className="muted">{t("Completed and failed runs will appear here.", "ستظهر هنا عمليات التشغيل الناجحة والفاشلة.")}</p> :
        <div className="automation-history">{runs.map(run => <button key={run.id} className="automation-history-row" onClick={() => setSelectedRun(run)}><span className={run.status === "success" ? "automation-success" : "automation-failed"}>{run.status === "success" ? "✓" : "!"}</span><span><strong>{run.workflowName}</strong><small>{new Date(run.createdAt).toLocaleString(isArabic ? "ar" : "en")}</small></span><span>{t("View result", "عرض النتيجة")}</span></button>)}</div>}
      {selectedRun && <div className="automation-result"><div className="automation-section-title"><h2>{selectedRun.workflowName}</h2><button className="back-button" onClick={() => setSelectedRun(null)}>{t("Close", "إغلاق")}</button></div><p className={selectedRun.status === "success" ? "automation-success" : "automation-failed"}>{selectedRun.status === "success" ? t("Completed", "اكتمل") : t("Failed", "فشل")}</p><pre>{selectedRun.output}</pre></div>}
      <p className="footnote">{t("Workflows and run history are stored in this browser only. Do not include passwords, API keys, or private credentials in prompts.", "تُحفظ المسارات وسجل التشغيل في هذا المتصفح فقط. لا تضع كلمات مرور أو مفاتيح API أو بيانات سرية في التعليمات.")}</p>
    </div>
  );
}
