import app from './app';
import { initNotificationCron } from './jobs/notification.job';
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
