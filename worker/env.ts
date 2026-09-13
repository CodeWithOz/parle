export interface Env {
  API_KEY_COOKIE_SECRET: string;
  API_KEY_COOKIE_SECRET_PREVIOUS?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}
