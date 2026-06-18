import { NextRequest, NextResponse } from 'next/server';
import { getReservers, addReserver, deleteReserver } from '@/lib/db';
import { syncToGithub } from '../records/route';

export async function GET() {
  try {
    const reservers = await getReservers();
    return NextResponse.json(reservers);
  } catch (error) {
    console.error('API Error (reservers GET):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const newReserver = await addReserver(name.trim());
    await syncToGithub();
    return NextResponse.json(newReserver, { status: 201 });
  } catch (error) {
    console.error('API Error (reservers POST):', error);
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
    const success = await deleteReserver(id);
    if (!success) {
      return NextResponse.json({ error: 'Reserver not found' }, { status: 404 });
    }
    await syncToGithub();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error (reservers DELETE):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
