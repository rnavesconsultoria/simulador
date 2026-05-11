"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "rnaves.simulator.session";

export function MagicLinkVerifier() {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Validando seu acesso…");

  useEffect(() => {
    const url = new URL(window.location.href);
    const email = url.searchParams.get("email");
    const code = url.searchParams.get("code");
    const next = url.searchParams.get("next") || "/";

    if (!email || !code) {
      setStatus("error");
      setMessage("Link inválido ou incompleto. Volte ao simulador e tente de novo.");
      return;
    }

    async function verify() {
      try {
        const response = await fetch("/api/auth/verify-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "Não foi possível validar o link.");
        }
        try {
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              sessionToken: payload.sessionToken,
              expiresAt: payload.sessionExpiresAt
            })
          );
        } catch {
          /* private mode / quota — non-fatal */
        }
        setStatus("ok");
        setMessage("Tudo certo! Redirecionando…");
        setTimeout(() => {
          window.location.replace(next);
        }, 400);
      } catch (err) {
        setStatus("error");
        setMessage(err.message ?? "Erro ao validar o link.");
      }
    }

    verify();
  }, []);

  return (
    <div className="magic-verifier">
      <div className="magic-verifier-card">
        <img
          src="/Logos/vertical-white.svg"
          alt="R Naves Consultoria"
          className="magic-verifier-logo"
        />
        <h1>
          {status === "loading"
            ? "Validando seu acesso…"
            : status === "ok"
              ? "Pronto!"
              : "Não consegui validar"}
        </h1>
        <p className={status === "error" ? "magic-verifier-error" : "magic-verifier-msg"}>
          {message}
        </p>
        {status === "error" ? (
          <a href="/" className="magic-verifier-link">
            Voltar ao simulador
          </a>
        ) : null}
      </div>
    </div>
  );
}
