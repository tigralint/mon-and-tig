/**
 * Lumea Proxy — Cloudflare Worker
 * Проксирует запросы к Google Gemini API, подставляя секретный ключ.
 * Клиент шлёт placeholder "LUMEA_CLIENT", Worker заменяет на настоящий.
 */

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://lumea.vercel.app',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key, x-goog-api-client',
  'Access-Control-Max-Age': '86400',
};

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const headers = { ...CORS_HEADERS };
  if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY secret not configured' }),
        { status: 500, headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' } }
      );
    }

    // Строим URL к Google API, заменяя ключ
    const url = new URL(request.url);
    const googleUrl = `https://generativelanguage.googleapis.com${url.pathname}?key=${apiKey}`;

    // Проксируем запрос
    const proxyResponse = await fetch(googleUrl, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: request.method !== 'GET' ? await request.text() : undefined,
    });

    // Возвращаем ответ с CORS-заголовками
    const responseHeaders = new Headers(proxyResponse.headers);
    const corsHeaders = getCorsHeaders(request);
    for (const [key, value] of Object.entries(corsHeaders)) {
      responseHeaders.set(key, value);
    }

    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      headers: responseHeaders,
    });
  },
};
