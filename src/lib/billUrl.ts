/** Encode a bill source URL into a URL-safe slug for routing (/bill/:slug). */
export const encodeBillSlug = (url: string): string =>
  btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Decode a slug from /bill/:slug back into the original source URL. */
export const decodeBillSlug = (slug: string): string => {
  try {
    const padded = slug.replace(/-/g, '+').replace(/_/g, '/');
    return atob(padded + '==='.slice(0, (4 - (padded.length % 4)) % 4));
  } catch {
    return '';
  }
};