import { NextRequest, NextResponse } from 'next/server';
import { getLedgerRecords, addLedgerRecord, updateLedgerRecord, deleteLedgerRecord } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const records = await getLedgerRecords();
    return NextResponse.json(records);
  } catch (error) {
    console.error('API Error (ledger GET):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, description, income = 0, expense = 0, category } = body;

    if (!date || !description || !category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newRecord = await addLedgerRecord({
      date,
      description,
      income: Number(income),
      expense: Number(expense),
      category,
    });

    return NextResponse.json(newRecord, { status: 201 });
  } catch (error) {
    console.error('API Error (ledger POST):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, date, description, income = 0, expense = 0, category } = body;

    if (!id || !date || !description || !category) {
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
    console.error('API Error (ledger PUT):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Id is required' }, { status: 400 });
    }

    const success = await deleteLedgerRecord(id);
    if (!success) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error (ledger DELETE):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
