import { RunStatusBadge } from "@/components/run/run-status-badge";
import { formatRelative } from "@/lib/slug";
import type { RunStatus } from "@/lib/types";

type SessionRow = {
  id: string;
  status: RunStatus;
  preview_url: string | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
};

export function SessionsHistory({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-card/70">
      {sessions.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-background/35"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {s.id}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Started {formatRelative(s.started_at ?? s.created_at)}
              {s.stopped_at ? ` · stopped ${formatRelative(s.stopped_at)}` : ""}
            </div>
          </div>
          <RunStatusBadge status={s.status} />
        </li>
      ))}
    </ul>
  );
}
