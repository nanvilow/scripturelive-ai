// Returns the static content snapshot (see content-snapshot.ts).
// The marketing site is built as a static Cloudflare Pages deploy with no backend —
// editing content means editing content-snapshot.ts (Cloudflare auto-rebuilds on push).

import {
  SNAPSHOT_FEATURES,
  SNAPSHOT_PRICING,
  SNAPSHOT_TESTIMONIALS,
  SNAPSHOT_PAGE_CONTENT,
  SNAPSHOT_DOWNLOADS,
  SNAPSHOT_HERO_BUTTONS,
  SNAPSHOT_MEDIA_ASSETS,
} from "./content-snapshot"

type QueryResult<T> = { data: T | undefined; isLoading: boolean; isError: boolean; error: null }

function ready<T>(data: T): QueryResult<T> {
  return { data, isLoading: false, isError: false, error: null }
}

export const useListFeatures = () => ready(SNAPSHOT_FEATURES as any[])
export const useListPricing = () => ready(SNAPSHOT_PRICING as any[])
export const useListTestimonials = () => ready(SNAPSHOT_TESTIMONIALS as any[])
export const useListPageContent = () => ready(SNAPSHOT_PAGE_CONTENT as any[])
export const useListMediaAssets = () => ready(SNAPSHOT_MEDIA_ASSETS as any[])
export const useListDownloads = () =>
  ready(SNAPSHOT_DOWNLOADS as Array<{ platform: string; url: string; isActive: boolean }>)
export const useListHeroButtons = () => ready(SNAPSHOT_HERO_BUTTONS as any[])

export const setAuthTokenGetter = (_getter: () => string | null) => {}
