"use client";

export function LoginScreen({
  flowStep,
  email,
  messageInput,
  setMessageInput,
  devCode,
  isRequesting,
  isVerifying,
  bannerError,
  onSubmitEmail,
  onSubmitCode,
  onBack,
  onDismissError
}) {
  function handleEmailSubmit(event) {
    event.preventDefault();
    if (!messageInput.trim() || isRequesting) return;
    onSubmitEmail();
  }

  function handleCodeSubmit(event) {
    event.preventDefault();
    if (!messageInput.trim() || isVerifying) return;
    onSubmitCode();
  }

  return (
    <div className="login-screen">
      <div className="login-bg-layer" aria-hidden="true">
        <div className="login-bg-image" />
        <div className="login-bg-gradient" />
        <div className="login-bg-glow-teal" />
        <div className="login-bg-glow-navy" />
        <div className="login-bg-line" />
      </div>

      <div className="login-shell">
        <div className={`login-logo${flowStep === "awaiting_email" ? " is-large" : ""}`}>
          <img src="/Logos/vertical-white.svg" alt="R Naves Consultoria" />
        </div>
        <div className={`login-divider${flowStep === "awaiting_email" ? " is-large" : ""}`} aria-hidden="true" />

        {flowStep === "awaiting_email" ? (
          <section className="login-step login-step-email">
            <header>
              <h1 className="login-heading">
                Bem-vindo ao seu<br />
                <span className="login-heading-accent">simulador de vendas</span>
              </h1>
              <p className="login-lead">
                Treine técnicas de negociação consultiva com cenários reais e receba avaliação personalizada.
              </p>
            </header>

            {bannerError ? (
              <div className="login-error" role="alert">
                <span>{bannerError}</span>
                {onDismissError ? (
                  <button type="button" onClick={onDismissError} aria-label="Fechar aviso">
                    ✕
                  </button>
                ) : null}
              </div>
            ) : null}

            <form className="login-form" onSubmit={handleEmailSubmit}>
              <div className="login-field">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="login-field-icon"
                >
                  <rect x="2" y="3.5" width="14" height="11" rx="2" />
                  <path d="M2 5.5l7 4.5 7-4.5" />
                </svg>
                <input
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  autoFocus
                  required
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  disabled={isRequesting}
                />
              </div>
              <button
                type="submit"
                className="login-primary"
                disabled={!messageInput.trim() || isRequesting}
              >
                {isRequesting ? "Enviando…" : "Continuar"}
              </button>
            </form>

            <p className="login-helper">
              Sua empresa precisa ter contratado o sistema
              <br />
              e você estar cadastrado.
            </p>
          </section>
        ) : (
          <section className="login-step login-step-code">
            <header>
              <h2 className="login-heading login-heading-sm">
                Verifique seu <span className="login-heading-accent">acesso</span>
              </h2>
              <p className="login-lead">
                Enviamos um código de verificação para
                <br />
                <strong className="login-email">{email}</strong>
              </p>
            </header>

            {devCode ? (
              <div className="login-devcode">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <circle cx="7" cy="7" r="5.5" />
                  <path d="M7 5v2M7 9h.01" />
                </svg>
                <span>
                  Dev: <strong>{devCode}</strong>
                </span>
              </div>
            ) : null}

            {bannerError ? (
              <div className="login-error" role="alert">
                <span>{bannerError}</span>
                {onDismissError ? (
                  <button type="button" onClick={onDismissError} aria-label="Fechar aviso">
                    ✕
                  </button>
                ) : null}
              </div>
            ) : null}

            <form className="login-form login-form-code" onSubmit={handleCodeSubmit}>
              <input
                className="login-code-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                autoComplete="one-time-code"
                autoFocus
                placeholder="000000"
                value={messageInput}
                onChange={(event) =>
                  setMessageInput(event.target.value.replace(/\D/g, ""))
                }
                disabled={isVerifying}
              />
              <button
                type="submit"
                className="login-primary"
                disabled={messageInput.trim().length < 4 || isVerifying}
              >
                {isVerifying ? "Validando…" : "Verificar código"}
              </button>
            </form>

            <button
              type="button"
              className="login-back"
              onClick={() => {
                if (onBack) onBack();
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M8 1.5L3.5 6 8 10.5" />
              </svg>
              Usar outro e-mail
            </button>
          </section>
        )}

        <div className="login-dots" aria-hidden="true">
          <span className={flowStep === "awaiting_email" ? "is-active" : ""} />
          <span className={flowStep === "awaiting_code" ? "is-active" : ""} />
          <span />
        </div>
      </div>

      <footer className="login-footer">
        R Naves Consultoria · Simulador de Vendas Consultivas
      </footer>
    </div>
  );
}
