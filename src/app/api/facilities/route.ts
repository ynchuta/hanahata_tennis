import { NextRequest, NextResponse } from 'next/server';
import { getFacilities, addFacility, updateFacility, deleteFacility } from '@/lib/db';

export async function GET() {
  try {
    const facilities = await getFacilities();
    return NextResponse.json(facilities);
  } catch (error) {
    console.error('API Error (facilities GET):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, adultRatePerHour, childRatePerHour, lightRatePerHour, allowChildRate } = body;

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const newFacility = await addFacility({
      name: name.trim(),
      adultRatePerHour: Number(adultRatePerHour) || 0,
      childRatePerHour: Number(childRatePerHour) || 0,
      lightRatePerHour: Number(lightRatePerHour) || 0,
      allowChildRate: !!allowChildRate,
    });

    return NextResponse.json(newFacility, { status: 201 });
  } catch (error) {
    console.error('API Error (facilities POST):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, adultRatePerHour, childRatePerHour, lightRatePerHour, allowChildRate } = body;

    if (!id) {
      return NextResponse.json({ error: 'Id is required' }, { status: 400 });
    }

    const updated = await updateFacility(id, {
      ...(name ? { name: name.trim() } : {}),
      ...(adultRatePerHour !== undefined ? { adultRatePerHour: Number(adultRatePerHour) } : {}),
      ...(childRatePerHour !== undefined ? { childRatePerHour: Number(childRatePerHour) } : {}),
      ...(lightRatePerHour !== undefined ? { lightRatePerHour: Number(lightRatePerHour) } : {}),
      ...(allowChildRate !== undefined ? { allowChildRate: !!allowChildRate } : {}),
    });

    if (!updated) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('API Error (facilities PUT):', error);
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
    const success = await deleteFacility(id);
    if (!success) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error (facilities DELETE):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
