import { describe, expect, it } from "vitest";
import { renderStudioSpec, validateStudioSpec } from "./templateRenderer.js";

const baseSpec = {
  version: "1.0",
  layout: "landing-page",
  theme: {
    primaryColor: "#7c3aed",
    secondaryColor: "#312e81",
    accentColor: "#f59e0b",
    backgroundColor: "#fffaf5",
    surfaceColor: "#ffffff",
    textColor: "#171717",
    mutedTextColor: "#6b625c",
    radius: "lg",
    mood: "warm"
  },
  sections: [
    { id: "hero", type: "hero", variant: "split" },
    { id: "menu", type: "menu", variant: "cards" },
    { id: "booking", type: "booking", variant: "form" }
  ],
  components: ["navbar", "hero", "menu-card", "booking-form", "footer"],
  content: {
    brand: { name: "Brew & Bean", tagline: "Coffee, plates, good company." },
    hero: { eyebrow: "Neighbourhood favourite", title: "Come for the coffee. Stay for the table.", description: "A warm all-day cafe with bold coffee and thoughtful plates.", primaryCta: "Book a table", secondaryCta: "See the menu" },
    menu: { title: "From the kitchen", description: "A few favourites made for slow mornings and easy evenings.", items: [
      { name: "Smoked Tomato Toast", description: "Sourdough, whipped ricotta and herbs.", price: "₹320", tag: "Popular" },
      { name: "House Cappuccino", description: "Double espresso with silky steamed milk.", price: "₹180", tag: "Classic" },
      { name: "Cocoa Cloud", description: "Dark chocolate, sea salt and vanilla cream.", price: "₹240", tag: "Sweet" }
    ] },
    booking: { title: "Save your seat", description: "Pick a date and send a simple request to the team.", buttonLabel: "Request reservation", successMessage: "Thanks — your reservation request is ready to confirm." },
    footer: { note: "Made for memorable meals." }
  },
  responsive: { breakpoint: "768px", hero: "stack", menuColumns: { desktop: 3, mobile: 1 }, navigation: "collapse" }
};

describe("Studio template renderer", () => {
  it("accepts the supported landing-page spec", () => {
    const spec = validateStudioSpec(baseSpec);
    expect(spec.layout).toBe("landing-page");
    expect(spec.sections.map((section) => section.id)).toEqual(["hero", "menu", "booking"]);
  });

  it("renders deterministic React and CSS artifacts", () => {
    const files = renderStudioSpec(baseSpec);
    expect(Object.keys(files)).toEqual(["/App.js", "/styles.css"]);
    expect(files["/App.js"]).toContain("const CONTENT =");
    expect(files["/App.js"]).toContain("Brew & Bean");
    expect(files["/App.js"]).toContain("CONTENT.menu.title");
    expect(files["/App.js"]).toContain("Smoked Tomato Toast");
    expect(files["/styles.css"]).toContain("grid-template-columns:repeat(3");
    expect(files["/styles.css"]).toContain("@media(max-width:768px)");
  });

  it("rejects unsupported layout or section variants", () => {
    expect(() => validateStudioSpec({ ...baseSpec, layout: "dashboard" })).toThrow();
    expect(() => validateStudioSpec({ ...baseSpec, sections: [{ ...baseSpec.sections[0], variant: "grid" }, ...baseSpec.sections.slice(1)] })).toThrow();
  });
});
