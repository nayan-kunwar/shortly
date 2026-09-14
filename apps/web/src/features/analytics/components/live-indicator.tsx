import type { SseStatus } from '../hooks/use-analytics-stream';

const statusConfig: Record<SseStatus, { color: string; label: string }> = {
  connecting: { color: 'bg-yellow-400', label: 'Connecting…' },
  connected: { color: 'bg-green-500', label: 'Live' },
  disconnected: { color: 'bg-gray-400', label: 'Offline' },
  error: { color: 'bg-red-500', label: 'Offline' },
};

/** Green/yellow/red dot + status label for SSE connection. */
export function LiveIndicator({ status }: { status: SseStatus }) {
  const { color, label } = statusConfig[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
