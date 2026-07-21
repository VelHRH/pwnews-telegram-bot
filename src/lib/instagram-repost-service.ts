import { Context } from "@/types/telegram";
import { KeyboardService } from "./keyboard";
import { InstagramService } from "./instagram-service";

export class InstagramRepostService {
  private static pendingReposts = new Set<number>();

  static isWaiting(userId: number): boolean {
    return this.pendingReposts.has(userId);
  }

  private static get channelUsername(): string {
    const username = process.env.CHANNEL_USERNAME?.trim();
    if (!username) {
      throw new Error("CHANNEL_USERNAME is not configured");
    }
    return username.replace(/^@/, "").toLowerCase();
  }

  static async startRepost(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;

    if (!InstagramService.isConfigured()) {
      await ctx.reply(
        "❌ Instagram не настроен. Добавьте INSTAGRAM_ACCESS_TOKEN и INSTAGRAM_USER_ID в переменные окружения.",
        await KeyboardService.getMainKeyboard(),
      );
      return;
    }

    this.pendingReposts.add(userId);

    await ctx.reply(
      "📸 Перешлите пост из вашего канала с фото.\n\nБот возьмёт картинку и подпись и опубликует их в Instagram.",
      KeyboardService.getInstagramRepostKeyboard(),
    );
  }

  static async cancel(ctx: Context): Promise<boolean> {
    const userId = ctx.from!.id;

    if (!this.pendingReposts.has(userId)) {
      return false;
    }

    this.pendingReposts.delete(userId);
    await ctx.reply(
      "❌ Репост в Instagram отменён.",
      await KeyboardService.getMainKeyboard(),
    );
    return true;
  }

  static async handleForwardedPhoto(ctx: Context): Promise<boolean> {
    const userId = ctx.from!.id;

    if (!this.pendingReposts.has(userId)) {
      return false;
    }

    const message = ctx.message;
    if (!message) {
      return false;
    }

    if (!this.isForwardedFromOurChannel(message)) {
      await ctx.reply(
        "❌ Перешлите пост именно из вашего канала (не копируйте вручную).",
      );
      return true;
    }

    const fileId = this.extractImageFileId(message);
    if (!fileId) {
      await ctx.reply(
        "❌ В пересланном посте нет фото. Instagram поддерживает только посты с изображением.",
      );
      return true;
    }

    const rawCaption =
      typeof message.caption === "string" ? message.caption : "";
    const caption = InstagramService.prepareCaption(rawCaption);

    await ctx.reply("⏳ Публикую в Instagram...");

    try {
      const imageUrl = await this.getTelegramFileUrl(ctx, fileId);
      const { mediaId } = await InstagramService.publishPhoto(
        imageUrl,
        caption,
      );

      this.pendingReposts.delete(userId);
      await ctx.reply(
        `✅ Пост опубликован в Instagram!\n\nID: ${mediaId}`,
        await KeyboardService.getMainKeyboard(),
      );
    } catch (error) {
      console.error("Instagram repost error:", error);
      this.pendingReposts.delete(userId);

      const details =
        error instanceof Error ? error.message : "Неизвестная ошибка";

      await ctx.reply(
        `❌ Не удалось опубликовать в Instagram.\n\n${details}`,
        await KeyboardService.getMainKeyboard(),
      );
    }

    return true;
  }

  private static isForwardedFromOurChannel(message: Record<string, unknown>): boolean {
    const expectedChannel = this.channelUsername;

    const forwardOrigin = message.forward_origin as
      | {
          type?: string;
          chat?: { username?: string; id?: number };
        }
      | undefined;

    if (forwardOrigin?.type === "channel" && forwardOrigin.chat) {
      const username = forwardOrigin.chat.username?.toLowerCase();
      if (username && username === expectedChannel) {
        return true;
      }
    }

    const forwardFromChat = message.forward_from_chat as
      | { username?: string; id?: number }
      | undefined;

    if (forwardFromChat?.username?.toLowerCase() === expectedChannel) {
      return true;
    }

    return false;
  }

  private static extractImageFileId(
    message: Record<string, unknown>,
  ): string | null {
    const photos = message.photo as Array<{ file_id: string }> | undefined;
    if (photos?.length) {
      return photos[photos.length - 1].file_id;
    }

    const document = message.document as
      | { file_id: string; mime_type?: string }
      | undefined;

    if (document?.mime_type?.startsWith("image/")) {
      return document.file_id;
    }

    return null;
  }

  private static async getTelegramFileUrl(
    ctx: Context,
    fileId: string,
  ): Promise<string> {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    return fileLink.href;
  }
}
