/**
 * Build the DiffBlock / ReadBlock / SearchBlock display copy from the
 * conversation locale seat — the one place each primitive's label surface
 * pairs with this package's dictionary, shared by every render site (chat
 * row body, details panel).
 * @module
 */
import type { DiffBlockLabels, ReadBlockLabels, SearchBlockLabels, WebBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Build the DiffBlock display copy from the conversation locale seat.
 * @param t - the render site's conversation locale seat.
 * @returns the full label set for `DiffBlockProps`'s `labels`.
 */
export function diffBlockLabels(t: TranslateNS<'conversation'>): DiffBlockLabels {
  return {
    copy: t('copy'),
    copied: t('copied'),
    expandAria: hidden => t('diff.expandAria', { n: hidden }),
    collapseAria: t('diff.collapseAria'),
    collapse: t('collapse'),
    expand: hidden => t('diff.expandRest', { n: hidden }),
  }
}

/**
 * Build the ReadBlock display copy from the conversation locale seat.
 * @param t - the render site's conversation locale seat.
 * @returns the full label set for `ReadBlockProps`'s `labels`.
 */
export function readBlockLabels(t: TranslateNS<'conversation'>): ReadBlockLabels {
  return {
    windowed: (shown, total) => t('read.windowed', { shown, total }),
    copy: t('copy'),
    copied: t('copied'),
    expandAria: hidden => t('read.expandAria', { n: hidden }),
    collapseAria: t('read.collapseAria'),
    collapse: t('collapse'),
    expand: hidden => t('read.expandRest', { n: hidden }),
  }
}

/**
 * Build the SearchBlock display copy from the conversation locale seat.
 * @param t - the render site's conversation locale seat.
 * @returns the full label set for `SearchBlockProps`'s `labels`.
 */
export function searchBlockLabels(t: TranslateNS<'conversation'>): SearchBlockLabels {
  return {
    summaryCapped: (shown, total) => t('search.summaryCapped', { shown, total }),
    summaryPaths: count => t('search.summaryPaths', { count }),
    summaryMatches: (count, fileCount) => t('search.summaryMatches', { count, files: fileCount }),
    empty: t('search.empty'),
    copy: t('copy'),
    copied: t('copied'),
    expandAria: hidden => t('search.expandAria', { n: hidden }),
    collapseAria: t('search.collapseAria'),
    collapse: t('collapse'),
    expand: hidden => t('search.expandRest', { n: hidden }),
  }
}

/**
 * Build the WebBlock display copy from the conversation locale seat.
 * @param t - the render site's conversation locale seat.
 * @returns the full label set for `WebSearchBlockProps`/`WebFetchBlockProps`'s `labels`.
 */
export function webBlockLabels(t: TranslateNS<'conversation'>): WebBlockLabels {
  return {
    searchEmpty: t('web.searchEmpty'),
    sourcesTruncated: t('web.sourcesTruncated'),
    fetchTruncated: t('web.fetchTruncated'),
  }
}
