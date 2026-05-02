export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Перенаправляем на API Google Generative Language
    url.hostname = 'generativelanguage.googleapis.com';
    
    // Создаем новый запрос с измененным URL
    const newRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });
    
    // Подставляем настоящий API ключ из секретных переменных окружения Cloudflare (env.GEMINI_API_KEY)
    // Клиент (мобильное приложение) передает 'x-goog-api-key: LUMEA_MOBILE_CLIENT', мы его стираем и заменяем.
    if (env.GEMINI_API_KEY) {
      newRequest.headers.set('x-goog-api-key', env.GEMINI_API_KEY);
    }
    
    // Отправляем запрос в Google
    const response = await fetch(newRequest);
    
    // Создаем новый ответ на основе ответа Google, чтобы добавить CORS
    const newResponse = new Response(response.body, response);
    
    // Добавляем CORS заголовки для браузера/Webview
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', '*');
    
    // Обработка Preflight (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: newResponse.headers
      });
    }
    
    return newResponse;
  },
};
