function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/**
 * Origin check for mutating /api routes.
 * Production: Origin (or Referer origin) must match the request URL origin.
 * Localhost: allow loopback hostnames even when the Vite proxy port differs
 * from the Worker listen port.
 *
 * If both Origin and Referer are missing, the request is allowed (same-site
 * non-CORS navigations / some tooling). Documented choice from the BFF lessons.
 */
export function isAllowedOrigin(request: Request): boolean {
  const originHeader = request.headers.get('Origin');
  const refererHeader = request.headers.get('Referer');
  const requestUrl = new URL(request.url);

  let candidateOrigin: string | null = originHeader;
  if (!candidateOrigin && refererHeader) {
    try {
      candidateOrigin = new URL(refererHeader).origin;
    } catch {
      return false;
    }
  }

  if (!candidateOrigin) {
    return true;
  }

  let candidateUrl: URL;
  try {
    candidateUrl = new URL(candidateOrigin);
  } catch {
    return false;
  }

  if (candidateUrl.origin === requestUrl.origin) {
    return true;
  }

  return isLoopbackHostname(candidateUrl.hostname) && isLoopbackHostname(requestUrl.hostname);
}
