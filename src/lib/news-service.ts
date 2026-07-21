import {
  Context,
  PendingPublication,
  PendingPPVPublication,
  PendingReview,
  PendingOtherNews,
} from "@/types/telegram";
import { Markup } from "telegraf";
import { KeyboardService } from "./keyboard";
import { WeeklyShow, WeeklyShowNames } from "@/constants/weekly-shows";
import { reviewersNames } from "@/constants/reviewers";
import { getBot } from "./bot";

export class NewsService {
  private static pendingPublications = new Map<number, PendingPublication>();
  private static pendingPPVPublications = new Map<
    number,
    PendingPPVPublication
  >();
  private static pendingReviews = new Map<number, PendingReview>();
  private static pendingOtherNews = new Map<number, PendingOtherNews>();

  /** PWNews often repeats the article headline as the first block inside textmessage; drop it when the real body follows. */
  private static stripDuplicateReviewLeadParagraph(text: string): string {
    const t = text.trim();
    if (!t) {
      return t;
    }

    const titleLike = (s: string) => /^Обзор\s.+-\s*Новости/i.test(s.trim());

    const blocks = t
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    if (blocks.length >= 2 && titleLike(blocks[0])) {
      return blocks.slice(1).join("\n\n").trim();
    }

    const lines = t.split(/\n/);
    if (lines.length >= 2 && titleLike(lines[0])) {
      return lines.slice(1).join("\n").trim();
    }

    return t;
  }

  private static trimTextAtReviewerName(text: string): string {
    // Split into sentences but KEEP their terminating punctuation
    const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [];

    for (let i = 0; i < sentences.length; i++) {
      // Check if the sentence contains one of the reviewer names
      const containsReviewerName = reviewersNames.some((name) =>
        sentences[i].toLowerCase().includes(name.toLowerCase()),
      );

      if (containsReviewerName) {
        // Return text up to this sentence, preserving original punctuation
        return sentences.slice(0, i).join("").trim();
      }
    }

    // If reviewer name not found, return the entire text
    return text;
  }

  private static get channelId(): string {
    if (!process.env.CHANNEL_USERNAME) {
      throw new Error(
        "CHANNEL_USERNAME is not defined in environment variables",
      );
    }
    return process.env.CHANNEL_USERNAME;
  }

  static async publishReview(ctx: Context): Promise<void> {
    try {
      const responseAllReviews = await fetch("https://pwnews.net/news/1-0-23");
      const htmlAllReviews = await responseAllReviews.text();
      const linkMatch = htmlAllReviews.match(/href="([^"]+)">Обзор /);
      const url = linkMatch ? `https://pwnews.net${linkMatch[1]}` : "";
      console.log(url);
      if (!url) {
        await ctx.reply("Не удалось получить ссылку на обзор");
        return;
      }

      const response = await fetch(url);
      const html = await response.text();

      const textMessageMatch = html.match(
        /<div class="textmessage">(.*?)<\/div>/s,
      );
      const imageMatch = html.match(/<img[^>]+src="([^">]+)"/);

      const rawTextMessage = textMessageMatch
        ? textMessageMatch[1]
            .split("</p>")[0]
            .replace(/<[^>]*>/g, "")
            .replace(/<p.*?>/g, "")
            .trim()
        : "";

      const textMessage = this.trimTextAtReviewerName(
        this.stripDuplicateReviewLeadParagraph(rawTextMessage),
      );

      const imageUrl = imageMatch
        ? imageMatch[1].startsWith("http")
          ? imageMatch[1]
          : `https://pwnews.net${imageMatch[1]}`
        : "";

      const text = textMessage;

      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: "ЧИТАТЬ ОБЗОР",
              url: url,
            },
          ],
        ],
      };

      this.pendingReviews.set(ctx.from!.id, {
        text,
        imageUrl,
        url,
        inlineKeyboard,
      });

      if (imageUrl) {
        await ctx.replyWithPhoto(imageUrl, {
          caption: text,
          reply_markup: inlineKeyboard,
        });
      } else {
        await ctx.reply(text, { reply_markup: inlineKeyboard });
      }

      await ctx.reply(
        "Проверьте пост и выберите действие:",
        Markup.keyboard([
          ["✅ Опубликовать обзор"],
          ["📝 Изменить текст обзора"],
          ["❌ Отменить публикацию обзора"],
        ])
          .resize()
          .oneTime(),
      );
    } catch (error) {
      console.error("Error in publishReview:", error);
      await ctx.reply("Произошла ошибка при получении обзора");
    }
  }

  static async handleReviewResponse(
    ctx: Context,
    response: string,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const pendingReview = this.pendingReviews.get(userId);

    if (!pendingReview) {
      await ctx.reply("Нет ожидающего обзора для публикации");
      return;
    }

    switch (response) {
      case "✅ Опубликовать обзор":
        try {
          if (pendingReview.imageUrl) {
            await ctx.telegram.sendPhoto(
              this.channelId,
              pendingReview.imageUrl,
              {
                caption: pendingReview.text,
                reply_markup: pendingReview.inlineKeyboard,
              },
            );
          } else {
            await ctx.telegram.sendMessage(this.channelId, pendingReview.text, {
              reply_markup: pendingReview.inlineKeyboard,
            });
          }
          await ctx.reply(
            "Обзор успешно опубликован!",
            await KeyboardService.getMainKeyboard(),
          );
          this.pendingReviews.delete(userId);
        } catch (error) {
          console.error("Error publishing review:", error);
          await ctx.reply("Ошибка при публикации обзора");
        }
        break;

      case "📝 Изменить текст обзора":
        await ctx.reply(
          "Отправьте новый текст для обзора:",
          KeyboardService.getCancelKeyboard(),
        );
        break;

      case "❌ Отменить публикацию обзора":
        this.pendingReviews.delete(userId);
        await ctx.reply(
          "Публикация обзора отменена",
          await KeyboardService.getMainKeyboard(),
        );
        break;

      default:
        // Handle text modification
        if (pendingReview && response !== "❌ Отменить") {
          const updatedReview = { ...pendingReview, text: response };
          this.pendingReviews.set(userId, updatedReview);

          if (updatedReview.imageUrl) {
            await ctx.replyWithPhoto(updatedReview.imageUrl, {
              caption: updatedReview.text,
              reply_markup: updatedReview.inlineKeyboard,
            });
          } else {
            await ctx.reply(updatedReview.text, {
              reply_markup: updatedReview.inlineKeyboard,
            });
          }

          await ctx.reply(
            "Обновленный пост. Выберите действие:",
            Markup.keyboard([
              ["✅ Опубликовать обзор"],
              ["📝 Изменить текст обзора"],
              ["❌ Отменить публикацию обзора"],
            ])
              .resize()
              .oneTime(),
          );
        }
        break;
    }
  }

  static async publishPPVResults(
    ctx: Context,
    customUrl?: string,
  ): Promise<void> {
    try {
      if (!process.env.CHANNEL_USERNAME?.trim()) {
        await ctx.reply("Ошибка: ID канала не настроен");
        return;
      }

      let ppvData: {
        cleanedText: string;
        articleUrl: string;
        imageUrl: string;
      };

      if (customUrl) {
        const extractedData = await this.extractPPVDataFromUrl(customUrl);
        if (!extractedData) {
          await ctx.reply(
            "Не удалось извлечь данные из предоставленной ссылки",
          );
          return;
        }
        ppvData = extractedData;
      } else {
        const defaultData = await this.extractPPVData();
        if (!defaultData) {
          await ctx.reply("Не удалось извлечь данные о PPV");
          return;
        }
        ppvData = defaultData;
      }

      const { cleanedText, articleUrl, imageUrl } = ppvData;
      const blogMatchTitles = this.ppvTitlesForBlogAltMatch(cleanedText);

      const responseVideo = await fetch("https://pwnews.net/blog/");
      const htmlVideo = await responseVideo.text();

      const imgRegex =
        /<a[^>]*href="([^"]*)"[^>]*>\s*<img[^>]*alt="([^"]*)"[^>]*>/gs;
      let videoUrl = "";
      let match;

      while ((match = imgRegex.exec(htmlVideo)) !== null) {
        const hrefUrl = match[1];
        const altText = match[2];

        if (blogMatchTitles.some((t) => t && altText.includes(t))) {
          videoUrl = hrefUrl.startsWith("http")
            ? hrefUrl
            : `https://pwnews.net${hrefUrl}`;
          break;
        }
      }

      if (!videoUrl) {
        await ctx.reply("Не удалось найти видео для данного эфира");
        return;
      }

      const inlineKeyboard = {
        inline_keyboard: [
          [
            { text: "Результаты".toUpperCase(), url: articleUrl },
            { text: "Смотреть".toUpperCase(), url: videoUrl },
          ],
        ],
      };

      await ctx.replyWithPhoto(imageUrl.replace(/\/s/g, "/"), {
        caption: `Результаты ${cleanedText} + запись шоу`,
        reply_markup: inlineKeyboard,
      });

      if (ctx.from?.id) {
        this.pendingPPVPublications.set(ctx.from.id, {
          cleanedText,
          articleUrl,
          videoUrl,
          imageUrl,
          inlineKeyboard,
        });
      }

      await ctx.reply(
        "Выберете время публикации или вставьте ссылку на другое шоу",
        Markup.keyboard([
          ["Сейчас", "В 7:30"],
          ["В 8:30", "В 9:00"],
        ]).resize(),
      );
    } catch (error) {
      console.error("Error in publishPPVResults:", error);
      await ctx.reply("Произошла ошибка при получении результатов PPV");
    }
  }

  private static async extractPPVData(): Promise<{
    cleanedText: string;
    articleUrl: string;
    imageUrl: string;
  } | null> {
    try {
      const response = await fetch("https://pwnews.net/news/1-0-21");
      const html = await response.text();

      const divMatch = html.match(
        /<div[^>]*class="[^"]*vidnovosnew-title[^"]*"[^>]*>(.*?)<\/div>/s,
      );

      if (!divMatch) {
        return null;
      }

      const divIndex = html.indexOf(divMatch[0]);
      const htmlBeforeDiv = html.substring(0, divIndex);
      const srcMatches = htmlBeforeDiv.match(/src="([^"]+)"/g);

      if (!srcMatches?.length) {
        return null;
      }

      const aTagMatch = divMatch[1].match(/<a[^>]*>(.*?)<\/a>/s);

      if (!aTagMatch) {
        return null;
      }

      const hrefMatch = divMatch[1].match(/<a[^>]*href="([^"]*)"[^>]*>/);

      if (!hrefMatch) {
        return null;
      }

      const articleUrl = hrefMatch[1].startsWith("http")
        ? hrefMatch[1]
        : `https://pwnews.net${hrefMatch[1]}`;

      let cleanedText = aTagMatch[1].replace(/<[^>]*>/g, "").trim();

      cleanedText = cleanedText.replace(/^Результаты\s+/i, "");
      cleanedText = cleanedText.replace(/\s+/g, " ").trim();

      const lastSrcMatch = srcMatches[srcMatches.length - 1];
      const srcCap = lastSrcMatch.match(/src="([^"]+)"/);
      if (!srcCap) {
        return null;
      }
      const imageUrl = `https://pwnews.net${srcCap[1]}`;

      return {
        cleanedText,
        articleUrl,
        imageUrl,
      };
    } catch (error) {
      console.error("Error extracting PPV data:", error);
      return null;
    }
  }

  private static async extractPPVDataFromUrl(url: string): Promise<{
    cleanedText: string;
    articleUrl: string;
    imageUrl: string;
  } | null> {
    try {
      const response = await fetch(url);
      const html = await response.text();

      const imgMatch = html.match(
        /<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/,
      );

      if (!imgMatch) {
        return null;
      }

      const srcUrl = imgMatch[1];
      const altText = imgMatch[2];

      const imageUrl = srcUrl.startsWith("http")
        ? srcUrl
        : `https://pwnews.net${srcUrl}`;

      let cleanedText = altText.trim();

      cleanedText = cleanedText.replace(/^Результаты\s+/i, "");
      cleanedText = cleanedText.replace(/\s+/g, " ").trim();

      return {
        cleanedText,
        articleUrl: url,
        imageUrl,
      };
    } catch (error) {
      console.error("Error extracting PPV data from URL:", error);
      return null;
    }
  }

  /** Titles to try against pwnews.net/blog/ <img alt> (full string for display is kept elsewhere; alts may omit the year). */
  private static ppvTitlesForBlogAltMatch(displayTitle: string): string[] {
    const normalized = displayTitle.replace(/\s+/g, " ").trim();
    const currentYear = new Date().getFullYear();
    const withoutYear = normalized
      .replace(new RegExp(`\\b${currentYear}\\b`, "g"), "")
      .replace(/\s+/g, " ")
      .trim();
    const keys = [normalized];
    if (withoutYear.length > 0 && withoutYear !== normalized) {
      keys.push(withoutYear);
    }
    return keys;
  }

  static async handlePPVTimeSelection(
    ctx: Context,
    timeSelection: string,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const pendingPPV = this.pendingPPVPublications.get(userId);

    if (!pendingPPV) {
      await ctx.reply("Нет ожидающих результатов PPV для публикации");
      return;
    }

    if (timeSelection === "Сейчас") {
      try {
        await ctx.telegram.sendPhoto(
          this.channelId,
          pendingPPV.imageUrl.replace(/\/s/g, "/"),
          {
            caption: `Результаты ${pendingPPV.cleanedText} + запись шоу`,
            reply_markup: pendingPPV.inlineKeyboard,
          },
        );
        await ctx.reply(
          "Результаты PPV успешно опубликованы!",
          await KeyboardService.getMainKeyboard(),
        );
        this.pendingPPVPublications.delete(userId);
      } catch (error) {
        console.error("Error publishing PPV results:", error);
        await ctx.reply("Ошибка при публикации результатов PPV");
      }
    } else {
      await ctx.reply(
        `Результаты PPV запланированы к публикации ${timeSelection}`,
        await KeyboardService.getMainKeyboard(),
      );
      // Note: In the original NestJS version, this would schedule the publication
      // For Vercel, we'll handle this through cron jobs
    }
  }

  static async publishWeeklyResults(ctx: Context): Promise<void> {
    if (!this.channelId) {
      await ctx.reply("Ошибка: ID канала не настроен");
      return;
    }

    const responseAllReviews = await fetch("https://pwnews.net/stuff/");
    const htmlAllReviews = await responseAllReviews.text();
    const linkMatch = htmlAllReviews.match(
      /href="([^"]+)">Результаты (WWE|AEW) /,
    );

    const url = linkMatch ? `https://pwnews.net${linkMatch[1]}` : "";

    if (!url) {
      await ctx.reply("Не удалось получить ссылку на обзор");
      return;
    }

    const response = await fetch(url);
    const html = await response.text();

    const title = html.match(/<title>(.*?)<\/title>/);
    const show = Object.values(WeeklyShow).find((show) =>
      title?.[1].toUpperCase().includes(show),
    );

    if (!show) {
      await ctx.reply("Не удалось получить название шоу из заголовка");
      return;
    }

    const normalizedShow = WeeklyShowNames[show];

    const dateMatch = title?.[1].match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dateMatch) {
      await ctx.reply("Не удалось получить дату из заголовка");
      return;
    }

    const [, day, month, year] = dateMatch;
    const postDate = new Date(`${year}-${month}-${day}`);
    const oneDayAgo = new Date(new Date().setHours(0, 0, 0, 0));
    oneDayAgo.setTime(oneDayAgo.getTime() - 24 * 60 * 60 * 1000);

    const responseVideo = await fetch("https://pwnews.net/blog/");
    const htmlVideo = await responseVideo.text();
    const dateSearch = `${day}.${month}.${year}`;

    const lines = htmlVideo.split("\n");
    const targetLine = lines.find(
      (line) => line.includes(normalizedShow) && line.includes(dateSearch),
    );

    let videoUrl = "";
    let videoImageUrl = "";

    if (targetLine) {
      const hrefMatch = targetLine.match(/href="([^"]+)"/);
      const srcMatch = targetLine.match(/src="([^"]+)"/);

      videoUrl = hrefMatch ? `https://pwnews.net${hrefMatch[1]}` : "";
      videoImageUrl = srcMatch
        ? srcMatch[1].startsWith("http")
          ? srcMatch[1]
          : `https://pwnews.net${srcMatch[1]}`
        : "";
    }

    if (!videoUrl || !videoImageUrl) {
      await ctx.reply("Видео для данного эфира не найдено");
      return;
    }

    const text = `Итоги и результаты сегодняшнего эфира ${normalizedShow} (+ онлайн запись шоу)`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "Результаты".toUpperCase(), url },
          { text: "Смотреть".toUpperCase(), url: videoUrl },
        ],
      ],
    };

    if (postDate < oneDayAgo) {
      await ctx.sendPhoto(videoImageUrl.replace(/\/s/g, "/"), {
        caption: `${text} \n\n• Результаты: ${url.replace("https://", "")} \n• Смотреть: ${videoUrl.replace("https://", "")}`,
        reply_markup: inlineKeyboard,
      });
      await ctx.reply(
        `Последние результаты (${title?.[1]}) слишком старые. Действительно ли я должен опубликовть их? Если что, я сам проверяю актуальые результаты каждый день в 7:30.`,
        Markup.keyboard([["✅ Да", "❌ Нет"]]).resize(),
      );

      // Save data for later use
      if (ctx.from?.id) {
        this.pendingPublications.set(ctx.from.id, {
          text,
          url,
          videoUrl,
          videoImageUrl: videoImageUrl.replace(/\/s/g, "/"),
          inlineKeyboard,
        });
      }

      return;
    }

    await ctx.telegram.sendPhoto(
      this.channelId,
      videoImageUrl.replace(/\/s/g, "/"),
      {
        caption: this.formatNewsCaption(text, url, videoUrl),
        parse_mode: "MarkdownV2",
        reply_markup: inlineKeyboard,
      },
    );

    await ctx.reply(`Результаты ${normalizedShow} успешно опубликованы!`);
  }

  private static escapeMarkdown(text: string): string {
    return text.replace(/[[\](){}*_#+\-=|>.]/g, "\\$&");
  }

  private static formatNewsCaption(
    text: string,
    url: string,
    videoUrl: string,
  ): string {
    return `${this.escapeMarkdown(text)} \n\n• *Результаты:* ${this.escapeMarkdown(url.replace("https://", ""))} \n• *Смотреть:* ${this.escapeMarkdown(videoUrl.replace("https://", ""))}`;
  }

  static async handleWeeklyConfirmation(
    ctx: Context,
    confirmed: boolean,
  ): Promise<void> {
    const userId = ctx.from!.id;

    if (confirmed) {
      await ctx.reply(
        "Результаты еженедельников опубликованы!",
        await KeyboardService.getMainKeyboard(),
      );
      // Implementation would publish all pending weekly results
    } else {
      await ctx.reply(
        "Публикация отменена",
        await KeyboardService.getMainKeyboard(),
      );
    }

    this.pendingPublications.delete(userId);
  }

  // Method for cron job to publish daily results automatically
  static async publishDailyResults(): Promise<boolean> {
    try {
      if (!this.channelId) {
        console.error(
          "Error: CHANNEL_USERNAME is not defined in environment variables",
        );
        return false;
      }

      // Get bot instance to send messages
      const bot = getBot();

      // Fetch latest results from pwnews.net
      const responseAllReviews = await fetch("https://pwnews.net/stuff/");
      const htmlAllReviews = await responseAllReviews.text();
      const linkMatch = htmlAllReviews.match(
        /href="([^"]+)">Результаты (WWE|AEW) /,
      );

      const url = linkMatch ? `https://pwnews.net${linkMatch[1]}` : "";

      if (!url) {
        console.error("Failed to get results link from pwnews.net/stuff/");
        return false;
      }

      const response = await fetch(url);
      const html = await response.text();

      const title = html.match(/<title>(.*?)<\/title>/);
      const show = Object.values(WeeklyShow).find((show) =>
        title?.[1].toUpperCase().includes(show),
      );

      if (!show) {
        console.error("Failed to extract show name from title:", title?.[1]);
        return false;
      }

      const normalizedShow = WeeklyShowNames[show];

      const dateMatch = title?.[1].match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (!dateMatch) {
        console.error("Failed to extract date from title:", title?.[1]);
        return false;
      }

      const [, day, month, year] = dateMatch;
      const dateSearch = `${day}.${month}.${year}`;

      const postDate = new Date(`${year}-${month}-${day}`);
      const oneDayAgo = new Date(new Date().setHours(0, 0, 0, 0));
      oneDayAgo.setTime(oneDayAgo.getTime() - 24 * 60 * 60 * 1000);

      if (postDate < oneDayAgo) {
        console.log(`Skipping publication: Results are too old`);
        return true;
      }

      // Fetch video information
      const responseVideo = await fetch("https://pwnews.net/blog/");
      const htmlVideo = await responseVideo.text();

      const lines = htmlVideo.split("\n");
      const targetLine = lines.find(
        (line) => line.includes(normalizedShow) && line.includes(dateSearch),
      );

      let videoUrl = "";
      let videoImageUrl = "";

      if (targetLine) {
        const hrefMatch = targetLine.match(/href="([^"]+)"/);
        const srcMatch = targetLine.match(/src="([^"]+)"/);

        videoUrl = hrefMatch ? `https://pwnews.net${hrefMatch[1]}` : "";
        videoImageUrl = srcMatch
          ? srcMatch[1].startsWith("http")
            ? srcMatch[1]
            : `https://pwnews.net${srcMatch[1]}`
          : "";
      }

      if (!videoUrl || !videoImageUrl) {
        console.error(
          "Video not found for show:",
          normalizedShow,
          "date:",
          dateSearch,
        );
        return false;
      }

      const text = `Итоги и результаты сегодняшнего эфира ${normalizedShow} (+ онлайн запись шоу)`;

      const inlineKeyboard = {
        inline_keyboard: [
          [
            { text: "Результаты".toUpperCase(), url },
            { text: "Смотреть".toUpperCase(), url: videoUrl },
          ],
        ],
      };

      // Publish directly to channel
      await bot.telegram.sendPhoto(
        this.channelId,
        videoImageUrl.replace(/\/s/g, "/"),
        {
          caption: this.formatNewsCaption(text, url, videoUrl),
          parse_mode: "MarkdownV2",
          reply_markup: inlineKeyboard,
        },
      );

      console.log(`Daily results for ${normalizedShow} published successfully`);
      return true;
    } catch (error) {
      console.error("Error in daily results publication:", error);
      return false;
    }
  }

  static async publishOtherNews(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;

    // Start the process - request URL
    this.pendingOtherNews.set(userId, {
      step: "waiting_url",
    });

    await ctx.reply(
      "🔗 Пожалуйста, отправьте ссылку на страницу, которую хотите опубликовать:",
      KeyboardService.getOtherNewsKeyboard(),
    );
  }

  static async handleOtherNewsInput(
    ctx: Context,
    text: string,
  ): Promise<boolean> {
    const userId = ctx.from!.id;
    const pending = this.pendingOtherNews.get(userId);

    if (!pending) {
      return false; // Don't handle if there's no active process
    }

    if (pending.step === "waiting_url") {
      // Check that this is a valid link
      const urlRegex = /^https?:\/\/.+/;
      if (!urlRegex.test(text)) {
        await ctx.reply(
          "❌ Пожалуйста, отправьте корректную ссылку (начинающуюся с http:// или https://)",
        );
        return true;
      }

      try {
        // Get page information
        const response = await fetch(text);
        const html = await response.text();

        // Extract title
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const title = titleMatch
          ? titleMatch[1].trim().split(" - ")[0]
          : "Без заголовка";

        // Extract image
        const imageMatch =
          html.match(
            /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)/i,
          ) || html.match(/<img[^>]*src=["']([^"']*)/i);
        let imageUrl = imageMatch ? imageMatch[1] : "";

        // Make image URL absolute
        if (imageUrl && !imageUrl.startsWith("http")) {
          const baseUrl = new URL(text).origin;
          imageUrl = imageUrl.startsWith("/")
            ? baseUrl + imageUrl
            : baseUrl + "/" + imageUrl;
        }

        // Update state
        this.pendingOtherNews.set(userId, {
          step: "waiting_button_text",
          url: text,
          title,
          imageUrl,
        });

        await ctx.reply(
          `✅ Страница загружена!\n\n📄 **${title}**\n\n🔘 Теперь введите текст для кнопки под постом (напрмер "ОЦЕНКИ"):`,
          {
            parse_mode: "Markdown",
            ...KeyboardService.getOtherNewsKeyboard(),
          },
        );
      } catch (error) {
        await ctx.reply(
          "❌ Не удалось загрузить страницу. Проверьте ссылку и попробуйте снова.",
        );
        return true;
      }
    } else if (pending.step === "waiting_button_text") {
      const buttonText = text.trim() || "ОЦЕНКИ";

      const finalPost = {
        ...pending,
        buttonText,
      };

      // Create final message
      const postText =
        finalPost.title +
        (finalPost.description ? `\n\n${finalPost.description}` : "");

      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: buttonText,
              url: finalPost.url!,
            },
          ],
        ],
      };

      // Send post preview
      if (finalPost.imageUrl) {
        try {
          await ctx.replyWithPhoto(finalPost.imageUrl, {
            caption: postText,
            reply_markup: inlineKeyboard,
          });
        } catch (error) {
          // If image doesn't load, send without it
          await ctx.reply(postText, { reply_markup: inlineKeyboard });
        }
      } else {
        await ctx.reply(postText, { reply_markup: inlineKeyboard });
      }

      await ctx.reply(
        "Проверьте пост и выберите действие:",
        KeyboardService.getOtherNewsConfirmKeyboard(),
      );

      // Save final data for publication
      this.pendingOtherNews.set(userId, {
        step: "ready_to_publish",
        url: finalPost.url!,
        title: finalPost.title!,
        description: finalPost.description || "",
        imageUrl: finalPost.imageUrl || "",
        buttonText: buttonText,
      });
    }

    return true;
  }

  static async cancelOtherNews(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    this.pendingOtherNews.delete(userId);
    await ctx.reply(
      "❌ Публикация отменена.",
      await KeyboardService.getMainKeyboard(),
    );
  }

  static async publishOtherNewsToChannel(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const pending = this.pendingOtherNews.get(userId);

    if (!pending || pending.step !== "ready_to_publish") {
      await ctx.reply(
        "❌ Нет данных для публикации",
        await KeyboardService.getMainKeyboard(),
      );
      return;
    }

    try {
      const postText =
        pending.title +
        (pending.description ? `\n\n${pending.description}` : "");

      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: pending.buttonText!,
              url: pending.url!,
            },
          ],
        ],
      };

      // Publish to channel
      if (pending.imageUrl) {
        try {
          await ctx.telegram.sendPhoto(this.channelId, pending.imageUrl, {
            caption: postText,
            reply_markup: inlineKeyboard,
          });
        } catch (error) {
          // If image doesn't load, send without it
          await ctx.telegram.sendMessage(this.channelId, postText, {
            reply_markup: inlineKeyboard,
          });
        }
      } else {
        await ctx.telegram.sendMessage(this.channelId, postText, {
          reply_markup: inlineKeyboard,
        });
      }

      // Clear state and return to main menu
      this.pendingOtherNews.delete(userId);
      await ctx.reply(
        "✅ Новость успешно опубликована!",
        await KeyboardService.getMainKeyboard(),
      );
    } catch (error) {
      console.error("Error publishing other news:", error);
      await ctx.reply(
        "❌ Ошибка при публикации. Попробуйте еще раз.",
        await KeyboardService.getMainKeyboard(),
      );
      this.pendingOtherNews.delete(userId);
    }
  }
}
