import { NextRequest, NextResponse } from 'next/server';
import { getLedgerRecords, addLedgerRecord } from '@/lib/db';

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
