import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/dateUtils';
import { formatShares } from '../../lib/numberUtils';
import { 
  ArrowRightLeft, 
  Clock, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  PieChart, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  DollarSign
} from 'lucide-react';

interface TransferStats {
  total_transfers: number;
  total_shares_transferred: number;
  pending_transfers: number;
  transferred_transfers: number;
  cancelled_transfers: number;
  total_pending_shares: number;
  total_transferred_shares: number;
  total_cancelled_shares: number;
  average_transfer_size: number;
  total_transfer_value: number;
  // By type
  vesting_transfers: number;
  forfeiture_transfers: number;
  exercise_transfers: number;
  cancellation_transfers: number;
  total_vesting_shares: number;
  total_forfeiture_shares: number;
  total_exercise_shares: number;
  total_cancellation_shares: number;
}

interface PendingTransfer {
  id: string;
  transfer_number: string;
  employee_name: string;
  shares_transferred: number;
  transfer_date: string;
  days_until_due: number;
  grant_number: string;
}

interface PieSlice {
  label: string;
  value: number;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: '#f59e0b',
  Transferred: '#10b981',
  Cancelled: '#ef4444',
};

const TYPE_COLORS: Record<string, string> = {
  Vesting: '#3b82f6',
  Forfeiture: '#f97316',
  Exercise: '#8b5cf6',
  Cancellation: '#6b7280',
};

export default function TransfersSummary() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TransferStats | null>(null);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);

  const [statusExpanded, setStatusExpanded] = useState(true);
  const [typeExpanded, setTypeExpanded] = useState(true);
  const [pendingExpanded, setPendingExpanded] = useState(true);

  const [highlightedStatus, setHighlightedStatus] = useState<string | null>(null);
  const [lockedStatus, setLockedStatus] = useState<string | null>(null);
  const [hoveredStatusSlice, setHoveredStatusSlice] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const statusChartRef = useRef<HTMLDivElement>(null);

  const [highlightedType, setHighlightedType] = useState<string | null>(null);
  const [lockedType, setLockedType] = useState<string | null>(null);
  const [hoveredTypeSlice, setHoveredTypeSlice] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const typeChartRef = useRef<HTMLDivElement>(null);

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

        // Load all transfers for the company
        const { data: transfersData, error: transfersError } = await supabase
          .from('share_transfers')
          .select(`
            *,
            employees(first_name_en, last_name_en),
            grants(grant_number)
          `)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });

        if (transfersError) throw transfersError;

        const transfers = transfersData || [];

        // Calculate stats
        const total_transfers = transfers.length;
        const total_shares_transferred = transfers.reduce((sum, t) => sum + Number(t.shares_transferred || 0), 0);
        
        const pending = transfers.filter(t => t.status === 'pending');
        const transferred = transfers.filter(t => t.status === 'transferred');
        const cancelled = transfers.filter(t => t.status === 'cancelled');

        const pending_transfers = pending.length;
        const transferred_transfers = transferred.length;
        const cancelled_transfers = cancelled.length;

        const total_pending_shares = pending.reduce((sum, t) => sum + Number(t.shares_transferred || 0), 0);
        const total_transferred_shares = transferred.reduce((sum, t) => sum + Number(t.shares_transferred || 0), 0);
        const total_cancelled_shares = cancelled.reduce((sum, t) => sum + Number(t.shares_transferred || 0), 0);

        const average_transfer_size = total_transfers > 0 ? total_shares_transferred / total_transfers : 0;
        
        const total_transfer_value = transfers.reduce((sum, t) => {
          const shares = Number(t.shares_transferred || 0);
          const price = Number(t.market_price_at_transfer || 0);
          return sum + (shares * price);
        }, 0);

        // By type
        const vesting = transfers.filter(t => t.transfer_type === 'vesting');
        const forfeiture = transfers.filter(t => t.transfer_type === 'forfeiture');
        const exercise = transfers.filter(t => t.transfer_type === 'exercise');
        const cancellation = transfers.filter(t => t.transfer_type === 'cancellation');

        const vesting_transfers = vesting.length;
        const forfeiture_transfers = forfeiture.length;
        const exercise_transfers = exercise.length;
        const cancellation_transfers = cancellation.length;

        const total_vesting_shares = vesting.reduce((sum, t) => sum + Number(t.shares_transferred || 0), 0);
        const total_forfeiture_shares = forfeiture.reduce((sum, t) => sum + Number(t.shares_transferred || 0), 0);
        const total_exercise_shares = exercise.reduce((sum, t) => sum + Number(t.shares_transferred || 0), 0);
        const total_cancellation_shares = cancellation.reduce((sum, t) => sum + Number(t.shares_transferred || 0), 0);

        setStats({
          total_transfers,
          total_shares_transferred,
          pending_transfers,
          transferred_transfers,
          cancelled_transfers,
          total_pending_shares,
          total_transferred_shares,
          total_cancelled_shares,
          average_transfer_size,
          total_transfer_value,
          vesting_transfers,
          forfeiture_transfers,
          exercise_transfers,
          cancellation_transfers,
          total_vesting_shares,
          total_forfeiture_shares,
          total_exercise_shares,
          total_cancellation_shares,
        });

        // Load pending transfers for timeline
        const today = new Date();
        const pendingForTimeline = pending.map((transfer: any) => {
          const transferDate = new Date(transfer.transfer_date);
          const daysUntilDue = Math.ceil((transferDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const employee = transfer.employees;
          return {
            id: transfer.id,
            transfer_number: transfer.transfer_number,
            employee_name: `${employee?.first_name_en || ''} ${employee?.last_name_en || ''}`.trim() || 'Employee',
            shares_transferred: Number(transfer.shares_transferred || 0),
            transfer_date: transfer.transfer_date,
            days_until_due: daysUntilDue,
            grant_number: transfer.grants?.grant_number || 'N/A',
          } as PendingTransfer;
        }).sort((a, b) => a.days_until_due - b.days_until_due).slice(0, 10);

        setPendingTransfers(pendingForTimeline);
      } catch (error) {
        console.error('Error loading transfer stats:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const statusSlices: PieSlice[] = useMemo(() => {
    if (!stats) return [];
    return [
      { label: t('transfers.pending'), value: stats.pending_transfers, color: STATUS_COLORS.Pending },
      { label: t('transfers.transferred'), value: stats.transferred_transfers, color: STATUS_COLORS.Transferred },
      { label: t('transfers.cancelled'), value: stats.cancelled_transfers, color: STATUS_COLORS.Cancelled },
    ].filter((slice) => slice.value > 0);
  }, [stats, t]);

  const typeSlices: PieSlice[] = useMemo(() => {
    if (!stats) return [];
    return [
      { label: t('transfers.vesting'), value: stats.vesting_transfers, color: TYPE_COLORS.Vesting },
      { label: t('transfers.forfeiture'), value: stats.forfeiture_transfers, color: TYPE_COLORS.Forfeiture },
      { label: t('transfers.exercise'), value: stats.exercise_transfers, color: TYPE_COLORS.Exercise },
      { label: t('transfers.cancellation'), value: stats.cancellation_transfers, color: TYPE_COLORS.Cancellation },
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
          <h2 className="text-2xl font-bold text-gray-900">{t('transfers.summaryTitle')}</h2>
          <p className="text-gray-600 text-sm">{t('transfers.summaryDescription')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard
          icon={<ArrowRightLeft className="w-5 h-5 text-blue-600" />}
          title={t('transfers.totalTransfers')}
          primary={`${stats.total_transfers}`}
          secondary={`${formatShares(stats.total_shares_transferred)} ${t('dashboard.shares')}`}
        />
        <SummaryCard
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          title={t('transfers.pending')}
          primary={stats.pending_transfers.toString()}
          secondary={`${formatShares(stats.total_pending_shares)} ${t('dashboard.shares')}`}
          highlight={stats.pending_transfers > 0}
        />
        <SummaryCard
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
          title={t('transfers.completed')}
          primary={stats.transferred_transfers.toString()}
          secondary={`${formatShares(stats.total_transferred_shares)} ${t('dashboard.shares')}`}
        />
        <SummaryCard
          icon={<XCircle className="w-5 h-5 text-red-600" />}
          title={t('transfers.cancelled')}
          primary={stats.cancelled_transfers.toString()}
          secondary={`${formatShares(stats.total_cancelled_shares)} ${t('dashboard.shares')}`}
        />
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
          title={t('transfers.averageTransferSize')}
          primary={formatShares(stats.average_transfer_size)}
          secondary={t('transfers.perTransfer')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PieCard
          title={t('transfers.transfersByStatus')}
          iconColor="text-blue-600"
          slices={statusSlices}
          totalValue={`${stats.total_transfers.toLocaleString()}`}
          totalLabel={t('transfers.transfers')}
          expanded={statusExpanded}
          onToggle={() => setStatusExpanded((prev) => !prev)}
          chartRef={statusChartRef}
          hoveredSlice={hoveredStatusSlice}
          onHoverSlice={setHoveredStatusSlice}
          highlightKey={highlightedStatus}
          onHighlightChange={setHighlightedStatus}
          lockedKey={lockedStatus}
          onLockChange={setLockedStatus}
        />

        <PieCard
          title={t('transfers.transfersByType')}
          iconColor="text-green-600"
          slices={typeSlices}
          totalValue={`${stats.total_transfers.toLocaleString()}`}
          totalLabel={t('transfers.transfers')}
          expanded={typeExpanded}
          onToggle={() => setTypeExpanded((prev) => !prev)}
          chartRef={typeChartRef}
          hoveredSlice={hoveredTypeSlice}
          onHoverSlice={setHoveredTypeSlice}
          highlightKey={highlightedType}
          onHighlightChange={setHighlightedType}
          lockedKey={lockedType}
          onLockChange={setLockedType}
        />

        <PendingTransfersCard
          transfers={pendingTransfers}
          expanded={pendingExpanded}
          onToggle={() => setPendingExpanded((prev) => !prev)}
          t={t}
          isRTL={isRTL}
        />
      </div>
    </section>
  );
}

function SummaryCard({ icon, title, primary, secondary, highlight }: { 
  icon: React.ReactNode; 
  title: string; 
  primary: string; 
  secondary: string; 
  highlight?: boolean; 
}) {
  return (
    <div className={`bg-white rounded-xl p-5 border ${highlight ? 'border-amber-300 shadow-sm' : 'border-gray-200'} hover:shadow-lg transition`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${highlight ? 'bg-amber-100' : 'bg-blue-100'}`}>{icon}</div>
      </div>
      <p className="text-sm text-gray-600 font-medium mb-1">{title}</p>
      <div className={`text-3xl font-bold ${highlight ? 'text-amber-600' : 'text-gray-900'}`}>{primary}</div>
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

  const { t } = useTranslation();
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
          <div className="text-center py-8 text-gray-500 text-sm">{t('transfers.noTransfersAvailable')}</div>
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

function PendingTransfersCard({ 
  transfers, 
  expanded, 
  onToggle, 
  t, 
  isRTL 
}: { 
  transfers: PendingTransfer[]; 
  expanded: boolean; 
  onToggle: () => void; 
  t: any;
  isRTL: boolean;
}) {
  const handleTransferClick = (transferId: string) => {
    // Scroll to transfers section and highlight the transfer
    // This could be enhanced to open a modal or navigate to the transfer
    const transfersSection = document.getElementById('transfers-section');
    if (transfersSection) {
      transfersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <button
        onClick={onToggle}
        className="w-full p-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <span className="text-lg font-semibold text-gray-900">{t('transfers.pendingTransfers')}</span>
          {transfers.length > 0 && (
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
              {transfers.length}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
      </button>

      <div className="p-4">
        {transfers.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">{t('transfers.noPendingTransfers')}</div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {(expanded ? transfers : transfers.slice(0, 3)).map((transfer) => (
              <button
                key={transfer.id}
                onClick={() => handleTransferClick(transfer.id)}
                className={`w-full text-left p-3 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all cursor-pointer ${isRTL ? 'text-right' : ''}`}
              >
                <div className={`flex items-start justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-900 mb-1">{transfer.employee_name}</div>
                    <div className="text-xs text-gray-600">
                      {formatShares(transfer.shares_transferred)} {t('dashboard.shares')} • {transfer.grant_number}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDate(transfer.transfer_date)} • {transfer.days_until_due >= 0 
                        ? `${transfer.days_until_due} ${t('transfers.daysRemaining')}`
                        : `${Math.abs(transfer.days_until_due)} ${t('transfers.overdue')}`}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-gray-900 ml-4">
                    {transfer.transfer_number}
                  </div>
                </div>
              </button>
            ))}
            {!expanded && transfers.length > 3 && (
              <div className="text-center">
                <button
                  onClick={onToggle}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  {t('transfers.showAllPending')} →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

