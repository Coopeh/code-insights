import { Badge } from '@/components/ui/badge';
import { SESSION_CHARACTER_COLORS } from '@/lib/constants/colors';
import { formatDuration, getSessionTitle, cn } from '@/lib/utils';
import { OutcomeBadge } from '@/components/insights/InsightCard';
import { Sparkles } from 'lucide-react';
import type { Session } from '@/lib/types';

const SOURCE_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  'codex-cli': 'Codex CLI',
  'copilot-cli': 'Copilot CLI',
  copilot: 'Copilot',
};

interface CompactSessionRowProps {
  session: Session;
  isActive: boolean;
  showProject: boolean;
  insightCounts?: Record<string, number>;
  outcome?: string;
  onClick: () => void;
}

export function CompactSessionRow({
  session,
  isActive,
  showProject,
  insightCounts,
  outcome,
  onClick,
}: CompactSessionRowProps) {
  const startedAt = new Date(session.started_at);
  const endedAt = new Date(session.ended_at);
  const title = getSessionTitle(session);
  const characterColor = session.session_character
    ? (SESSION_CHARACTER_COLORS[session.session_character] ?? 'bg-muted text-muted-foreground')
    : null;

  const sourceLabel = session.source_tool
    ? (SOURCE_LABELS[session.source_tool] ?? session.source_tool)
    : null;

  const insightTotal = insightCounts
    ? Object.entries(insightCounts)
        .filter(([type]) => type !== 'summary')
        .reduce((sum, [, n]) => sum + n, 0)
    : 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 transition-colors border-l-2',
        isActive
          ? 'bg-accent/60 border-primary'
          : 'border-transparent hover:bg-accent/40'
      )}
    >
      {/* Title */}
      <p className="text-sm font-medium line-clamp-2 leading-snug">{title}</p>

      {/* Badges */}
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {session.session_character && characterColor && (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${characterColor}`}>
            {session.session_character.replace(/_/g, ' ')}
          </Badge>
        )}
        {outcome && <OutcomeBadge outcome={outcome} />}
      </div>

      {/* Stats line 1: source . messages . duration */}
      <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
        {sourceLabel && <span>{sourceLabel}</span>}
        {sourceLabel && <span className="text-muted-foreground/40">&middot;</span>}
        <span>{session.message_count} msgs</span>
        <span className="text-muted-foreground/40">&middot;</span>
        <span>{formatDuration(startedAt, endedAt)}</span>
      </div>

      {/* Stats line 2: cost . insights */}
      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
        {session.estimated_cost_usd != null && (
          <>
            <span>${session.estimated_cost_usd.toFixed(2)}</span>
            <span className="text-muted-foreground/40">&middot;</span>
          </>
        )}
        {insightTotal > 0 ? (
          <span className="flex items-center gap-0.5">
            <Sparkles className="h-3 w-3 text-purple-500" />
            {insightTotal} insight{insightTotal !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-muted-foreground/60">not analyzed</span>
        )}
      </div>

      {/* Project name (only when "All Projects" selected) */}
      {showProject && (
        <p className="text-[10px] text-muted-foreground/60 mt-1 truncate">
          {session.project_name}
        </p>
      )}
    </button>
  );
}
