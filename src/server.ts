import app from './app';
import { initNotificationCron } from './jobs/notification.job';
import cron from 'node-cron'; // 👈 node-cron ইম্পোর্ট করা হলো
import { processDailyStreaks, resetMonthlyFreezes } from './jobs/streak.job'; // 👈 streak.job ইম্পোর্ট করা হলো
// import { connectRedis } from './config/redis';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
const HOST = '0.0.0.0'; // হোস্ট যুক্ত করা হয়েছে

async function bootstrap() {
  try {
    // ডাটাবেস বা রেডিয়স কানেকশন এখানে ইনিশিয়ালাইজ করবেন
    // await connectRedis();

    // listen-এর মধ্যে HOST প্যারামিটার দেওয়া হয়েছে
    const server = app.listen(PORT, HOST, () => {
      console.log(`🚀 Server is running on http://${HOST}:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });

    // Cron Job ইনিশিয়ালাইজ করা হলো (নোটিফিকেশন scheduled থেকে sent করার জন্য)
    initNotificationCron();

    // ==========================================
    // 🌟 Streak System Cron Jobs 🌟
    // ==========================================
    
    // প্রতিদিন রাত ১২:০১ মিনিটে স্ট্রিক প্রসেস হবে
    cron.schedule('1 0 * * *', () => {
      console.log('⏳ Running daily streak processing cron job...');
      processDailyStreaks();
    });

    // প্রতি মাসের ১ তারিখ রাত ১২:০৫ মিনিটে ফ্রিজ রিসেট হবে
    cron.schedule('5 0 1 * *', () => {
      console.log('⏳ Running monthly freeze reset cron job...');
      resetMonthlyFreezes();
    });

    // Unhandled Rejection এবং Uncaught Exception হ্যান্ডেলিং
    process.on('unhandledRejection', (error) => {
      console.log('UNHANDLED REJECTION! 💥 Shutting down...');
      console.log(error);
      server.close(() => {
        process.exit(1);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
