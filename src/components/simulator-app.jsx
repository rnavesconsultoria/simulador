"use client";

import { useEffect, useMemo, useState } from "react";

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
  activeRequest: "",
  feedbackStatus: "O formulário de feedback será liberado depois do relatório.",
  chatItems: [{ kind: "system", label: "", text: "Aguardando criação da simulação." }]
};

function appendChatItem(setState, item) {
  setState((current) => ({
    ...current,
    chatItems: [...current.chatItems, item]
  }));
}

async function apiRequest(path, options = {}, sessionToken = "") {
  const headers = new Headers(options.headers ?? {});
  headers.set("Content-Type", "application/json");

  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Erro inesperado.");
  }

  return payload;
}

function setActiveRequest(setState, value) {
  setState((current) => ({
    ...current,
    activeRequest: value
  }));
}

function StagePill({ ready, label }) {
  return <span className={`stage-pill ${ready ? "ready" : ""}`}>{label}</span>;
}

export function SimulatorApp() {
  const [state, setState] = useState(initialState);
  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [clipboardStatus, setClipboardStatus] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        setState((current) => ({ ...current, healthOk: response.ok }));
      })
      .catch(() => {
        setState((current) => ({ ...current, healthOk: false }));
      });
  }, []);

  const sessionStatus = state.user ? `${state.user.name} autenticado` : "Aguardando autenticação";
  const simulationStatus = state.sessionId
    ? `Sessão ativa ${state.sessionId.slice(0, 8)}`
    : "Nenhuma simulação ativa";
  const isBusy = (action) => state.activeRequest === action;

  const progress = useMemo(
    () => [
      { label: "Acesso liberado", ready: Boolean(state.sessionToken) },
      { label: "Simulação criada", ready: Boolean(state.sessionId) },
      { label: "Relatório gerado", ready: Boolean(state.report) },
      { label: "Feedback registrado", ready: state.feedbackStatus === "Feedback salvo com sucesso." }
    ],
    [state.sessionToken, state.sessionId, state.report, state.feedbackStatus]
  );

  async function handleRequestCode(event) {
    event.preventDefault();
    setActiveRequest(setState, "request-code");
    setClipboardStatus("");

    try {
      const payload = await apiRequest("/api/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ email: emailInput.trim() })
      });

      setState((current) => ({
        ...current,
        email: emailInput.trim(),
        devCode: payload.developmentCodePreview ?? ""
      }));

      appendChatItem(setState, {
        kind: "system",
        label: "",
        text: "Código de acesso gerado. Valide para continuar."
      });
    } catch (error) {
      appendChatItem(setState, {
        kind: "system",
        label: "",
        text: error.message
      });
    } finally {
      setActiveRequest(setState, "");
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();
    setActiveRequest(setState, "verify-code");

    try {
      const payload = await apiRequest("/api/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({
          email: state.email,
          code: codeInput.trim()
        })
      });

      setState((current) => ({
        ...current,
        sessionToken: payload.sessionToken,
        user: payload.user
      }));

      appendChatItem(setState, {
        kind: "system",
        label: "",
        text: `Sessão autenticada para ${payload.user.name}.`
      });
    } catch (error) {
      appendChatItem(setState, {
        kind: "system",
        label: "",
        text: error.message
      });
    } finally {
      setActiveRequest(setState, "");
    }
  }

  async function handleCreateSimulation() {
    setActiveRequest(setState, "create-simulation");

    try {
      const payload = await apiRequest(
        "/api/simulations",
        {
          method: "POST",
          body: "{}"
        },
        state.sessionToken
      );

      setState((current) => ({
        ...current,
        sessionId: payload.session.id,
        scenario: payload.scenario,
        report: null,
        lastIntent: "",
        chatItems: [
          { kind: "system", label: "", text: "Simulação criada. Você já pode iniciar a conversa." }
        ],
        feedbackStatus: "O formulário de feedback será liberado depois do relatório."
      }));
    } catch (error) {
      appendChatItem(setState, {
        kind: "system",
        label: "",
        text: error.message
      });
    } finally {
      setActiveRequest(setState, "");
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    const text = messageInput.trim();
    if (!text || !state.sessionId) {
      return;
    }

    appendChatItem(setState, {
      kind: "user",
      label: "Vendedor",
      text
    });
    setMessageInput("");
    setActiveRequest(setState, "send-message");

    try {
      const payload = await apiRequest(
        `/api/simulations/${state.sessionId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ message: text })
        },
        state.sessionToken
      );

      if (payload.moderated) {
        appendChatItem(setState, {
          kind: "system",
          label: "",
          text: `Moderador: ${payload.moderator.reason}`
        });
        return;
      }

      setState((current) => ({
        ...current,
        lastIntent: payload.intent ?? ""
      }));

      appendChatItem(setState, {
        kind: "assistant",
        label: "Cliente",
        text: payload.reply
      });

      if (payload.shouldEnd) {
        appendChatItem(setState, {
          kind: "system",
          label: "",
          text: "A intenção detectou possibilidade de encerramento da conversa."
        });
      }
    } catch (error) {
      appendChatItem(setState, {
        kind: "system",
        label: "",
        text: error.message
      });
    } finally {
      setActiveRequest(setState, "");
    }
  }

  async function handleGenerateReport() {
    if (!state.sessionId) {
      return;
    }

    setActiveRequest(setState, "generate-report");

    try {
      const payload = await apiRequest(
        `/api/simulations/${state.sessionId}/report`,
        {
          method: "POST",
          body: "{}"
        },
        state.sessionToken
      );

      setState((current) => ({
        ...current,
        report: payload.report,
        feedbackStatus: "Tudo pronto para registrar o feedback final."
      }));

      appendChatItem(setState, {
        kind: "system",
        label: "",
        text: "Relatório do gerente gerado com sucesso."
      });
    } catch (error) {
      appendChatItem(setState, {
        kind: "system",
        label: "",
        text: error.message
      });
    } finally {
      setActiveRequest(setState, "");
    }
  }

  async function handleFeedbackSubmit(event) {
    event.preventDefault();
    if (!state.sessionId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    payload.realismScore = Number(payload.realismScore);
    payload.challengeScore = Number(payload.challengeScore);
    payload.interactionQualityScore = Number(payload.interactionQualityScore);
    payload.feedbackUtilityScore = Number(payload.feedbackUtilityScore);
    payload.learningImpactScore = Number(payload.learningImpactScore);

    setActiveRequest(setState, "send-feedback");

    try {
      await apiRequest(
        `/api/simulations/${state.sessionId}/feedback`,
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        state.sessionToken
      );

      setState((current) => ({
        ...current,
        feedbackStatus: "Feedback salvo com sucesso."
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        feedbackStatus: error.message
      }));
    } finally {
      setActiveRequest(setState, "");
    }
  }

  async function copyDevCode() {
    if (!state.devCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(state.devCode);
      setClipboardStatus("Código copiado.");
    } catch {
      setClipboardStatus("Não foi possível copiar automaticamente.");
    }
  }

  function resetApp() {
    setState(initialState);
    setEmailInput("");
    setCodeInput("");
    setMessageInput("");
    setClipboardStatus("");

    fetch("/api/health")
      .then((response) => {
        setState((current) => ({ ...current, healthOk: response.ok }));
      })
      .catch(() => {
        setState((current) => ({ ...current, healthOk: false }));
      });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">RN</div>
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
      </aside>

      <main className="main">
        <section className="hero">
          <div>
            <p className="eyebrow">Validação do novo stack</p>
            <h2>Fluxo completo do simulador em paralelo ao legado</h2>
            <p className="hero-copy">
              Autentique, gere um cenário, conduza a conversa, produza o relatório do gerente e registre o feedback
              final.
            </p>
          </div>
          <button className="ghost-button" onClick={resetApp} type="button">
            Limpar sessão
          </button>
        </section>

        <section className="grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">1. Acesso</p>
                <h3>Entrar no simulador</h3>
              </div>
            </div>

            <form className="stack" onSubmit={handleRequestCode}>
              <label className="field">
                <span>E-mail</span>
                <input
                  type="email"
                  placeholder="voce@empresa.com"
                  required
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                />
              </label>
              <button type="submit" className="primary-button" disabled={isBusy("request-code")}>
                {isBusy("request-code") ? "Enviando..." : "Enviar código"}
              </button>
            </form>

            {state.email ? (
              <form className="stack compact" onSubmit={handleVerifyCode}>
                <label className="field">
                  <span>Código</span>
                  <input
                    type="text"
                    placeholder="000000"
                    required
                    value={codeInput}
                    onChange={(event) => setCodeInput(event.target.value)}
                  />
                </label>
                <button type="submit" className="primary-button" disabled={isBusy("verify-code")}>
                  {isBusy("verify-code") ? "Validando..." : "Validar código"}
                </button>
              </form>
            ) : null}

            {state.devCode ? (
              <div className="dev-code-card">
                <div>
                  <p className="eyebrow">Código de desenvolvimento</p>
                  <strong>{state.devCode}</strong>
                  <p className="helper-text">Esse bloco aparece só fora de produção, para agilizar os testes internos.</p>
                </div>
                <button type="button" className="secondary-button" onClick={copyDevCode}>
                  Copiar
                </button>
              </div>
            ) : null}

            {clipboardStatus ? <div className="helper-text">{clipboardStatus}</div> : null}
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
              >
                {isBusy("create-simulation") ? "Gerando..." : "Criar simulação"}
              </button>
            </div>

            <div className="scenario-box">
              {state.scenario ? (
                <>
                  <div className="scenario-highlights">
                    <div className="mini-metric">
                      <span className="eyebrow">Persona</span>
                      <strong>{state.scenario.dynamic_block_json.personagem.nome}</strong>
                    </div>
                    <div className="mini-metric">
                      <span className="eyebrow">Cargo</span>
                      <strong>{state.scenario.dynamic_block_json.personagem.cargo}</strong>
                    </div>
                    <div className="mini-metric">
                      <span className="eyebrow">Empresa</span>
                      <strong>{state.scenario.dynamic_block_json.personagem.empresa}</strong>
                    </div>
                    <div className="mini-metric">
                      <span className="eyebrow">Nível</span>
                      <strong>{state.scenario.dynamic_block_json.personagem.personalidade_nivel.nivel}</strong>
                    </div>
                  </div>
                  <p>{state.scenario.manager_context}</p>
                </>
              ) : (
                <p className="muted">Assim que a simulação for criada, o resumo do cenário aparece aqui.</p>
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
              {state.lastIntent === "intention_true" ? <span className="intent-chip">Encerramento sugerido</span> : null}
              <button
                type="button"
                className="secondary-button"
                disabled={!state.sessionId || isBusy("generate-report")}
                onClick={handleGenerateReport}
              >
                {isBusy("generate-report") ? "Gerando..." : "Gerar relatório"}
              </button>
            </div>
          </div>

          <div className="chat-log">
            {state.chatItems.map((item, index) => (
              <article className={`message ${item.kind}`} key={`${item.kind}-${index}`}>
                {item.kind !== "system" ? <span className="message-label">{item.label}</span> : null}
                <div>{item.text}</div>
              </article>
            ))}
            {isBusy("send-message") ? <p className="system-line">Cliente pensando na próxima resposta...</p> : null}
          </div>

          <form className="composer" onSubmit={handleSendMessage}>
            <textarea
              placeholder="Escreva a próxima fala do vendedor..."
              rows={3}
              disabled={!state.sessionId || isBusy("send-message")}
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
            />
            <button
              type="submit"
              className="primary-button"
              disabled={!state.sessionId || !messageInput.trim() || isBusy("send-message")}
            >
              {isBusy("send-message") ? "Enviando..." : "Enviar"}
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
                      <p>{state.report.report_json.Resumo}</p>
                    </div>
                    <div>
                      <h4>Preparação</h4>
                      <p>{state.report.report_json.Preparacao}</p>
                    </div>
                    <div>
                      <h4>Análise</h4>
                      <p>{state.report.report_json.Analise}</p>
                    </div>
                    <div>
                      <h4>Cocriação</h4>
                      <p>{state.report.report_json.Cocriacao}</p>
                    </div>
                    <div>
                      <h4>Engajamento</h4>
                      <p>{state.report.report_json.Engajamento}</p>
                    </div>
                    <div>
                      <h4>Recomendações</h4>
                      <p>{state.report.report_json.Recomendacoes ?? state.report.report_summary}</p>
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

            {state.report ? (
              <form className="stack" onSubmit={handleFeedbackSubmit}>
                <div className="rating-grid">
                  <label className="field">
                    <span>Realismo</span>
                    <input name="realismScore" type="number" min="1" max="5" defaultValue="5" required />
                  </label>
                  <label className="field">
                    <span>Desafio</span>
                    <input name="challengeScore" type="number" min="1" max="5" defaultValue="4" required />
                  </label>
                  <label className="field">
                    <span>Interação</span>
                    <input name="interactionQualityScore" type="number" min="1" max="5" defaultValue="4" required />
                  </label>
                  <label className="field">
                    <span>Utilidade</span>
                    <input name="feedbackUtilityScore" type="number" min="1" max="5" defaultValue="5" required />
                  </label>
                  <label className="field">
                    <span>Aprendizado</span>
                    <input name="learningImpactScore" type="number" min="1" max="5" defaultValue="4" required />
                  </label>
                </div>

                <label className="field">
                  <span>Comentário</span>
                  <textarea
                    name="userFeedback"
                    rows={4}
                    placeholder="Como foi usar esta nova versão?"
                    defaultValue="Fluxo inicial do novo simulador funcionando bem."
                  />
                </label>

                <button type="submit" className="primary-button" disabled={isBusy("send-feedback")}>
                  {isBusy("send-feedback") ? "Salvando..." : "Salvar feedback"}
                </button>
              </form>
            ) : null}

            <div className="notice">{state.feedbackStatus}</div>
          </section>
        </section>
      </main>
    </div>
  );
}
