"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const suggestions = ["시공 사진은 어떻게 등록해요?", "시공자에게 현장을 어떻게 배정해요?", "고객 견적은 어디에서 봐요?"];

export default function HelpChat() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, loading]);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text = question) {
    const value = text.trim();
    if (!value || loading) return;
    const history = messages.slice(-6);
    setQuestion("");
    setMessages((current) => [...current, { role: "user", content: value }]);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("관리자로 다시 로그인해주세요.");
      const response = await fetch("/api/admin/help-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ question: value, history }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "답변을 가져오지 못했습니다.");
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
    } catch (error) {
      if (error.name !== "AbortError") setMessages((current) => [...current, { role: "assistant", content: error.message }]);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 1000, fontFamily: "inherit" }}>
      {open && (
        <section aria-label="앱 기능 안내 챗봇" style={{ width: "min(390px, calc(100vw - 32px))", height: "min(560px, calc(100dvh - 100px))", background: "#fff", border: "1px solid #d1d5db", borderRadius: 16, boxShadow: "0 12px 40px #0f172a33", display: "flex", flexDirection: "column", marginBottom: 10, overflow: "hidden" }}>
          <header style={{ padding: "14px 16px", background: "#111827", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>앱 사용 안내</strong>
            <button type="button" aria-label="챗봇 닫기" onClick={() => setOpen(false)} style={{ color: "#fff", background: "transparent", border: 0, fontSize: 22, cursor: "pointer" }}>×</button>
          </header>
          <div role="log" aria-live="polite" style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {!messages.length && <>
              <p style={{ margin: 0, lineHeight: 1.5, fontSize: 14 }}>이 앱의 기능이나 사용 방법을 자연스럽게 물어보세요. 계정의 비밀번호나 고객 개인정보는 입력하지 마세요.</p>
              {suggestions.map((item) => <button key={item} type="button" onClick={() => send(item)} style={{ textAlign: "left", padding: 10, border: "1px solid #cbd5e1", borderRadius: 10, background: "#f8fafc", color: "#111827", cursor: "pointer" }}>{item}</button>)}
            </>}
            {messages.map((message, index) => <div key={index} style={{ alignSelf: message.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%", padding: "10px 12px", borderRadius: 12, background: message.role === "user" ? "#dbeafe" : "#f1f5f9", color: "#111827", whiteSpace: "pre-wrap", lineHeight: 1.55, fontSize: 14 }}>{message.content}</div>)}
            {loading && <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>답변을 작성하고 있습니다...</p>}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={(event) => { event.preventDefault(); send(); }} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e5e7eb" }}>
            <input aria-label="앱 기능 질문" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} placeholder="예: 현장 배정은 어떻게 해요?" style={{ minWidth: 0, flex: 1, border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 8px", fontSize: 14 }} />
            <button type="submit" disabled={loading || !question.trim()} style={{ border: 0, borderRadius: 8, padding: "0 14px", color: "white", background: "#111827", opacity: loading || !question.trim() ? 0.5 : 1, cursor: "pointer" }}>전송</button>
          </form>
        </section>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "앱 사용 안내 닫기" : "앱 사용 안내 챗봇 열기"} style={{ float: "right", padding: "12px 16px", border: 0, borderRadius: 24, background: "#111827", color: "white", boxShadow: "0 4px 16px #0f172a33", fontWeight: 700, cursor: "pointer" }}>💬 앱 사용 안내</button>
    </div>
  );
}
