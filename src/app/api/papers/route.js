import { NextResponse } from 'next/server';
import dbConnect from '@/../lib/db';
import Paper from '@/../models/Paper';

export async function GET() {
  try {
    await dbConnect();
    const papers = await Paper.find({}).sort({ createdAt: -1 }).limit(20);
    return NextResponse.json(papers);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
