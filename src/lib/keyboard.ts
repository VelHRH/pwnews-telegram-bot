import { Markup } from "telegraf";
import { CronPauseService } from "@/lib/cron-pause";

export class KeyboardService {
  static async getMainKeyboard() {
    const toggleButton = await CronPauseService.getToggleButtonLabel();

    return Markup.keyboard([
      ["📝 Опубликовать обзор"],
      ["🎉 Опубликовать результаты PPV/спецшоу"],
      ["Опубликовать результаты еженедельника"],
      ["🔗 Опубликовать другое"],
      [toggleButton],
    ])
      .resize()
      .placeholder("Нажмите, чтобы создать пост");
  }

  static getCancelKeyboard() {
    return Markup.keyboard([["❌ Отменить"]])
      .resize()
      .oneTime();
  }

  static getOtherNewsKeyboard() {
    return Markup.keyboard([["❌ Отмена"]])
      .resize()
      .oneTime();
  }

  static getOtherNewsConfirmKeyboard() {
    return Markup.keyboard([["✅ Опубликовать"], ["❌ Отмена"]])
      .resize()
      .oneTime();
  }
}
