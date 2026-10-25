export function connectionAddress(input: string): { origin: string; error: string } {
  const value = input.trim();
  if (!value) return { origin: '', error: 'Enter a domain or IP address.' };
  try {
    let address = value;
    if (!value.includes('://')) {
      const ipv6 = !value.startsWith('[') && /^[\da-f:]+$/i.test(value) && (value.match(/:/g)?.length ?? 0) >= 2;
      const authority = value.split(/[/?#]/)[0];
      const local = /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[.*\])(?::\d+)?$/i.test(authority);
      const port = authority.match(/:(\d+)$/)?.[1];
      address = ipv6 ? `http://[${value}]` : `${local || (port && port !== '443') ? 'http' : 'https'}://${value}`;
    }
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol)) return { origin: '', error: 'Use an http:// or https:// address.' };
    if (url.username || url.password) return { origin: '', error: 'Use an address without a username or password.' };
    if (url.pathname !== '/') return { origin: '', error: 'Enter the server address without a path.' };
    // Session parameters and fragments belong to the new device link, not a
    // previously copied presenter or audience URL.
    return { origin: url.origin, error: '' };
  } catch {
    return { origin: '', error: 'Enter a valid domain or IP, including the port if needed.' };
  }
}
