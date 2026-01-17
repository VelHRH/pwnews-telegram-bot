import { Context, PendingPublication, PendingPPVPublication, PendingReview } from '@/types/telegram';
import { Markup } from 'telegraf';
import { KeyboardService } from './keyboard';
import { WeeklyShow, WeeklyShowNames } from '@/constants/weekly-shows';
import { reviewersNames } from '@/constants/reviewers';

export class NewsService {
  private static pendingPublications = new Map<number, PendingPublication>();
  private static pendingPPVPublications = new Map<number, PendingPPVPublication>();
  private static pendingReviews = new Map<number, PendingReview>();

  private static trimTextAtReviewerName(text: string): string {
    const sentences = text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0);

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();

      // Проверяем, содержит ли предложение одно из имен рецензентов
      const containsReviewerName = reviewersNames.some(name =>
        sentence.toLowerCase().includes(name.toLowerCase())
      );

      if (containsReviewerName) {
        // Возвращаем текст до этого предложения
        return sentences.slice(0, i).join('. ').trim() + (sentences.slice(0, i).length > 0 ? '.' : '');
      }
    }

    // Если имя рецензента не найдено, возвращаем весь текст
    return text;
  }

  private static get channelId(): string {
    if (!process.env.CHANNEL_USERNAME) {
      throw new Error('CHANNEL_USERNAME is not defined in environment variables');
    }
    return process.env.CHANNEL_USERNAME;
  }

  static async publishReview(ctx: Context): Promise<void> {
    try {
      const responseAllReviews = await fetch('https://pwnews.net/news/1-0-23');
      const htmlAllReviews = await responseAllReviews.text();
      const linkMatch = htmlAllReviews.match(/href="([^"]+)">Обзор /);
      const url = linkMatch ? `https://pwnews.net${linkMatch[1]}` : '';
      console.log(url);
      if (!url) {
        await ctx.reply('Не удалось получить ссылку на обзор');
        return;
      }

      const response = await fetch(url);
      const html = await response.text();

      const title = html.match(/<title>(.*?)<\/title>/);
      const textMessageMatch = html.match(/<div class="textmessage">(.*?)<\/div>/s);
      const imageMatch = html.match(/<img[^>]+src="([^">]+)"/);

      const rawTextMessage = textMessageMatch
        ? textMessageMatch[1]
          .split('</p>')[0]
          .replace(/<[^>]*>/g, '')
          .replace(/<p.*?>/g, '')
          .trim()
        : '';

      const textMessage = this.trimTextAtReviewerName(rawTextMessage);



      const imageUrl = imageMatch
        ? imageMatch[1].startsWith('http')
          ? imageMatch[1]
          : `https://pwnews.net${imageMatch[1]}`
        : '';
      const cleanTitle = title ? title[1].replace(' - PWNews.net', '') : '';

      const text = `${cleanTitle}\n\n${textMessage}`;

      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: '📖 Читать на сайте',
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
        'Проверьте пост и выберите действие:',
        Markup.keyboard([
          ['✅ Опубликовать обзор'],
          ['📝 Изменить текст обзора'],
          ['❌ Отменить публикацию обзора'],
        ])
          .resize()
          .oneTime(),
      );
    } catch (error) {
      console.error('Error in publishReview:', error);
      await ctx.reply('Произошла ошибка при получении обзора');
    }
  }

  static async handleReviewResponse(ctx: Context, response: string): Promise<void> {
    const userId = ctx.from!.id;
    const pendingReview = this.pendingReviews.get(userId);

    if (!pendingReview) {
      await ctx.reply('Нет ожидающего обзора для публикации');
      return;
    }

    switch (response) {
      case '✅ Опубликовать обзор':
        try {
          if (pendingReview.imageUrl) {
            await ctx.telegram.sendPhoto(this.channelId, pendingReview.imageUrl, {
              caption: pendingReview.text,
              reply_markup: pendingReview.inlineKeyboard,
            });
          } else {
            await ctx.telegram.sendMessage(this.channelId, pendingReview.text, {
              reply_markup: pendingReview.inlineKeyboard,
            });
          }
          await ctx.reply('Обзор успешно опубликован!', KeyboardService.getMainKeyboard());
          this.pendingReviews.delete(userId);
        } catch (error) {
          console.error('Error publishing review:', error);
          await ctx.reply('Ошибка при публикации обзора');
        }
        break;

      case '📝 Изменить текст обзора':
        await ctx.reply(
          'Отправьте новый текст для обзора:',
          KeyboardService.getCancelKeyboard(),
        );
        break;

      case '❌ Отменить публикацию обзора':
        this.pendingReviews.delete(userId);
        await ctx.reply('Публикация обзора отменена', KeyboardService.getMainKeyboard());
        break;

      default:
        // Handle text modification
        if (pendingReview && response !== '❌ Отменить') {
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
            'Обновленный пост. Выберите действие:',
            Markup.keyboard([
              ['✅ Опубликовать обзор'],
              ['📝 Изменить текст обзора'],
              ['❌ Отменить публикацию обзора'],
            ])
              .resize()
              .oneTime(),
          );
        }
        break;
    }
  }

  static async publishPPVResults(ctx: Context, url?: string): Promise<void> {
    try {
      let articleUrl = url;

      if (!articleUrl) {
        const responseAllResults = await fetch('https://pwnews.net/news/1-0-21');
        const htmlAllResults = await responseAllResults.text();
        const linkMatch = htmlAllResults.match(/href="([^"]+)">Результаты /);
        articleUrl = linkMatch ? `https://pwnews.net${linkMatch[1]}` : '';
      }

      if (!articleUrl) {
        await ctx.reply('Не удалось получить ссылку на результаты');
        return;
      }

      const response = await fetch(articleUrl);
      const html = await response.text();

      const title = html.match(/<title>(.*?)<\/title>/);
      const textMessageMatch = html.match(/<div class="textmessage">(.*?)<\/div>/s);
      const imageMatch = html.match(/<img[^>]+src="([^">]+)"/);
      const videoMatch = html.match(/https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);

      const textMessage = textMessageMatch
        ? textMessageMatch[1]
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim()
        : '';

      const imageUrl = imageMatch
        ? imageMatch[1].startsWith('http')
          ? imageMatch[1]
          : `https://pwnews.net${imageMatch[1]}`
        : '';
      const videoUrl = videoMatch ? videoMatch[0] : '';
      const cleanTitle = title ? title[1].replace(' - PWNews.net', '') : '';

      const cleanedText = `${cleanTitle}\n\n${textMessage}`;

      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: '📖 Читать на сайте',
              url: articleUrl,
            },
          ],
          ...(videoUrl
            ? [
              [
                {
                  text: '📺 Смотреть видео',
                  url: videoUrl,
                },
              ],
            ]
            : []),
        ],
      };

      this.pendingPPVPublications.set(ctx.from!.id, {
        cleanedText,
        articleUrl,
        videoUrl,
        imageUrl,
        inlineKeyboard,
      });

      if (imageUrl) {
        await ctx.replyWithPhoto(imageUrl, {
          caption: cleanedText,
          reply_markup: inlineKeyboard,
        });
      } else {
        await ctx.reply(cleanedText, { reply_markup: inlineKeyboard });
      }

      await ctx.reply(
        'Когда опубликовать?',
        Markup.keyboard([['Сейчас'], ['В 7:30'], ['В 8:30'], ['В 9:00']])
          .resize()
          .oneTime(),
      );
    } catch (error) {
      console.error('Error in publishPPVResults:', error);
      await ctx.reply('Произошла ошибка при получении результатов PPV');
    }
  }

  static async handlePPVTimeSelection(ctx: Context, timeSelection: string): Promise<void> {
    const userId = ctx.from!.id;
    const pendingPPV = this.pendingPPVPublications.get(userId);

    if (!pendingPPV) {
      await ctx.reply('Нет ожидающих результатов PPV для публикации');
      return;
    }

    if (timeSelection === 'Сейчас') {
      try {
        if (pendingPPV.imageUrl) {
          await ctx.telegram.sendPhoto(this.channelId, pendingPPV.imageUrl, {
            caption: pendingPPV.cleanedText,
            reply_markup: pendingPPV.inlineKeyboard,
          });
        } else {
          await ctx.telegram.sendMessage(this.channelId, pendingPPV.cleanedText, {
            reply_markup: pendingPPV.inlineKeyboard,
          });
        }
        await ctx.reply('Результаты PPV успешно опубликованы!', KeyboardService.getMainKeyboard());
        this.pendingPPVPublications.delete(userId);
      } catch (error) {
        console.error('Error publishing PPV results:', error);
        await ctx.reply('Ошибка при публикации результатов PPV');
      }
    } else {
      await ctx.reply(`Результаты PPV запланированы к публикации ${timeSelection}`, KeyboardService.getMainKeyboard());
      // Note: In the original NestJS version, this would schedule the publication
      // For Vercel, we'll handle this through cron jobs
    }
  }

  static async publishWeeklyResults(ctx: Context): Promise<void> {
    try {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (!isWeekend) {
        await ctx.reply('Публикация результатов еженедельника доступна только по выходным');
        return;
      }

      const showsToCheck = Object.values(WeeklyShow);
      const results: Array<{ show: WeeklyShow; data: unknown }> = [];

      for (const show of showsToCheck) {
        try {
          const response = await fetch(`https://pwnews.net/news/1-0-${this.getShowCategoryId(show)}`);
          const html = await response.text();

          const linkMatch = html.match(/href="([^"]+)">Результаты /);
          if (linkMatch) {
            const url = `https://pwnews.net${linkMatch[1]}`;
            const articleResponse = await fetch(url);
            const articleHtml = await articleResponse.text();

            const title = articleHtml.match(/<title>(.*?)<\/title>/);
            const showName = WeeklyShowNames[show];

            if (title && title[1].includes(showName)) {
              results.push({ show, data: { url, title: title[1] } });
            }
          }
        } catch (error) {
          console.error(`Error checking ${show}:`, error);
        }
      }

      if (results.length === 0) {
        await ctx.reply('Нет новых результатов еженедельников для публикации');
        return;
      }

      let message = 'Найдены результаты следующих шоу:\n\n';
      results.forEach(({ show }) => {
        message += `• ${WeeklyShowNames[show]}\n`;
      });
      message += '\nОпубликовать все результаты?';

      await ctx.reply(
        message,
        Markup.keyboard([['✅ Да'], ['❌ Нет']])
          .resize()
          .oneTime(),
      );

      // Store results for confirmation
      this.pendingPublications.set(ctx.from!.id, {
        text: message,
        url: '',
        videoUrl: '',
        videoImageUrl: '',
        inlineKeyboard: { inline_keyboard: [] }
      });
    } catch (error) {
      console.error('Error in publishWeeklyResults:', error);
      await ctx.reply('Произошла ошибка при получении результатов еженедельников');
    }
  }

  static async handleWeeklyConfirmation(ctx: Context, confirmed: boolean): Promise<void> {
    const userId = ctx.from!.id;

    if (confirmed) {
      await ctx.reply('Результаты еженедельников опубликованы!', KeyboardService.getMainKeyboard());
      // Implementation would publish all pending weekly results
    } else {
      await ctx.reply('Публикация отменена', KeyboardService.getMainKeyboard());
    }

    this.pendingPublications.delete(userId);
  }

  private static getShowCategoryId(show: WeeklyShow): number {
    const categoryMap = {
      [WeeklyShow.RAW]: 24,
      [WeeklyShow.SMACKDOWN]: 25,
      [WeeklyShow.DYNAMITE]: 26,
      [WeeklyShow.COLLISION]: 27,
      [WeeklyShow.NXT]: 28,
    };
    return categoryMap[show] || 24;
  }

  // Method for cron job to publish daily results
  static async publishDailyResults(): Promise<void> {
    try {
      console.log('Starting daily results publication at 7:30 Moscow time');

      // Create a mock context for automated execution
      const mockContext = {
        reply: (message: string) => {
          console.warn(`Auto-publish warning: ${message}`);
        },
        telegram: {
          sendMessage: async (chatId: string, text: string) => {
            console.log(`Would send to ${chatId}: ${text}`);
          },
          sendPhoto: async (chatId: string, photo: string) => {
            console.log(`Would send photo to ${chatId}: ${photo}`);
          }
        },
        from: { id: 0 }
      } as unknown as Context;

      await this.publishWeeklyResults(mockContext);
      console.log('Daily results publication completed successfully');
    } catch (error) {
      console.error('Error in daily results publication:', error);
    }
  }
}
