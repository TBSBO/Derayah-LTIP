import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { getVestingEventStats, updateVestingEventStatuses, type VestingEventWithDetails } from '../../lib/vestingEventsService';
import { formatCompactNumber } from '../../lib/numberUtils';
import { Calendar, AlertCircle, Clock, TrendingUp, PieChart, ChevronDown, ChevronUp, Award } from 'lucide-react';
import { formatDate, formatDaysRemaining, formatVestingEventId } from '../../lib/dateUtils';

interface VestingEventStats {
  total_events: number;
  total_total_shares: number;
  pending_events: number;
  due_events: number;
  vested_events: number;
  transferred_events: number;
  exercised_events: number;
  forfeited_events: number;
  cancelled_events: number;
  processed_events: number;
  total_pending_shares: number;
  total_due_shares: number;
  total_vested_shares: number;
  total_transferred_shares: number;
  total_exercised_shares: number;
  total_forfeited_shares: number;
  total_cancelled_shares: number;
}

interface PieSlice {
  label: string;
  value: number;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  'Due Now': '#ef4444',
  Pending: '#f59e0b',
  Transferred: '#10b981',
  Exercised: '#8b5cf6',
  Vested: '#06b6d4',
  'Forfeited/Cancelled': '#6b7280',
};

const SHARES_COLORS: Record<string, string> = {
  'Due Now': '#ef4444',
  Pending: '#f59e0b',
  Transferred: '#10b981',
  Exercised: '#8b5cf6',
  Vested: '#06b6d4',
  'Forfeited/Cancelled': '#6b7280',
};

export default function VestingEventsSummary() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<VestingEventStats | null>(null);
  const [dueEvents, setDueEvents] = useState<VestingEventWithDetails[]>([]);

  const [eventsExpanded, setEventsExpanded] = useState(true);
  const [sharesExpanded, setSharesExpanded] = useState(true);
  const [dueExpanded, setDueExpanded] = useState(true);

  const [highlightedEventStatus, setHighlightedEventStatus] = useState<string | null>(null);
  const [lockedEventStatus, setLockedEventStatus] = useState<string | null>(null);
  const [hoveredEventSlice, setHoveredEventSlice] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const eventsChartRef = useRef<HTMLDivElement>(null);

  const [highlightedShareStatus, setHighlightedShareStatus] = useState<string | null>(null);
  const [lockedShareStatus, setLockedShareStatus] = useState<string | null>(null);
  const [hoveredShareSlice, setHoveredShareSlice] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const sharesChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: companyUser } = await supabase
          .from('company_users')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!companyUser) return;
        const companyId = companyUser.company_id;

        await updateVestingEventStatuses();

        const statsResult = await getVestingEventStats(companyId);
        if (statsResult.success && statsResult.data) {
          setStats(statsResult.data);
        }

        const today = new Date().toISOString().split('T')[0];
        const { data: dueData } = await supabase
          .from('vesting_events')
          .select(`
            *,
            employees(first_name_en, last_name_en),
            grants(plan_id, grant_number, incentive_plans(plan_name_en, plan_code, plan_type))
          `)
          .eq('company_id', companyId)
          .eq('status', 'due')
          .lte('vesting_date', today)
          .order('vesting_date', { ascending: true })
          .limit(5);

        const processed = (dueData || []).map((event: any) => {
          const plan = event.grants?.incentive_plans;
          const employee = event.employees;
          const vestingDate = new Date(event.vesting_date);
          const todayDate = new Date();
          const daysRemaining = Math.ceil((vestingDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
          return {
            ...event,
            employee_name: `${employee?.first_name_en || ''} ${employee?.last_name_en || ''}`.trim() || 'Employee',
            plan_name: plan?.plan_name_en || 'Unknown Plan',
            plan_code: plan?.plan_code || 'N/A',
            plan_type: plan?.plan_type || 'LTIP_RSU',
            days_remaining: daysRemaining,
            requires_exercise: plan?.plan_type === 'ESOP',
          } as VestingEventWithDetails;
        });
        setDueEvents(processed);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const eventsSlices: PieSlice[] = useMemo(() => {
    if (!stats) return [];
    return [
      { label: t('vestingEvents.dueNow'), value: stats.due_events, color: STATUS_COLORS['Due Now'] },
      { label: t('vestingEvents.pending'), value: stats.pending_events, color: STATUS_COLORS.Pending },
      { label: t('vestingEvents.transferred'), value: stats.transferred_events, color: STATUS_COLORS.Transferred },
      { label: t('vestingEvents.exercised'), value: stats.exercised_events, color: STATUS_COLORS.Exercised },
      { label: t('vestingEvents.vested'), value: stats.vested_events, color: STATUS_COLORS.Vested },
      { label: t('vestingEvents.forfeitedCancelled'), value: stats.forfeited_events + stats.cancelled_events, color: STATUS_COLORS['Forfeited/Cancelled'] },
    ].filter((slice) => slice.value > 0);
  }, [stats, t]);

  const sharesSlices: PieSlice[] = useMemo(() => {
    if (!stats) return [];
    return [
      { label: t('vestingEvents.dueNow'), value: stats.total_due_shares, color: SHARES_COLORS['Due Now'] },
      { label: t('vestingEvents.pending'), value: stats.total_pending_shares, color: SHARES_COLORS.Pending },
      { label: t('vestingEvents.transferred'), value: stats.total_transferred_shares, color: SHARES_COLORS.Transferred },
      { label: t('vestingEvents.exercised'), value: stats.total_exercised_shares, color: SHARES_COLORS.Exercised },
      { label: t('vestingEvents.vested'), value: stats.total_vested_shares, color: SHARES_COLORS.Vested },
      { label: t('vestingEvents.forfeitedCancelled'), value: stats.total_forfeited_shares + stats.total_cancelled_shares, color: SHARES_COLORS['Forfeited/Cancelled'] },
    ].filter((slice) => slice.value > 0);
  }, [stats, t]);

  if (loading || !stats) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('vestingEvents.title')}</h2>
          <p className="text-gray-600 text-sm">{t('vestingEvents.description')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard
          icon={<Calendar className="w-5 h-5 text-blue-600" />}
          title={t('vestingEvents.totalEvents')}
          primary={`${stats.total_events}`}
          secondary={`${stats.total_total_shares.toLocaleString()} ${t('dashboard.shares')}`}
        />
        <SummaryCard
          icon={<AlertCircle className="w-5 h-5 text-red-600" />}
          title={t('vestingEvents.dueNow')}
          primary={stats.due_events.toString()}
          secondary={`${stats.total_due_shares.toLocaleString()} ${t('dashboard.shares')}`}
          highlight
        />
        <SummaryCard
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          title={t('vestingEvents.pending')}
          primary={stats.pending_events.toString()}
          secondary={`${stats.total_pending_shares.toLocaleString()} ${t('dashboard.shares')}`}
        />
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
          title={t('vestingEvents.vested')}
          primary={stats.vested_events.toString()}
          secondary={`${stats.total_vested_shares.toLocaleString()} ${t('dashboard.shares')}`}
        />
        <SummaryCard
          icon={<Award className="w-5 h-5 text-purple-600" />}
          title={t('vestingEvents.exercised')}
          primary={stats.exercised_events.toString()}
          secondary={`${stats.total_exercised_shares.toLocaleString()} ${t('dashboard.shares')}`}
        />
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5 text-green-600" />}
          title={t('vestingEvents.transferred')}
          primary={stats.transferred_events.toString()}
          secondary={`${stats.total_transferred_shares.toLocaleString()} ${t('dashboard.shares')}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PieCard
          title={t('vestingEvents.eventsByStatus')}
          iconColor="text-blue-600"
          slices={eventsSlices}
          totalValue={formatCompactNumber(stats.total_events)}
          totalLabel={t('vestingEvents.events')}
          expanded={eventsExpanded}
          onToggle={() => setEventsExpanded((prev) => !prev)}
          chartRef={eventsChartRef}
          hoveredSlice={hoveredEventSlice}
          onHoverSlice={setHoveredEventSlice}
          highlightKey={highlightedEventStatus}
          onHighlightChange={setHighlightedEventStatus}
          lockedKey={lockedEventStatus}
          onLockChange={setLockedEventStatus}
        />

        <PieCard
          title={t('vestingEvents.sharesByStatus')}
          iconColor="text-green-600"
          slices={sharesSlices}
          totalValue={formatCompactNumber(stats.total_total_shares)}
          totalLabel={t('dashboard.shares')}
          expanded={sharesExpanded}
          onToggle={() => setSharesExpanded((prev) => !prev)}
          chartRef={sharesChartRef}
          hoveredSlice={hoveredShareSlice}
          onHoverSlice={setHoveredShareSlice}
          highlightKey={highlightedShareStatus}
          onHighlightChange={setHighlightedShareStatus}
          lockedKey={lockedShareStatus}
          onLockChange={setLockedShareStatus}
        />

        <DueEventsCard
          events={dueEvents}
          expanded={dueExpanded}
          onToggle={() => setDueExpanded((prev) => !prev)}
          t={t}
        />
      </div>
    </section>
  );
}

function SummaryCard({ icon, title, primary, secondary, highlight }: { icon: React.ReactNode; title: string; primary: string; secondary: string; highlight?: boolean; }) {
  return (
    <div className={`bg-white rounded-xl p-5 border ${highlight ? 'border-red-300 shadow-sm' : 'border-gray-200'} hover:shadow-lg transition`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${highlight ? 'bg-red-100' : 'bg-blue-100'}`}>{icon}</div>
      </div>
      <p className="text-sm text-gray-600 font-medium mb-1">{title}</p>
      <div className={`text-3xl font-bold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{primary}</div>
      <div className="text-xs text-gray-500 mt-1">{secondary}</div>
    </div>
  );
}

interface PieCardProps {
  title: string;
  iconColor: string;
  slices: PieSlice[];
  totalValue: string;
  totalLabel: string;
  expanded: boolean;
  onToggle: () => void;
  chartRef: React.RefObject<HTMLDivElement>;
  hoveredSlice: { label: string; value: number; percentage: number; x: number; y: number } | null;
  onHoverSlice: (slice: { label: string; value: number; percentage: number; x: number; y: number } | null) => void;
  highlightKey: string | null;
  onHighlightChange: (key: string | null) => void;
  lockedKey: string | null;
  onLockChange: (key: string | null) => void;
}

function PieCard(props: PieCardProps) {
  const {
    title,
    iconColor,
    slices,
    totalValue,
    totalLabel,
    expanded,
    onToggle,
    chartRef,
    hoveredSlice,
    onHoverSlice,
    highlightKey,
    onHighlightChange,
    lockedKey,
    onLockChange,
  } = props;

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <button
        className="w-full p-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <PieChart className={`w-5 h-5 ${iconColor}`} />
          <span className="text-lg font-semibold text-gray-900">{title}</span>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
      </button>

      <div className="p-4">
        {total === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">{t('vestingEvents.noEventsAvailable')}</div>
        ) : (
          <div className="space-y-3">
            <div
              ref={chartRef}
              className="relative w-full h-40 flex items-center justify-center"
              onClick={(e) => {
                if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg') {
                  onLockChange(null);
                  onHighlightChange(null);
                  onHoverSlice(null);
                }
              }}
            >
              <svg
                viewBox="0 0 120 120"
                className="w-full max-w-40 h-40 cursor-pointer"
                onMouseLeave={() => {
                  onHoverSlice(null);
                  if (!lockedKey) onHighlightChange(null);
                }}
              >
                {slices.map((slice) => {
                  const startAngle = slices
                    .slice(0, slices.indexOf(slice))
                    .reduce((sum, s) => sum + (s.value / total) * 360, 0);
                  const angle = (slice.value / total) * 360;
                  const endAngle = startAngle + angle;

                  const startRad = (startAngle - 90) * (Math.PI / 180);
                  const endRad = (endAngle - 90) * (Math.PI / 180);

                  const x1 = 60 + 50 * Math.cos(startRad);
                  const y1 = 60 + 50 * Math.sin(startRad);
                  const x2 = 60 + 50 * Math.cos(endRad);
                  const y2 = 60 + 50 * Math.sin(endRad);

                  const largeArc = angle > 180 ? 1 : 0;
                  const percentage = (slice.value / total) * 100;
                  const isLocked = lockedKey === slice.label;
                  const isHighlighted = highlightKey === slice.label;
                  const isDimmed = lockedKey ? !isLocked : highlightKey !== null && !isHighlighted;

                  return (
                    <path
                      key={slice.label}
                      d={`M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={slice.color}
                      stroke="white"
                      strokeWidth={isLocked || isHighlighted ? 3 : 2}
                      style={{
                        opacity: isLocked ? 1 : isDimmed ? 0.3 : isHighlighted ? 1 : 0.85,
                        filter:
                          isLocked || isHighlighted
                            ? 'brightness(1.2)'
                            : lockedKey
                            ? 'brightness(0.5)'
                            : 'none',
                        transition: 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (chartRef.current) {
                          const rect = chartRef.current.getBoundingClientRect();
                          const mouseX = e.clientX - rect.left;
                          const mouseY = e.clientY - rect.top;
                          if (!lockedKey) onHighlightChange(slice.label);
                          onHoverSlice({ label: slice.label, value: slice.value, percentage, x: mouseX, y: mouseY });
                        }
                      }}
                      onMouseLeave={() => {
                        onHoverSlice(null);
                        if (!lockedKey) onHighlightChange(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextLock = lockedKey === slice.label ? null : slice.label;
                        onLockChange(nextLock);
                        onHighlightChange(nextLock);
                      }}
                    />
                  );
                })}
                <circle cx="60" cy="60" r="30" fill="white" />
                <text x="60" y="56" textAnchor="middle" className="font-bold" fill="#111827" fontSize="12">
                  {totalValue}
                </text>
                <text x="60" y="70" textAnchor="middle" fill="#6b7280" fontSize="9">
                  {totalLabel}
                </text>
              </svg>

              {hoveredSlice && (
                <div
                  className="absolute z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap"
                  style={{ left: `${hoveredSlice.x}px`, top: `${hoveredSlice.y - 30}px`, transform: 'translateX(-50%)' }}
                >
                  <div className="font-semibold">{hoveredSlice.label}</div>
                  <div className="text-gray-300">
                    {hoveredSlice.value.toLocaleString()} ({hoveredSlice.percentage.toFixed(1)}%)
                  </div>
                </div>
              )}
            </div>

            {expanded && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {slices.map((slice) => {
                  const percentage = total > 0 ? (slice.value / total) * 100 : 0;
                  const isLocked = lockedKey === slice.label;
                  const isHighlighted = highlightKey === slice.label;
                  return (
                    <div
                      key={slice.label}
                      className={`flex items-center gap-2 text-xs p-1 rounded cursor-pointer transition-colors ${
                        isLocked || isHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                      onMouseEnter={() => {
                        if (chartRef.current) {
                          const rect = chartRef.current.getBoundingClientRect();
                          onHoverSlice({
                            label: slice.label,
                            value: slice.value,
                            percentage,
                            x: rect.width / 2,
                            y: rect.height / 2,
                          });
                          if (!lockedKey) onHighlightChange(slice.label);
                        }
                      }}
                      onMouseLeave={() => {
                        onHoverSlice(null);
                        if (!lockedKey) onHighlightChange(null);
                      }}
                      onClick={() => {
                        const nextLock = lockedKey === slice.label ? null : slice.label;
                        onLockChange(nextLock);
                        onHighlightChange(nextLock);
                      }}
                    >
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }} />
                      <span className="flex-1 truncate">{slice.label}</span>
                      <span className="font-medium">{slice.value.toLocaleString()} ({percentage.toFixed(1)}%)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DueEventsCard({ events, expanded, onToggle, t }: { events: VestingEventWithDetails[]; expanded: boolean; onToggle: () => void; t: any }) {
  const isRTL = t.i18n?.language === 'ar';
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <button
        onClick={onToggle}
        className="w-full p-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-lg font-semibold text-gray-900">{t('vestingEvents.dueEvents')}</span>
          {events.length > 0 && (
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
              {events.length}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
      </button>

      <div className="p-4">
        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">{t('vestingEvents.noDueEvents')}</div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {(expanded ? events : events.slice(0, 3)).map((event) => (
              <div key={event.id} className={`p-3 border-l-4 border-red-500 bg-red-50 rounded-r-lg ${isRTL ? 'border-r-4 border-l-0 rounded-l-lg rounded-r-none' : ''}`}>
                <div className={`flex items-start justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div>
                    <div className="text-sm font-semibold text-gray-900 mb-1">{event.employee_name}</div>
                    <div className="text-xs text-gray-600">
                      {Math.floor(event.shares_to_vest).toLocaleString()} {t('dashboard.shares')} • {event.plan_name}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDate(event.vesting_date)} • {formatDaysRemaining(event.days_remaining)}
                    </div>
                  </div>
                  <div className="text-xs font-mono bg-white border border-red-200 text-red-600 px-2 py-1 rounded">
                    {formatVestingEventId(
                      event.id,
                      event.sequence_number,
                      event.vesting_date,
                      event.grants?.grant_number ?? event.grant_id
                    ).displayId}
                  </div>
                </div>
              </div>
            ))}
            {!expanded && events.length > 3 && (
              <div className="text-center">
                <button
                  onClick={onToggle}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  {t('vestingEvents.showAllDueEvents')} →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

