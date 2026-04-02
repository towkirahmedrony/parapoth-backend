import { supabase } from '../../config/supabase';
import { ProgressDashboardResponse } from './progress.types';

export const getProgressDashboardData = async (userId: string): Promise<ProgressDashboardResponse> => {
  // ডাটাবেইজ থেকে প্রোফাইল ফেচ করা হচ্ছে
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

  const skillMapping = [];
  const subjectReport = [];

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

  const weaknesses = weaknessRaw?.map((w: any) => ({
    topic: w.topic_name,
    subject: w.subject_name,
    errorRate: `${Math.round(w.error_rate)}%`
  })) || [];

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
    focusTopic: weaknesses.length > 0 ? weaknesses[0].topic : 'General Revision',
    subjectReport
  };
};
