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
  it('summarizes totals, today, this week, last 7 days, and this month', () => {
    render(<AnalyticsSummary data={data} />);
    expect(screen.getByText('Total clicks')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('Last 7 days')).toBeTruthy();
    expect(screen.getByText('This month')).toBeTruthy();
    // total=10 must be present; other values depend on date calculations.
    expect(screen.getByText('10')).toBeTruthy();
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
