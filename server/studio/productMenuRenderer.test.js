import { describe, expect, it } from "vitest";
import { renderProductMenuSpec, validateProductMenuSpec } from "./productMenuRenderer.js";

const spec = {
  version: "1.0",
  layout: "product-menu-showcase",
  theme: {
    primaryColor: "#0f766e", secondaryColor: "#134e4a", accentColor: "#f59e0b", backgroundColor: "#f7fbfa",
    surfaceColor: "#ffffff", textColor: "#13201e", mutedTextColor: "#64736f", radius: "lg", mood: "modern"
  },
  sections: [
    { id: "hero", type: "hero", variant: "spotlight" },
    { id: "catalog", type: "catalog", variant: "grid" },
    { id: "cart", type: "cart", variant: "drawer" }
  ],
  components: ["navbar", "hero", "category-filter", "product-card", "cart-panel", "footer"],
  content: {
    brand: { name: "Brew & Bean", tagline: "Coffee worth slowing down for." },
    hero: { eyebrow: "Fresh today", title: "Your daily cup, better.", description: "A focused coffee collection for easy browsing.", cta: "Explore menu" },
    catalog: {
      title: "Shop our favourites", description: "Browse the menu and add a favourite.", categories: ["Coffee", "Bakery"],
      items: [
        { name: "Cappuccino", description: "Velvety espresso and milk.", price: "₹180", tag: "Popular", category: "Coffee" },
        { name: "Latte", description: "Smooth and balanced.", price: "₹190", tag: "Classic", category: "Coffee" },
        { name: "Cold Brew", description: "Slow-steeped and bright.", price: "₹210", tag: "Chilled", category: "Coffee" },
        { name: "Croissant", description: "Buttery and flaky.", price: "₹140", tag: "Fresh", category: "Bakery" }
      ]
    },
    cart: { title: "Your basket", emptyMessage: "Add a favourite to get started.", buttonLabel: "Place order request", successMessage: "Thanks — your order request is ready." },
    footer: { note: "Made for good coffee." }
  },
  responsive: { breakpoint: "768px", hero: "stack", productColumns: { desktop: 3, mobile: 1 }, navigation: "collapse" }
};

describe("product menu renderer", () => {
  it("accepts the supported product menu spec", () => {
    expect(validateProductMenuSpec(spec).layout).toBe("product-menu-showcase");
  });
  it("renders deterministic React and responsive CSS", () => {
    const files = renderProductMenuSpec(spec);
    expect(files["/App.js"]).toContain("product-card");
    expect(files["/App.js"]).toContain("useMemo");
    expect(files["/styles.css"]).toContain("@media (max-width: 768px)");
  });
  it("rejects unsupported section variants", () => {
    expect(() => validateProductMenuSpec({ ...spec, sections: [{ ...spec.sections[0], variant: "split" }, ...spec.sections.slice(1)] })).toThrow();
  });
});
