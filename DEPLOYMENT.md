# Deployment Guide

## Quick Start

1. **Clone and Setup**
   ```bash
   cd /home/velhrh/Documents/code/pwnews/pwnews-telegram-nextjs
   npm install
   cp .env.example .env.local
   ```

2. **Configure Environment Variables**
   Edit `.env.local`:
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
   CHANNEL_USERNAME=@your_channel_username
   CRON_SECRET=your_random_secret_string
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

3. **Test Locally**
   ```bash
   npm run dev
   ```

## Deploy to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/pwnews-telegram-nextjs.git
git push -u origin main
```

### 2. Deploy on Vercel
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Add environment variables:
   - `TELEGRAM_BOT_TOKEN`
   - `CHANNEL_USERNAME`
   - `CRON_SECRET`

### 3. Setup Webhook
After deployment, run:
```bash
npm run setup-webhook https://your-app.vercel.app
```

Or manually:
```bash
curl -X POST https://your-app.vercel.app/api/setup-webhook \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://your-app.vercel.app/api/webhook"}'
```

## Verification

1. **Check webhook status:**
   ```bash
   curl https://your-app.vercel.app/api/setup-webhook
   ```

2. **Test bot:**
   Send `/start` to your bot in Telegram

3. **Check cron job:**
   Verify in Vercel dashboard that cron job is scheduled

## Migration from NestJS

If migrating from the existing NestJS bot:

1. **Stop the old bot:**
   - Stop the EC2 instance or PM2 process
   - Delete the old webhook: `curl -X DELETE https://your-app.vercel.app/api/setup-webhook`

2. **Deploy new bot:**
   - Follow deployment steps above
   - Set up new webhook

3. **Test functionality:**
   - All commands should work the same
   - Cron job runs daily at 7:30 AM Moscow time

## Troubleshooting

### Bot not responding
- Check webhook: `GET /api/setup-webhook`
- Verify `TELEGRAM_BOT_TOKEN` in Vercel environment variables
- Check Vercel function logs

### Cron job not working
- Verify `CRON_SECRET` matches in Vercel
- Check Vercel cron job logs
- Ensure timezone is correct (4:30 UTC = 7:30 Moscow)

### Build errors
- Ensure all environment variables are set for build
- Check TypeScript errors in Vercel build logs

## Cost Comparison

| Service | NestJS (EC2) | Next.js (Vercel) |
|---------|--------------|------------------|
| **First 12 months** | Free | Free |
| **After 12 months** | ~$8-10/month | Free (within limits) |
| **Scaling** | Manual | Automatic |
| **Maintenance** | High | Low |

The Next.js version on Vercel is more cost-effective and requires less maintenance!
