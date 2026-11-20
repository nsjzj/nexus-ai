"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/ai/types";

type Section = "hub" | "projects" | "github" | "automations" | "settings";
type SavedConversation = { id: string; title: string; messages: ChatMessage[]; updatedAt: number };

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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const isArabic = language === "ar";

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SavedConversation[];
        setConversations(parsed);
        if (parsed[0]?.messages?.length) setMessages(parsed[0].messages);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  function persist(next: SavedConversation[]) {
    setConversations(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function saveConversation(nextMessages: ChatMessage[]) {
    const firstUser = nextMessages.find((message) => message.role === "user")?.content || "New conversation";
    const item: SavedConversation = {
      id: crypto.randomUUID(),
      title: firstUser.slice(0, 42),
      messages: nextMessages,
      updatedAt: Date.now(),
    };
    persist([item, ...conversations].slice(0, 30));
  }

  function newChat() {
    setMessages([welcome]);
    setInput("");
    setNotice("");
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

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
      const data = (await response.json()) as { message?: ChatMessage; error?: string };
      if (!response.ok || !data.message) throw new Error(data.error || "Something went wrong.");
      const completed = [...nextMessages, data.message];
      setMessages(completed);
      saveConversation(completed);
    } catch (error) {
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
            <div><strong>NEXUS User</strong><small>{copy("Personal workspace", "مساحة شخصية")}</small></div>
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

        {section === "hub" ? (
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
                <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onComposerKeyDown} placeholder={copy("Message NEXUS AI…", "اكتب رسالتك إلى NEXUS AI…")} rows={2} />
                <div className="composer-footer"><span>{copy("Enter to send · Shift + Enter for a new line", "Enter للإرسال · Shift + Enter لسطر جديد")}</span><button className="send-button" type="submit" disabled={!input.trim() || busy}>{busy ? "…" : "↑"}</button></div>
              </form>
            </div>
            <div className="quick-prompts">
              <button onClick={() => setInput(copy("Help me plan a new project.", "ساعدني في تخطيط مشروع جديد."))}>✧ {copy("Plan a project", "خطّط لمشروع")}</button>
              <button onClick={() => setInput(copy("Explain a difficult concept simply.", "اشرح لي مفهوماً صعباً ببساطة."))}>⌁ {copy("Learn something", "تعلّم شيئاً")}</button>
              <button onClick={() => setInput(copy("Review this code and suggest improvements.", "راجع هذا الكود واقترح تحسينات."))}>⌘ {copy("Review code", "راجع كوداً")}</button>
            </div>
            <p className="footnote">{copy("AI can make mistakes. Review important information before acting.", "قد يخطئ الذكاء الاصطناعي. راجع المعلومات المهمة قبل العمل بها.")}</p>
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