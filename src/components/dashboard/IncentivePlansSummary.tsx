import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { FileText, TrendingUp, Users, PieChart, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCompactNumber } from '../../lib/numberUtils';

interface IncentivePlan {
  id: string;
  plan_name_en: string;
  status: 'draft' | 'active' | 'closed' | 'suspended';
  total_shares_allocated: number;
}

interface PieSlice {
  label: string;
  value: number;
  color: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function IncentivePlansSummary() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<IncentivePlan[]>([]);
  const [ltipPoolTotals, setLtipPoolTotals] = useState({ total: 0, allocated: 0, available: 0 });
  const [grantsByPlan, setGrantsByPlan] = useState<Record<string, number>>({});

  const [poolExpanded, setPoolExpanded] = useState(true);
  const [plansExpanded, setPlansExpanded] = useState(true);
  const [highlightedPoolSlice, setHighlightedPoolSlice] = useState<string | null>(null);
  const [lockedPoolSlice, setLockedPoolSlice] = useState<string | null>(null);
  const [hoveredPoolSlice, setHoveredPoolSlice] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const poolChartRef = useRef<HTMLDivElement>(null);

  const [highlightedPlanSlice, setHighlightedPlanSlice] = useState<string | null>(null);
  const [lockedPlanSlice, setLockedPlanSlice] = useState<string | null>(null);
  const [hoveredPlanSlice, setHoveredPlanSlice] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const plansChartRef = useRef<HTMLDivElement>(null);

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

        const [{ data: plansData }, { data: poolsData }, { data: grantsData }] = await Promise.all([
          supabase
            .from('incentive_plans')
            .select('id, plan_name_en, status, total_shares_allocated')
            .eq('company_id', companyId),
          supabase
            .from('ltip_pools')
            .select('total_shares_allocated, shares_used, shares_available')
            .eq('company_id', companyId),
          supabase
            .from('grants')
            .select('plan_id, total_shares')
            .eq('company_id', companyId),
        ]);

        setPlans(plansData || []);

        const poolTotals = (poolsData || []).reduce(
          (acc, pool) => {
            acc.total += Number(pool.total_shares_allocated || 0);
            acc.allocated += Number(pool.shares_used || 0);
            acc.available += Number(pool.shares_available || 0);
            return acc;
          },
          { total: 0, allocated: 0, available: 0 }
        );
        setLtipPoolTotals(poolTotals);

        const grantsMap: Record<string, number> = {};
        (grantsData || []).forEach((grant) => {
          const key = grant.plan_id as string;
          if (!key) return;
          grantsMap[key] = (grantsMap[key] || 0) + Number(grant.total_shares || 0);
        });
        setGrantsByPlan(grantsMap);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const totalPlannedShares = useMemo(
    () => plans.reduce((sum, plan) => sum + Number(plan.total_shares_allocated || 0), 0),
    [plans]
  );

  const totalGrantedShares = useMemo(
    () => Object.values(grantsByPlan).reduce((sum, v) => sum + v, 0),
    [grantsByPlan]
  );

  const totalUngrantedShares = Math.max(totalPlannedShares - totalGrantedShares, 0);

  const poolSlices = useMemo<PieSlice[]>(() => {
    if (!ltipPoolTotals.total) return [];
    return [
      { label: t('incentivePlans.plannedShares'), value: totalPlannedShares, color: '#3b82f6' },
      { label: t('incentivePlans.unplannedShares'), value: Math.max(ltipPoolTotals.total - totalPlannedShares, 0), color: '#94a3b8' },
    ].filter((slice) => slice.value > 0);
  }, [ltipPoolTotals.total, totalPlannedShares, t]);

  const planSlices = useMemo<PieSlice[]>(() => {
    if (!totalPlannedShares) return [];
    return plans
      .filter((plan) => plan.total_shares_allocated > 0)
      .map((plan, index) => ({
        label: plan.plan_name_en,
        value: plan.total_shares_allocated,
        color: COLORS[index % COLORS.length],
      }));
  }, [plans, totalPlannedShares]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  const activePlansCount = plans.filter((plan) => plan.status === 'active').length;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('incentivePlans.title')}</h2>
          <p className="text-gray-600 text-sm">{t('incentivePlans.description')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className={isRTL ? 'text-left' : 'text-right'}>
              <div className="text-xs text-gray-500">{t('incentivePlans.totalPlans')}</div>
              <div className="text-2xl font-bold text-gray-900">{plans.length}</div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('incentivePlans.active')}</span>
              <span className="text-sm font-semibold text-gray-900">
                {activePlansCount} / {plans.length}
              </span>
            </div>
            <ProgressBar percentage={plans.length ? (activePlansCount / plans.length) * 100 : 0} t={t} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-slate-100 rounded-lg">
              <Users className="w-6 h-6 text-slate-600" />
            </div>
            <span className="text-2xl font-bold text-gray-900">{ltipPoolTotals.total.toLocaleString()}</span>
          </div>
          <p className="text-gray-600 font-medium mb-2">{t('incentivePlans.ltipPool')}</p>
          <div className="space-y-1 text-sm">
            <SummaryLine label={t('incentivePlans.plannedShares')} value={totalPlannedShares} />
            <SummaryLine label={t('incentivePlans.granted')} value={totalGrantedShares} indent />
            <SummaryLine label={t('incentivePlans.ungranted')} value={totalUngrantedShares} indent />
            <SummaryLine label={t('incentivePlans.availableToPlan')} value={ltipPoolTotals.available} highlight />
          </div>
        </div>

        <PieSummaryCard
          title={t('incentivePlans.ltipPoolVsPlanned')}
          iconColor="text-cyan-600"
          totalLabel={t('incentivePlans.totalPool')}
          totalValue={formatCompactNumber(ltipPoolTotals.total)}
          slices={poolSlices}
          expanded={poolExpanded}
          onToggle={() => setPoolExpanded((prev) => !prev)}
          chartRef={poolChartRef}
          hoveredSlice={hoveredPoolSlice}
          onHoverSlice={setHoveredPoolSlice}
          highlightKey={highlightedPoolSlice}
          onHighlightChange={setHighlightedPoolSlice}
          lockedKey={lockedPoolSlice}
          onLockChange={setLockedPoolSlice}
        />

        <PieSummaryCard
          title={t('incentivePlans.plannedSharesByPlan')}
          iconColor="text-purple-600"
          totalLabel={t('dashboard.shares')}
          totalValue={formatCompactNumber(totalPlannedShares)}
          slices={planSlices}
          expanded={plansExpanded}
          onToggle={() => setPlansExpanded((prev) => !prev)}
          chartRef={plansChartRef}
          hoveredSlice={hoveredPlanSlice}
          onHoverSlice={setHoveredPlanSlice}
          highlightKey={highlightedPlanSlice}
          onHighlightChange={setHighlightedPlanSlice}
          lockedKey={lockedPlanSlice}
          onLockChange={setLockedPlanSlice}
        />
      </div>
    </section>
  );
}

function SummaryLine({ label, value, indent = false, highlight = false }: { label: string; value: number; indent?: boolean; highlight?: boolean; }) {
  return (
    <div className={`flex justify-between ${indent ? 'pl-4' : ''}`}>
      <span className={`text-xs ${highlight ? 'text-green-600 font-semibold' : 'text-gray-500'}`}>{label}:</span>
      <span className={`text-xs ${highlight ? 'text-green-600 font-semibold' : 'text-gray-900 font-medium'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function ProgressBar({ percentage, t }: { percentage: number; t: any }) {
  const pct = Math.round(percentage);
  return (
    <div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-2 bg-green-500 rounded-full transition-all"
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-gray-500">{pct}% {t('incentivePlans.activePercent')}</div>
    </div>
  );
}

interface PieSummaryCardProps {
  title: string;
  iconColor: string;
  totalLabel: string;
  totalValue: string;
  slices: PieSlice[];
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

function PieSummaryCard(props: PieSummaryCardProps) {
  const { t } = useTranslation();
  const {
    title,
    iconColor,
    totalLabel,
    totalValue,
    slices,
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
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <button className="w-full flex items-center justify-between mb-4" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <PieChart className={`w-5 h-5 ${iconColor}`} />
          <span className="text-sm font-medium text-gray-900">{title}</span>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
      </button>

      {total === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">{t('common.noData')}</div>
      ) : (
        <>
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
            <div className="space-y-1 max-h-40 overflow-y-auto mt-3">
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
                    <span className="flex-1 truncate" title={slice.label}>
                      {slice.label}
                    </span>
                    <span className="font-medium">{slice.value.toLocaleString()} ({percentage.toFixed(1)}%)</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

