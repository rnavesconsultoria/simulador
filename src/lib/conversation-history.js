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

export function formatConversationHistory(messages) {
  return messages
    .filter((message) => message.content && ["vendor", "client", "moderator"].includes(message.actor))
    .map((message) => `**${mapActorLabel(message.actor)}:** ${message.content}`)
    .join("\n");
}
