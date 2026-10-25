export function enforceSameOrigin(app) {
  // Tailscale Serve terminates HTTPS and forwards over loopback HTTP. Honor
  // its protocol header only on local proxy connections, never LAN clients.
  app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.get('origin');
    // Use the actual Host header; a forwarded host must not bypass this check.
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: 'Use this app from its own address.' });
    next();
  });
}
