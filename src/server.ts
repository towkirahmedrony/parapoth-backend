import app from './app';
import { initNotificationCron } from './jobs/notification.job';
import cron from 'node-cron';
import { processDailyStreaks, resetMonthlyFreezes } from './jobs/streak.job';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
const HOST = '0.0.0.0';

async function bootstrap() {
  try {
    const server = app.listen(PORT, HOST, () => {
      console.log(`🚀 Server is running on http://${HOST}:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });

    // Cron Job ইনিশিয়ালাইজ করা হলো (নোটিফিকেশন scheduled থেকে sent করার জন্য)
    initNotificationCron();

    // ==========================================
    // 🌟 Streak System Cron Jobs 🌟
    // ==========================================
    
    // প্রতিদিন রাত ১২:০১ মিনিটে স্ট্রিক প্রসেস হবে (বাংলাদেশ সময়)
    cron.schedule('1 0 * * *', () => {
      console.log('⏳ Running daily streak processing cron job...');
      processDailyStreaks();
    }, {
      timezone: "Asia/Dhaka" // 👈 টাইমজোন যুক্ত করা হয়েছে
    });

    // প্রতি মাসের ১ তারিখ রাত ১২:০৫ মিনিটে ফ্রিজ রিসেট হবে (বাংলাদেশ সময়)
    cron.schedule('5 0 1 * *', () => {
      console.log('⏳ Running monthly freeze reset cron job...');
      resetMonthlyFreezes();
    }, {
      timezone: "Asia/Dhaka" // 👈 টাইমজোন যুক্ত করা হয়েছে
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
