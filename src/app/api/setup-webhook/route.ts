import { NextRequest, NextResponse } from 'next/server';
import { getBot } from '@/lib/bot';

export async function POST(request: NextRequest) {
  try {
    const { webhookUrl } = await request.json();
    
    if (!webhookUrl) {
      return NextResponse.json({ error: 'Webhook URL is required' }, { status: 400 });
    }

    // Set the webhook
    const bot = getBot();
    await bot.telegram.setWebhook(webhookUrl);
    
    return NextResponse.json({ 
      message: 'Webhook set successfully',
      url: webhookUrl
    });
  } catch (error) {
    console.error('Setup webhook error:', error);
    return NextResponse.json({ 
      error: 'Failed to set webhook',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Get current webhook info
    const bot = getBot();
    const webhookInfo = await bot.telegram.getWebhookInfo();
    
    return NextResponse.json({
      webhook: webhookInfo
    });
  } catch (error) {
    console.error('Get webhook info error:', error);
    return NextResponse.json({ 
      error: 'Failed to get webhook info',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    // Delete webhook
    const bot = getBot();
    await bot.telegram.deleteWebhook();
    
    return NextResponse.json({ 
      message: 'Webhook deleted successfully'
    });
  } catch (error) {
    console.error('Delete webhook error:', error);
    return NextResponse.json({ 
      error: 'Failed to delete webhook',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
