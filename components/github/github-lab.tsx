"use client";

import { FormEvent, useState } from "react";

type Repository = {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  default_branch: string;
  license: { spdx_id: string | null } | null;
  updated_at: string;
  topics?: string[];
};

type Commit = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
};

function parseRepository(value: string): { owner: string; repo: string } | null {
  const cleaned = value.trim().replace(/\.git$/i, "").replace(/\/$/, "");
  const match = cleaned.match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export default function GitHubLab({ isArabic }: { isArabic: boolean }) {
  const [input, setInput] = useState("");
  const [repository, setRepository] = useState<Repository | null>(null);
  const [readme, setReadme] = useState("");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [readmeMissing, setReadmeMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = (en: string, ar: string) => isArabic ? ar : en;

  async function inspect(event: FormEvent) {
    event.preventDefault();
    const parsed = parseRepository(input);
    if (!parsed) {
      setError(t("Enter a public GitHub repository as owner/name or a GitHub URL.", "أدخل مستودع GitHub عام بصيغة owner/name أو رابطه."));
      return;
    }
    setBusy(true);
    setError("");
    setRepository(null);
    setReadme("");
    setCommits([]);
    setReadmeMissing(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
      const headers = { Accept: "application/vnd.github+json" };
      const response = await fetch(base, { headers, signal: controller.signal });
      if (!response.ok) {
        if (response.status === 404) throw new Error(t("Repository not found or not public.", "المستودع غير موجود أو ليس عاماً."));
        if (response.status === 403 || response.status === 429) throw new Error(t("GitHub rate limit reached. Wait a little and try again.", "وصلت إلى حد طلبات GitHub. انتظر قليلاً ثم حاول مجدداً."));
        throw new Error(t("GitHub could not load this repository.", "تعذر تحميل المستودع من GitHub."));
      }
      const repoData = (await response.json()) as Repository;
      setRepository(repoData);

      const [readmeResponse, commitsResponse] = await Promise.all([
        fetch(`${base}/readme`, { headers, signal: controller.signal }),
        fetch(`${base}/commits?per_page=5`, { headers, signal: controller.signal }),
      ]);
      if (readmeResponse.ok) {
        const file = (await readmeResponse.json()) as { content?: string; encoding?: string };
        if (file.content && file.encoding === "base64") {
          const binary = atob(file.content.replace(/\s/g, ""));
          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
          setReadme(new TextDecoder().decode(bytes).slice(0, 18000));
        } else setReadmeMissing(true);
      } else setReadmeMissing(true);
      if (commitsResponse.ok) {
        const data = (await commitsResponse.json()) as Commit[];
        if (Array.isArray(data)) setCommits(data.slice(0, 5));
      }
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError"
        ? t("GitHub took too long to respond. Try again.", "استغرق GitHub وقتاً طويلاً للرد. حاول مجدداً.")
        : cause instanceof Error ? cause.message : t("Could not inspect repository.", "تعذر فحص المستودع."));
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  return (
    <div className="hub-layout github-lab">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("READ-ONLY REPOSITORY INSPECTOR", "فاحص المستودعات للقراءة فقط")}</div>
          <h1>{t("Explore a GitHub project.", "استكشف مشروعاً على GitHub.")}</h1>
          <p>{t("Start with a public repository. Private repository access and code changes will require a secure GitHub connection.", "ابدأ بمستودع عام. الوصول للمستودعات الخاصة وتعديل الكود يحتاج ربط GitHub آمن.")}</p>
        </div>
      </div>
      <form className="project-form github-search-form" onSubmit={inspect}>
        <label>{t("Repository", "المستودع")}
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="vercel/next.js" required />
        </label>
        <div className="project-form-actions">
          <span className="settings-note">{t("Public repositories only · No GitHub token required", "المستودعات العامة فقط · لا يحتاج رمز GitHub")}</span>
          <button className="project-primary" type="submit" disabled={busy || !input.trim()}>{busy ? t("Inspecting…", "جارٍ الفحص…") : t("Inspect repository", "افحص المستودع")}</button>
        </div>
      </form>
      {error && <p className="notice" role="alert">{error}</p>}
      {repository && (
        <section className="settings-card">
          <div className="eyebrow">{t("REPOSITORY OVERVIEW", "نظرة عامة على المستودع")}</div>
          <h2>{repository.full_name}</h2>
          <p>{repository.description || t("No description provided.", "لم يُضف وصف للمستودع.")}</p>
          <div className="github-stats">
            <span>★ {repository.stargazers_count.toLocaleString()}</span>
            <span>⑂ {repository.forks_count.toLocaleString()}</span>
            <span>{repository.language || t("Language unknown", "اللغة غير محددة")}</span>
            <span>{t("Default branch", "الفرع الافتراضي")}: {repository.default_branch}</span>
            <span>{t("License", "الرخصة")}: {repository.license?.spdx_id || t("Not specified", "غير محددة")}</span>
          </div>
          {repository.topics && repository.topics.length > 0 && <div className="github-stats">{repository.topics.slice(0, 8).map((topic) => <span key={topic}>#{topic}</span>)}</div>}
          <p className="settings-note">{t("Last updated", "آخر تحديث")}: {new Date(repository.updated_at).toLocaleString(isArabic ? "ar" : "en")}</p>
          <a className="project-primary github-open-link" href={repository.html_url} target="_blank" rel="noreferrer">{t("Open on GitHub", "افتح على GitHub")} ↗</a>
          {readme && <div className="github-readme"><h3>README</h3><pre>{readme}</pre></div>}
          {readmeMissing && <p className="settings-note">{t("No README was found in the default branch.", "لم نعثر على ملف README في الفرع الافتراضي.")}</p>}
          {commits.length > 0 && <div className="github-readme"><h3>{t("Recent commits", "آخر التحديثات")}</h3><ul>{commits.map((commit) => <li key={commit.sha}><a href={commit.html_url} target="_blank" rel="noreferrer">{commit.commit.message.split("\n")[0].slice(0, 140)}</a><p className="settings-note">{commit.commit.author?.name || t("Unknown author", "مؤلف غير معروف")} · {commit.commit.author?.date ? new Date(commit.commit.author.date).toLocaleDateString(isArabic ? "ar" : "en") : ""} · {commit.sha.slice(0, 7)}</p></li>)}</ul></div>}
        </section>
      )}
      <p className="footnote">{t("This GitHub Lab reads public repository metadata, topics, README previews, and recent commit history. It does not clone code, execute scripts, access private repositories, or modify anything.", "يقرأ مختبر GitHub بيانات المستودع العام والوسوم ومعاينة README وآخر التحديثات. لا يستنسخ الكود ولا يشغّل ملفات ولا يصل للمستودعات الخاصة ولا يعدّل شيئاً.")}</p>
    </div>
  );
}
