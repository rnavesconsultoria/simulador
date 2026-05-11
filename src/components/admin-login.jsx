"use client";

import { useState } from "react";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, next: "/admin" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Não consegui enviar o link.");
      }
      setDevCode(payload?.developmentCodePreview ?? "");
      setStatus("sent");
    } catch (err) {
      setError(err.message ?? "Erro inesperado.");
      setStatus("error");
    }
  }

  return (
    <div className="admin-login-shell">
      <main className="admin-login-card">
        <div className="admin-login-brand">
          <img src="/Logos/vertical-black.png" alt="R Naves Consultoria" />
        </div>
        <div className="admin-login-eyebrow">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Acesso administrativo
        </div>
        <h1>Painel do simulador</h1>
        <p className="admin-login-lead">
          Restrito à equipe administrativa. Digite seu e-mail e enviaremos um link de acesso por
          e-mail. Ao clicar, você entra direto no dashboard.
        </p>

        {status === "sent" ? (
          <div className="admin-login-confirm" role="status">
            <strong>Link enviado.</strong> Verifique sua caixa de entrada (e o spam) e clique no
            botão <em>Entrar no simulador</em>. O link vale por 15 minutos.
            {devCode ? (
              <div className="admin-login-devcode">
                Código dev: <strong>{devCode}</strong>
              </div>
            ) : null}
            <button
              type="button"
              className="admin-login-resend"
              onClick={() => {
                setStatus("idle");
                setDevCode("");
              }}
            >
              Enviar de novo
            </button>
          </div>
        ) : (
          <form className="admin-login-form" onSubmit={handleSubmit}>
            <label>
              <span>E-mail administrativo</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="voce@rnavesconsultoria.com.br"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={status === "sending"}
                required
                autoFocus
              />
            </label>
            {error ? <div className="admin-login-error">{error}</div> : null}
            <button
              type="submit"
              className="admin-login-submit"
              disabled={status === "sending" || !email.trim()}
            >
              {status === "sending" ? "Enviando…" : "Enviar link de acesso"}
            </button>
          </form>
        )}

        <p className="admin-login-footer">
          Não tem acesso administrativo? Use a página principal do simulador em{" "}
          <a href="/">simulador.rnavesconsultoria.com.br</a>.
        </p>
      </main>
    </div>
  );
}
