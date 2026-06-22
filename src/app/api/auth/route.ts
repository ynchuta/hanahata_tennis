import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    
    const expectedUser = process.env.APP_LOGIN_ID || 'admin';
    const expectedPass = process.env.APP_LOGIN_PASSWORD || 'admin';

    if (username === expectedUser && password === expectedPass) {
      return NextResponse.json({ success: true, token: 'authenticated' });
    } else {
      return NextResponse.json({ error: 'ユーザーIDまたはパスワードが正しくありません' }, { status: 401 });
    }
  } catch (error) {
    console.error('Auth API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
