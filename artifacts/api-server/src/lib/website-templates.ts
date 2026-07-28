import type { SiteSection } from "@workspace/db";

export type TemplateId = "modern-shop" | "service" | "restaurant" | "portfolio";

export type TemplateDef = {
  id: TemplateId;
  name: string;
  description: string;
  primaryFont: string;
  palette: { primary: string; secondary: string; bg: string; text: string; accent: string };
  defaultSections: SiteSection[];
};

const heroSection = (headline: string, sub: string): SiteSection => ({
  id: "hero",
  type: "hero",
  enabled: true,
  content: {
    headline,
    subheadline: sub,
    backgroundImage: "",
    ctaText: "Shop Now",
    ctaUrl: "",
    overlayOpacity: "0.4",
  },
});

const aboutSection = (title: string, body: string): SiteSection => ({
  id: "about",
  type: "about",
  enabled: true,
  content: {
    title,
    body,
    image: "",
  },
});

const productsSection = (): SiteSection => ({
  id: "products",
  type: "products",
  enabled: true,
  content: {
    title: "Our Products & Services",
    subtitle: "Explore our full range of offerings",
    items: JSON.stringify([
      { name: "Product 1", description: "A great product", price: "", image: "" },
      { name: "Product 2", description: "Another offering", price: "", image: "" },
      { name: "Product 3", description: "Popular choice", price: "", image: "" },
    ]),
  },
});

const gallerySection = (): SiteSection => ({
  id: "gallery",
  type: "gallery",
  enabled: false,
  content: {
    title: "Gallery",
    images: JSON.stringify([]),
  },
});

const testimonialsSection = (): SiteSection => ({
  id: "testimonials",
  type: "testimonials",
  enabled: false,
  content: {
    title: "What Our Customers Say",
    items: JSON.stringify([
      { name: "Jane Doe", role: "Customer", text: "Absolutely love this business! Highly recommended.", avatar: "" },
      { name: "John Smith", role: "Regular Client", text: "Top quality and great service every time.", avatar: "" },
    ]),
  },
});

const contactSection = (email: string): SiteSection => ({
  id: "contact",
  type: "contact",
  enabled: true,
  content: {
    title: "Get In Touch",
    email,
    phone: "",
    address: "",
    showForm: "true",
  },
});

const socialSection = (): SiteSection => ({
  id: "social",
  type: "social",
  enabled: true,
  content: {
    title: "Follow Us",
    facebook: "",
    instagram: "",
    twitter: "",
    linkedin: "",
    tiktok: "",
    youtube: "",
  },
});

const shopSection = (): SiteSection => ({
  id: "shop",
  type: "shop",
  enabled: false,
  content: {
    title: "Shop Our Products",
    subtitle: "Browse our full catalog and order directly — fast, easy checkout",
    view: "grid",
    columns: "3",
    cta: "Add to Cart",
  },
});

const whatsappSection = (): SiteSection => ({
  id: "whatsapp_cta",
  type: "whatsapp_cta",
  enabled: true,
  content: {
    message: "Hi! I'd like to know more about your products.",
    number: "",
    buttonText: "Chat on WhatsApp",
  },
});

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  "modern-shop": {
    id: "modern-shop",
    name: "Modern Shop",
    description: "Clean, bold e-commerce look for product-based businesses",
    primaryFont: "Inter, sans-serif",
    palette: { primary: "#7F50FF", secondary: "#FF7F50", bg: "#FFFFFF", text: "#111827", accent: "#F3F0FF" },
    defaultSections: [
      heroSection("Welcome to Our Store", "Discover quality products at great prices"),
      aboutSection("About Us", "We are dedicated to bringing you the best products with exceptional customer service. Our team works hard every day to exceed your expectations."),
      productsSection(),
      shopSection(),
      gallerySection(),
      testimonialsSection(),
      contactSection(""),
      socialSection(),
      whatsappSection(),
    ],
  },
  service: {
    id: "service",
    name: "Service Business",
    description: "Professional, trust-building layout for service providers",
    primaryFont: "Georgia, serif",
    palette: { primary: "#1D4ED8", secondary: "#F59E0B", bg: "#F9FAFB", text: "#111827", accent: "#EFF6FF" },
    defaultSections: [
      heroSection("Expert Services You Can Trust", "Professional solutions tailored to your needs"),
      aboutSection("Our Story", "With years of experience in the industry, we provide reliable, high-quality services that make a difference. We're committed to your success."),
      { ...productsSection(), content: { ...productsSection().content, title: "Our Services", subtitle: "Everything you need, all in one place" } },
      testimonialsSection(),
      gallerySection(),
      contactSection(""),
      socialSection(),
      whatsappSection(),
    ],
  },
  restaurant: {
    id: "restaurant",
    name: "Restaurant & Food",
    description: "Warm, appetizing design for food businesses & eateries",
    primaryFont: "Playfair Display, Georgia, serif",
    palette: { primary: "#DC2626", secondary: "#F59E0B", bg: "#FFFBF5", text: "#1C1917", accent: "#FEF3C7" },
    defaultSections: [
      heroSection("Taste the Difference", "Fresh ingredients, unforgettable flavors — served with love"),
      aboutSection("Our Kitchen Story", "Every dish we serve tells a story of passion and tradition. We source the freshest local ingredients to create meals that bring people together."),
      { ...productsSection(), content: { ...productsSection().content, title: "Our Menu", subtitle: "Handcrafted with the finest ingredients" } },
      gallerySection(),
      testimonialsSection(),
      contactSection(""),
      socialSection(),
      whatsappSection(),
    ],
  },
  portfolio: {
    id: "portfolio",
    name: "Portfolio",
    description: "Creative, minimal layout for freelancers & creatives",
    primaryFont: "DM Sans, sans-serif",
    palette: { primary: "#18181B", secondary: "#A855F7", bg: "#FAFAFA", text: "#18181B", accent: "#FAF5FF" },
    defaultSections: [
      heroSection("Hello, I'm a Creative Professional", "I build things that people love to use"),
      aboutSection("About Me", "I'm a passionate creative with expertise in my craft. I work with brands and businesses to create experiences that resonate and deliver results."),
      { ...productsSection(), content: { ...productsSection().content, title: "My Work", subtitle: "Selected projects and case studies" } },
      gallerySection(),
      testimonialsSection(),
      contactSection(""),
      socialSection(),
      whatsappSection(),
    ],
  },
};

/** Generate a URL-safe slug from a vendor name */
export function generateSlug(vendorName: string, vendorId: number): string {
  const base = vendorName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "my-business";
  return `${base}-${vendorId}`;
}
