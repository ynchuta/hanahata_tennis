import { NextResponse } from 'next/server';
import { getUseMock, testKVConnection } from '@/lib/db';

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

  // 実行時に評価する（ビルド時の定数ではなく）
  const useMock = getUseMock();

  const envInfo = {
    USE_MOCK: useMock,
    KV_REDIS_URL_set: !!KV_REDIS_URL,
    KV_REDIS_URL_scheme: kvRedisScheme,
    KV_REST_API_URL_set: !!KV_REST_API_URL,
    KV_REST_API_URL_scheme: kvRestScheme,
    KV_REST_API_TOKEN_set: !!KV_REST_API_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
  };

  // KV接続テスト（タイムアウト5秒）
  if (!useMock) {
    try {
      const errorMsg = await Promise.race([
        testKVConnection(),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('TIMEOUT after 5s'), 5000)
        ),
      ]);

      if (errorMsg === null) {
        // null = 接続成功
        return NextResponse.json({ status: 'ok', kv: 'connected', ...envInfo });
      } else {
        // string = エラーメッセージ
        return NextResponse.json({ status: 'error', kv: 'failed', error: errorMsg, ...envInfo });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ status: 'error', kv: 'failed', error: errMsg, ...envInfo });
    }
  }

  return NextResponse.json({ status: 'ok', kv: 'mock_mode', ...envInfo });
}
