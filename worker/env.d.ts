/**
 * Optional rotation secret. Set via `.dev.vars` or `wrangler secret put`.
 * `Fetcher` is declared here because `wrangler types --include-runtime false`
 * emits `Env.ASSETS: Fetcher` without the runtime typedef.
 */
type Fetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

interface Env {
  API_KEY_COOKIE_SECRET_PREVIOUS?: string;
}
