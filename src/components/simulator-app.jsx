"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "rnaves.simulator.session";
const FEEDBACK_FIELDS = [
  { name: "realismScore", label: "Realismo" },
  { name: "challengeScore", label: "Desafio" },
  { name: "interactionQualityScore", label: "Interação" },
  { name: "feedbackUtilityScore", label: "Utilidade" },
  { name: "learningImpactScore", label: "Aprendizado" }
];

const initialState = {
  email: "",
  sessionToken: "",
  user: null,
  sessionId: "",
  scenario: null,
  report: null,
  healthOk: false,
  devCode: "",
  lastIntent: "",
  shouldEnd: false,
  activeRequest: "",
  feedbackSaved: false,
  bannerError: "",
  chatItems: [{ kind: "system", label: "", text: "Aguardando criação da simulação." }]
};

function loadStoredSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionToken) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistSession(session) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore quota / private mode */
  }
}

function clearStoredSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function apiRequest(path, options = {}, sessionToken = "") {
  const headers = new Headers(options.headers ?? {});
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const response = await fetch(path, { ...options, headers });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    /* empty body */
  }

  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? "Erro inesperado.");
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }

  return payload;
}

function StagePill({ ready, label }) {
  return <span className={`stage-pill ${ready ? "ready" : ""}`}>{label}</span>;
}

function RatingInput({ name, label, value, onChange, disabled }) {
  return (
    <fieldset className="rating-field" disabled={disabled}>
      <legend>{label}</legend>
      <div className="rating-options" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((score) => (
          <label key={score} className={`rating-option ${value === score ? "selected" : ""}`}>
            <input
              type="radio"
              name={name}
              value={score}
              checked={value === score}
              onChange={() => onChange(score)}
            />
            <span>{score}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SimulatorApp() {
  const [state, setState] = useState(initialState);
  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [feedbackScores, setFeedbackScores] = useState({
    realismScore: 0,
    challengeScore: 0,
    interactionQualityScore: 0,
    feedbackUtilityScore: 0,
    learningImpactScore: 0
  });
  const [feedbackComment, setFeedbackComment] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [dictationSupported, setDictationSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const chatLogRef = useRef(null);
  const composerRef = useRef(null);
  const recognitionRef = useRef(null);
  const dictationBaseRef = useRef("");

  const isBusy = (action) => state.activeRequest === action;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    setDictationSupported(!!Ctor);
    return () => {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  function joinDictation(base, incoming) {
    if (!base) return incoming;
    if (!incoming) return base;
    const needsSpace = !/\s$/.test(base) && !/^\s/.test(incoming);
    return base + (needsSpace ? " " : "") + incoming;
  }

  function toggleDictation() {
    if (isListening) {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        /* ignore */
      }
      return;
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    dictationBaseRef.current = messageInput;
    rec.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setMessageInput(joinDictation(dictationBaseRef.current, transcript));
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    setIsListening(true);
    try {
      rec.start();
    } catch {
      setIsListening(false);
    }
  }

  useEffect(() => {
    fetch("/api/health")
      .then((response) => setState((c) => ({ ...c, healthOk: response.ok })))
      .catch(() => setState((c) => ({ ...c, healthOk: false })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stored = loadStoredSession();
    if (!stored) {
      setHydrated(true);
      return;
    }

    apiRequest("/api/auth/me", { method: "GET" }, stored.sessionToken)
      .then((payload) => {
        if (cancelled) return;
        setState((c) => ({
          ...c,
          sessionToken: stored.sessionToken,
          user: payload.user,
          email: payload.user.email
        }));
      })
      .catch(() => {
        clearStoredSession();
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!chatLogRef.current) return;
    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [state.chatItems.length, state.activeRequest]);

  useEffect(() => {
    if (state.sessionId && composerRef.current) {
      composerRef.current.focus();
    }
  }, [state.sessionId]);

  const sessionStatus = state.user
    ? `${state.user.name} autenticado`
    : "Aguardando autenticação";

  const persona = state.scenario?.dynamic_block_json?.personagem;
  const simulationStatus = persona
    ? `${persona.nome} — ${persona.personalidade_nivel?.nivel ?? ""}`
    : state.sessionId
      ? "Simulação ativa"
      : "Nenhuma simulação ativa";

  const progress = useMemo(
    () => [
      { label: "Acesso liberado", ready: Boolean(state.sessionToken) },
      { label: "Simulação criada", ready: Boolean(state.sessionId) },
      { label: "Relatório gerado", ready: Boolean(state.report) },
      { label: "Feedback registrado", ready: state.feedbackSaved }
    ],
    [state.sessionToken, state.sessionId, state.report, state.feedbackSaved]
  );

  function setActiveRequest(value) {
    setState((c) => ({ ...c, activeRequest: value }));
  }

  function pushChatItem(item) {
    setState((c) => ({ ...c, chatItems: [...c.chatItems, item] }));
  }

  function showError(error) {
    setState((c) => ({ ...c, bannerError: error?.message ?? "Erro inesperado." }));
  }

  function clearError() {
    setState((c) => ({ ...c, bannerError: "" }));
  }

  async function handleRequestCode(event) {
    event.preventDefault();
    clearError();
    setActiveRequest("request-code");

    try {
      const payload = await apiRequest("/api/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ email: emailInput.trim() })
      });

      setState((c) => ({
        ...c,
        email: emailInput.trim(),
        devCode: payload.developmentCodePreview ?? ""
      }));
      pushChatItem({
        kind: "system",
        label: "",
        text: "Se o e-mail estiver cadastrado, um código foi enviado."
      });
    } catch (error) {
      showError(error);
    } finally {
      setActiveRequest("");
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();
    clearError();
    setActiveRequest("verify-code");

    try {
      const payload = await apiRequest("/api/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({
          email: state.email,
          code: codeInput.trim()
        })
      });

      persistSession({
        sessionToken: payload.sessionToken,
        expiresAt: payload.sessionExpiresAt
      });

      setState((c) => ({
        ...c,
        sessionToken: payload.sessionToken,
        user: payload.user,
        devCode: ""
      }));
      setCodeInput("");
      pushChatItem({
        kind: "system",
        label: "",
        text: `Sessão autenticada para ${payload.user.name}.`
      });
    } catch (error) {
      showError(error);
    } finally {
      setActiveRequest("");
    }
  }

  async function handleCreateSimulation() {
    clearError();
    setActiveRequest("create-simulation");

    try {
      const payload = await apiRequest(
        "/api/simulations",
        { method: "POST", body: "{}" },
        state.sessionToken
      );

      setState((c) => ({
        ...c,
        sessionId: payload.session.id,
        scenario: payload.scenario,
        report: null,
        lastIntent: "",
        shouldEnd: false,
        feedbackSaved: false,
        chatItems: [
          { kind: "system", label: "", text: "Simulação criada. Você já pode iniciar a conversa." }
        ]
      }));
      setFeedbackScores({
        realismScore: 0,
        challengeScore: 0,
        interactionQualityScore: 0,
        feedbackUtilityScore: 0,
        learningImpactScore: 0
      });
      setFeedbackComment("");
    } catch (error) {
      showError(error);
    } finally {
      setActiveRequest("");
    }
  }

  async function handleSendMessage(event) {
    if (event) event.preventDefault();
    const text = messageInput.trim();
    if (!text || !state.sessionId) return;

    clearError();
    pushChatItem({ kind: "user", label: "Vendedor", text });
    setMessageInput("");
    setActiveRequest("send-message");

    try {
      const payload = await apiRequest(
        `/api/simulations/${state.sessionId}/messages`,
        { method: "POST", body: JSON.stringify({ message: text }) },
        state.sessionToken
      );

      if (payload.moderated) {
        pushChatItem({
          kind: "system",
          label: "",
          text: `Moderador: ${payload.moderator.reason}`
        });
        return;
      }

      setState((c) => ({
        ...c,
        lastIntent: payload.shouldEnd ? "intention_true" : "intention_false",
        shouldEnd: Boolean(payload.shouldEnd)
      }));

      pushChatItem({ kind: "assistant", label: "Cliente", text: payload.reply });

      if (payload.shouldEnd) {
        pushChatItem({
          kind: "system",
          label: "",
          text: "A intenção detectou possível encerramento. Você pode gerar o relatório."
        });
      }
    } catch (error) {
      showError(error);
    } finally {
      setActiveRequest("");
    }
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }

  async function handleGenerateReport() {
    if (!state.sessionId) return;
    clearError();
    setActiveRequest("generate-report");

    try {
      const payload = await apiRequest(
        `/api/simulations/${state.sessionId}/report`,
        { method: "POST", body: "{}" },
        state.sessionToken
      );

      setState((c) => ({ ...c, report: payload.report }));
      pushChatItem({ kind: "system", label: "", text: "Relatório do gerente gerado com sucesso." });
    } catch (error) {
      showError(error);
    } finally {
      setActiveRequest("");
    }
  }

  function feedbackIsValid() {
    return Object.values(feedbackScores).every((score) => score >= 1 && score <= 5);
  }

  async function handleFeedbackSubmit(event) {
    event.preventDefault();
    if (!state.sessionId || !feedbackIsValid()) {
      showError(new Error("Preencha todas as avaliações de 1 a 5."));
      return;
    }

    clearError();
    setActiveRequest("send-feedback");

    try {
      await apiRequest(
        `/api/simulations/${state.sessionId}/feedback`,
        {
          method: "POST",
          body: JSON.stringify({
            ...feedbackScores,
            userFeedback: feedbackComment
          })
        },
        state.sessionToken
      );

      setState((c) => ({ ...c, feedbackSaved: true }));
    } catch (error) {
      showError(error);
    } finally {
      setActiveRequest("");
    }
  }

  async function handleLogout({ confirm } = {}) {
    if (confirm && typeof window !== "undefined") {
      const ok = window.confirm("Encerrar a sessão atual? O histórico local será apagado.");
      if (!ok) return;
    }

    if (state.sessionToken) {
      try {
        await apiRequest("/api/auth/logout", { method: "POST" }, state.sessionToken);
      } catch {
        /* sessão já pode ter sido revogada */
      }
    }

    clearStoredSession();
    setEmailInput("");
    setCodeInput("");
    setMessageInput("");
    setFeedbackScores({
      realismScore: 0,
      challengeScore: 0,
      interactionQualityScore: 0,
      feedbackUtilityScore: 0,
      learningImpactScore: 0
    });
    setFeedbackComment("");
    setState({ ...initialState, healthOk: state.healthOk });

    fetch("/api/health")
      .then((response) => setState((c) => ({ ...c, healthOk: response.ok })))
      .catch(() => setState((c) => ({ ...c, healthOk: false })));
  }

  async function copyDevCode() {
    if (!state.devCode || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(state.devCode);
    } catch {
      /* navegador sem clipboard API */
    }
  }

  if (!hydrated) {
    return (
      <div className="shell">
        <div className="loading-shell">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">RN</div>
          <div>
            <p className="eyebrow">RNaves Consultoria</p>
            <h1>Simulador</h1>
          </div>
        </div>

        <div className="status-card">
          <p className="eyebrow">Ambiente</p>
          <p className="status-text">{state.healthOk ? "API online" : "API indisponível"}</p>
        </div>

        <div className="status-card">
          <p className="eyebrow">Sessão</p>
          <p className="status-text">{sessionStatus}</p>
        </div>

        <div className="status-card">
          <p className="eyebrow">Simulação</p>
          <p className="status-text">{simulationStatus}</p>
        </div>

        <div className="status-card">
          <p className="eyebrow">Andamento</p>
          <div className="stage-list">
            {progress.map((stage) => (
              <StagePill key={stage.label} label={stage.label} ready={stage.ready} />
            ))}
          </div>
        </div>

        {state.user ? (
          <button
            type="button"
            className="ghost-button sidebar-action"
            onClick={() => handleLogout({ confirm: true })}
          >
            Sair
          </button>
        ) : null}
      </aside>

      <main className="main">
        <section className="hero">
          <div>
            <p className="eyebrow">Validação do novo stack</p>
            <h2>Fluxo completo do simulador em paralelo ao legado</h2>
            <p className="hero-copy">
              Autentique, gere um cenário, conduza a conversa, produza o relatório do gerente e
              registre o feedback final.
            </p>
          </div>
        </section>

        {state.bannerError ? (
          <div className="error-banner" role="alert">
            <span>{state.bannerError}</span>
            <button type="button" className="ghost-button" onClick={clearError} aria-label="Fechar aviso">
              Fechar
            </button>
          </div>
        ) : null}

        <section className="grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">1. Acesso</p>
                <h3>Entrar no simulador</h3>
              </div>
            </div>

            {state.user ? (
              <div className="notice">
                Conectado como <strong>{state.user.name}</strong> ({state.user.email}).
              </div>
            ) : (
              <>
                <form className="stack" onSubmit={handleRequestCode}>
                  <label className="field">
                    <span>E-mail</span>
                    <input
                      type="email"
                      placeholder="voce@empresa.com"
                      autoComplete="email"
                      required
                      value={emailInput}
                      onChange={(event) => setEmailInput(event.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isBusy("request-code")}
                    aria-busy={isBusy("request-code")}
                  >
                    {isBusy("request-code") ? "Enviando…" : "Enviar código"}
                  </button>
                </form>

                {state.email ? (
                  <form className="stack compact" onSubmit={handleVerifyCode}>
                    <label className="field">
                      <span>Código</span>
                      <input
                        type="text"
                        placeholder="000000"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{4,8}"
                        required
                        value={codeInput}
                        onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, ""))}
                      />
                    </label>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={isBusy("verify-code")}
                      aria-busy={isBusy("verify-code")}
                    >
                      {isBusy("verify-code") ? "Validando…" : "Validar código"}
                    </button>
                  </form>
                ) : null}

                {state.devCode ? (
                  <div className="dev-code-card" role="note">
                    <div>
                      <p className="eyebrow">Código de desenvolvimento</p>
                      <strong>{state.devCode}</strong>
                      <p className="helper-text">
                        Visível apenas com SHOW_DEVELOPMENT_CODE_PREVIEW habilitado.
                      </p>
                    </div>
                    <button type="button" className="secondary-button" onClick={copyDevCode}>
                      Copiar
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">2. Cenário</p>
                <h3>Preparar simulação</h3>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={!state.sessionToken || isBusy("create-simulation")}
                onClick={handleCreateSimulation}
                aria-busy={isBusy("create-simulation")}
              >
                {isBusy("create-simulation") ? "Gerando…" : "Criar simulação"}
              </button>
            </div>

            <div className="scenario-box">
              {persona ? (
                <>
                  <div className="scenario-highlights">
                    <div className="mini-metric">
                      <span className="eyebrow">Persona</span>
                      <strong>{persona.nome}</strong>
                    </div>
                    <div className="mini-metric">
                      <span className="eyebrow">Cargo</span>
                      <strong>{persona.cargo}</strong>
                    </div>
                    <div className="mini-metric">
                      <span className="eyebrow">Empresa</span>
                      <strong>{persona.empresa}</strong>
                    </div>
                    <div className="mini-metric">
                      <span className="eyebrow">Nível</span>
                      <strong>{persona.personalidade_nivel?.nivel}</strong>
                    </div>
                  </div>
                  <p>{state.scenario.manager_context}</p>
                </>
              ) : (
                <p className="muted">
                  Assim que a simulação for criada, o resumo do cenário aparece aqui.
                </p>
              )}
            </div>
          </section>
        </section>

        <section className="panel full-height">
          <div className="panel-header">
            <div>
              <p className="eyebrow">3. Conversa</p>
              <h3>Treino de negociação</h3>
            </div>
            <div className="header-actions">
              {state.shouldEnd ? <span className="intent-chip">Encerramento sugerido</span> : null}
              <button
                type="button"
                className="secondary-button"
                disabled={!state.sessionId || isBusy("generate-report")}
                onClick={handleGenerateReport}
                aria-busy={isBusy("generate-report")}
              >
                {isBusy("generate-report") ? "Gerando…" : state.report ? "Atualizar relatório" : "Gerar relatório"}
              </button>
            </div>
          </div>

          <div
            className="chat-log"
            ref={chatLogRef}
            aria-live="polite"
            aria-busy={isBusy("send-message")}
          >
            {state.chatItems.map((item, index) => (
              <article className={`message ${item.kind}`} key={`${item.kind}-${index}`}>
                {item.kind !== "system" ? <span className="message-label">{item.label}</span> : null}
                <div className="message-text">{item.text}</div>
              </article>
            ))}
            {isBusy("send-message") ? (
              <p className="system-line">Cliente está digitando…</p>
            ) : null}
          </div>

          <form className="composer" onSubmit={handleSendMessage}>
            <textarea
              ref={composerRef}
              placeholder="Escreva a próxima fala do vendedor… (Enter envia, Shift+Enter quebra linha)"
              rows={3}
              maxLength={4000}
              disabled={!state.sessionId || isBusy("send-message") || isListening}
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            {dictationSupported ? (
              <button
                type="button"
                className={`mic-button${isListening ? " listening" : ""}`}
                onClick={toggleDictation}
                disabled={!state.sessionId || isBusy("send-message")}
                aria-pressed={isListening}
                aria-label={isListening ? "Parar ditado" : "Falar (ditado por voz)"}
                title={isListening ? "Parar ditado" : "Falar (ditado por voz)"}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="9" y="3" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              </button>
            ) : null}
            <button
              type="submit"
              className="primary-button"
              disabled={!state.sessionId || !messageInput.trim() || isBusy("send-message") || isListening}
              aria-busy={isBusy("send-message")}
            >
              {isBusy("send-message") ? "Enviando…" : "Enviar"}
            </button>
          </form>
        </section>

        <section className="grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">4. Relatório</p>
                <h3>Leitura do gerente</h3>
              </div>
            </div>

            <div className="report-box">
              {state.report ? (
                <>
                  <div className="report-meta">
                    <div className="metric">
                      <span className="eyebrow">P</span>
                      <strong>{state.report.questions_score ?? "-"}</strong>
                    </div>
                    <div className="metric">
                      <span className="eyebrow">A</span>
                      <strong>{state.report.analysis_score ?? "-"}</strong>
                    </div>
                    <div className="metric">
                      <span className="eyebrow">C</span>
                      <strong>{state.report.creativity_score ?? "-"}</strong>
                    </div>
                    <div className="metric">
                      <span className="eyebrow">E</span>
                      <strong>{state.report.engagement_score ?? "-"}</strong>
                    </div>
                    <div className="metric">
                      <span className="eyebrow">Média</span>
                      <strong>{state.report.average_score ?? "-"}</strong>
                    </div>
                  </div>
                  <div className="report-copy">
                    <div>
                      <h4>Resumo</h4>
                      <p>{state.report.report_json?.Resumo}</p>
                    </div>
                    <div>
                      <h4>Preparação</h4>
                      <p>{state.report.report_json?.Preparacao}</p>
                    </div>
                    <div>
                      <h4>Análise</h4>
                      <p>{state.report.report_json?.Analise}</p>
                    </div>
                    <div>
                      <h4>Cocriação</h4>
                      <p>{state.report.report_json?.Cocriacao}</p>
                    </div>
                    <div>
                      <h4>Engajamento</h4>
                      <p>{state.report.report_json?.Engajamento}</p>
                    </div>
                    <div>
                      <h4>Recomendações</h4>
                      <p>{state.report.report_json?.Recomendacoes ?? state.report.report_summary}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="muted">O relatório final aparece aqui depois da conversa.</p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">5. Feedback</p>
                <h3>Fechar sessão</h3>
              </div>
            </div>

            {!state.report ? (
              <div className="notice">
                O formulário de feedback é liberado depois que o relatório é gerado.
              </div>
            ) : state.feedbackSaved ? (
              <div className="notice success" role="status">
                Feedback registrado. Obrigado!
              </div>
            ) : (
              <form className="stack" onSubmit={handleFeedbackSubmit}>
                <div className="rating-grid">
                  {FEEDBACK_FIELDS.map((field) => (
                    <RatingInput
                      key={field.name}
                      name={field.name}
                      label={field.label}
                      value={feedbackScores[field.name]}
                      disabled={isBusy("send-feedback")}
                      onChange={(score) =>
                        setFeedbackScores((current) => ({ ...current, [field.name]: score }))
                      }
                    />
                  ))}
                </div>

                <label className="field">
                  <span>Comentário (opcional)</span>
                  <textarea
                    name="userFeedback"
                    rows={4}
                    maxLength={4000}
                    placeholder="Como foi usar esta nova versão?"
                    value={feedbackComment}
                    onChange={(event) => setFeedbackComment(event.target.value)}
                    disabled={isBusy("send-feedback")}
                  />
                </label>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={isBusy("send-feedback") || !feedbackIsValid()}
                  aria-busy={isBusy("send-feedback")}
                >
                  {isBusy("send-feedback") ? "Salvando…" : "Salvar feedback"}
                </button>
              </form>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}
