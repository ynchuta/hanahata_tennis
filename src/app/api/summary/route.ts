import { NextRequest, NextResponse } from 'next/server';
import { getReservations } from '@/lib/db';
import { MonthlyReportRow } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month'); // 形式: YYYY-MM

    if (!month) {
      return NextResponse.json({ error: 'Month parameter is required (e.g. YYYY-MM)' }, { status: 400 });
    }

    const reservations = await getReservations();

    // 指定された月でフィルタリング (r.date は YYYY-MM-DD 形式)
    const filteredReservations = reservations.filter((r) => r.date.startsWith(month));

    // 保護者ごとにグループ化
    const summaryMap = new Map<string, typeof filteredReservations>();
    for (const r of filteredReservations) {
      if (!summaryMap.has(r.reserverName)) {
        summaryMap.set(r.reserverName, []);
      }
      summaryMap.get(r.reserverName)!.push(r);
    }

    const report: MonthlyReportRow[] = Array.from(summaryMap.entries()).map(([reserverName, list]) => {
      // 立替合計金額を計算 (status === "cancelled" のデータは除外)
      const activeList = list.filter((r) => r.status !== 'cancelled');
      const totalAmount = activeList.reduce((sum, r) => sum + r.totalFee, 0);

      // その月のすべての有効な予約が精算済みかどうかを判定
      const settlementStatus = activeList.length > 0
        ? (activeList.every((r) => r.settlementStatus === '精算済') ? '精算済' : '未精算')
        : '精算済';

      return {
        reserverName,
        totalAmount,
        settlementStatus,
        reservations: list.sort((a, b) => a.date.localeCompare(b.date)),
      };
    });

    // 立替合計金額の高い順にソートして返す
    return NextResponse.json(report.sort((a, b) => b.totalAmount - a.totalAmount));
  } catch (error) {
    console.error('API Error (summary GET):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { month, reserverName, settlementStatus } = body;

    if (!month || !reserverName || !settlementStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (settlementStatus !== '未精算' && settlementStatus !== '精算済') {
      return NextResponse.json({ error: 'Invalid settlementStatus value' }, { status: 400 });
    }

    const { updateReservationsStatusByReserverMonth } = await import('@/lib/db');
    const count = await updateReservationsStatusByReserverMonth(month, reserverName, settlementStatus);

    return NextResponse.json({ success: true, updatedCount: count });
  } catch (error) {
    console.error('API Error (summary POST):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
