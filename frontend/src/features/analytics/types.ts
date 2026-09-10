/** Mirrors GET /api/v1/urls/:shortCode/analytics (backend M13 contract). */
export interface DayBucket {
  date: string;
  count: number;
}

export interface UrlAnalytics {
  shortCode: string;
  totalClicks: number;
  clicksByDay: DayBucket[];
  countries: Record<string, number>;
  devices: Record<string, number>;
  browsers: Record<string, number>;
  referrers: Record<string, number>;
}
