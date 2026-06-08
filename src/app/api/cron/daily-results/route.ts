import { NextRequest, NextResponse } from 'next/server';
import { CronPauseService } from '@/lib/cron-pause';
import { NewsService } from '@/lib/news-service';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (await CronPauseService.isPaused()) {
      const pauseUntil = await CronPauseService.getPauseUntil();
      console.log(
        `Daily results cron skipped — paused until ${pauseUntil ? new Date(pauseUntil).toISOString() : 'unknown'}`,
      );
      return NextResponse.json({
        message: 'Cron jobs are paused',
        pausedUntil: pauseUntil ? new Date(pauseUntil).toISOString() : null,
        timestamp: new Date().toISOString(),
      });
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
