const state = {
  email: "",
  sessionToken: "",
  user: null,
  sessionId: "",
  scenario: null,
  report: null,
  healthOk: false
};

const elements = {
  healthStatus: document.querySelector("#health-status"),
  sessionStatus: document.querySelector("#session-status"),
  simulationStatus: document.querySelector("#simulation-status"),
  requestCodeForm: document.querySelector("#request-code-form"),
  verifyCodeForm: document.querySelector("#verify-code-form"),
  emailInput: document.querySelector("#email-input"),
  codeInput: document.querySelector("#code-input"),
  devCodeBox: document.querySelector("#dev-code-box"),
  createSimulationButton: document.querySelector("#create-simulation-button"),
  scenarioBox: document.querySelector("#scenario-box"),
  chatLog: document.querySelector("#chat-log"),
  messageForm: document.querySelector("#message-form"),
  messageInput: document.querySelector("#message-input"),
  sendMessageButton: document.querySelector("#send-message-button"),
  generateReportButton: document.querySelector("#generate-report-button"),
  reportBox: document.querySelector("#report-box"),
  feedbackForm: document.querySelector("#feedback-form"),
  feedbackStatus: document.querySelector("#feedback-status"),
  resetApp: document.querySelector("#reset-app")
};

function updateStatuses() {
  elements.healthStatus.textContent = state.healthOk ? "API online" : "API indisponível";
  elements.sessionStatus.textContent = state.user
    ? `${state.user.name} autenticado`
    : "Aguardando autenticação";
  elements.simulationStatus.textContent = state.sessionId
    ? `Sessão ativa ${state.sessionId.slice(0, 8)}`
    : "Nenhuma simulação ativa";
}

function appendMessage(kind, label, text) {
  const article = document.createElement("article");
  article.className = `message ${kind}`;
  if (kind !== "system") {
    const caption = document.createElement("span");
    caption.className = "message-label";
    caption.textContent = label;
    article.appendChild(caption);
  }

  const paragraph = document.createElement("div");
  paragraph.textContent = text;
  article.appendChild(paragraph);
  elements.chatLog.appendChild(article);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function resetChat() {
  elements.chatLog.innerHTML = "";
  appendMessage("system", "", "Aguardando criação da simulação.");
}

function renderScenario() {
  if (!state.scenario) {
    elements.scenarioBox.innerHTML = '<p class="muted">Assim que a simulação for criada, o resumo do cenário aparece aqui.</p>';
    return;
  }

  const personagem = state.scenario.dynamic_block_json.personagem;
  elements.scenarioBox.innerHTML = `
    <h4>${personagem.nome}, ${personagem.cargo}</h4>
    <p><strong>Empresa:</strong> ${personagem.empresa}</p>
    <p><strong>Nível:</strong> ${personagem.personalidade_nivel.nivel}</p>
    <p>${state.scenario.manager_context}</p>
  `;
}

function renderReport() {
  if (!state.report) {
    elements.reportBox.innerHTML = '<p class="muted">O relatório final aparece aqui depois da conversa.</p>';
    elements.feedbackForm.classList.add("hidden");
    elements.feedbackStatus.textContent = "O formulário de feedback será liberado depois do relatório.";
    return;
  }

  const reportJson = state.report.report_json;
  elements.reportBox.innerHTML = `
    <div class="report-meta">
      <div class="metric"><span class="eyebrow">P</span><strong>${state.report.questions_score ?? "-"}</strong></div>
      <div class="metric"><span class="eyebrow">A</span><strong>${state.report.analysis_score ?? "-"}</strong></div>
      <div class="metric"><span class="eyebrow">C</span><strong>${state.report.creativity_score ?? "-"}</strong></div>
      <div class="metric"><span class="eyebrow">E</span><strong>${state.report.engagement_score ?? "-"}</strong></div>
      <div class="metric"><span class="eyebrow">Média</span><strong>${state.report.average_score ?? "-"}</strong></div>
    </div>
    <div class="report-copy">
      <div><h4>Resumo</h4><p>${reportJson.Resumo}</p></div>
      <div><h4>Preparação</h4><p>${reportJson.Preparacao}</p></div>
      <div><h4>Análise</h4><p>${reportJson.Analise}</p></div>
      <div><h4>Cocriação</h4><p>${reportJson.Cocriacao}</p></div>
      <div><h4>Engajamento</h4><p>${reportJson.Engajamento}</p></div>
      <div><h4>Recomendações</h4><p>${reportJson.Recomendacoes}</p></div>
    </div>
  `;

  elements.feedbackForm.classList.remove("hidden");
  elements.feedbackStatus.textContent = "Tudo pronto para registrar o feedback final.";
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  headers.set("Content-Type", "application/json");

  if (state.sessionToken) {
    headers.set("Authorization", `Bearer ${state.sessionToken}`);
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

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    state.healthOk = response.ok;
  } catch {
    state.healthOk = false;
  }

  updateStatuses();
}

elements.requestCodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    state.email = elements.emailInput.value.trim();
    const payload = await request("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ email: state.email })
    });

    elements.verifyCodeForm.classList.remove("hidden");
    elements.devCodeBox.classList.remove("hidden");
    elements.devCodeBox.textContent = payload.developmentCodePreview
      ? `Código de desenvolvimento: ${payload.developmentCodePreview}`
      : "Código enviado por e-mail.";
    appendMessage("system", "", "Código de acesso gerado. Valide para continuar.");
  } catch (error) {
    appendMessage("system", "", error.message);
  }
});

elements.verifyCodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await request("/api/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({
        email: state.email,
        code: elements.codeInput.value.trim()
      })
    });

    state.sessionToken = payload.sessionToken;
    state.user = payload.user;
    elements.createSimulationButton.disabled = false;
    updateStatuses();
    appendMessage("system", "", `Sessão autenticada para ${state.user.name}.`);
  } catch (error) {
    appendMessage("system", "", error.message);
  }
});

elements.createSimulationButton.addEventListener("click", async () => {
  try {
    const payload = await request("/api/simulations", {
      method: "POST",
      body: "{}"
    });

    state.sessionId = payload.session.id;
    state.scenario = payload.scenario;
    state.report = null;
    renderScenario();
    renderReport();
    resetChat();
    elements.messageInput.disabled = false;
    elements.sendMessageButton.disabled = false;
    elements.generateReportButton.disabled = false;
    updateStatuses();
    appendMessage("system", "", "Simulação criada. Você já pode iniciar a conversa.");
  } catch (error) {
    appendMessage("system", "", error.message);
  }
});

elements.messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = elements.messageInput.value.trim();
  if (!message || !state.sessionId) {
    return;
  }

  appendMessage("user", "Vendedor", message);
  elements.messageInput.value = "";

  try {
    const payload = await request(`/api/simulations/${state.sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message })
    });

    if (payload.moderated) {
      appendMessage("system", "", `Moderador: ${payload.moderator.reason}`);
      return;
    }

    appendMessage("assistant", "Cliente", payload.reply);
    if (payload.shouldEnd) {
      const chip = document.createElement("div");
      chip.className = "intent-chip";
      chip.textContent = "A intenção detectou possibilidade de encerramento da conversa.";
      elements.chatLog.appendChild(chip);
      elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
    }
  } catch (error) {
    appendMessage("system", "", error.message);
  }
});

elements.generateReportButton.addEventListener("click", async () => {
  if (!state.sessionId) {
    return;
  }

  try {
    const payload = await request(`/api/simulations/${state.sessionId}/report`, {
      method: "POST",
      body: "{}"
    });

    state.report = payload.report;
    renderReport();
    appendMessage("system", "", "Relatório do gerente gerado com sucesso.");
  } catch (error) {
    appendMessage("system", "", error.message);
  }
});

elements.feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.sessionId) {
    return;
  }

  const formData = new FormData(elements.feedbackForm);
  const payload = Object.fromEntries(formData.entries());

  payload.realismScore = Number(payload.realismScore);
  payload.challengeScore = Number(payload.challengeScore);
  payload.interactionQualityScore = Number(payload.interactionQualityScore);
  payload.feedbackUtilityScore = Number(payload.feedbackUtilityScore);
  payload.learningImpactScore = Number(payload.learningImpactScore);

  try {
    await request(`/api/simulations/${state.sessionId}/feedback`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    elements.feedbackStatus.textContent = "Feedback salvo com sucesso.";
  } catch (error) {
    elements.feedbackStatus.textContent = error.message;
  }
});

elements.resetApp.addEventListener("click", () => {
  state.email = "";
  state.sessionToken = "";
  state.user = null;
  state.sessionId = "";
  state.scenario = null;
  state.report = null;
  elements.emailInput.value = "";
  elements.codeInput.value = "";
  elements.verifyCodeForm.classList.add("hidden");
  elements.devCodeBox.classList.add("hidden");
  elements.createSimulationButton.disabled = true;
  elements.messageInput.disabled = true;
  elements.sendMessageButton.disabled = true;
  elements.generateReportButton.disabled = true;
  renderScenario();
  renderReport();
  resetChat();
  updateStatuses();
});

resetChat();
renderScenario();
renderReport();
checkHealth();
