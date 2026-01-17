# PWNews Telegram Bot - Next.js Version

A Telegram bot for managing PWNews content, built with Next.js and designed to run on Vercel with cron jobs.

## Features

- 📝 Publish reviews from PWNews.net
- 🎉 Publish PPV/special show results  
- 📊 Publish weekly show results
- ⏰ Automated daily publishing via Vercel cron jobs
- 🔗 Handle PWNews.net URLs automatically

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token from @BotFather
- `CHANNEL_USERNAME` - Your Telegram channel username (e.g., @yourchannel)
- `CRON_SECRET` - Random secret string for cron job security
- `NEXT_PUBLIC_APP_URL` - Your app URL (for webhooks)

### 2. Local Development

```bash
npm install
npm run dev
```

### 3. Deploy to Vercel

1. Push to GitHub
2. Connect to Vercel
3. Add environment variables in Vercel dashboard:
   - `TELEGRAM_BOT_TOKEN`
   - `CHANNEL_USERNAME` 
   - `CRON_SECRET`

### 4. Setup Telegram Webhook

After deployment, set up the webhook:

```bash
curl -X POST https://your-app.vercel.app/api/setup-webhook \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://your-app.vercel.app/api/webhook"}'
```

Or visit: `https://your-app.vercel.app/api/setup-webhook` and use the UI.

## Bot Commands

- **📝 Опубликовать обзор** - Fetch and publish latest review
- **🎉 Опубликовать результаты PPV/спецшоу** - Publish PPV results
- **Опубликовать результаты еженедельника** - Publish weekly show results

## Cron Jobs

The bot automatically publishes daily results at 7:30 AM Moscow time (4:30 UTC) via Vercel cron jobs.

## API Endpoints

- `POST /api/webhook` - Telegram webhook endpoint
- `GET/POST /api/cron/daily-results` - Daily results cron job
- `GET/POST/DELETE /api/setup-webhook` - Webhook management

## Architecture

- **Next.js App Router** - Modern React framework
- **Telegraf** - Telegram bot framework
- **Vercel Cron Jobs** - Scheduled tasks
- **Webhook-based** - No polling, serverless-friendly

## Migration from NestJS

This version replaces the original NestJS version with:
- Webhook instead of polling
- Vercel cron jobs instead of @nestjs/schedule
- Static methods instead of dependency injection
- Serverless architecture

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Troubleshooting

### Webhook Issues
- Check webhook status: `GET /api/setup-webhook`
- Verify `TELEGRAM_BOT_TOKEN` is correct
- Ensure webhook URL is accessible

### Cron Job Issues  
- Verify `CRON_SECRET` matches in Vercel
- Check Vercel function logs
- Ensure timezone is correct (UTC in vercel.json)

### Bot Not Responding
- Check webhook is set correctly
- Verify environment variables
- Check Vercel function logs