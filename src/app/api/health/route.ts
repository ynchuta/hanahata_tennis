import { NextResponse } from 'next/server';
import { USE_MOCK } from '@/lib/db';

export async function GET() {
  const KV_REDIS_URL = process.env.KV_REDIS_URL;
  const KV_REST_API_URL = process.env.KV_REST_API_URL;
  const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

  // URLの先頭スキームだけ確認（秘密情報は返さない）
  const kvRedisScheme = KV_REDIS_URL
    ? KV_REDIS_URL.split('://')[0] + '://'
    : null;
  const kvRestScheme = KV_REST_API_URL
    ? KV_REST_API_URL.split('://')[0] + '://'
    : null;

  const envInfo = {
    USE_MOCK,
    KV_REDIS_URL_set: !!KV_REDIS_URL,
    KV_REDIS_URL_scheme: kvRedisScheme,
    KV_REST_API_URL_set: !!KV_REST_API_URL,
    KV_REST_API_URL_scheme: kvRestScheme,
    KV_REST_API_TOKEN_set: !!KV_REST_API_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
  };

  // KV接続テスト
  if (!USE_MOCK) {
    try {
      const { createClient } = await import('@vercel/kv');

      let client;
      if (KV_REST_API_URL && KV_REST_API_TOKEN) {
        client = createClient({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
      } else if (KV_REDIS_URL) {
        if (KV_REDIS_URL.startsWith('redis://') || KV_REDIS_URL.startsWith('rediss://')) {
          const urlObj = new URL(KV_REDIS_URL);
          client = createClient({
            url: `https://${urlObj.hostname}`,
            token: urlObj.password || urlObj.username || '',
          });
        } else {
          client = createClient({ url: KV_REDIS_URL, token: KV_REST_API_TOKEN || '' });
        }
      }

      if (client) {
        const pingResult = await Promise.race([
          client.ping(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT after 5s')), 5000)
          ),
        ]);
        return NextResponse.json({ status: 'ok', kv: 'connected', ping: pingResult, ...envInfo });
      }
      return NextResponse.json({ status: 'error', kv: 'no_client', ...envInfo });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ status: 'error', kv: 'failed', error: errMsg, ...envInfo });
    }
  }

  return NextResponse.json({ status: 'ok', kv: 'mock_mode', ...envInfo });
}
