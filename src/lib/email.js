import { env } from "../config/env.js";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendMagicLinkEmail({ to, name, code, magicUrl }) {
  const apiKey = env.resendApiKey;
  if (!apiKey) {
    return { ok: false, reason: "missing_api_key" };
  }

  const safeName = name ? name.split(/\s+/)[0] : "vendedor(a)";
  const subject = "Seu acesso ao Simulador RNaves";

  const html = `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background:#0b1121;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1121;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0f172a;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:32px;">
            <tr>
              <td style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#14b8a6;font-weight:600;padding-bottom:10px;">
                IA R Naves
              </td>
            </tr>
            <tr>
              <td style="font-size:22px;font-weight:600;color:#ffffff;padding-bottom:12px;">
                Olá, ${escapeHtml(safeName)} — seu acesso está pronto.
              </td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.55;color:#cbd5f5;padding-bottom:22px;">
                Clique no botão abaixo para entrar diretamente no simulador. O link vale por 15 minutos.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <a href="${escapeHtml(magicUrl)}" style="display:inline-block;padding:14px 26px;border-radius:10px;background:#14b8a6;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;letter-spacing:0.01em;">
                  Entrar no simulador
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.55;color:#94a3b8;padding-bottom:6px;">
                Se preferir, cole o código abaixo no simulador:
              </td>
            </tr>
            <tr>
              <td style="font-size:24px;letter-spacing:0.24em;font-weight:600;color:#14b8a6;padding-bottom:22px;">
                ${escapeHtml(code)}
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;line-height:1.55;color:#64748b;border-top:1px solid rgba(255,255,255,0.06);padding-top:18px;">
                Se você não pediu esse acesso, pode ignorar este e-mail.<br>
                R Naves Consultoria · IA de Treinamento de Vendas
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Olá, ${safeName}.

Seu acesso ao Simulador RNaves está pronto.
Clique no link abaixo (vale por 15 minutos):

${magicUrl}

Ou cole este código no simulador: ${code}

Se não foi você que pediu, ignore este e-mail.

R Naves Consultoria — IA de Treinamento de Vendas`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [to],
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    let errorText;
    try {
      errorText = JSON.stringify(await response.json());
    } catch {
      errorText = await response.text().catch(() => "");
    }
    return { ok: false, status: response.status, error: errorText };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* ignore */
  }
  return { ok: true, id: payload?.id ?? null };
}
