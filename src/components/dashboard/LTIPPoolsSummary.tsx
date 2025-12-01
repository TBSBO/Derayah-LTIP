import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { TrendingUp, DollarSign, Users, PieChart, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { formatCompactNumber } from '../../lib/numberUtils';

interface LTIPPool {
  id: string;
  pool_name_en: string;
  total_shares_allocated: number;
  shares_used: number;
  shares_available: number;
}

interface PieSlice {
  label: string;
  value: number;
  color: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function LTIPPoolsSummary() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [loading, setLoading] = useState(true);
  const [pools, setPools] = useState<LTIPPool[]>([]);
  const [grantedByPool, setGrantedByPool] = useState<Record<string, number>>({});
  const [vestedByPool, setVestedByPool] = useState<Record<string, number>>({});
  const [unvestedByPool, setUnvestedByPool] = useState<Record<string, number>>({});

  const [poolsExpanded, setPoolsExpanded] = useState(true);
  const [statusExpanded, setStatusExpanded] = useState(true);
  const [usedExpanded, setUsedExpanded] = useState(true);

  const [highlightedPoolId, setHighlightedPoolId] = useState<string | null>(null);
  const [poolHighlightLocked, setPoolHighlightLocked] = useState<string | null>(null);
  const [hoveredPoolSlice, setHoveredPoolSlice] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const poolsChartRef = useRef<HTMLDivElement>(null);

  const [highlightedStatus, setHighlightedStatus] = useState<string | null>(null);
  const [statusHighlightLocked, setStatusHighlightLocked] = useState<string | null>(null);
  const [hoveredStatusSlice, setHoveredStatusSlice] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const statusChartRef = useRef<HTMLDivElement>(null);

  const [highlightedUsedStatus, setHighlightedUsedStatus] = useState<string | null>(null);
  const [usedHighlightLocked, setUsedHighlightLocked] = useState<string | null>(null);
  const [hoveredUsedSlice, setHoveredUsedSlice] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const usedChartRef = useRef<HTMLDivElement>(null);

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

        const [{ data: poolData }, { data: grantsData }] = await Promise.all([
          supabase
            .from('ltip_pools')
            .select('id, pool_name_en, total_shares_allocated, shares_used, shares_available')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
          supabase
            .from('grants')
            .select('id, total_shares, incentive_plans(id, ltip_pool_id)')
            .eq('company_id', companyId),
        ]);

        setPools(poolData || []);

        const grantedMap: Record<string, number> = {};
        const grantToPool: Record<string, string> = {};

        (grantsData || []).forEach((grant: any) => {
          const poolId = grant?.incentive_plans?.ltip_pool_id as string | null;
          if (!poolId) return;
          const shares = Number(grant.total_shares || 0);
          grantedMap[poolId] = (grantedMap[poolId] || 0) + shares;
          grantToPool[grant.id as string] = poolId;
        });

        setGrantedByPool(grantedMap);

        if (Object.keys(grantToPool).length) {
          const { data: vestingEvents } = await supabase
            .from('vesting_events')
            .select('grant_id, shares_to_vest, status')
            .in('grant_id', Object.keys(grantToPool));

          const vestedMap: Record<string, number> = {};
          const unvestedMap: Record<string, number> = {};
          const vestedStatuses = ['vested', 'transferred', 'exercised', 'due'];

          (vestingEvents || []).forEach((event) => {
            const poolId = grantToPool[event.grant_id as string];
            if (!poolId) return;
            const shares = Math.floor(Number(event.shares_to_vest || 0));
            if (vestedStatuses.includes(event.status as string)) {
              vestedMap[poolId] = (vestedMap[poolId] || 0) + shares;
            } else {
              unvestedMap[poolId] = (unvestedMap[poolId] || 0) + shares;
            }
          });

          setVestedByPool(vestedMap);
          setUnvestedByPool(unvestedMap);
        } else {
          setVestedByPool({});
          setUnvestedByPool({});
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const totalAllocated = useMemo(() => pools.reduce((sum, pool) => sum + pool.total_shares_allocated, 0), [pools]);
  const totalUsed = useMemo(() => pools.reduce((sum, pool) => sum + pool.shares_used, 0), [pools]);
  const totalAvailable = useMemo(() => pools.reduce((sum, pool) => sum + pool.shares_available, 0), [pools]);
  const totalGranted = useMemo(() => Object.values(grantedByPool).reduce((sum, v) => sum + v, 0), [grantedByPool]);
  const totalVested = useMemo(() => Object.values(vestedByPool).reduce((sum, v) => sum + v, 0), [vestedByPool]);
  const totalUnvested = useMemo(() => Object.values(unvestedByPool).reduce((sum, v) => sum + v, 0), [unvestedByPool]);

  const poolSlices: PieSlice[] = useMemo(() => {
    const total = pools.reduce((sum, pool) => sum + pool.total_shares_allocated, 0);
    if (!total) return [];
    return pools
      .filter(pool => pool.total_shares_allocated > 0)
      .map((pool, index) => ({
        label: pool.pool_name_en,
        value: pool.total_shares_allocated,
        color: COLORS[index % COLORS.length],
      }));
  }, [pools]);

  const statusSlices: PieSlice[] = useMemo(() => {
    const slices: PieSlice[] = [];
    if (totalUsed > 0) {
      slices.push({ label: t('dashboard.usedLabel'), value: totalUsed, color: '#10b981' });
    }
    if (totalAvailable > 0) {
      slices.push({ label: t('dashboard.available'), value: totalAvailable, color: '#f59e0b' });
    }
    return slices;
  }, [totalUsed, totalAvailable, t]);

  const usedBreakdownSlices: PieSlice[] = useMemo(() => {
    const allocatedButNotGranted = Math.max(totalUsed - totalGranted, 0);
    const grantedWithoutEvents = Math.max(totalGranted - (totalVested + totalUnvested), 0);
    const slices: PieSlice[] = [];
    if (totalVested > 0) slices.push({ label: t('dashboard.vested'), value: totalVested, color: '#22c55e' });
    if (totalUnvested > 0) slices.push({ label: t('dashboard.unvested'), value: totalUnvested, color: '#ec4899' });
    if (grantedWithoutEvents > 0) slices.push({ label: t('dashboard.grantedNoVestingEvents'), value: grantedWithoutEvents, color: '#f97316' });
    if (allocatedButNotGranted > 0) slices.push({ label: t('dashboard.allocatedNotGranted'), value: allocatedButNotGranted, color: '#6366f1' });
    return slices;
  }, [totalUsed, totalGranted, totalVested, totalUnvested, t]);

  if (loading) {
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
          <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.ltipPoolsSnapshot')}</h2>
          <p className="text-gray-600 text-sm">{t('dashboard.ltipPoolsSnapshotDesc')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Layers className="w-6 h-6 text-blue-600" />}
          title={t('dashboard.totalPools')}
          value={pools.length.toString()}
          iconBg="bg-blue-100"
        />
        <SummaryCard
          icon={<TrendingUp className="w-6 h-6 text-green-600" />}
          title={t('dashboard.totalAllocated')}
          value={totalAllocated.toLocaleString()}
          iconBg="bg-green-100"
        />
        <SummaryCard
          icon={<DollarSign className="w-6 h-6 text-yellow-600" />}
          title={t('dashboard.sharesUsedLabel')}
          value={totalUsed.toLocaleString()}
          iconBg="bg-yellow-100"
        />
        <SummaryCard
          icon={<Users className="w-6 h-6 text-purple-600" />}
          title={t('dashboard.available')}
          value={totalAvailable.toLocaleString()}
          iconBg="bg-purple-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PieChartCard
          title={t('dashboard.sharesByPool')}
          iconColor="text-blue-600"
          expanded={poolsExpanded}
          onToggle={() => setPoolsExpanded((prev) => !prev)}
          slices={poolSlices}
          totalLabel={t('dashboard.shares')}
          totalValue={formatCompactNumber(totalAllocated)}
          highlightKey={highlightedPoolId}
          lockedKey={poolHighlightLocked}
          hoveredSlice={hoveredPoolSlice}
          onHoverSlice={setHoveredPoolSlice}
          onHighlightChange={setHighlightedPoolId}
          onLockChange={setPoolHighlightLocked}
          chartRef={poolsChartRef}
        />

        <PieChartCard
          title={t('dashboard.sharesByStatus')}
          iconColor="text-green-600"
          expanded={statusExpanded}
          onToggle={() => setStatusExpanded((prev) => !prev)}
          slices={statusSlices}
          totalLabel={t('dashboard.shares')}
          totalValue={formatCompactNumber(totalUsed + totalAvailable)}
          highlightKey={highlightedStatus}
          lockedKey={statusHighlightLocked}
          hoveredSlice={hoveredStatusSlice}
          onHoverSlice={setHoveredStatusSlice}
          onHighlightChange={setHighlightedStatus}
          onLockChange={setStatusHighlightLocked}
          chartRef={statusChartRef}
        />

        <PieChartCard
          title={t('dashboard.usedSharesBreakdown')}
          iconColor="text-indigo-600"
          expanded={usedExpanded}
          onToggle={() => setUsedExpanded((prev) => !prev)}
          slices={usedBreakdownSlices}
          totalLabel={`${t('dashboard.shares')} (${t('dashboard.usedLabel')})`}
          totalValue={formatCompactNumber(totalUsed)}
          highlightKey={highlightedUsedStatus}
          lockedKey={usedHighlightLocked}
          hoveredSlice={hoveredUsedSlice}
          onHoverSlice={setHoveredUsedSlice}
          onHighlightChange={setHighlightedUsedStatus}
          onLockChange={setUsedHighlightLocked}
          chartRef={usedChartRef}
        />
      </div>
    </section>
  );
}

function SummaryCard({ icon, iconBg, title, value }: { icon: React.ReactNode; iconBg: string; title: string; value: string; }) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${iconBg}`}>{icon}</div>
        <span className="text-2xl font-bold text-gray-900">{value}</span>
      </div>
      <p className="text-gray-600 font-medium text-sm">{title}</p>
    </div>
  );
}

interface PieChartCardProps {
  title: string;
  iconColor: string;
  slices: PieSlice[];
  totalLabel: string;
  totalValue: string;
  expanded: boolean;
  onToggle: () => void;
  highlightKey: string | null;
  lockedKey: string | null;
  hoveredSlice: { label: string; value: number; percentage: number; x: number; y: number } | null;
  onHoverSlice: (slice: { label: string; value: number; percentage: number; x: number; y: number } | null) => void;
  onHighlightChange: (key: string | null) => void;
  onLockChange: (key: string | null) => void;
  chartRef: React.RefObject<HTMLDivElement>;
}

function PieChartCard(props: PieChartCardProps) {
  const { t } = useTranslation();
  const {
    title,
    iconColor,
    slices,
    totalLabel,
    totalValue,
    expanded,
    onToggle,
    highlightKey,
    lockedKey,
    hoveredSlice,
    onHoverSlice,
    onHighlightChange,
    onLockChange,
    chartRef,
  } = props;

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <button
        onClick={onToggle}
        className="w-full p-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center space-x-2">
          <PieChart className={`w-5 h-5 ${iconColor}`} />
          <span className="text-lg font-semibold text-gray-900">{title}</span>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
      </button>

      <div className="p-4">
        {total === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">{t('common.noData')}</div>
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
                  if (!lockedKey) {
                    onHighlightChange(null);
                  }
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
                  const isLocked = lockedKey === slice.label;
                  const isHighlighted = highlightKey === slice.label;
                  const isDimmed = lockedKey ? !isLocked : highlightKey !== null && !isHighlighted;
                  const percentage = (slice.value / total) * 100;

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
                        if (chartRef.current) {
                          const rect = chartRef.current.getBoundingClientRect();
                          onHoverSlice({
                            label: slice.label,
                            value: slice.value,
                            percentage,
                            x: rect.width / 2,
                            y: rect.height / 2,
                          });
                        }
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

