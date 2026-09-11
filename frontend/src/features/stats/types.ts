/** Mirrors GET /api/v1/stats (stats milestone contract). */
export interface GlobalStats {
  totalUrls: number;
  activeUrls: number;
  totalClicks: number;
  clicksToday: number;
}
