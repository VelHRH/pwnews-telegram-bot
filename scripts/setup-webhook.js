#!/usr/bin/env node

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function setupWebhook() {
  console.log('🤖 PWNews Telegram Bot - Webhook Setup');
  console.log('=====================================\n');

  const appUrl = process.argv[2] || await new Promise((resolve) => {
    rl.question('Enter your Vercel app URL (e.g., https://your-app.vercel.app): ', resolve);
  });

  if (!appUrl) {
    console.error('❌ App URL is required');
    process.exit(1);
  }

  const webhookUrl = `${appUrl}/api/webhook`;
  
  console.log(`\n🔗 Setting up webhook: ${webhookUrl}`);
  
  try {
    const response = await fetch(`${appUrl}/api/setup-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ webhookUrl }),
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Webhook set successfully!');
      console.log(`📍 Webhook URL: ${result.url}`);
      console.log('\n🎉 Your bot is now ready to receive messages!');
    } else {
      console.error('❌ Failed to set webhook:', result.error);
      console.error('Message:', result.message);
    }
  } catch (error) {
    console.error('❌ Error setting up webhook:', error.message);
    console.log('\n💡 Make sure:');
    console.log('  - Your app is deployed and accessible');
    console.log('  - TELEGRAM_BOT_TOKEN is set in environment variables');
    console.log('  - The bot token is valid');
  }

  rl.close();
}

// Add fetch polyfill for Node.js < 18
if (!global.fetch) {
  global.fetch = require('node-fetch');
}

setupWebhook().catch(console.error);
