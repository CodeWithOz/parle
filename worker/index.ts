import { errorJson, json } from './http';
import {
  handleChat,
  handleScenarioPlan,
  handleScenarioReview,
  handleTefAdConfirm,
  handleTefReview,
  handleTranscribe,
  handleTts,
} from './routes/ai';
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
      if (pathname === '/api/transcribe') {
        return handleTranscribe(request, env);
      }
      if (pathname === '/api/chat') {
        return handleChat(request, env);
      }
      if (pathname === '/api/tts') {
        return handleTts(request, env);
      }
      if (pathname === '/api/tef-ad-confirm') {
        return handleTefAdConfirm(request, env);
      }
      if (pathname === '/api/tef-review') {
        return handleTefReview(request, env);
      }
      if (pathname === '/api/scenario-review') {
        return handleScenarioReview(request, env);
      }
      if (pathname === '/api/scenario-plan') {
        return handleScenarioPlan(request, env);
      }

      if (pathname.startsWith('/api/')) {
        return errorJson('NOT_FOUND', 404);
      }

      return env.ASSETS.fetch(request);
    } catch {
      return errorJson('INTERNAL_ERROR', 500);
    }
  },
};
