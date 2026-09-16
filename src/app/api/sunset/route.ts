import { NextResponse } from 'next/server';
import { getSunsetSettings } from '@/lib/db';

function formatToJSTHHMM(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    // JST (UTC+9) の時分を取得
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(d);
  } catch (e) {
    return '';
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const datesParam = searchParams.get('dates');

  // 緯度経度パラメータがあれば使用し、なければスプレッドシート設定を使用
  const latParam = searchParams.get('lat');
  const lngParam = searchParams.get('lng');

  let lat: number;
  let lng: number;
  let twilightType: string = 'civil';

  if (latParam && lngParam) {
    lat = parseFloat(latParam);
    lng = parseFloat(lngParam);
    twilightType = searchParams.get('twilightType') || 'civil';
  } else {
    const settings = await getSunsetSettings();
    lat = settings.latitude;
    lng = settings.longitude;
    twilightType = settings.twilightType;
  }

  const targetDates = datesParam
    ? datesParam.split(',').filter(Boolean)
    : dateParam
    ? [dateParam]
    : [];

  if (targetDates.length === 0) {
    return NextResponse.json({ error: 'date or dates parameter is required' }, { status: 400 });
  }

  try {
    const results: Record<string, { sunset: string; civil: string; nautical: string; astronomical: string; selectedTime: string }> = {};

    // sunrise-sunset.org へのリクエスト（並列）
    await Promise.all(
      targetDates.map(async (d) => {
        try {
          const res = await fetch(
            `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&date=${d}&formatted=0`,
            { next: { revalidate: 86400 } }
          );
          if (!res.ok) return;
          const json = await res.json();
          if (json.status === 'OK' && json.results) {
            const r = json.results;
            const sunset = formatToJSTHHMM(r.sunset);
            const civil = formatToJSTHHMM(r.civil_twilight_end);
            const nautical = formatToJSTHHMM(r.nautical_twilight_end);
            const astronomical = formatToJSTHHMM(r.astronomical_twilight_end);

            let selectedTime = civil;
            if (twilightType === 'sunset') selectedTime = sunset;
            else if (twilightType === 'nautical') selectedTime = nautical;
            else if (twilightType === 'astronomical') selectedTime = astronomical;

            results[d] = {
              sunset,
              civil,
              nautical,
              astronomical,
              selectedTime,
            };
          }
        } catch (e) {
          console.error(`Failed to fetch sunset for ${d}:`, e);
        }
      })
    );

    return NextResponse.json({
      twilightType,
      data: results,
    });
  } catch (error) {
    console.error('API Error (GET /api/sunset):', error);
    return NextResponse.json({ error: 'Failed to fetch sunset data' }, { status: 500 });
  }
}
