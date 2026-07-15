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

    let settlementStatusVal = settlementStatus;
    let statusVal = status;

    // 過去互換処理: statusが精算ステータス（未精算/精算済）の場合はsettlementStatusValにマッピング
    if (status === '未精算' || status === '精算済') {
      settlementStatusVal = status;
      statusVal = undefined;
    }

    let updatedRecord;

    if (settlementStatusVal !== undefined) {
      if (settlementStatusVal !== '未精算' && settlementStatusVal !== '精算済') {
        return NextResponse.json({ error: 'Invalid settlementStatus value' }, { status: 400 });
      }
      updatedRecord = await updateReservationSettlementStatus(id, settlementStatusVal);
    } else if (statusVal !== undefined) {
      if (statusVal !== 'active' && statusVal !== 'cancelled') {
        return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
      }
      updatedRecord = await updateReservationCancelStatus(id, statusVal);
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
