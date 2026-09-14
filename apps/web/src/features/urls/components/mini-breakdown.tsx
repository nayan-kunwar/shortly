/** Tiny inline breakdown: label + thin bar. Used in table cells. */
export function MiniBreakdown({ value }: { value: string | null }) {
  if (value === null || value === '') return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="truncate max-w-[80px]">{value}</span>
    </span>
  );
}
