import { Markup } from 'telegraf';
import { CronPauseService } from '@/lib/cron-pause';

export class KeyboardService {
  static getMainKeyboard() {
    return Markup.keyboard([
      ['📝 Опубликовать обзор'],
      ['🎉 Опубликовать результаты PPV/спецшоу'],
      ['Опубликовать результаты еженедельника'],
      ['🔗 Опубликовать другое'],
      [CronPauseService.BUTTON_LABEL],
    ])
      .resize()
      .placeholder('Нажмите, чтобы создать пост');
  }

  static getCancelKeyboard() {
    return Markup.keyboard([['❌ Отменить']])
      .resize()
      .oneTime();
  }

  static getOtherNewsKeyboard() {
    return Markup.keyboard([['❌ Отмена']])
      .resize()
      .oneTime();
  }

  static getOtherNewsConfirmKeyboard() {
    return Markup.keyboard([
      ['✅ Опубликовать'],
      ['❌ Отмена']
    ])
      .resize()
      .oneTime();
  }
}
