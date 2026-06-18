import { NextRequest, NextResponse } from 'next/server';
import { getFacilities, getReservations, addReservation } from '@/lib/db';
import { calculateFees } from '@/lib/calculator';
import { syncSettlementStatusToGithub } from '@/lib/github';

/**
 * 共通ヘルパー: 全予約から非公開情報を除外した精算状況を GitHub に同期する
 */
export async function syncToGithub() {
  try {
    const reservations = await getReservations();
    const publicData = reservations.map((r) => ({
      date: r.date,
      reserverName: r.reserverName,
      status: r.status,
    }));
    await syncSettlementStatusToGithub(publicData);
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
      lightStartTime = '',
      lightEndTime = '',
      feeType,
    } = body;

    // バリデーション
    if (!date || !facilityName || !reserverName || !courtStartTime || !courtEndTime || !feeType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 施設情報の取得
    const facilities = await getFacilities();
    const facility = facilities.find((f) => f.name === facilityName);
    if (!facility) {
      return NextResponse.json({ error: `Facility not found: ${facilityName}` }, { status: 400 });
    }

    // 計算
    const { courtFee, lightFee, totalFee, appliedFeeType } = calculateFees({
      facility,
      feeType,
      courtStartTime,
      courtEndTime,
      lightStartTime,
      lightEndTime,
    });

    // 保存
    const newRecord = await addReservation({
      date,
      facilityName,
      reserverName,
      courtStartTime,
      courtEndTime,
      lightStartTime,
      lightEndTime,
      feeType: appliedFeeType, // 適用された料金種別（博多の森の制約を反映）
      courtFee,
      lightFee,
      totalFee,
      status: '未精算', // 新規登録時は未精算
    });

    // GitHub 同期を実行
    await syncToGithub();

    return NextResponse.json(newRecord, { status: 201 });
  } catch (error) {
    console.error('API Error (records POST):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
