import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// রাউট ইম্পোর্ট
import authRoutes from './features/auth/auth.routes';
import profileRoutes from './features/profile/profile.routes'; 
import adminProfileRoutes from './features/profile/profile.admin.routes';
import usersAdminRoutes from './features/users/users.admin.routes';
import contentRoutes from './features/content/content.routes'; 
import communityAdminRoutes from './features/community/community.admin.routes';
import communityUserRoutes from './features/community/community.user.routes';
import dashboardAdminRoutes from './features/dashboard/dashboard.admin.routes';
import mediaRoutes from './features/media/media.routes';
import enterpriseRoutes from './features/enterprise/enterprise.routes';
import leaderboardRoutes from './features/leaderboard/leaderboard.routes';

// এক্সাম, সিস্টেম, ফাইন্যান্স, নোটিফিকেশন এবং হিস্ট্রি রাউট ইম্পোর্ট
import { ExamUserRoutes } from './features/exams/exams.user.routes';
import { ExamAdminRoutes } from './features/exams/exams.admin.routes';
import systemRoutes from './features/system/system.routes'; 
import { financeRoutes } from './features/finance/finance.routes';
import notificationRoutes from './features/notifications/notifications.routes';
import notificationsAdminRoutes from './features/notifications/notifications.admin.routes'; // <-- Admin Notifications
import historyRoutes from './features/history/history.routes'; 

// মনিটাইজেশন, প্রগ্রেস, এআই এবং গ্রোথ (স্ট্রিক) রাউট ইম্পোর্ট
import monetizationRoutes from './features/monetization/monetization.routes';
import progressRoutes from './features/progress/progress.routes'; // <-- Progress রাউট ইম্পোর্ট
import aiRoutes from './features/ai/ai.routes'; // <-- AI রাউট ইম্পোর্ট
import growthRoutes from './features/growth/streak.routes'; // <-- Growth/Streak রাউট ইম্পোর্ট

dotenv.config();

const app: Application = express();

// CORS Allowed Origins সেটআপ
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173', 
  'http://localhost:5174',
  'http://127.0.0.1:5174'
].filter(Boolean) as string[];

// Global Middlewares
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'ParaPoth API is running perfectly!'
  });
});

// Application Routes (Standard API v1)
app.use('/api/v1/auth', authRoutes); 
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/content', contentRoutes);
app.use('/api/v1/community/admin', communityAdminRoutes);
app.use('/api/v1/community/user', communityUserRoutes);
app.use('/api/v1/dashboard', dashboardAdminRoutes);
app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/enterprise', enterpriseRoutes);
app.use('/api/v1/leaderboard', leaderboardRoutes);

// এক্সাম মডিউট রাউট
app.use('/api/v1/exams/user', ExamUserRoutes);
app.use('/api/v1/exams/admin', ExamAdminRoutes);

// সিস্টেম, ফাইন্যান্স, নোটিফিকেশন, মনিটাইজেশন, হিস্ট্রি, প্রগ্রেস ও এআই মডিউল রাউট
app.use('/api/v1/system', systemRoutes); 
app.use('/api/v1/finance', financeRoutes); 
app.use('/api/v1/notifications/admin', notificationsAdminRoutes); // <-- Admin Notifications (FIXED)
app.use('/api/v1/notifications', notificationRoutes); 
app.use('/api/v1/monetization', monetizationRoutes); 
app.use('/api/v1/history', historyRoutes); 
app.use('/api/v1/progress', progressRoutes); // <-- Progress মডিউল কানেক্ট করা হলো
app.use('/api/v1/ai', aiRoutes); // <-- AI রাউট কানেক্ট করা হলো
app.use('/api/v1/growth', growthRoutes); // <-- Growth/Streak রাউট কানেক্ট করা হলো

// Frontend API কলের সাথে মেলানোর জন্য এডমিন প্রোফাইল রাউট
app.use('/api/v1/admin/profile', adminProfileRoutes);

// User Management (Admin 360 View) রাউট কানেক্ট করা হলো
app.use('/api/v1/admin/users', usersAdminRoutes);

// Frontend Compatibility Routes 
app.use('/content', contentRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/enterprise', enterpriseRoutes);
app.use('/exams', ExamUserRoutes); 

// 404 Not Found Handler
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    success: false,
    message: 'API route not found'
  });
});

// Global Error Handler (catchAsync এর Error গুলো এখানে আসবে)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('🔥 [Global Error]:', err);
  
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message: message,
    data: null
  });
});

export default app;
