// Content source of truth for the static Cloudflare Pages deployment.
//
// Two ways to edit:
//  1) Visual CMS at https://scriptureliveai.com/admin/ (recommended) — sign in with GitHub
//     and edit through forms. Saves commit the JSON files below.
//  2) GitHub.com directly — open one of the JSON files under src/content/ and click the
//     pencil icon. Both paths trigger a Cloudflare Pages rebuild (~90s).

import featuresJson from "../content/features.json";
import pricingJson from "../content/pricing.json";
import testimonialsJson from "../content/testimonials.json";
import pageContentJson from "../content/page-content.json";
import downloadsJson from "../content/downloads.json";
import heroButtonsJson from "../content/hero-buttons.json";

export const SNAPSHOT_FEATURES = featuresJson.items as Array<{
  id: number; title: string; description: string; icon: string; sortOrder: number;
}>;

export const SNAPSHOT_PRICING = pricingJson.items as Array<{
  id: number; name: string; price: string; period: string; description: string;
  features: string[]; isPopular: boolean; sortOrder: number;
}>;

export const SNAPSHOT_TESTIMONIALS = testimonialsJson.items as Array<{
  id: number; name: string; church: string; quote: string; photoUrl: string | null; sortOrder: number;
}>;

export const SNAPSHOT_PAGE_CONTENT = pageContentJson.items as Array<{
  id: number; key: string; value: string;
}>;

export const SNAPSHOT_DOWNLOADS = downloadsJson.items as Array<{
  id: number; label: string; url: string; version: string; platform: string; isActive: boolean;
}>;

export const SNAPSHOT_HERO_BUTTONS = heroButtonsJson.items as Array<{
  id: number; label: string; url: string; icon: string; variant: string; sortOrder: number;
}>;

export const SNAPSHOT_MEDIA_ASSETS: Array<{ key: string; url: string; alt?: string }> = [];
