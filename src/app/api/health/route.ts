import { NextResponse } from 'next/server';
import { USE_MOCK, testKVConnection } from '@/lib/db';

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
      // 疎通確認を試みる（タイムアウト5秒）
      const isConnected = await Promise.race([
        testKVConnection(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT after 5s')), 5000)
        ),
      ]);

      if (isConnected) {
        return NextResponse.json({ status: 'ok', kv: 'connected', ...envInfo });
      } else {
        return NextResponse.json({ status: 'error', kv: 'failed', error: 'Connection test returned false', ...envInfo });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ status: 'error', kv: 'failed', error: errMsg, ...envInfo });
    }
  }

  return NextResponse.json({ status: 'ok', kv: 'mock_mode', ...envInfo });
}
