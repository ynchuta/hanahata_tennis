import { NextResponse } from 'next/server';
import { getUseMock, testKVConnection } from '@/lib/db';

export async function GET() {
  const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
  const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

  // 実行時に評価する
  const useMock = getUseMock();

  const envInfo = {
    USE_MOCK: useMock,
    SPREADSHEET_ID_set: !!SPREADSHEET_ID,
    GOOGLE_SERVICE_ACCOUNT_EMAIL_set: !!GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY_set: !!GOOGLE_PRIVATE_KEY,
    NODE_ENV: process.env.NODE_ENV,
  };

  // Google Sheets 接続テスト（タイムアウト5秒）
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
        return NextResponse.json({ status: 'ok', db: 'connected', ...envInfo });
      } else {
        // string = エラーメッセージ
        return NextResponse.json({ status: 'error', db: 'failed', error: errorMsg, ...envInfo });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ status: 'error', db: 'failed', error: errMsg, ...envInfo });
    }
  }

  return NextResponse.json({ status: 'ok', db: 'mock_mode', ...envInfo });
}
