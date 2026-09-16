import { NextResponse } from 'next/server';
import { getSunsetSettings, saveSunsetSettings, SunsetSettings } from '@/lib/db';

export async function GET() {
  try {
    const settings = await getSunsetSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('API Error (GET /api/sunset-settings):', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: Partial<SunsetSettings> = await request.json();
    const updated = await saveSunsetSettings(body);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('API Error (POST /api/sunset-settings):', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
