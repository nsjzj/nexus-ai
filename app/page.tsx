"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import ProjectWorkspace from "@/components/projects/project-workspace";
import AuthPanel from "@/components/auth/auth-panel";
import GitHubLab from "@/components/github/github-lab";
import { createClient } from "@/lib/supabase/client";

type Section = "hub" | "projects" | "github" | "automations" | "settings";
type SavedConversation = { id: string; title: string; messages: ChatMessage[]; updatedAt: number };

function isSavedConversation(value: unknown): value is SavedConversation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.updatedAt === "number" &&
    Array.isArray(item.messages) &&
    item.messages.every((message) =>
      !!message &&
      typeof message === "object" &&
      ["system", "user", "assistant"].includes((message as Record<string, unknown>).role as string) &&
      typeof (message as Record<string, unknown>).content === "string"
    );
}

const STORAGE_KEY = "nexus-ai-conversations-v1";
const labels: Record<Section, { en: string; ar: string; icon: string }> = {
  hub: { en: "AI Hub", ar: "مركز الذكاء", icon: "✳" },
  projects: { en: "Projects", ar: "المشاريع", icon: "▦" },
  github: { en: "GitHub Lab", ar: "مختبر GitHub", icon: "⌘" },
  automations: { en: "Automations", ar: "الأتمتة", icon: "↗" },
  settings: { en: "Settings", ar: "الإعدادات", icon: "⚙" },
};

const welcome: ChatMessage = {
  role: "assistant",
  content: "Welcome to NEXUS AI. Your workspace is ready. Connect an AI provider in the project environment to start chatting.",
};

export default function Home() {
  const [section, setSection] = useState<Section>("hub");
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isArabic = language === "ar";

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(isSavedConversation)) {
          setConversations(parsed);
          if (parsed[0]?.messages.length) {
            setActiveConversationId(parsed[0].id);
            setMessages(parsed[0].messages);
          }
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ }
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
    }).catch(() => {
      if (active) setCloudReady(true);
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
    // Clear the previous account's visible history immediately on account changes.
    setConversations([]);
    setActiveConversationId(null);
    setMessages([welcome]);
    if (!userId) {
      setCloudReady(true);
      return;
    }
    let active = true;
    setCloudReady(false);
    void (async () => {
      try {
        const supabase = createClient();
        const { data: rows, error } = await supabase
          .from("conversations")
          .select("id,title,updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(30);
        if (error) throw error;
        const ids = (rows ?? []).map((row) => row.id);
        const messageRows = ids.length
          ? await supabase.from("messages")
              .select("conversation_id,role,content,created_at")
              .eq("user_id", userId)
              .in("conversation_id", ids)
              .order("created_at", { ascending: true })
          : { data: [], error: null };
        if (messageRows.error) throw messageRows.error;
        const cloudItems: SavedConversation[] = (rows ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          updatedAt: new Date(row.updated_at).getTime(),
          messages: (messageRows.data ?? [])
            .filter((message) => message.conversation_id === row.id)
            .map((message) => ({ role: message.role as "user" | "assistant", content: message.content })),
        })).filter((item) => item.messages.length > 0);
        if (!active) return;
        setConversations(cloudItems);
        try { localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(cloudItems)); } catch { /* Cloud remains the source of truth. */ }
        if (cloudItems[0]) {
          setActiveConversationId(cloudItems[0].id);
          setMessages(cloudItems[0].messages);
        } else {
          setActiveConversationId(null);
          setMessages([welcome]);
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error
          ? copy("Cloud chat sync failed: ", "تعذرت مزامنة المحادثات: ") + error.message
          : copy("Cloud chat sync failed.", "تعذرت مزامنة المحادثات."));
      } finally {
        if (active) setCloudReady(true);
      }
    })();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  function persist(next: SavedConversation[]) {
    setConversations(next);
    try {
      localStorage.setItem(userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY, JSON.stringify(next));
    } catch {
      setNotice(copy(
        "This conversation is available until you close this tab, but browser storage is unavailable.",
        "المحادثة متاحة إلى أن تغلق علامة التبويب، لكن التخزين في المتصفح غير متاح."
      ));
    }
  }

  async function syncConversation(item: SavedConversation) {
    if (!userId) return;
    try {
      const supabase = createClient();
      const { error: conversationError } = await supabase.from("conversations").upsert({
        id: item.id,
        user_id: userId,
        title: item.title.slice(0, 160) || "New conversation",
        updated_at: new Date(item.updatedAt).toISOString(),
      }, { onConflict: "id" });
      if (conversationError) throw conversationError;

      const { error: deleteError } = await supabase.from("messages")
        .delete().eq("conversation_id", item.id).eq("user_id", userId);
      if (deleteError) throw deleteError;

      if (item.messages.length) {
        const { error: insertError } = await supabase.from("messages").insert(
          item.messages.filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => ({
              conversation_id: item.id,
              user_id: userId,
              role: message.role,
              content: message.content.slice(0, 12000),
            }))
        );
        if (insertError) throw insertError;
      }
    } catch (error) {
      setNotice(error instanceof Error
        ? copy("Saved on this device; cloud sync failed: ", "حُفظت على الجهاز وتعذرت المزامنة: ") + error.message
        : copy("Saved on this device; cloud sync failed.", "حُفظت على الجهاز وتعذرت المزامنة."));
    }
  }

  function saveConversation(nextMessages: ChatMessage[]) {
    const firstUser = nextMessages.find((message) => message.role === "user")?.content || "New conversation";
    const id = activeConversationId || crypto.randomUUID();
    const item: SavedConversation = {
      id,
      title: firstUser.slice(0, 42),
      messages: nextMessages,
      updatedAt: Date.now(),
    };
    setActiveConversationId(id);
    persist([item, ...conversations.filter((conversation) => conversation.id !== id)].slice(0, 30));
    void syncConversation(item);
  }

  function newChat() {
    setActiveConversationId(null);
    setMessages([welcome]);
    setInput("");
    setNotice("");
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy || !cloudReady) return;

    const nextMessages: ChatMessage[] = [...messages.filter((m) => m !== welcome), { role: "user", content: text }];
    setMessages([...nextMessages]);
    setInput("");
    setBusy(true);
    setNotice("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      let data: { message?: ChatMessage; error?: string };
      try {
        data = (await response.json()) as { message?: ChatMessage; error?: string };
      } catch {
        throw new Error("The server returned an invalid response. Please try again.");
      }
      if (!response.ok || !data.message) throw new Error(data.error || "Something went wrong.");
      const completed = [...nextMessages, data.message];
      setMessages(completed);
      saveConversation(completed);
    } catch (error) {
      saveConversation(nextMessages);
      setNotice(error instanceof Error ? error.message : "Could not send the message.");
    } finally {
      setBusy(false);
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function openConversation(item: SavedConversation) {
    setActiveConversationId(item.id);
    setMessages(item.messages);
    setSection("hub");
    setNotice("");
  }

  const copy = (en: string, ar: string) => (isArabic ? ar : en);

  return (
    <main className={`shell ${isArabic ? "rtl" : ""}`} dir={isArabic ? "rtl" : "ltr"}>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setSection("hub"); }}>
          <span className="brand-mark">N</span>
          <span><strong>NEXUS</strong><small>AI WORKSPACE</small></span>
        </a>
        <button className="new-chat" onClick={newChat}><span>＋</span>{copy("New conversation", "محادثة جديدة")}</button>
        <div className="nav-label">{copy("WORKSPACE", "مساحة العمل")}</div>
        <nav className="nav-list">
          {(Object.keys(labels) as Section[]).map((key) => (
            <button key={key} className={`nav-item ${section === key ? "active" : ""}`} onClick={() => setSection(key)}>
              <span className="nav-icon">{labels[key].icon}</span>{labels[key][language]}
              {key === "hub" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">{copy("RECENT", "الأخيرة")}</div>
          {conversations.slice(0, 5).map((item) => (
            <button className="recent-item" key={item.id} onClick={() => openConversation(item)} title={item.title}>
              <span>◷</span><span className="recent-title">{item.title}</span>
            </button>
          ))}
          {conversations.length === 0 && <p className="muted small">{copy("Your chats will appear here.", "ستظهر محادثاتك هنا.")}</p>}
          <div className="profile">
            <div className="avatar">N</div>
            <div><strong>{userId ? copy("Connected account", "حساب متصل") : copy("NEXUS User", "مستخدم NEXUS")}</strong><small>{userId ? copy("Cloud sync enabled", "المزامنة السحابية مفعّلة") : copy("Personal workspace", "مساحة شخصية")}</small></div>
            <span className="profile-menu">•••</span>
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs"><span>NEXUS</span><b>/</b><strong>{labels[section][language]}</strong></div>
          <div className="top-actions">
            <span className="connection"><i />{copy("Workspace ready", "مساحة العمل جاهزة")}</span>
            <button className="language-button" onClick={() => setLanguage(isArabic ? "en" : "ar")}>{isArabic ? "EN" : "عربي"}</button>
          </div>
        </header>

        {section === "projects" ? (
          <ProjectWorkspace isArabic={isArabic} onBack={() => setSection("hub")} />
        ) : section === "settings" ? (
          <div className="hub-layout">
            <div className="page-heading">
              <div><div className="eyebrow">{copy("WORKSPACE PREFERENCES", "تفضيلات مساحة العمل")}</div>
                <h1>{copy("Settings and account.", "الإعدادات والحساب.")}</h1>
                <p>{copy("Manage your account connection and prepare for cloud features.", "أدر اتصال حسابك واستعد لميزات السحابة.")}</p>
              </div>
            </div>
            <AuthPanel isArabic={isArabic} />
          </div>
        ) : section === "github" ? (
          <GitHubLab isArabic={isArabic} />
        ) : section === "hub" ? (
          <div className="hub-layout">
            <div className="page-heading">
              <div><div className="eyebrow">{copy("YOUR AI WORKSPACE", "مساحة الذكاء الخاصة بك")}</div>
                <h1>{copy("One space. Many possibilities.", "مساحة واحدة، احتمالات كثيرة.")}</h1>
                <p>{copy("Think, create, and build with AI — without losing your context.", "فكّر وابتكر وابنِ باستخدام الذكاء الاصطناعي دون أن تفقد سياق عملك.")}</p>
              </div>
              <div className="model-pill"><span className="model-spark">✳</span><span><small>{copy("ACTIVE PROVIDER", "المزوّد الحالي")}</small><strong>OpenAI-compatible</strong></span><span className="chevron">⌄</span></div>
            </div>

            <div className="chat-card">
              <div className="chat-header"><div><span className="live-dot" />{copy("NEXUS ASSISTANT", "مساعد NEXUS")}<span className="chat-subtitle">{copy("Private workspace", "مساحة خاصة")}</span></div><button className="icon-button" onClick={newChat} title="New chat">＋</button></div>
              {!cloudReady && <div className="settings-note">{copy("Connecting your chat history…", "جارٍ الاتصال بسجل محادثاتك…")}</div>}
              <div className="messages">
                {messages.map((message, index) => (
                  <div className={`message-row ${message.role === "user" ? "user-row" : ""}`} key={index}>
                    {message.role === "assistant" && <div className="message-avatar">N</div>}
                    <div className={`message-bubble ${message.role === "user" ? "user-bubble" : ""}`}>
                      <div className="message-author">{message.role === "user" ? copy("YOU", "أنت") : "NEXUS AI"}</div>
                      <p>{message.content}</p>
                    </div>
                  </div>
                ))}
                {busy && <div className="typing"><span /><span /><span />{copy("NEXUS is thinking", "NEXUS يفكر")}</div>}
                <div ref={bottomRef} />
              </div>
              {notice && <div className="notice" role="alert">{notice}</div>}
              <form className="composer" onSubmit={sendMessage}>
                <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onComposerKeyDown} placeholder={!cloudReady ? copy("Loading your secure chat history…", "جارٍ تحميل سجل محادثاتك...") : copy("Message NEXUS AI…", "اكتب رسالتك إلى NEXUS AI…")} rows={2} />
                <div className="composer-footer"><span>{copy("Enter to send · Shift + Enter for a new line", "Enter للإرسال · Shift + Enter لسطر جديد")}</span><button className="send-button" type="submit" disabled={!input.trim() || busy || !cloudReady}>{busy ? "…" : "↑"}</button></div>
              </form>
            </div>
            <div className="quick-prompts">
              <button onClick={() => setInput(copy("Help me plan a new project.", "ساعدني في تخطيط مشروع جديد."))}>✧ {copy("Plan a project", "خطّط لمشروع")}</button>
              <button onClick={() => setInput(copy("Explain a difficult concept simply.", "اشرح لي مفهوماً صعباً ببساطة."))}>⌁ {copy("Learn something", "تعلّم شيئاً")}</button>
              <button onClick={() => setInput(copy("Review this code and suggest improvements.", "راجع هذا الكود واقترح تحسينات."))}>⌘ {copy("Review code", "راجع كوداً")}</button>
            </div>
            <p className="footnote">{userId ? copy("Your conversations sync to your account. AI can make mistakes; review important information.", "تتزامن محادثاتك مع حسابك. قد يخطئ الذكاء الاصطناعي؛ راجع المعلومات المهمة.") : copy("Conversations are saved on this device. Sign in to enable cloud sync.", "تُحفظ المحادثات على هذا الجهاز. سجّل الدخول لتفعيل المزامنة السحابية.")}</p>
          </div>
        ) : (
          <div className="placeholder-page">
            <div className="placeholder-icon">{labels[section].icon}</div>
            <div className="eyebrow">{copy("COMING IN THE NEXT BUILD", "في الإصدار القادم")}</div>
            <h1>{labels[section][language]}</h1>
            <p>{section === "projects" ? copy("A home for your files, notes, and project-specific AI context.", "مكان لملفاتك وملاحظاتك وسياق الذكاء الاصطناعي لكل مشروع.") : section === "github" ? copy("Repository insights, code reviews, and safe branch-based changes.", "تحليل المستودعات ومراجعة الكود والتعديلات الآمنة عبر الفروع.") : section === "automations" ? copy("Build repeatable multi-step workflows with approval checkpoints.", "أنشئ مهاماً متسلسلة قابلة للتكرار مع نقاط موافقة.") : copy("Manage your language, AI provider, and workspace preferences.", "تحكّم باللغة ومزوّد الذكاء وتفضيلات مساحة العمل.")}</p>
            <span className="coming-pill"><i />{copy("Foundation phase", "مرحلة التأسيس")}</span>
            <button className="back-button" onClick={() => setSection("hub")}>{copy("Back to AI Hub", "العودة إلى مركز الذكاء")}</button>
          </div>
        )}
      </section>
    </main>
  );
}