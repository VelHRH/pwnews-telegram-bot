import { Telegraf } from 'telegraf';
import { Context } from '@/types/telegram';

let botInstance: Telegraf<Context> | null = null;

export function getBot(): Telegraf<Context> {
  if (!botInstance) {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
    }

    botInstance = new Telegraf<Context>(process.env.TELEGRAM_BOT_TOKEN);

    // Error handling
    botInstance.catch((err: any, ctx: Context) => {
      console.error(`Error for ${ctx.updateType}:`, err);
    });
  }

  return botInstance;
}
