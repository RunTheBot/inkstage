/** Keep the session token in the fragment, including on the QR landing page. */
export function penLaunchLinks(input: string) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.searchParams.get('view') !== 'pen' || !url.searchParams.get('session') || url.hash.length < 2) throw new Error('A complete pen session link is required.');
  url.pathname = '/';
  const browser = url.toString();
  url.pathname = '/open-pen';
  const payload = encodeURIComponent(browser);
  return {
    qr: url.toString(), browser,
    app: `inkstage://pen?url=${payload}`,
    intent: `intent://pen?url=${payload}#Intent;scheme=inkstage;package=com.inkstage.pen;S.browser_fallback_url=${encodeURIComponent(url.toString())};end`,
  };
}
