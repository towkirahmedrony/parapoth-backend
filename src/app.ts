import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

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
import notificationsAdminRoutes from './features/notifications/notifications.admin.routes'; 
import historyRoutes from './features/history/history.routes'; 

// মনিটাইজেশন, প্রগ্রেস, এআই, গ্রোথ, কন্টাক্ট, রিপোর্ট এবং রেফারেল রাউট ইম্পোর্ট
import monetizationRoutes from './features/monetization/monetization.routes';
import progressRoutes from './features/progress/progress.routes'; 
import aiRoutes from './features/ai/ai.routes'; 
import growthRoutes from './features/growth/streak.routes'; 
import referralRoutes from './features/referral/referral.routes';
import { contactRoutes } from './features/contact/contact.routes';
import reportRoutes from './features/reports/reports.routes'; 

// অ্যাপ-বিল্ডার রাউট ইম্পোর্ট (system থেকে মুভ করা কনফিগারেশনের জন্য)
import appBuilderRoutes from './features/app-builder/app-builder.routes';

dotenv.config();

const app: Application = express();

const envClientUrls = process.env.CLIENT_URL 
  ? process.env.CLIENT_URL.split(',') 
  : [];

const allowedOrigins = [
  ...envClientUrls, 
  'http://localhost:5173', 
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'https://parapoth-studio.web.app'
].filter(Boolean) as string[];

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
app.use(cookieParser());

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

// 🛠️ Content & Institutions Fix
app.use('/api/v1/content', contentRoutes);
app.use('/api/v1/admin/content', contentRoutes);
app.use('/api/v1/institutions', contentRoutes); // Frontend compatibility

// 🛠️ Community Admin & User (flagged-chats, overview fix)
app.use('/api/v1/community/admin', communityAdminRoutes);
app.use('/api/v1/community/user', communityUserRoutes);
app.use('/api/v1/community', communityAdminRoutes); // Frontend compatibility for Admin panel calls

// 🛠️ Admin Dashboard (stats fix)
app.use('/api/v1/admin/dashboard', dashboardAdminRoutes);

app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/enterprise', enterpriseRoutes);

// 🛠️ Enterprise Reports (reports fix)
app.use('/api/v1/enterprise/reports', reportRoutes);
app.use('/api/v1/reports', reportRoutes); // Retain original route

app.use('/api/v1/leaderboard', leaderboardRoutes);

// এক্সাম মডিউট রাউট
app.use('/api/v1/exams/user', ExamUserRoutes);
app.use('/api/v1/exams/admin', ExamAdminRoutes);

// সিস্টেম, ফাইন্যান্স এবং অন্যান্য রাউট
app.use('/api/v1/system', systemRoutes); 
app.use('/api/v1/finance', financeRoutes); 
app.use('/api/v1/notifications/admin', notificationsAdminRoutes); 
app.use('/api/v1/notifications', notificationRoutes); 
app.use('/api/v1/monetization', monetizationRoutes); 
app.use('/api/v1/history', historyRoutes); 
app.use('/api/v1/progress', progressRoutes); 
app.use('/api/v1/ai', aiRoutes); 
app.use('/api/v1/growth', growthRoutes); 
app.use('/api/v1/referral', referralRoutes); 
app.use('/api/v1/contact', contactRoutes);

// 🛠️ App Builder (configs, home-grids, daily_quote fix)
app.use('/api/v1/app-builder', appBuilderRoutes);

// Admin & Management Routes
app.use('/api/v1/admin/profile', adminProfileRoutes);
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

// Custom Error Interface for Type Safety (Removing 'any' type)
interface CustomError extends Error {
  status?: number;
  statusCode?: number;
}

// Global Error Handler
app.use((err: CustomError, req: Request, res: Response, next: NextFunction) => {
  // Removed console.error for strict production quality
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message: message,
    data: null
  });
});

export default app;
