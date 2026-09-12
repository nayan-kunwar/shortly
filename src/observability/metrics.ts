/**
 * Minimal Prometheus-compatible metrics: counters + histograms with text
 * exposition. Hand-rolled instead of prom-client: the format is trivial,
 * every byte is understood, and there is one less dependency to audit.
 * Graduate to prom-client if summaries/exemplars are ever needed.
 */

export class Counter {
  private values = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: string[] = [],
  ) {}

  inc(labels: Record<string, string | number> = {}, by = 1): void {
    const key = this.labelNames.map((n) => String(labels[n] ?? '')).join('|');
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }

  collect(): { labels: string[]; value: number }[] {
    return [...this.values.entries()].map(([key, value]) => ({
      labels: key === '' ? [] : key.split('|'),
      value,
    }));
  }

  reset(): void {
    this.values.clear();
  }
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export interface HistogramSample {
  labels: string[];
  /** Cumulative counts per bucket bound, in bound order. */
  buckets: number[];
  sum: number;
  count: number;
}

export class Histogram {
  private counts = new Map<string, number[]>();
  private sums = new Map<string, number>();
  private totals = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: string[] = [],
    readonly bucketBounds: number[] = DEFAULT_BUCKETS,
  ) {}

  observe(valueSeconds: number, labels: Record<string, string | number> = {}): void {
    const key = this.labelNames.map((n) => String(labels[n] ?? '')).join('|');
    if (!this.counts.has(key)) {
      this.counts.set(
        key,
        this.bucketBounds.map(() => 0),
      );
      this.sums.set(key, 0);
      this.totals.set(key, 0);
    }
    const buckets = this.counts.get(key) as number[];
    this.bucketBounds.forEach((bound, i) => {
      if (valueSeconds <= bound && buckets[i] !== undefined) buckets[i] += 1;
    });
    this.sums.set(key, (this.sums.get(key) ?? 0) + valueSeconds);
    this.totals.set(key, (this.totals.get(key) ?? 0) + 1);
  }

  collect(): HistogramSample[] {
    return [...this.counts.entries()].map(([key, buckets]) => ({
      labels: key === '' ? [] : key.split('|'),
      buckets: [...buckets],
      sum: this.sums.get(key) ?? 0,
      count: this.totals.get(key) ?? 0,
    }));
  }

  reset(): void {
    this.counts.clear();
    this.sums.clear();
    this.totals.clear();
  }
}

function formatLabels(names: string[], values: string[]): string {
  if (names.length === 0) return '';
  return `{${names.map((n, i) => `${n}="${values[i] ?? ''}"`).join(',')}}`;
}

function renderCounter(counter: Counter): string {
  const lines = [`# HELP ${counter.name} ${counter.help}`, `# TYPE ${counter.name} counter`];
  for (const { labels, value } of counter.collect()) {
    lines.push(`${counter.name}${formatLabels(counter.labelNames, labels)} ${String(value)}`);
  }
  return lines.join('\n');
}

function renderHistogram(histogram: Histogram): string {
  const lines = [
    `# HELP ${histogram.name} ${histogram.help}`,
    `# TYPE ${histogram.name} histogram`,
  ];
  for (const sample of histogram.collect()) {
    histogram.bucketBounds.forEach((bound, i) => {
      lines.push(
        `${histogram.name}_bucket${formatLabels([...histogram.labelNames, 'le'], [...sample.labels, String(bound)])} ${String(sample.buckets[i] ?? 0)}`,
      );
    });
    lines.push(
      `${histogram.name}_bucket${formatLabels([...histogram.labelNames, 'le'], [...sample.labels, '+Inf'])} ${String(sample.count)}`,
    );
    lines.push(
      `${histogram.name}_sum${formatLabels(histogram.labelNames, sample.labels)} ${String(sample.sum)}`,
    );
    lines.push(
      `${histogram.name}_count${formatLabels(histogram.labelNames, sample.labels)} ${String(sample.count)}`,
    );
  }
  return lines.join('\n');
}

/** Full Prometheus text exposition for the given metric families. */
export function renderMetrics(counters: Counter[], histograms: Histogram[]): string {
  const parts = [...counters.map(renderCounter), ...histograms.map(renderHistogram)];
  return parts.join('\n') + '\n';
}
