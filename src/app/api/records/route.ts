import { NextRequest, NextResponse } from 'next/server';
import { getFacilities, getReservations, addReservation, getReservers } from '@/lib/db';
import { calculateFees } from '@/lib/calculator';
import { syncSettlementStatusToGithub } from '@/lib/github';

/**
 * 全データをまとめて settlement_status.json に同期する
 * 予約ステータス・施設マスタ・保護者マスタを含めるが、金額や口座情報は除外する
 */
export async function syncToGithub() {
  try {
    const [reservations, facilities, reservers] = await Promise.all([
      getReservations(),
      getFacilities(),
      getReservers(),
    ]);

    const publicData = {
      updatedAt: new Date().toISOString(),
      facilities: facilities.map((f) => ({
        name: f.name,
        allowChildRate: f.allowChildRate,
      })),
      reservers: reservers.map((r) => ({
        name: r.name,
      })),
      reservations: reservations.map((r) => ({
        date: r.date,
        facilityName: r.facilityName,
        reserverName: r.reserverName,
        courtStartTime: r.courtStartTime,
        courtEndTime: r.courtEndTime,
        lightHours: r.lightHours,
        feeType: r.feeType,
        status: r.status,
        // 金額・口座情報は公開しない
      })),
    };

    await syncSettlementStatusToGithub(publicData as any);
  } catch (error) {
    console.error('Failed to auto-sync to GitHub:', error);
  }
}

export async function GET() {
  try {
    const records = await getReservations();
    return NextResponse.json(records);
  } catch (error) {
    console.error('API Error (records GET):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      date,
      facilityName,
      reserverName,
      courtStartTime,
      courtEndTime,
      lightHours = 0,
      feeType,
      memo = '',
    } = body;

    if (!date || !facilityName || !reserverName || !courtStartTime || !courtEndTime || !feeType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const facilities = await getFacilities();
    const facility = facilities.find((f) => f.name === facilityName);
    if (!facility) {
      return NextResponse.json({ error: `Facility not found: ${facilityName}` }, { status: 400 });
    }

    const { courtFee, lightFee, totalFee, appliedFeeType } = calculateFees({
      facility,
      feeType,
      courtStartTime,
      courtEndTime,
      lightHours: Number(lightHours),
    });

    const newRecord = await addReservation({
      date,
      facilityName,
      reserverName,
      courtStartTime,
      courtEndTime,
      lightHours: Number(lightHours),
      feeType: appliedFeeType,
      courtFee,
      lightFee,
      totalFee,
      memo,
      status: '未精算',
    });

    await syncToGithub();

    return NextResponse.json(newRecord, { status: 201 });
  } catch (error) {
    console.error('API Error (records POST):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
