export default {
  async fetch(request) {
    // 讀取請求來源，用於 CORS 回應
    const origin = request.headers.get('Origin') || '*';

    // CORS 頭部，支援 credentials 模式
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400', // 預檢請求快取 24 小時
    };

    // 處理 CORS 預檢請求
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 從路徑中提取目標 URL
    // 格式: /http://example.com/path → http://example.com/path
    const url = new URL(request.url);
    const path = url.pathname.substring(1); // 移除開頭的 /
    const target = path + url.search;

    // 驗證目標 URL
    if (!target || !target.startsWith('http')) {
      return new Response(
        'Usage: /http://host:port/path\n' +
        'Example: /http://example.com',
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
        }
      );
    }

    // 讀取 body 成 buffer，避免 redirect 時 stream 無法重發
    const body = request.method !== 'GET' && request.method !== 'HEAD'
    ? await request.arrayBuffer()
    : undefined;

    // 建立目標 URL 物件
    const targetUrl = new URL(target);

    // 轉發請求到目標伺服器
    const newRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: body,
    });

    // 移除 origin/referer 避免目標伺服器的 CORS 問題
    newRequest.headers.delete('origin');
    newRequest.headers.delete('referer');

    try {
      const response = await fetch(newRequest);
      // 回傳目標回應並加上 CORS 頭部
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });

      // 修正 Set-Cookie：加上 Secure; SameSite=None 確保跨域帶 cookie
      const setCookies = [];
      for (const [key, value] of newResponse.headers.entries()) {
        if (key.toLowerCase() === 'set-cookie') {
          setCookies.push(value);
        }
      }
      if (setCookies.length > 0) {
        newResponse.headers.delete('Set-Cookie');
        setCookies.forEach(cookie => {
          let fixed = cookie
            .replace(/;?\s*SameSite=Lax/gi, '')
            .replace(/;?\s*SameSite=Strict/gi, '')
            .replace(/;?\s*SameSite=None/gi, '')
            .replace(/;?\s*Secure/gi, '');
          if (!fixed.endsWith(';')) fixed += ';';
          fixed += ' SameSite=None; Secure';
          newResponse.headers.append('Set-Cookie', fixed);
        });
      }

      return newResponse;
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};