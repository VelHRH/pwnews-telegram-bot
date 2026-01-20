import { NextRequest, NextResponse } from 'next/server';
import { NewsService } from '@/lib/news-service';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting daily results publication cron job');
    const success = await NewsService.publishDailyResults();

    if (!success) {
      console.error('Daily results publication failed');
      return NextResponse.json({
        error: 'Publication failed',
        message: 'Failed to publish daily results. Check logs for details.',
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Daily results publication completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
