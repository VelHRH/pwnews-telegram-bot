import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          PWNews Telegram Bot
        </h1>
        
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Bot Status</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Telegram bot is running and ready to receive updates via webhook.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold mb-3">Webhook Management</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Manage Telegram webhook configuration
            </p>
            <Link 
              href="/api/setup-webhook"
              className="inline-block bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              View Webhook Status
            </Link>
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold mb-3">Cron Jobs</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Automated daily publishing at 7:30 AM Moscow time
            </p>
            <div className="text-sm text-gray-500">
              Next run: Daily at 04:30 UTC
            </div>
          </div>
        </div>

        <div className="mt-8 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
            Setup Required
          </h3>
          <ol className="list-decimal list-inside text-yellow-700 dark:text-yellow-300 space-y-1">
            <li>Configure environment variables in Vercel</li>
            <li>Set up Telegram webhook</li>
            <li>Test bot functionality</li>
          </ol>
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            Built with Next.js • Deployed on Vercel • Powered by Telegraf
          </p>
        </div>
      </div>
    </main>
  );
}