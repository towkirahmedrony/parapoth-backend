export interface MetricData {
  averageScore: number;
  totalExams: number;
  streak: number;
  globalRank: string | number;
}

export interface ChartData {
  name: string;
  score: number;
}

export interface RadarData {
  subject: string;
  A: number;
  fullMark: number;
}

export interface HeatmapData {
  cal_date: string;
  exams_taken: number;
}

export interface WeaknessData {
  topic: string;
  subject: string;
  errorRate: string;
}

export interface SubjectReportData {
  subject: string;
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
}

export interface ProgressDashboardResponse {
  user: {
    name: string;
    batch: string;
  };
  metrics: MetricData;
  performanceChart: ChartData[];
  skillMapping: RadarData[];
  activityHeatmap: HeatmapData[];
  weaknesses: WeaknessData[];
  focusTopic: string;
  subjectReport: SubjectReportData[];
}
