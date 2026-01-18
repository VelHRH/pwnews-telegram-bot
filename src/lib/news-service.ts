import { Context, PendingPublication, PendingPPVPublication, PendingReview, PendingOtherNews } from '@/types/telegram';
import { Markup } from 'telegraf';
import { KeyboardService } from './keyboard';
import { WeeklyShow, WeeklyShowNames } from '@/constants/weekly-shows';
import { reviewersNames } from '@/constants/reviewers';

export class NewsService {
  private static pendingPublications = new Map<number, PendingPublication>();
  private static pendingPPVPublications = new Map<number, PendingPPVPublication>();
  private static pendingReviews = new Map<number, PendingReview>();
  private static pendingOtherNews = new Map<number, PendingOtherNews>();

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
    if (!this.channelId) {
      await ctx.reply('Ошибка: ID канала не настроен');
      return;
    }

    const responseAllReviews = await fetch('https://pwnews.net/stuff/');
    const htmlAllReviews = await responseAllReviews.text();
    const linkMatch = htmlAllReviews.match(
      /href="([^"]+)">Результаты (WWE|AEW) /,
    );

    const url = linkMatch ? `https://pwnews.net${linkMatch[1]}` : '';

    if (!url) {
      await ctx.reply('Не удалось получить ссылку на обзор');
      return;
    }

    const response = await fetch(url);
    const html = await response.text();

    const title = html.match(/<title>(.*?)<\/title>/);
    const show = Object.values(WeeklyShow).find((show) =>
      title?.[1].toUpperCase().includes(show),
    );

    if (!show) {
      await ctx.reply('Не удалось получить название шоу из заголовка');
      return;
    }

    const normalizedShow = WeeklyShowNames[show];

    const dateMatch = title?.[1].match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dateMatch) {
      await ctx.reply('Не удалось получить дату из заголовка');
      return;
    }

    const [, day, month, year] = dateMatch;
    const postDate = new Date(`${year}-${month}-${day}`);
    const oneDayAgo = new Date(new Date().setHours(0, 0, 0, 0));
    oneDayAgo.setTime(oneDayAgo.getTime() - 24 * 60 * 60 * 1000);

    const responseVideo = await fetch('https://pwnews.net/blog/');
    const htmlVideo = await responseVideo.text();
    const dateSearch = `${day}.${month}.${year}`;

    const lines = htmlVideo.split('\n');
    const targetLine = lines.find(
      (line) => line.includes(normalizedShow) && line.includes(dateSearch),
    );

    let videoUrl = '';
    let videoImageUrl = '';

    if (targetLine) {
      const hrefMatch = targetLine.match(/href="([^"]+)"/);
      const srcMatch = targetLine.match(/src="([^"]+)"/);

      videoUrl = hrefMatch ? `https://pwnews.net${hrefMatch[1]}` : '';
      videoImageUrl = srcMatch
        ? srcMatch[1].startsWith('http')
          ? srcMatch[1]
          : `https://pwnews.net${srcMatch[1]}`
        : '';
    }

    if (!videoUrl || !videoImageUrl) {
      await ctx.reply('Видео для данного эфира не найдено');
      return;
    }

    const text = `Итоги и результаты сегодняшнего эфира ${normalizedShow} (+ онлайн запись шоу)`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: 'Результаты'.toUpperCase(), url },
          { text: 'Смотреть'.toUpperCase(), url: videoUrl },
        ],
      ],
    };

    if (postDate < oneDayAgo) {
      await ctx.sendPhoto(videoImageUrl.replace(/\/s/g, '/'), {
        caption: `${text} \n\n• Результаты: ${url.replace('https://', '')} \n• Смотреть: ${videoUrl.replace('https://', '')}`,
        reply_markup: inlineKeyboard,
      });
      await ctx.reply(
        `Последние результаты (${title?.[1]}) слишком старые. Действительно ли я должен опубликовть их? Если что, я сам проверяю актуальые результаты каждый день в 7:30.`,
        Markup.keyboard([['✅ Да', '❌ Нет']]).resize(),
      );

      // Сохраняем данные для последующего использования
      if (ctx.from?.id) {
        this.pendingPublications.set(ctx.from.id, {
          text,
          url,
          videoUrl,
          videoImageUrl: videoImageUrl.replace(/\/s/g, '/'),
          inlineKeyboard,
        });
      }

      return;
    }

    await ctx.telegram.sendPhoto(
      this.channelId,
      videoImageUrl.replace(/\/s/g, '/'),
      {
        caption: this.formatNewsCaption(text, url, videoUrl),
        parse_mode: 'MarkdownV2',
        reply_markup: inlineKeyboard,
      },
    );

    await ctx.reply(`Результаты ${normalizedShow} успешно опубликованы!`);
  }

  private static escapeMarkdown(text: string): string {
    return text.replace(/[[\](){}*_#+\-=|>.]/g, '\\$&');
  }

  private static formatNewsCaption(
    text: string,
    url: string,
    videoUrl: string,
  ): string {
    return `${this.escapeMarkdown(text)} \n\n• *Результаты:* ${this.escapeMarkdown(url.replace('https://', ''))} \n• *Смотреть:* ${this.escapeMarkdown(videoUrl.replace('https://', ''))}`;
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

  static async publishOtherNews(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;

    // Начинаем процесс - запрашиваем URL
    this.pendingOtherNews.set(userId, {
      step: 'waiting_url'
    });

    await ctx.reply(
      '🔗 Пожалуйста, отправьте ссылку на страницу, которую хотите опубликовать:',
      KeyboardService.getOtherNewsKeyboard()
    );
  }

  static async handleOtherNewsInput(ctx: Context, text: string): Promise<boolean> {
    const userId = ctx.from!.id;
    const pending = this.pendingOtherNews.get(userId);

    if (!pending) {
      return false; // Не обрабатываем, если нет активного процесса
    }

    if (pending.step === 'waiting_url') {
      // Проверяем, что это валидная ссылка
      const urlRegex = /^https?:\/\/.+/;
      if (!urlRegex.test(text)) {
        await ctx.reply('❌ Пожалуйста, отправьте корректную ссылку (начинающуюся с http:// или https://)');
        return true;
      }

      try {
        // Получаем информацию о странице
        const response = await fetch(text);
        const html = await response.text();

        // Извлекаем title
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim().split(' - ')[0] : 'Без заголовка';

        // Извлекаем изображение
        const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)/i) ||
          html.match(/<img[^>]*src=["']([^"']*)/i);
        let imageUrl = imageMatch ? imageMatch[1] : '';

        // Делаем URL изображения абсолютным
        if (imageUrl && !imageUrl.startsWith('http')) {
          const baseUrl = new URL(text).origin;
          imageUrl = imageUrl.startsWith('/') ? baseUrl + imageUrl : baseUrl + '/' + imageUrl;
        }

        // Обновляем состояние
        this.pendingOtherNews.set(userId, {
          step: 'waiting_button_text',
          url: text,
          title,
          imageUrl
        });

        await ctx.reply(
          `✅ Страница загружена!\n\n📄 **${title}**\n\n🔘 Теперь введите текст для кнопки под постом (напрмер "ОЦЕНКИ"):`,
          {
            parse_mode: 'Markdown',
            ...KeyboardService.getOtherNewsKeyboard()
          }
        );

      } catch (error) {
        await ctx.reply('❌ Не удалось загрузить страницу. Проверьте ссылку и попробуйте снова.');
        return true;
      }

    } else if (pending.step === 'waiting_button_text') {
      const buttonText = text.trim() || "ОЦЕНКИ";

      const finalPost = {
        ...pending,
        buttonText
      };

      // Создаем финальное сообщение
      const postText = finalPost.title + (finalPost.description ? `\n\n${finalPost.description}` : '');

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

      // Отправляем превью поста
      if (finalPost.imageUrl) {
        try {
          await ctx.replyWithPhoto(finalPost.imageUrl, {
            caption: postText,
            reply_markup: inlineKeyboard,
          });
        } catch (error) {
          // Если изображение не загружается, отправляем без него
          await ctx.reply(postText, { reply_markup: inlineKeyboard });
        }
      } else {
        await ctx.reply(postText, { reply_markup: inlineKeyboard });
      }

      await ctx.reply(
        'Проверьте пост и выберите действие:',
        KeyboardService.getOtherNewsConfirmKeyboard()
      );

      // Сохраняем финальные данные для публикации
      this.pendingOtherNews.set(userId, {
        step: 'ready_to_publish',
        url: finalPost.url!,
        title: finalPost.title!,
        description: finalPost.description || '',
        imageUrl: finalPost.imageUrl || '',
        buttonText: buttonText
      });
    }

    return true;
  }

  static async cancelOtherNews(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    this.pendingOtherNews.delete(userId);
    await ctx.reply('❌ Публикация отменена.', KeyboardService.getMainKeyboard());
  }

  static async publishOtherNewsToChannel(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const pending = this.pendingOtherNews.get(userId);

    if (!pending || pending.step !== 'ready_to_publish') {
      await ctx.reply('❌ Нет данных для публикации', KeyboardService.getMainKeyboard());
      return;
    }

    try {
      const postText = pending.title + (pending.description ? `\n\n${pending.description}` : '');

      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: pending.buttonText!,
              url: pending.url,
            },
          ],
        ],
      };

      // Публикуем в канал
      if (pending.imageUrl) {
        try {
          await ctx.telegram.sendPhoto(this.channelId, pending.imageUrl, {
            caption: postText,
            reply_markup: inlineKeyboard,
          });
        } catch (error) {
          // Если изображение не загружается, отправляем без него
          await ctx.telegram.sendMessage(this.channelId, postText, {
            reply_markup: inlineKeyboard
          });
        }
      } else {
        await ctx.telegram.sendMessage(this.channelId, postText, {
          reply_markup: inlineKeyboard
        });
      }

      // Очищаем состояние и возвращаем к основному меню
      this.pendingOtherNews.delete(userId);
      await ctx.reply('✅ Новость успешно опубликована!', KeyboardService.getMainKeyboard());

    } catch (error) {
      console.error('Error publishing other news:', error);
      await ctx.reply('❌ Ошибка при публикации. Попробуйте еще раз.', KeyboardService.getMainKeyboard());
      this.pendingOtherNews.delete(userId);
    }
  }
}
