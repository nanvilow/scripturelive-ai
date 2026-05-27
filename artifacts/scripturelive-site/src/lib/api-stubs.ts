type QueryResult<T> = { data: T | undefined; isLoading: boolean; isError: boolean; error: null }

function emptyResult<T>(): QueryResult<T> {
  return { data: undefined, isLoading: false, isError: false, error: null }
}

export const useListFeatures = () => emptyResult<any[]>()
export const useListPricing = () => emptyResult<any[]>()
export const useListTestimonials = () => emptyResult<any[]>()
export const useListPageContent = () => emptyResult<any[]>()
export const useListMediaAssets = () => emptyResult<any[]>()
export const useListDownloads = () => emptyResult<Array<{ platform: string; url: string; isActive: boolean }>>()
export const useListHeroButtons = () => emptyResult<any[]>()

export const setAuthTokenGetter = (_getter: () => string | null) => {}
