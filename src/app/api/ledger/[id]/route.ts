import { NextRequest, NextResponse } from 'next/server';
import { updateLedgerRecord, deleteLedgerRecord } from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { date, description, income = 0, expense = 0, category } = body;

    if (!date || !description || !category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const updated = await updateLedgerRecord(id, {
      date,
      description,
      income: Number(income) || 0,
      expense: Number(expense) || 0,
      category,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('API Error (ledger PUT [id]):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await deleteLedgerRecord(id);

    if (!success) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error (ledger DELETE [id]):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
