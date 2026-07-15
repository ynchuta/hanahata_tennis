import { NextRequest, NextResponse } from 'next/server';
import { updateReservationSettlementStatus, updateReservationCancelStatus, deleteReservation } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { settlementStatus, status } = body;

    let updatedRecord;

    if (settlementStatus !== undefined) {
      if (settlementStatus !== '未精算' && settlementStatus !== '精算済') {
        return NextResponse.json({ error: 'Invalid settlementStatus value' }, { status: 400 });
      }
      updatedRecord = await updateReservationSettlementStatus(id, settlementStatus);
    } else if (status !== undefined) {
      if (status !== 'active' && status !== 'cancelled') {
        return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
      }
      updatedRecord = await updateReservationCancelStatus(id, status);
    } else {
      return NextResponse.json({ error: 'No valid status field provided' }, { status: 400 });
    }

    if (!updatedRecord) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json(updatedRecord);
  } catch (error) {
    console.error('API Error (records PATCH):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await deleteReservation(id);
    if (!success) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error (records DELETE):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
