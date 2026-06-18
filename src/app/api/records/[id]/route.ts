import { NextRequest, NextResponse } from 'next/server';
import { updateReservationStatus } from '@/lib/db';
import { syncToGithub } from '../route';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    if (status !== '未精算' && status !== '精算済') {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const updatedRecord = await updateReservationStatus(id, status);
    if (!updatedRecord) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // GitHub 同期を実行
    await syncToGithub();

    return NextResponse.json(updatedRecord);
  } catch (error) {
    console.error('API Error (records PATCH):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
