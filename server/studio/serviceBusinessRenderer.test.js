import { describe, expect, it } from "vitest";
import { renderServiceBusinessSpec, validateServiceBusinessSpec } from "./serviceBusinessRenderer.js";

const baseSpec = {
  version: "1.0",
  layout: "service-business",
  theme: {
    primaryColor: "#4f46e5", secondaryColor: "#312e81", accentColor: "#f59e0b", backgroundColor: "#f7f7fb", surfaceColor: "#ffffff", textColor: "#17172a", mutedTextColor: "#6b6b80", radius: "lg", mood: "modern"
  },
  sections: [
    { id: "hero", type: "hero", variant: "split" },
    { id: "services", type: "services", variant: "grid" },
    { id: "trust", type: "trust", variant: "proof" },
    { id: "booking", type: "booking", variant: "form" },
    { id: "contact", type: "contact", variant: "details" },
    { id: "footer", type: "footer", variant: "simple" }
  ],
  components: ["navbar", "hero", "service-card", "trust-section", "booking-form", "footer"],
  content: {
    brand: { name: "Glow Studio", tagline: "Beauty, made simple." },
    hero: { eyebrow: "Trusted locally", title: "Feel your best.", description: "Professional beauty services with easy booking.", cta: "Book a service" },
    services: { title: "Our services", description: "Choose what you need.", items: [
      { name: "Haircut", description: "A polished cut tailored to you.", price: "₹500", tag: "Popular" },
      { name: "Color", description: "Fresh color with careful finishing.", price: "₹1200", tag: "Featured" },
      { name: "Styling", description: "Event-ready styling and finish.", price: "₹800", tag: "Available" }
    ] },
    trust: { eyebrow: "Why choose us", title: "Careful work. Clear communication.", points: ["Experienced stylists", "Flexible scheduling", "Friendly local service"] },
    booking: { title: "Book your service", description: "Tell us what you need.", buttonLabel: "Request booking", successMessage: "Thanks — your booking request is ready to confirm." },
    contact: { title: "Let's talk", phone: "Call us for availability", email: "hello@glow.example", hours: "Mon–Sat · 9am–6pm" },
    footer: { note: "Professional service, thoughtfully delivered." }
  },
  responsive: { breakpoint: "768px", hero: "stack", serviceColumns: { desktop: 3, mobile: 1 }, navigation: "collapse" }
};

describe("service business renderer", () => {
  it("accepts the supported service business contract", () => {
    const spec = validateServiceBusinessSpec(baseSpec);
    expect(spec.layout).toBe("service-business");
    expect(spec.content.services.items).toHaveLength(3);
    expect(spec.responsive.serviceColumns.mobile).toBe(1);
  });

  it("renders deterministic React and responsive CSS artifacts", () => {
    const files = renderServiceBusinessSpec(baseSpec);
    expect(files["/App.js"]).toContain("service-grid");
    expect(files["/App.js"]).toContain("booking-form");
    expect(files["/styles.css"]).toContain("@media (max-width:768px)");
    expect(files["/styles.css"]).toContain(".site-shell");
  });

  it("rejects unsupported section order", () => {
    expect(() => validateServiceBusinessSpec({ ...baseSpec, sections: [...baseSpec.sections].reverse() })).toThrow(/supported order/);
  });

  it("rejects fewer than three services", () => {
    expect(() => validateServiceBusinessSpec({ ...baseSpec, content: { ...baseSpec.content, services: { ...baseSpec.content.services, items: baseSpec.content.services.items.slice(0, 2) } } })).toThrow(/at least three services/);
  });
});
