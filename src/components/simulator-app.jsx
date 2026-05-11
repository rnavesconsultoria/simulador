"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoginScreen } from "./login-screen.jsx";

const STORAGE_KEY = "rnaves.simulator.session";
const FEEDBACK_FIELDS_PRE = [
  { name: "realismScore", label: "Realismo da simulação" },
  { name: "challengeScore", label: "Nível de desafio" },
  { name: "interactionQualityScore", label: "Qualidade da interação" }
];

const FEEDBACK_FIELDS_POST = [
  { name: "feedbackUtilityScore", label: "Utilidade do relatório" },
  { name: "learningImpactScore", label: "Impacto no aprendizado" }
];

const FEEDBACK_FIELDS = [...FEEDBACK_FIELDS_PRE, ...FEEDBACK_FIELDS_POST];

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
  feedbackPhase1Done: false,
  bannerError: "",
  welcomeShown: false,
  chatItems: []
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
  const personaInitials = (persona?.nome ?? "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "CL";
  const simulationStatus = persona
    ? `${persona.nome} — ${persona.personalidade_nivel?.nivel ?? ""}`
    : state.sessionId
      ? "Simulação ativa"
      : "Nenhuma simulação ativa";

  const inSimulation = Boolean(state.user && state.scenario && !state.report);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!inSimulation) setDrawerOpen(false);
  }, [inSimulation]);

  const flowStep = !state.user
    ? state.email
      ? "awaiting_code"
      : "awaiting_email"
    : !state.scenario
      ? "creating_scenario"
      : state.report
        ? "completed"
        : "in_simulation";

  const isEndingSession =
    state.activeRequest === "generate-report" || Boolean(state.report);
  const screenPhase = !isEndingSession
    ? "simulation"
    : !state.feedbackPhase1Done
      ? "feedback_form"
      : "report_view";

  // Welcome flag (used to know when the static welcome copy has been shown
  // at least once; we no longer seed welcome messages into the chat itself —
  // a static, flowing copy block above the chat carries the message now).
  useEffect(() => {
    if (!hydrated || state.welcomeShown) return;
    setState((c) => ({ ...c, welcomeShown: true }));
  }, [hydrated, state.welcomeShown]);

  // Auto-create scenario once the user is authenticated
  useEffect(() => {
    if (!hydrated || !state.user || state.scenario || state.report) return;
    if (state.activeRequest === "create-simulation") return;
    handleCreateSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, state.user, state.scenario, state.report, state.activeRequest]);

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
    if (event) event.preventDefault();
    const email = (emailInput || messageInput).trim().toLowerCase();
    if (!email) return;
    clearError();
    setActiveRequest("request-code");

    try {
      const payload = await apiRequest("/api/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ email })
      });

      setState((c) => ({
        ...c,
        email,
        devCode: payload.developmentCodePreview ?? ""
      }));
      setEmailInput("");
      setMessageInput("");
    } catch (error) {
      showError(error);
    } finally {
      setActiveRequest("");
    }
  }

  async function handleVerifyCode(event) {
    if (event) event.preventDefault();
    const code = (codeInput || messageInput).trim().replace(/\D/g, "");
    if (!code) return;
    clearError();
    setActiveRequest("verify-code");

    try {
      const payload = await apiRequest("/api/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({
          email: state.email,
          code
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
        devCode: "",
        // Auth UX lives in /login screen; don't pollute the chat-log.
        chatItems: []
      }));
      setCodeInput("");
      setMessageInput("");
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

      const personaCtx = payload?.scenario?.seller_context;
      setState((c) => ({
        ...c,
        sessionId: payload.session.id,
        scenario: payload.scenario,
        report: null,
        lastIntent: "",
        shouldEnd: false,
        feedbackSaved: false,
        chatItems: [
          ...c.chatItems,
          {
            kind: "system",
            label: "",
            text: personaCtx
              ? `Contexto — ${personaCtx}`
              : "Simulação criada. Você já pode iniciar a conversa."
          },
          {
            kind: "assistant",
            label: "IA R Naves",
            text: "Pode começar quando quiser. Boa simulação!"
          }
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
    } catch (error) {
      showError(error);
    } finally {
      setActiveRequest("");
    }
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleComposerSubmit();
    }
  }

  async function handleComposerSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();
    const text = messageInput.trim();
    if (!text) return;
    if (flowStep === "awaiting_email") {
      pushChatItem({ kind: "user", label: state.user?.name ?? "Você", text });
      setMessageInput("");
      setEmailInput(text);
      await handleRequestCode();
      return;
    }
    if (flowStep === "awaiting_code") {
      pushChatItem({ kind: "user", label: state.user?.name ?? "Você", text });
      setMessageInput("");
      setCodeInput(text);
      await handleVerifyCode();
      return;
    }
    if (flowStep === "in_simulation") {
      await handleSendMessage();
      return;
    }
    // creating_scenario / completed: ignore submits
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

  function feedbackPreIsValid() {
    return FEEDBACK_FIELDS_PRE.every(
      (f) => feedbackScores[f.name] >= 1 && feedbackScores[f.name] <= 5
    );
  }

  function feedbackPostIsValid() {
    return FEEDBACK_FIELDS_POST.every(
      (f) => feedbackScores[f.name] >= 1 && feedbackScores[f.name] <= 5
    );
  }

  function feedbackIsValid() {
    return feedbackPreIsValid() && feedbackPostIsValid();
  }

  function handleFeedbackPreSubmit(event) {
    event.preventDefault();
    if (!feedbackPreIsValid()) {
      showError(new Error("Avalie os 3 itens de 1 a 5."));
      return;
    }
    clearError();
    setState((c) => ({ ...c, feedbackPhase1Done: true }));
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

  function dismissIntentPrompt() {
    setState((c) => ({ ...c, shouldEnd: false }));
  }

  function handleNewSimulation() {
    setState((c) => ({
      ...c,
      scenario: null,
      sessionId: "",
      report: null,
      lastIntent: "",
      shouldEnd: false,
      feedbackSaved: false,
      feedbackPhase1Done: false,
      welcomeShown: false,
      chatItems: [],
      bannerError: ""
    }));
    setFeedbackScores({
      realismScore: 0,
      challengeScore: 0,
      interactionQualityScore: 0,
      feedbackUtilityScore: 0,
      learningImpactScore: 0
    });
    setFeedbackComment("");
    setMessageInput("");
  }

  function pilarColor(score) {
    const n = Number(score);
    if (!Number.isFinite(n)) return "#6b7280";
    if (n < 6) return "#ba7517";
    if (n < 8) return "#185fa5";
    return "#0f6e56";
  }

  function resultLabel(resultado) {
    switch (resultado) {
      case "fechou_ideal":
        return "Fechou no ideal";
      case "fechou_aceitavel":
        return "Fechou no aceitável";
      case "nao_fechou":
        return "Não fechou";
      case "inconclusivo":
        return "Sessão inconclusiva";
      default:
        return resultado || "Resultado";
    }
  }

  if (!hydrated) {
    return (
      <div className="shell">
        <div className="loading-shell">
          <img
            src="/Logos/vertical-white.svg?v=2"
            alt="R Naves Consultoria"
            className="brand-logo-vertical"
          />
          <span>Carregando…</span>
        </div>
      </div>
    );
  }

  const contextContent = persona ? (
    <>
      <div className="context-card">
        <div className="context-card-head">
          <div className="context-avatar" aria-hidden="true">{personaInitials}</div>
          <div>
            <div className="context-name">{persona.nome}</div>
            <div className="context-subtitle">
              {persona.cargo}
              {persona.empresa ? ` · ${persona.empresa}` : ""}
            </div>
          </div>
        </div>
        <div className="context-details">
          {persona.cidade ? (
            <div className="context-detail">
              <span className="label">Cidade</span>
              <span className="value">{persona.cidade}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="context-card">
        <p className="context-eyebrow">Cenário</p>
        <p className="context-body">{state.scenario?.seller_context}</p>
      </div>

      <div className="context-tip">
        <p className="context-eyebrow">Dica</p>
        <p className="context-body">
          Faça perguntas abertas para diagnosticar necessidades antes de apresentar soluções.
        </p>
      </div>
    </>
  ) : null;

  return (
    <div className="shell">
      {state.user && !state.report ? (
        <button
          type="button"
          className={`floating-logout${state.scenario ? " in-sim" : ""}`}
          onClick={() => handleLogout({ confirm: true })}
          aria-label="Sair da sessão"
          title="Sair"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sair</span>
        </button>
      ) : null}

      {!state.user ? (
        <LoginScreen
          flowStep={flowStep}
          email={state.email}
          messageInput={messageInput}
          setMessageInput={setMessageInput}
          devCode={state.devCode}
          isRequesting={isBusy("request-code")}
          isVerifying={isBusy("verify-code")}
          bannerError={state.bannerError}
          onDismissError={clearError}
          onSubmitEmail={handleRequestCode}
          onSubmitCode={handleVerifyCode}
          onBack={() => {
            clearError();
            setState((c) => ({ ...c, email: "", devCode: "" }));
            setMessageInput("");
          }}
        />
      ) : screenPhase === "simulation" ? (
        <div className={`simulation-stage${state.scenario ? "" : " no-aside"}`}>
          <div className="simulation-chat">
            {state.scenario ? (
              <div className="mobile-subbar">
                <button type="button" onClick={() => setDrawerOpen(true)}>
                  Ver cliente
                </button>
                <button
                  type="button"
                  className="accent"
                  onClick={handleGenerateReport}
                  disabled={isBusy("generate-report")}
                >
                  {isBusy("generate-report") ? "Gerando…" : "Encerrar"}
                </button>
              </div>
            ) : null}

            {state.bannerError ? (
              <div className="error-banner" role="alert" style={{ margin: "14px 28px 0" }}>
                <span>{state.bannerError}</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={clearError}
                  aria-label="Fechar aviso"
                >
                  Fechar
                </button>
              </div>
            ) : null}

            <div className="welcome-hero">
              <img
                src="/Logos/Vertical branco.png?v=3"
                alt="R Naves Consultoria"
                className="welcome-hero-logo-vertical"
              />
              <p className="welcome-hero-tagline">
                IA R Naves — Sua especialista em treinamento de vendas
              </p>
            </div>

            {!state.scenario ? (
              <div className="welcome-copy">
                {flowStep === "awaiting_email" ? (
                  <>
                    <p>
                      <strong>Olá! Que bom ter você aqui.</strong> Esta é a IA de Treinamento da
                      RNaves Consultoria — sua parceira para treinar técnicas de vendas
                      consultivas quantas vezes quiser, evoluir a cada conversa e receber uma
                      avaliação personalizada no final de cada simulação.
                    </p>
                    <p>
                      Cada cenário é único: você vai negociar com um cliente diferente, com dores
                      reais, e a cada sessão a sua leitura de cliente fica mais afiada. Não tem
                      medo de errar aqui — é treino, e errar faz parte do aprendizado.
                    </p>
                    <p>
                      Para começar, preciso saber quem você é. Sua empresa precisa ter contratado
                      o sistema e você estar cadastrado. <strong>Digite seu e-mail no campo abaixo</strong> e vamos juntos.
                    </p>
                  </>
                ) : flowStep === "awaiting_code" ? (
                  <>
                    <p>
                      <strong>Acabei de te enviar um e-mail.</strong> Clique no botão{" "}
                      <em>Entrar no simulador</em> dentro do e-mail para entrar direto, ou cole o
                      código de 6 dígitos no campo abaixo.
                    </p>
                    <p className="welcome-copy-muted">
                      Não chegou em alguns segundos? Confira a caixa de spam ou tente outro
                      e-mail.
                    </p>
                  </>
                ) : flowStep === "creating_scenario" ? (
                  <>
                    <p>
                      <strong>
                        Que bom te ver, {state.user?.name?.split(/\s+/)[0] ?? "vendedor(a)"}!
                      </strong>{" "}
                      Já estou montando um cenário de negociação especialmente para você. Cada
                      treino te aproxima de uma venda consultiva mais sólida.
                    </p>
                    <p className="welcome-copy-muted">Leva só alguns segundos…</p>
                  </>
                ) : null}
              </div>
            ) : null}

            {state.scenario ? (
              <div className="simulation-header">
                <div className="session-meta">
                  {persona?.nome ? `Conversando com ${persona.nome}` : "Conversa em andamento"}
                  {state.shouldEnd ? (
                    <span className="intent-chip" style={{ marginLeft: 10 }}>
                      Encerramento sugerido
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {state.devCode ? (
              <div className="simulation-header">
                <span className="dev-code-pill">
                  Código dev: <strong>{state.devCode}</strong>
                </span>
              </div>
            ) : null}

            <div
              className="chat-log"
              ref={chatLogRef}
              aria-live="polite"
              aria-busy={isBusy("send-message")}
            >
              {state.chatItems.map((item, index) => (
                <article className={`message ${item.kind}`} key={`${item.kind}-${index}`}>
                  {item.kind !== "system" ? (
                    <span className="message-label">{item.label}</span>
                  ) : null}
                  <div className="message-text">{item.text}</div>
                </article>
              ))}
              {isBusy("send-message") ? (
                <div className="typing-indicator" aria-label="Cliente digitando">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
              {state.shouldEnd && !state.report && !isBusy("send-message") ? (
                <div className="intent-confirm" role="dialog" aria-label="Encerrar simulação?">
                  <p className="intent-confirm-text">
                    Parece que a conversa pode estar terminando. Deseja encerrar a simulação e ver o relatório?
                  </p>
                  <div className="intent-confirm-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleGenerateReport}
                      disabled={isBusy("generate-report")}
                      aria-busy={isBusy("generate-report")}
                    >
                      {isBusy("generate-report") ? "Gerando…" : "Encerrar"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={dismissIntentPrompt}
                      disabled={isBusy("generate-report")}
                    >
                      Continuar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <form className="composer" onSubmit={handleComposerSubmit}>
              <div className="composer-wrap">
                <textarea
                  ref={composerRef}
                  placeholder={
                    flowStep === "awaiting_email"
                      ? "voce@empresa.com"
                      : flowStep === "awaiting_code"
                        ? "Digite o código recebido por e-mail"
                        : flowStep === "creating_scenario"
                          ? "Preparando o cenário…"
                          : "Conversa..."
                  }
                  rows={1}
                  maxLength={4000}
                  inputMode={flowStep === "awaiting_code" ? "numeric" : "text"}
                  autoComplete={
                    flowStep === "awaiting_email"
                      ? "email"
                      : flowStep === "awaiting_code"
                        ? "one-time-code"
                        : "off"
                  }
                  disabled={
                    flowStep === "creating_scenario" ||
                    isBusy("send-message") ||
                    isBusy("request-code") ||
                    isBusy("verify-code") ||
                    isListening
                  }
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                />
                {dictationSupported && flowStep === "in_simulation" ? (
                  <button
                    type="button"
                    className={`mic-button${isListening ? " listening" : ""}`}
                    onClick={toggleDictation}
                    disabled={isBusy("send-message")}
                    aria-pressed={isListening}
                    aria-label={isListening ? "Parar ditado" : "Falar (ditado por voz)"}
                    title={isListening ? "Parar ditado" : "Falar (ditado por voz)"}
                  >
                    <svg
                      width="18"
                      height="18"
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
                  className="send-button"
                  disabled={
                    !messageInput.trim() ||
                    flowStep === "creating_scenario" ||
                    flowStep === "completed" ||
                    isBusy("send-message") ||
                    isBusy("request-code") ||
                    isBusy("verify-code") ||
                    isListening
                  }
                  aria-busy={isBusy("send-message")}
                >
                  {isBusy("send-message") || isBusy("request-code") || isBusy("verify-code")
                    ? "Enviando…"
                    : flowStep === "awaiting_email"
                      ? "Enviar"
                      : flowStep === "awaiting_code"
                        ? "Validar"
                        : "Enviar"}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 7h10M8 3l4 4-4 4" />
                  </svg>
                </button>
              </div>
            </form>
          </div>

          {state.scenario ? (
            <aside className="context-panel">
              <button
                type="button"
                className="context-end-button"
                onClick={handleGenerateReport}
                disabled={!state.sessionId || isBusy("generate-report")}
                aria-busy={isBusy("generate-report")}
              >
                {isBusy("generate-report") ? "Gerando relatório…" : "Encerrar simulação"}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 5v3l2 1.5" />
                </svg>
              </button>
              {contextContent}
            </aside>
          ) : null}

          {state.scenario ? (
            <>
              <div
                className={`context-drawer-backdrop${drawerOpen ? " open" : ""}`}
                onClick={() => setDrawerOpen(false)}
                aria-hidden="true"
              />
              <div
                className={`context-drawer${drawerOpen ? " open" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Detalhes do cliente"
              >
                <div className="context-drawer-handle" aria-hidden="true" />
                {contextContent}
              </div>
            </>
          ) : null}
        </div>
      ) : screenPhase === "feedback_form" ? (
        <main className="feedback-screen">
          {state.bannerError ? (
            <div className="fb-error-banner" role="alert">
              <span>{state.bannerError}</span>
              <button type="button" className="fb-btn fb-btn-ghost" onClick={clearError}>
                Fechar
              </button>
            </div>
          ) : null}

          <div className="fb-header-card">
            <div className="fb-eyebrow-line" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="m9 14 2 2 4-4" />
              </svg>
              Antes do relatório
            </div>
            <h1 className="fb-h1">Sua avaliação sobre a simulação</h1>
            <p className="fb-subtitle">
              Enquanto o gerente prepara o relatório, conta pra gente como foi a experiência.
            </p>
            <div className="fb-baseline" style={{ marginTop: 12 }}>
              {state.report ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                  Relatório pronto — salve o feedback para visualizar.
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Gerando o relatório do gerente em paralelo…
                </>
              )}
            </div>
          </div>

          <section className="fb-section">
            <h2 className="fb-h2">Como foi essa simulação para você?</h2>
            <form className="fb-form-card" onSubmit={handleFeedbackPreSubmit}>
              <div className="fb-rating-grid">
                {FEEDBACK_FIELDS_PRE.map((field) => (
                  <RatingInput
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    value={feedbackScores[field.name]}
                    disabled={false}
                    onChange={(score) =>
                      setFeedbackScores((current) => ({ ...current, [field.name]: score }))
                    }
                  />
                ))}
              </div>
              <button
                type="submit"
                className="fb-btn fb-btn-primary"
                disabled={!feedbackPreIsValid()}
              >
                Continuar para o relatório
              </button>
            </form>
          </section>
        </main>
      ) : (
        <main className="feedback-screen">
          {state.bannerError ? (
            <div className="fb-error-banner" role="alert">
              <span>{state.bannerError}</span>
              <button type="button" className="fb-btn fb-btn-ghost" onClick={clearError}>
                Fechar
              </button>
            </div>
          ) : null}

          <div className="fb-header-card">
            <div className="fb-eyebrow-line" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="m9 14 2 2 4-4" />
              </svg>
              Feedback da simulação
            </div>
            <h1 className="fb-h1">
              {(state.user?.name?.split(/\s+/)[0]) ?? "Você"}, boa simulação.
            </h1>
            {persona ? (
              <p className="fb-subtitle">
                Conversa com <strong>{persona.nome}</strong>
                {persona.cargo ? <> · {persona.cargo}</> : null}
                {persona.empresa ? <> · {persona.empresa}</> : null}
                {persona.personalidade_pace ? (
                  <>
                    {" "}
                    · perfil DISC <strong>{persona.personalidade_pace}</strong>
                  </>
                ) : null}
              </p>
            ) : null}

            <div className="fb-hero-grid">
              <div className="fb-score-block">
                <div className="fb-score-big">
                  {Number(state.report.average_score ?? 0).toFixed(1)}
                </div>
                <div className="fb-tiny" style={{ marginTop: 4 }}>média PACE</div>
                <div className="fb-baseline">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s-8-4.5-8-12a8 8 0 0 1 16 0c0 7.5-8 12-8 12z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  seu ponto de partida
                </div>
              </div>
              <div>
                {state.report.report_json?.Resultado ? (
                  <div className="fb-pill fb-pill-info">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                    {resultLabel(state.report.report_json.Resultado)}
                  </div>
                ) : null}
                <div className="fb-result-details">
                  {state.report.report_json?.Preco_final ? (
                    <div style={{ marginBottom: 4 }}>
                      <span className="fb-label">Preço final:</span>{" "}
                      <strong>{state.report.report_json.Preco_final}</strong>
                    </div>
                  ) : null}
                  {state.report.report_json?.Compromissos_obtidos ? (
                    <div>
                      <span className="fb-label">Próximo passo:</span>{" "}
                      {state.report.report_json.Compromissos_obtidos}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <section className="fb-section">
            <h2 className="fb-h2">Avaliação por pilar PACE</h2>
            <p className="fb-muted fb-tight">
              Sem comparativo nesta primeira sessão. As próximas simulações vão mostrar sua evolução.
            </p>

            <div className="fb-radar-wrap">
              <svg viewBox="0 0 320 280" width="320" height="280" role="img" aria-label="Radar PACE">
                <g transform="translate(160, 140)">
                  <polygon points="0,-100 100,0 0,100 -100,0" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.6" />
                  <polygon points="0,-75 75,0 0,75 -75,0" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.6" />
                  <polygon points="0,-50 50,0 0,50 -50,0" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.6" />
                  <polygon points="0,-25 25,0 0,25 -25,0" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" />
                  <line x1="0" y1="-100" x2="0" y2="100" stroke="rgba(255,255,255,0.08)" strokeWidth="0.6" />
                  <line x1="-100" y1="0" x2="100" y2="0" stroke="rgba(255,255,255,0.08)" strokeWidth="0.6" />
                </g>
                <g transform="translate(160, 140)">
                  {(() => {
                    const P = Number(state.report.questions_score ?? 0);
                    const A = Number(state.report.analysis_score ?? 0);
                    const C = Number(state.report.creativity_score ?? 0);
                    const E = Number(state.report.engagement_score ?? 0);
                    const points = `0,${-P * 10} ${A * 10},0 0,${C * 10} ${-E * 10},0`;
                    return (
                      <>
                        <polygon points={points} fill="#14b8a6" fillOpacity="0.22" stroke="#14b8a6" strokeWidth="1.6" />
                        <circle cx="0" cy={-P * 10} r="3.6" fill="#14b8a6" />
                        <circle cx={A * 10} cy="0" r="3.6" fill="#14b8a6" />
                        <circle cx="0" cy={C * 10} r="3.6" fill="#14b8a6" />
                        <circle cx={-E * 10} cy="0" r="3.6" fill="#14b8a6" />
                      </>
                    );
                  })()}
                </g>
                <g>
                  <text x="160" y="25" textAnchor="middle" fontSize="13" fontWeight="600" fill="#e2e8f0">
                    P · {Number(state.report.questions_score ?? 0).toFixed(1)}
                  </text>
                  <text x="280" y="144" textAnchor="start" fontSize="13" fontWeight="600" fill="#e2e8f0">
                    A · {Number(state.report.analysis_score ?? 0).toFixed(1)}
                  </text>
                  <text x="160" y="260" textAnchor="middle" fontSize="13" fontWeight="600" fill="#e2e8f0">
                    C · {Number(state.report.creativity_score ?? 0).toFixed(1)}
                  </text>
                  <text x="40" y="144" textAnchor="end" fontSize="13" fontWeight="600" fill="#e2e8f0">
                    E · {Number(state.report.engagement_score ?? 0).toFixed(1)}
                  </text>
                </g>
              </svg>
            </div>

            {[
              { score: state.report.questions_score, label: "Preparação", text: state.report.report_json?.Preparacao },
              { score: state.report.analysis_score, label: "Análise", text: state.report.report_json?.Analise },
              { score: state.report.creativity_score, label: "Cocriação", text: state.report.report_json?.Cocriacao },
              { score: state.report.engagement_score, label: "Engajamento", text: state.report.report_json?.Engajamento }
            ].map((p) => {
              const color = pilarColor(p.score);
              const n = Number(p.score) || 0;
              return (
                <div className="fb-pilar-row" key={p.label}>
                  <div>
                    <div className="fb-score-medium" style={{ color }}>{n.toFixed(1)}</div>
                    <div className="fb-tiny" style={{ marginTop: 4 }}>{p.label}</div>
                    <div className="fb-band-track">
                      <div className="fb-band-fill" style={{ width: `${Math.max(0, Math.min(100, n * 10))}%`, background: color }} />
                    </div>
                  </div>
                  <div>
                    <h3 className="fb-h3">{p.label}</h3>
                    <p style={{ margin: 0 }}>{p.text}</p>
                  </div>
                </div>
              );
            })}
          </section>

          {(() => {
            const negociacao = persona?.negociacao ?? {};
            const allBenefits = (negociacao.beneficios_ocultos ?? [])
              .map((b) => b.nome || b.descricao)
              .filter(Boolean);
            const allDeep = (negociacao.objecoes_profundas ?? [])
              .map((o) => o.descricao)
              .filter(Boolean);
            const rawDiscoveredB = state.report.report_json?.Beneficios_ocultos_descobertos ?? [];
            const rawDiscoveredO = state.report.report_json?.Objecoes_profundas_descobertas ?? [];
            // Discovery items can come as legacy plain strings (v2.0.0) or as
            // {nome, turno, citacao_vendedor} objects (v2.1.0). Normalize.
            const toDiscovery = (item) => {
              if (!item) return null;
              if (typeof item === "string") return { nome: item, turno: null, citacao: "" };
              return {
                nome: item.nome ?? item.descricao ?? "",
                turno: typeof item.turno === "number" ? item.turno : null,
                citacao: item.citacao_vendedor ?? ""
              };
            };
            const discovered = [...rawDiscoveredB, ...rawDiscoveredO]
              .map(toDiscovery)
              .filter((d) => d && d.nome);
            const norm = (s) => String(s).toLowerCase().slice(0, 18);
            const isCovered = (item) =>
              discovered.some(
                (d) =>
                  norm(d.nome) &&
                  (norm(item).includes(norm(d.nome)) || norm(d.nome).includes(norm(item)))
              );
            const toExplore = [
              ...allBenefits.filter((b) => !isCovered(b)),
              ...allDeep.filter((o) => !isCovered(o))
            ];
            if (discovered.length === 0 && toExplore.length === 0) return null;
            return (
              <section className="fb-section">
                <h2 className="fb-h2">Descobertas da conversa</h2>
                <p className="fb-muted fb-tight">
                  O cenário tinha dores e benefícios ocultos que só emergem com diagnóstico profundo.
                </p>
                <div className="fb-discoveries">
                  <div>
                    <h3 className="fb-h3" style={{ color: "#0f6e56" }}>Você descobriu</h3>
                    {discovered.length ? (
                      discovered.map((d, i) => (
                        <div className="fb-discovery" key={`d-${i}`}>
                          <span className="fb-discovery-icon" style={{ color: "#0f6e56" }} aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="9" />
                              <path d="m9 12 2 2 4-4" />
                            </svg>
                          </span>
                          <div>
                            <div>{d.nome}</div>
                            {d.turno || d.citacao ? (
                              <div className="fb-discovery-meta">
                                {d.turno ? <span>turno {d.turno}</span> : null}
                                {d.citacao ? <span>“{d.citacao}”</span> : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="fb-muted" style={{ margin: 0 }}>Nada nesta sessão.</p>
                    )}
                  </div>
                  <div>
                    <h3 className="fb-h3" style={{ color: "#6b7280" }}>Para explorar na próxima</h3>
                    {toExplore.length ? (
                      toExplore.map((t, i) => (
                        <div className="fb-discovery" key={`t-${i}`}>
                          <span className="fb-discovery-icon" style={{ color: "#9ca3af" }} aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3">
                              <circle cx="12" cy="12" r="9" />
                            </svg>
                          </span>
                          <span>{t}</span>
                        </div>
                      ))
                    ) : (
                      <p className="fb-muted" style={{ margin: 0 }}>Você cobriu tudo. Excelente.</p>
                    )}
                  </div>
                </div>
              </section>
            );
          })()}

          {state.report.report_json?.Resumo ? (
            <section className="fb-section">
              <h2 className="fb-h2">Resumo</h2>
              <div className="fb-editorial-card">
                <p>{state.report.report_json.Resumo}</p>
              </div>
            </section>
          ) : null}

          {state.report.report_json?.Recomendacoes || state.report.report_summary ? (
            <section className="fb-section">
              <h2 className="fb-h2">Próximas ações</h2>
              <div className="fb-editorial-card">
                {(() => {
                  const rec = state.report.report_json?.Recomendacoes;
                  // v2.1.0: array of {titulo, descricao, prioritaria}
                  if (Array.isArray(rec) && rec.length > 0 && typeof rec[0] === "object") {
                    return (
                      <ol className="fb-recommendation-list">
                        {rec.map((item, i) => (
                          <li key={i} className={item.prioritaria ? "is-priority" : ""}>
                            <div className="fb-rec-title">
                              {item.prioritaria ? (
                                <span className="fb-rec-priority">prioridade</span>
                              ) : null}
                              <strong>{item.titulo}</strong>
                            </div>
                            {item.descricao ? <p>{item.descricao}</p> : null}
                          </li>
                        ))}
                      </ol>
                    );
                  }
                  // v2.0.0 legacy: single string "1. ... 2. ..."
                  const raw = (typeof rec === "string" ? rec : state.report.report_summary ?? "").trim();
                  if (!raw) return null;
                  const parts = raw
                    .split(/(?<=[.!?])\s+(?=\d+[.)]\s)/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  if (parts.length <= 1) return <p>{raw}</p>;
                  return (
                    <ol className="fb-recommendation-list">
                      {parts.map((item, i) => (
                        <li key={i}>{item.replace(/^\d+[.)]\s*/, "")}</li>
                      ))}
                    </ol>
                  );
                })()}
              </div>
            </section>
          ) : null}

          <section className="fb-section">
            <h2 className="fb-h2">Para finalizar, o que você achou do relatório?</h2>
            <p className="fb-muted fb-tight">
              Dê uma nota e, se quiser, deixe um comentário sobre o feedback que acabou de receber.
            </p>
            {state.feedbackSaved ? (
              <div className="fb-success-card" role="status">Avaliação registrada. Obrigado!</div>
            ) : (
              <form className="fb-form-card" onSubmit={handleFeedbackSubmit}>
                <div className="fb-rating-grid">
                  {FEEDBACK_FIELDS_POST.map((field) => (
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
                <label className="fb-field">
                  <span>Quer me dar algum feedback dessa sua interação? (opcional)</span>
                  <textarea
                    name="userFeedback"
                    rows={3}
                    maxLength={4000}
                    placeholder="Deixe seu feedback…"
                    value={feedbackComment}
                    onChange={(event) => setFeedbackComment(event.target.value)}
                    disabled={isBusy("send-feedback")}
                  />
                </label>
                <button
                  type="submit"
                  className="fb-btn fb-btn-primary"
                  disabled={isBusy("send-feedback") || !feedbackPostIsValid()}
                  aria-busy={isBusy("send-feedback")}
                >
                  {isBusy("send-feedback") ? "Salvando…" : "Enviar avaliação"}
                </button>
              </form>
            )}
          </section>

          <div className="fb-btn-row">
            <button type="button" className="fb-btn fb-btn-primary" onClick={handleNewSimulation}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 0 1 15-6.7l3 3" />
                <path d="M21 3v6h-6" />
                <path d="M21 12a9 9 0 0 1-15 6.7l-3-3" />
                <path d="M3 21v-6h6" />
              </svg>
              Nova simulação
            </button>
            <button type="button" className="fb-btn" onClick={() => handleLogout({ confirm: true })}>
              Sair
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
