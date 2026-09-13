import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalyticsSummary } from './analytics-summary';
import { BreakdownList } from './breakdown-list';
import { ClicksChart } from './clicks-chart';
import type { UrlAnalytics } from '../types';

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);

const data: UrlAnalytics = {
  shortCode: 'a1',
  totalClicks: 10,
  clicksByDay: [
    { date: '2020-01-01', count: 4 },
    { date: yesterday, count: 3 },
    { date: today, count: 3 },
  ],
  countries: { IN: 7, US: 3 },
  devices: {},
  browsers: { Chrome: 10 },
  referrers: {},
};

describe('analytics components', () => {
  it('summarizes totals, today, and trailing week', () => {
    render(<AnalyticsSummary data={data} />);
    expect(screen.getByText('Total clicks')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Last 7 days')).toBeTruthy();
    // total=10, today=3, week(yesterday+today)=6 — three distinct values.
    const values = screen.getAllByText(/^(10|3|6)$/).map((el) => el.textContent);
    expect(values).toContain('10');
    expect(values.filter((v) => v === '3')).toHaveLength(1);
    expect(values.filter((v) => v === '6')).toHaveLength(1);
  });

  it('renders ranked breakdowns and honest empty states', () => {
    render(<BreakdownList title="Countries" data={data.countries} />);
    expect(screen.getByText('IN')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();

    render(<BreakdownList title="Devices" data={data.devices} />);
    expect(screen.getByText('No data yet.')).toBeTruthy();
  });

  it('renders the time-series chart and the no-clicks empty state', () => {
    const { unmount } = render(<ClicksChart data={data.clicksByDay} />);
    expect(screen.getByTestId('clicks-chart')).toBeTruthy();
    unmount();

    render(<ClicksChart data={[]} />);
    expect(screen.getByText(/No clicks yet/)).toBeTruthy();
  });
});
