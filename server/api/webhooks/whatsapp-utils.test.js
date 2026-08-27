import { describe, expect, it } from "vitest";
import { extractIncomingMessages, getMessageIds } from "./whatsapp-utils.js";

describe("WhatsApp webhook helpers", () => {
  it("extracts text messages and sender metadata", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            metadata: {
              phone_number_id: "123",
              display_phone_number: "15550000000",
            },
            contacts: [{ wa_id: "919999999999", profile: { name: "Test User" } }],
            messages: [{
              id: "wamid.test-1",
              from: "919999999999",
              timestamp: "1760000000",
              type: "text",
              text: { body: "Hi PromptStudio" },
            }],
          },
        }],
      }],
    };

    expect(extractIncomingMessages(payload)).toEqual([{
      id: "wamid.test-1",
      from: "919999999999",
      type: "text",
      timestamp: "1760000000",
      text: "Hi PromptStudio",
      contact: { wa_id: "919999999999", profile: { name: "Test User" } },
      phoneNumberId: "123",
      displayPhoneNumber: "15550000000",
    }]);
  });

  it("ignores malformed messages and returns stable message ids", () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [
        { id: "one", from: "1", type: "image" },
        { id: "two", from: "2", type: "text", text: { body: "hello" } },
        { from: "missing-id" },
      ] } }] }],
    };

    expect(getMessageIds(payload)).toEqual(["one", "two"]);
  });
});
