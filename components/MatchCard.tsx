import type { Match } from '@/lib/types';
import { trimTrailingEmptyGames } from '@/lib/merge-matches';

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Both formatters parse the API's date-time string as plain text rather
// than through Date/toLocaleString. A string like "2026-09-10T11:00:00"
// carries no timezone offset, so Date would reinterpret it as local time
// in whatever environment parses it — the server during SSR, the
// visitor's browser during hydration — producing a hydration mismatch
// and, for some timezones, a different calendar day entirely. Plain
// parsing also matches the design decision to show venue time exactly as
// given, with no timezone conversion.
function parseDateTimeParts(dateStr: string) {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return { year, month: Number(month), day: Number(day), hour, minute };
}

function formatUpcomingTime(dateStr: string): string {
  const parts = parseDateTimeParts(dateStr);
  if (!parts) return '';
  return `${SHORT_MONTH_NAMES[parts.month - 1]} ${parts.day}, ${parts.hour}:${parts.minute}`;
}

function formatExact(dateStr: string): string {
  const parts = parseDateTimeParts(dateStr);
  if (!parts) return '';
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${day}/${month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export function MatchCard({ match: m }: { match: Match }) {
  let badge: React.ReactNode;
  if (m.status === 'live') {
    badge = (
      <span className="badge live">
        <span className="pulse" />
        LIVE
      </span>
    );
  } else if (m.status === 'done') {
    badge = <span className="badge done" title={`Finished: ${formatExact(m.endDate || m.startDate)}`}>Finished</span>;
  } else {
    badge = <span className="badge upcoming" title={formatExact(m.startDate)}>{formatUpcomingTime(m.startDate)}</span>;
  }

  const maxGames = m.gameScores ? trimTrailingEmptyGames(m.gameScores) : 0;

  return (
    <article className={`card ${m.status}`} data-code={m.normCode}>
      <div className="card-top">
        <div className="card-round">
          {m.round}
          <span className="sub">{m.subEvent || ''}</span>
        </div>
        {badge}
      </div>
      <div className="players">
        {m.isTbd || m.players.length === 0 ? (
          <div className="player-row">
            <span className="p-name">TBD</span>
          </div>
        ) : (
          m.players.map((p, idx) => {
            const isWinner = m.winnerIdx === idx;
            const own = m.gameScores?.[idx] ?? [];
            const opp = m.gameScores?.[(1 - idx) as 0 | 1] ?? [];
            const setsWon = own.filter((v, i) => v > (opp[i] || 0)).length;
            return (
              <div key={idx} className={`player-row${isWinner ? ' winner' : ''}`}>
                <span className="p-name">
                  {p.name}
                  {p.seed ? <span className="p-seed">({p.seed})</span> : null}
                </span>
                {m.gameScores && (
                  <span className="games">
                    {own.slice(0, maxGames).map((g, gi) => (
                      <span key={gi} className={`g${g > (opp[gi] || 0) ? ' won' : ''}`}>{g}</span>
                    ))}
                    {setsWon > 0 && <span className="sets">{setsWon}</span>}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
      {m.status === 'done' && !m.gameScores && <div className="no-score">Loading score…</div>}
      <div className="card-bottom">
        <span>{m.table}</span>
        <span>{m.venue}</span>
      </div>
    </article>
  );
}
