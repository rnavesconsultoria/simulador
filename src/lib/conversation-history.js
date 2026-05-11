function mapActorLabel(actor) {
  switch (actor) {
    case "vendor":
      return "Vendedor";
    case "client":
      return "Cliente";
    case "moderator":
      return "Moderador";
    case "intent":
      return "Intencao";
    case "manager":
      return "Gerente";
    default:
      return "Sistema";
  }
}

const DEFAULT_ACTORS = new Set(["vendor", "client"]);

export function formatConversationHistory(messages, { actors } = {}) {
  const allowed = actors instanceof Set ? actors : (actors ? new Set(actors) : DEFAULT_ACTORS);
  return messages
    .filter((m) => m.content && allowed.has(m.actor))
    .map((m) => `**${mapActorLabel(m.actor)}:** ${m.content}`)
    .join("\n");
}
