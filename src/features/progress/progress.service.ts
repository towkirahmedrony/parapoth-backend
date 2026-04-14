import { supabase } from '../../config/supabase';
import { ProgressDashboardResponse } from './progress.types';

// Python API URL (টারমাক্সে লোকালহোস্টে রান করার জন্য)
const PYTHON_AI_SERVICE_URL = process.env.PYTHON_AI_SERVICE_URL || 'http://127.0.0.1:8000/api/v1/analyze-progress';

export const getProgressDashboardData = async (userId: string): Promise<ProgressDashboardResponse> => {
  // 1. ডাটাবেইজ থেকে প্রোফাইল ফেচ করা হচ্ছে
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, batch_year, current_streak, total_xp')
    .eq('id', userId)
    .single();

  if (profileError) {
    console.error("Profile Fetch Error:", profileError);
  }

  // 👉 ডিবাগ করার জন্য টার্মিনালে প্রোফাইলের ডেটা প্রিন্ট করা হলো
  console.log("🚀 Database Profile Data for User ID", userId, ":", profile);

  // 2. Fetch Aggregated Metrics
  const { data: metricsData } = await supabase
    .from('exam_history')
    .select('score, total_marks')
    .eq('user_id', userId);

  const totalExams = metricsData?.length || 0;
  const avgScore = totalExams > 0 
    ? metricsData!.reduce((acc, curr) => acc + (curr.score / curr.total_marks) * 100, 0) / totalExams 
    : 0;

  // 3. Fetch Performance Chart Data
  const { data: recentExams } = await supabase
    .from('exam_history')
    .select('created_at, score, total_marks')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(7);

  const performanceChart = recentExams?.reverse().map((exam) => ({
    name: new Date(exam.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    score: Math.round((exam.score / exam.total_marks) * 100)
  })) || [];

  // 4. Fetch Subject Analysis & Radar Data
  const { data: subjectStats } = await supabase
    .rpc('get_student_subject_analytics', { p_user_id: userId });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skillMapping: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subjectReport: any[] = [];

  if (subjectStats) {
    for (const stat of subjectStats) {
      skillMapping.push({
        subject: stat.subject_name,
        A: stat.mastery_percentage,
        fullMark: 100
      });

      subjectReport.push({
        subject: stat.subject_name,
        score: stat.average_score,
        correct: stat.total_correct,
        wrong: stat.total_wrong,
        skipped: stat.total_skipped
      });
    }
  }

  // 5. Fetch Activity Heatmap
  const { data: heatmapRaw } = await supabase
    .from('user_daily_activities')
    .select('activity_date, exams_taken')
    .eq('user_id', userId)
    .order('activity_date', { ascending: false })
    .limit(30);

  const activityHeatmap = heatmapRaw?.map(h => ({
    cal_date: h.activity_date,
    exams_taken: h.exams_taken
  })) || [];

  // 6. Fetch Weaknesses
  const { data: weaknessRaw } = await supabase
    .rpc('get_student_weaknesses', { p_user_id: userId })
    .limit(3);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weaknesses = weaknessRaw?.map((w: any) => ({
    topic: w.topic_name,
    subject: w.subject_name,
    errorRate: `${Math.round(w.error_rate)}%`
  })) || [];

  // 7. 🔥 Fetch AI Insights from Python Microservice 🔥
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiInsights: any = null;
  
  try {
    const studentDataForAI = {
      user_id: userId,
      weaknesses,
      subject_report: subjectReport,
      avg_score: Number(avgScore.toFixed(1))
    };

    // Node 18+ এ ডিফল্টভাবেই fetch কাজ করে
    const aiResponse = await fetch(PYTHON_AI_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(studentDataForAI)
    });

    if (aiResponse.ok) {
      const aiResult = await aiResponse.json();
      aiInsights = aiResult.data;
      console.log("✅ AI Insights Fetched Successfully");
    } else {
      console.error("⚠️ AI Service returned status:", aiResponse.status);
    }
  } catch (error) {
    console.error("❌ Failed to fetch AI insights from Python service:", error);
    // AI সার্ভিস ডাউন থাকলে বা টারমাক্সে না চললে যেন ড্যাশবোর্ড ক্র্যাশ না করে, তাই error catch করা হলো
  }

  // 8. রিটার্ন ডেটা
  return {
    user: {
      name: profile?.full_name || 'Student',
      batch: profile?.batch_year || 'HSC'
    },
    metrics: {
      averageScore: Number(avgScore.toFixed(1)),
      totalExams,
      streak: profile?.current_streak || 0,
      globalRank: 'Top 15%' 
    },
    performanceChart,
    skillMapping,
    activityHeatmap,
    weaknesses,
    focusTopic: aiInsights?.focus_action || (weaknesses.length > 0 ? weaknesses[0].topic : 'General Revision'),
    subjectReport,
    // AI ডেটা অবজেক্টে যুক্ত করা হলো
    aiAnalysis: aiInsights || {
      strong_points: [],
      weak_points: [],
      personalized_suggestions: ["নিয়মিত পরীক্ষা দিয়ে নিজের স্কিল যাচাই করুন।"]
    }
  };
};
