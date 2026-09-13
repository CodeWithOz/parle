import type { Env } from './env';
import { errorJson, json } from './http';
import { handleCreateSession, handleRevoke, handleSessionStatus } from './routes/session';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (pathname === '/api/session' && request.method === 'POST') {
        return handleCreateSession(request, env);
      }
      if (pathname === '/api/session/status' && request.method === 'GET') {
        return handleSessionStatus(request, env);
      }
      if (pathname === '/api/revoke' && request.method === 'POST') {
        return handleRevoke(request, env);
      }

      if (pathname.startsWith('/api/')) {
        return errorJson('NOT_FOUND', 404);
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return json({ error: 'NOT_FOUND' }, 404);
    } catch {
      return errorJson('INTERNAL_ERROR', 500);
    }
  },
};
