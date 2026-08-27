export function extractIncomingMessages(payload) {
  const messages = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change?.value;
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      const contactByWaId = new Map(
        contacts
          .filter((contact) => contact?.wa_id)
          .map((contact) => [contact.wa_id, contact])
      );

      const incoming = Array.isArray(value?.messages) ? value.messages : [];
      for (const message of incoming) {
        if (!message?.id || !message?.from) continue;

        messages.push({
          id: String(message.id),
          from: String(message.from),
          type: message.type || "unknown",
          timestamp: message.timestamp || null,
          text: message.type === "text" ? message.text?.body || "" : "",
          contact: contactByWaId.get(message.from) || null,
          phoneNumberId: value?.metadata?.phone_number_id || null,
          displayPhoneNumber: value?.metadata?.display_phone_number || null,
        });
      }
    }
  }

  return messages;
}

export function getMessageIds(payload) {
  return extractIncomingMessages(payload).map((message) => message.id);
}
