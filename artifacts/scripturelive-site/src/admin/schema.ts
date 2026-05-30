export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "string-list";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  readOnly?: boolean;
  options?: readonly string[];
  placeholder?: string;
}

export interface CollectionDef {
  key: string;
  label: string;
  description: string;
  fileName: string;
  idField: string;
  hasSortOrder: boolean;
  allowAdd: boolean;
  allowDelete: boolean;
  summary: (item: Record<string, any>) => string;
  fields: FieldDef[];
}

export const CONTENT_PATH_PREFIX = "artifacts/scripturelive-site/src/content/";

export const PAGE_KEY_LABELS: Record<string, string> = {
  hero_headline: "Hero headline",
  hero_subtext: "Hero subtext",
  why_description: "Why-section description",
  support_whatsapp: "Support WhatsApp number",
  support_email: "Support email",
  demo_url: "Demo video URL",
};

export const COLLECTIONS: CollectionDef[] = [
  {
    key: "page-content",
    label: "Page Text",
    description:
      "Headlines, subtext and support contact details shown across the site.",
    fileName: "page-content.json",
    idField: "id",
    hasSortOrder: false,
    allowAdd: false,
    allowDelete: false,
    summary: (i) => PAGE_KEY_LABELS[i.key] || i.key,
    fields: [
      { name: "id", label: "ID", type: "number", readOnly: true },
      {
        name: "key",
        label: "Key",
        type: "text",
        readOnly: true,
        hint: "Used by the website — don't change.",
      },
      { name: "value", label: "Text", type: "textarea" },
    ],
  },
  {
    key: "features",
    label: "Features",
    description: "The feature cards in the “Features” section.",
    fileName: "features.json",
    idField: "id",
    hasSortOrder: true,
    allowAdd: true,
    allowDelete: true,
    summary: (i) => i.title || "Untitled feature",
    fields: [
      { name: "id", label: "ID", type: "number", readOnly: true },
      { name: "title", label: "Title", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      {
        name: "icon",
        label: "Icon",
        type: "text",
        hint: "Lucide icon name, e.g. brain, video, monitor, palette, book-open, mic, shield-check, refresh-cw, message-square",
      },
      { name: "sortOrder", label: "Sort order", type: "number" },
    ],
  },
  {
    key: "pricing",
    label: "Pricing",
    description: "Pricing tiers shown in the “Pricing” section.",
    fileName: "pricing.json",
    idField: "id",
    hasSortOrder: true,
    allowAdd: true,
    allowDelete: true,
    summary: (i) => `${i.name || "Tier"} — ${i.price || ""}`,
    fields: [
      { name: "id", label: "ID", type: "number", readOnly: true },
      { name: "name", label: "Tier name", type: "text" },
      {
        name: "price",
        label: "Price",
        type: "text",
        hint: "e.g. Free, GHS 200, GHS 1,800",
      },
      {
        name: "period",
        label: "Period",
        type: "text",
        hint: "e.g. forever, per month, Year",
      },
      { name: "description", label: "Description", type: "textarea" },
      { name: "features", label: "Feature bullets", type: "string-list" },
      { name: "isPopular", label: "Mark as most popular?", type: "boolean" },
      { name: "sortOrder", label: "Sort order", type: "number" },
    ],
  },
  {
    key: "testimonials",
    label: "Testimonials",
    description: "Customer quotes shown in the testimonials section.",
    fileName: "testimonials.json",
    idField: "id",
    hasSortOrder: true,
    allowAdd: true,
    allowDelete: true,
    summary: (i) => `${i.name || "Someone"} — ${i.church || ""}`,
    fields: [
      { name: "id", label: "ID", type: "number", readOnly: true },
      { name: "name", label: "Name", type: "text" },
      { name: "church", label: "Church", type: "text" },
      { name: "quote", label: "Quote", type: "textarea" },
      {
        name: "photoUrl",
        label: "Photo URL (optional)",
        type: "text",
        hint: "Leave blank to show initials instead.",
      },
      { name: "sortOrder", label: "Sort order", type: "number" },
    ],
  },
  {
    key: "downloads",
    label: "Downloads",
    description: "Download buttons / links offered on the site.",
    fileName: "downloads.json",
    idField: "id",
    hasSortOrder: false,
    allowAdd: true,
    allowDelete: true,
    summary: (i) => `${i.label || "Download"} (${i.platform || ""})`,
    fields: [
      { name: "id", label: "ID", type: "number", readOnly: true },
      { name: "label", label: "Button label", type: "text" },
      { name: "url", label: "Download URL", type: "text" },
      { name: "version", label: "Version", type: "text" },
      { name: "platform", label: "Platform", type: "text" },
      { name: "isActive", label: "Active?", type: "boolean" },
    ],
  },
  {
    key: "hero-buttons",
    label: "Hero Buttons",
    description:
      "Buttons shown next to “DOWNLOAD NOW” in the hero. Click Add to create a new button, drag the arrows to reorder, and Publish to push it live.",
    fileName: "hero-buttons.json",
    idField: "id",
    hasSortOrder: true,
    allowAdd: true,
    allowDelete: true,
    summary: (i) => i.label || "Button",
    fields: [
      { name: "id", label: "ID", type: "number", readOnly: true },
      { name: "label", label: "Button text", type: "text" },
      { name: "url", label: "Link URL", type: "text" },
      {
        name: "icon",
        label: "Icon",
        type: "text",
        hint: "Lucide icon name in PascalCase, e.g. BookOpen",
      },
      {
        name: "variant",
        label: "Style variant",
        type: "select",
        options: ["primary", "secondary"],
      },
      { name: "sortOrder", label: "Sort order", type: "number" },
    ],
  },
];

export function emptyItem(collection: CollectionDef): Record<string, any> {
  const obj: Record<string, any> = {};
  for (const f of collection.fields) {
    switch (f.type) {
      case "number":
        obj[f.name] = 0;
        break;
      case "boolean":
        obj[f.name] = false;
        break;
      case "string-list":
        obj[f.name] = [];
        break;
      case "select":
        obj[f.name] = f.options?.[0] ?? "";
        break;
      default:
        obj[f.name] = "";
    }
  }
  return obj;
}

export function nextId(items: Record<string, any>[], idField: string): number {
  const max = items.reduce((m, it) => {
    const n = Number(it?.[idField]);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return max + 1;
}
