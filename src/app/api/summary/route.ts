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
      // 立替合計金額を計算
      const totalAmount = list.reduce((sum, r) => sum + r.totalFee, 0);

      // その月のすべての予約が精算済みかどうかを判定
      const status = list.every((r) => r.status === '精算済') ? '精算済' : '未精算';

      return {
        reserverName,
        totalAmount,
        status,
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
