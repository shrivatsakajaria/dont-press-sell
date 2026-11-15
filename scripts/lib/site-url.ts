// The site's absolute address at build time (I7): crawlers for link previews do not run scripts and often
// ignore relative og:image URLs. SITE_URL (set once by the owner) wins; Cloudflare Pages sets CF_PAGES_URL.

export function siteUrl(env: Record<string, string | undefined>): string {
  return (env.SITE_URL || env.CF_PAGES_URL || '').replace(/\/+$/, '');
}

/** Replaces every %SITE_URL% in index.html; without an address the URLs stay relative ("/og.png"). */
export function withSiteUrl(html: string, url: string): string {
  return html.split('%SITE_URL%').join(url);
}
