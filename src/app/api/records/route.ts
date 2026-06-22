import { NextRequest, NextResponse } from 'next/server';
import { getFacilities, getReservations, addReservation, updateReservation } from '@/lib/db';

export async function GET() {
  try {
    const records = await getReservations();
    return NextResponse.json(records);
  } catch (error) {
    console.error('API Error (records GET):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      date,
      facilityName,
      reserverName,
      courtStartTime,
      courtEndTime,
      lightHours = 0,
      lightStartTime = '',
      feeType,
      memo = '',
      status = '未精算',
    } = body;

    if (!id || !date || !facilityName || !reserverName || !courtStartTime || !courtEndTime || !feeType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const facilities = await getFacilities();
    const facility = facilities.find((f) => f.name === facilityName);
    if (!facility) {
      return NextResponse.json({ error: `Facility not found: ${facilityName}` }, { status: 400 });
    }

    const updated = await updateReservation(id, {
      date,
      facilityId: facility.id,
      reserverName,
      courtStartTime,
      courtEndTime,
      lightHours: Number(lightHours),
      lightStartTime,
      feeType,
      memo,
      status,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('API Error (records PUT):', error);
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
      lightStartTime = '',
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

    // 新しい addReservation は内部で料金を計算して保存し、結合された Reservation オブジェクトを返す
    const newRecord = await addReservation({
      date,
      facilityId: facility.id, // facilityId を指定して保存する
      reserverName,
      courtStartTime,
      courtEndTime,
      lightHours: Number(lightHours),
      lightStartTime,
      feeType,
      memo,
      status: '未精算',
    });

    return NextResponse.json(newRecord, { status: 201 });
  } catch (error) {
    console.error('API Error (records POST):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
