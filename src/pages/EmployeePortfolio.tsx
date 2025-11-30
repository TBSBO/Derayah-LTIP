// @ts-nocheck
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Briefcase, DollarSign, TrendingUp, Package, Calendar, CheckCircle, Clock, Plus, X } from 'lucide-react';
import { formatDate, formatDateTime } from '../lib/dateUtils';
import PortfolioValuation from '../components/PortfolioValuation';

interface PortfolioData {
  id: string;
  portfolio_type: 'employee_vested';
  total_shares: number;
  available_shares: number;
  locked_shares: number;
  portfolio_number: string;
  created_at: string;
  updated_at: string;
}

interface CashPortfolioData {
  id: string;
  portfolio_type: 'employee_cash';
  cash_balance: number;
  currency: string;
  portfolio_number: string;
}

interface GrantData {
  id: string;
  grant_number: string;
  total_shares: number;
  vested_shares: number;
  remaining_unvested_shares: number;
  grant_date: string;
  status: string;
  incentive_plans?: {
    plan_name_en: string;
    plan_code: string;
    plan_type: string;
    exercise_price?: number;
  };
}

interface TransferData {
  id: string;
  transfer_number: string;
  shares_transferred: number;
  transfer_date: string;
  status: string;
  transfer_type: string;
  grants?: {
    grant_number: string;
    incentive_plans?: {
      plan_name_en: string;
      plan_code: string;
    };
  };
}

interface CashTransaction {
  id: string;
  amount: number;
  transaction_type: 'deposit' | 'withdrawal' | 'exercise' | 'refund';
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'processed';
  created_at: string;
}

interface ExerciseOrder {
  id: string;
  order_number: string;
  shares_to_exercise: number;
  exercise_price_per_share: number;
  total_exercise_cost: number;
  status: 'pending' | 'approved' | 'rejected' | 'processed' | 'cancelled';
  created_at: string;
  grants?: {
    grant_number: string;
  };
  vesting_events?: {
    id: string;
  };
}

type TabType = 'grants' | 'cash' | 'transfers' | 'exercise';

interface DonutChartData {
  label: string;
  value: number;
  units: number;
  color: string;
}

interface DonutChartProps {
  data: DonutChartData[];
  totalValue: number;
  totalUnits: number;
  currency: string;
  availableValue?: number;
  availableUnits?: number;
}

function DonutChart({ data, totalValue, totalUnits, currency, availableValue, availableUnits }: DonutChartProps) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const size = 200;
  const radius = 80;
  const innerRadius = 50;
  const center = size / 2;

  // Format number with K/M abbreviations (absolute numbers, no decimals)
  const formatNumber = (num: number): string => {
    const absNum = Math.abs(Math.round(num));
    if (absNum >= 1000000) {
      return Math.round(absNum / 1000000) + 'M';
    } else if (absNum >= 1000) {
      return Math.round(absNum / 1000) + 'K';
    } else {
      return absNum.toString();
    }
  };

  // Filter out zero values for display but keep for calculations
  const filteredData = data.filter(d => d.value > 0);
  const total = filteredData.reduce((sum, d) => sum + d.value, 0) || totalValue;
  const strokeWidth = 12; // Border width

  // If no data, show empty state
  if (filteredData.length === 0 || total === 0) {
    return (
      <div className="flex items-center gap-6">
        <div className="flex-shrink-0">
          <svg viewBox={`0 0 ${size} ${size}`} className="w-48 h-48">
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={center}
              cy={center}
              r={innerRadius}
              fill="white"
            />
            <text
              x={center - 15}
              y={center + 3}
              textAnchor={isRTL ? "start" : "end"}
              className="fill-gray-400"
              style={{ fontSize: '10px', fontWeight: 'normal' }}
            >
              {currency}
            </text>
            <text
              x={center}
              y={center + 8}
              textAnchor="middle"
              className="font-bold fill-gray-900"
              style={{ fontSize: '24px' }}
            >
              {formatNumber(availableValue !== undefined ? availableValue : 0)}
            </text>
          </svg>
        </div>
        <div className="flex-1 space-y-3">
          {data.map((item, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm font-medium text-gray-700">{item.label}:</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  <span className="text-xs text-gray-400 font-normal">{currency}</span> 0.00
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  let currentAngle = -90; // Start from top

  const segments = filteredData.map((item) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    // If this is the only segment, make it a full circle
    const angle = filteredData.length === 1 ? 360 : (percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    // Create arc path for stroke-only donut segment
    let pathData;
    if (angle >= 360) {
      // Full circle - draw complete arc
      pathData = `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center - 0.001} ${center - radius}`;
    } else {
      pathData = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
    }

    return {
      ...item,
      pathData,
      percentage,
      angle
    };
  });

  return (
    <div className="flex items-center gap-6">
      <div className="flex-shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-48 h-48">
          {/* Background circle (light gray) */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          {/* Colored segments as strokes only */}
          {segments.map((segment, index) => (
            <path
              key={index}
              d={segment.pathData}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          ))}
          {/* Inner white circle to create donut effect */}
          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            fill="white"
          />
          <text
            x={center - 15}
            y={center + 3}
            textAnchor={isRTL ? "start" : "end"}
            className="fill-gray-400"
            style={{ fontSize: '10px', fontWeight: 'normal' }}
          >
            {currency}
          </text>
          <text
            x={center}
            y={center + 8}
            textAnchor="middle"
            className="font-bold fill-gray-900"
            style={{ fontSize: '24px' }}
          >
            {formatNumber(availableValue !== undefined ? availableValue : totalValue)}
          </text>
          {(availableUnits !== undefined ? availableUnits : totalUnits) > 0 && (
            <text
              x={center}
              y={center + 30}
              textAnchor="middle"
              className="fill-gray-600"
              style={{ fontSize: '12px' }}
            >
              {formatNumber(availableUnits !== undefined ? availableUnits : totalUnits)} SHARES
            </text>
          )}
        </svg>
      </div>
      <div className="flex-1 space-y-3">
        {data.map((item, index) => {
          const displayValue = item.value;
          const displayUnits = item.units;
          
          return (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm font-medium text-gray-700">{item.label}:</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  <span className="text-xs text-gray-400 font-normal">{currency}</span> {displayValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                    {displayUnits > 0 && (
                      <div className="text-xs text-gray-500">
                        {Math.abs(Math.round(displayUnits)).toLocaleString()} shares
                      </div>
                    )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EmployeePortfolio() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [cashPortfolio, setCashPortfolio] = useState<CashPortfolioData | null>(null);
  const [grants, setGrants] = useState<GrantData[]>([]);
  const [transfers, setTransfers] = useState<TransferData[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [exerciseOrders, setExerciseOrders] = useState<ExerciseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [sharePrice, setSharePrice] = useState<number>(30);
  const [tadawulSymbol, setTadawulSymbol] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('grants');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDescription, setDepositDescription] = useState('');
  const [processingDeposit, setProcessingDeposit] = useState(false);
  const [calculatedPortfolioData, setCalculatedPortfolioData] = useState({
    totalShares: 0,
    availableShares: 0,
    inProgressShares: 0,
    restrictedShares: 0,
    unavailableShares: 0
  });

  useEffect(() => {
    loadPortfolioData();
  }, []);

  const loadPortfolioData = async () => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/employee/login';
        return;
      }

      // Get employee data
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select('id, company_id, first_name_en, last_name_en')
        .eq('user_id', user.id)
        .maybeSingle();

      if (employeeError || !employee) {
        console.error('Error loading employee:', employeeError);
        setLoading(false);
        return;
      }

      // Load all data in parallel
      const [companyRes, portfolioRes, cashPortfolioRes, grantsRes, vestingEventsRes, exerciseOrdersRes] = await Promise.all([
        supabase
          .from('companies')
          .select('company_name_en, tadawul_symbol, current_fmv, fmv_source')
          .eq('id', employee.company_id)
          .maybeSingle(),
        supabase
          .from('portfolios')
          .select('*')
          .eq('company_id', employee.company_id)
          .eq('employee_id', employee.id)
          .eq('portfolio_type', 'employee_vested')
          .maybeSingle(),
        supabase
          .from('portfolios')
          .select('*')
          .eq('company_id', employee.company_id)
          .eq('employee_id', employee.id)
          .eq('portfolio_type', 'employee_cash')
          .maybeSingle(),
        supabase
          .from('grants')
          .select(`
            id,
            grant_number,
            total_shares,
            vested_shares,
            remaining_unvested_shares,
            grant_date,
            status,
            incentive_plans:plan_id (
              plan_name_en,
              plan_code,
              plan_type,
              exercise_price
            )
          `)
          .eq('employee_id', employee.id)
          .eq('status', 'active')
          .order('grant_date', { ascending: false }),
        supabase
          .from('vesting_events')
          .select('id, shares_to_vest, status, grant_id, vesting_date')
          .eq('employee_id', employee.id),
        supabase
          .from('exercise_orders')
          .select('id, vesting_event_id, status')
          .eq('employee_id', employee.id)
          .in('status', ['pending', 'approved'])
      ]);

      if (companyRes.data) {
        setCompanyInfo(companyRes.data);
        setTadawulSymbol(companyRes.data.tadawul_symbol || '');
        const fmv = companyRes.data.current_fmv;
        setSharePrice(fmv ? Number(fmv) : 30);
      }

      if (portfolioRes.data) {
        setPortfolio(portfolioRes.data);
        
        // Load transfers
        const { data: transfersData, error: transfersError } = await supabase
          .from('share_transfers')
          .select(`
            id,
            transfer_number,
            shares_transferred,
            transfer_date,
            status,
            transfer_type,
            grants:grant_id (
              grant_number,
              incentive_plans:plan_id (
                plan_name_en,
                plan_code
              )
            )
          `)
          .eq('to_portfolio_id', portfolioRes.data.id)
          .order('transfer_date', { ascending: false })
          .limit(50);
        
        if (!transfersError && transfersData) {
          setTransfers(transfersData as TransferData[]);
        }
      }

      if (cashPortfolioRes.data) {
        setCashPortfolio(cashPortfolioRes.data);
      }

      if (grantsRes.data) {
        setGrants(grantsRes.data as GrantData[]);
      }

      // Calculate portfolio breakdown based on vesting events (same as EmployeeOverview)
      const vestingEvents = vestingEventsRes.data || [];
      const exerciseOrdersForCalculation = exerciseOrdersRes.data || [];

      // Create a set of vesting event IDs that have pending/approved exercise orders
      const vestingEventsWithPendingExercise = new Set(
        exerciseOrdersForCalculation
          .filter((order: any) => order.vesting_event_id)
          .map((order: any) => order.vesting_event_id)
      );

      let totalShares = 0; // Excludes transferred and exercised
      let availableShares = 0; // Only vested status
      let inProgressShares = 0; // Only due events
      let restrictedShares = 0; // Vested with pending exercise OR pending_exercise status
      let unavailableShares = 0; // All pending events
      let vestedWithPendingExercise = 0; // Track vested events with pending exercise separately

      vestingEvents.forEach((event: any) => {
        const shares = Number(event.shares_to_vest || 0);
        const status = event.status;

        // Total Potential Value and Number of Shares: exclude transferred and exercised
        if (status !== 'transferred' && status !== 'exercised') {
          totalShares += shares;
        }

        // Available: only events with vested status
        if (status === 'vested') {
          availableShares += shares;
        }

        // In Progress: only due events
        if (status === 'due') {
          inProgressShares += shares;
        }

        // Available with restriction: 
        // 1. Vested events with pending/approved exercise orders
        // 2. Events with pending_exercise status
        if (status === 'pending_exercise') {
          restrictedShares += shares;
        } else if (status === 'vested' && vestingEventsWithPendingExercise.has(event.id)) {
          restrictedShares += shares;
          vestedWithPendingExercise += shares;
        }

        // Unavailable: all pending events (but not pending_exercise)
        if (status === 'pending') {
          unavailableShares += shares;
        }
      });

      // Adjust available to account for restricted (only vested events with pending exercise)
      availableShares = Math.max(0, availableShares - vestedWithPendingExercise);

      setCalculatedPortfolioData({
        totalShares: totalShares,
        availableShares: availableShares,
        inProgressShares: inProgressShares,
        restrictedShares: restrictedShares,
        unavailableShares: unavailableShares
      });

      // Load cash transactions
      const { data: cashTransfers, error: cashTransfersError } = await supabase
        .from('cash_transfers')
        .select('id, amount, transfer_type, status, description, created_at, exercise_order_id, exercise_orders(order_number)')
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!cashTransfersError && cashTransfers) {
        const transferTransactions: CashTransaction[] = (cashTransfers || []).map((transfer: any) => {
          let type: 'deposit' | 'withdrawal' | 'exercise' | 'refund' = 'deposit';
          let amount = transfer.amount;
          let description = transfer.description || '';

          if (transfer.transfer_type === 'employee_deposit') {
            type = 'deposit';
            description = `Deposit: ${description}`;
          } else if (transfer.transfer_type === 'exercise_settlement') {
            type = 'exercise';
            amount = -amount;
            description = `Exercise Settlement: ${transfer.exercise_orders?.order_number || 'N/A'}`;
          }

          return {
            id: transfer.id,
            amount: amount,
            transaction_type: type,
            description: description,
            status: transfer.status || 'pending',
            created_at: transfer.created_at
          };
        });
        setCashTransactions(transferTransactions);
      }

      // Load exercise orders
      const { data: exerciseOrdersData, error: exerciseOrdersError } = await supabase
        .from('exercise_orders')
        .select(`
          id,
          order_number,
          shares_to_exercise,
          exercise_price_per_share,
          total_exercise_cost,
          status,
          created_at,
          grants:grant_id (
            grant_number
          ),
          vesting_events:vesting_event_id (
            id
          )
        `)
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!exerciseOrdersError && exerciseOrdersData) {
        setExerciseOrders(exerciseOrdersData as ExerciseOrder[]);
      }

    } catch (error) {
      console.error('Error loading portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      alert('Please enter a valid deposit amount');
      return;
    }

    if (!cashPortfolio) {
      alert('Cash portfolio not found');
      return;
    }

    setProcessingDeposit(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data: employee } = await supabase
        .from('employees')
        .select('id, company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!employee) throw new Error('Employee not found');

      const amount = parseFloat(depositAmount);

      const transferNumber = `CT-${employee.company_id}-${Date.now()}`;
      const { error } = await supabase
        .from('cash_transfers')
        .insert({
          transfer_number: transferNumber,
          company_id: employee.company_id,
          transfer_type: 'employee_deposit',
          to_portfolio_id: cashPortfolio.id,
          employee_id: employee.id,
          amount: amount,
          currency: 'SAR',
          status: 'pending',
          description: depositDescription || `Employee deposit request`,
          created_by: user.id
        });

      if (error) throw error;

      alert(`Deposit request submitted for SAR ${amount.toFixed(2)}. It will be processed after approval.`);
      setShowDepositModal(false);
      setDepositAmount('');
      setDepositDescription('');
      await loadPortfolioData();
    } catch (error) {
      console.error('Error processing deposit:', error);
      alert('Failed to submit deposit request: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setProcessingDeposit(false);
    }
  };

  // Calculate totals - use calculated values from vesting events (same as overview page)
  const totalShares = calculatedPortfolioData.totalShares;
  const availableShares = calculatedPortfolioData.availableShares;
  const inProgressShares = calculatedPortfolioData.inProgressShares;
  const restrictedShares = calculatedPortfolioData.restrictedShares;
  const unavailableShares = calculatedPortfolioData.unavailableShares;
  const totalVestedFromGrants = grants.reduce((sum, grant) => sum + Number(grant.vested_shares || 0), 0);
  const totalUnvestedFromGrants = grants.reduce((sum, grant) => sum + Number(grant.remaining_unvested_shares || 0), 0);

  // Calculate portfolio value
  const portfolioValue = totalShares * sharePrice;
  const cashBalance = cashPortfolio?.cash_balance || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-500 mt-4">{t('employeePortfolio.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Deposit Button */}
      <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('employeePortfolio.title')}</h1>
        <p className="text-gray-600 mt-1">
          {t('employeePortfolio.description')}
        </p>
        </div>
        {cashPortfolio && (
          <button
            onClick={() => setShowDepositModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('employeePortfolio.depositCash', 'Deposit Cash')}
          </button>
        )}
      </div>

      {/* Shares and Cash Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shares Breakdown Chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('common.portfolio')}</h2>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DonutChart
                data={[
                  { label: t('employeeOverview.available'), value: availableShares * sharePrice, units: availableShares, color: '#10b981' },
                  { label: t('employeeOverview.inProgress'), value: inProgressShares * sharePrice, units: inProgressShares, color: '#3b82f6' },
                  { label: t('employeeOverview.availableWithRestrictions'), value: restrictedShares * sharePrice, units: restrictedShares, color: '#f59e0b' },
                  { label: t('employeeOverview.unavailable'), value: unavailableShares * sharePrice, units: unavailableShares, color: '#6b7280' }
                ]}
                totalValue={portfolioValue}
                totalUnits={totalShares}
                currency="SAR"
                availableValue={availableShares * sharePrice}
                availableUnits={availableShares}
              />
            </div>
          </div>
        </div>

        {/* Cash Breakdown Chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('employeePortfolio.cashBalance', 'Cash Balance')}</h2>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DonutChart
                data={[
                  { 
                    label: 'Available', 
                    value: cashBalance, 
                    units: 0, 
                    color: '#10b981' 
                  },
                  { 
                    label: 'Pending Deposits', 
                    value: cashTransactions
                      .filter(t => t.transaction_type === 'deposit' && t.status === 'pending')
                      .reduce((sum, t) => sum + t.amount, 0), 
                    units: 0, 
                    color: '#3b82f6' 
                  },
                  { 
                    label: 'Pending Withdrawals', 
                    value: Math.abs(cashTransactions
                      .filter(t => t.transaction_type === 'withdrawal' && t.status === 'pending')
                      .reduce((sum, t) => sum + t.amount, 0)), 
                    units: 0, 
                    color: '#f59e0b' 
                  },
                  { 
                    label: 'Reserved', 
                    value: exerciseOrders
                      .filter(o => o.status === 'approved' || o.status === 'pending')
                      .reduce((sum, o) => sum + o.total_exercise_cost, 0), 
                    units: 0, 
                    color: '#6b7280' 
                  }
                ]}
                totalValue={cashBalance + cashTransactions
                  .filter(t => t.transaction_type === 'deposit' && t.status === 'pending')
                  .reduce((sum, t) => sum + t.amount, 0)}
                totalUnits={0}
                currency="SAR"
                availableValue={cashBalance}
                availableUnits={0}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Summary Cards - Now 5 cards including cash balance */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Shares */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('employeePortfolio.totalShares')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {totalShares.toLocaleString()}
              </p>
            </div>
            <Package className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        {/* Available Shares */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('employeePortfolio.availableShares')}</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {availableShares.toLocaleString()}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>

        {/* Locked Shares */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('employeePortfolio.lockedShares')}</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">
                {restrictedShares.toLocaleString()}
              </p>
            </div>
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
        </div>

        {/* Portfolio Value */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('employeePortfolio.portfolioValue')}</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">
                SAR {portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                @ SAR {sharePrice.toFixed(2)} {t('employeePortfolio.perShare')}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-purple-600" />
          </div>
        </div>

        {/* Cash Balance */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Available Balance</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                SAR {cashBalance.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {cashPortfolio?.currency || 'SAR'}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-green-700" />
          </div>
        </div>
      </div>

      {/* Portfolio Details and Valuation - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Portfolio Details */}
      {portfolio ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Briefcase className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">{t('employeePortfolio.portfolioDetails')}</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">{t('employeePortfolio.portfolioNumber')}</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {portfolio.portfolio_number}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('employeePortfolio.company')}</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {companyInfo?.company_name_en || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('employeePortfolio.createdDate')}</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {formatDate(portfolio.created_at)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('employeePortfolio.lastUpdated')}</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {formatDate(portfolio.updated_at)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-yellow-600" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-900">{t('employeePortfolio.noPortfolioFound')}</h3>
              <p className="text-sm text-yellow-700 mt-1">
                {t('employeePortfolio.noPortfolioMessage')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Valuation Chart */}
      {portfolio && tadawulSymbol && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{t('employeePortfolio.portfolioValuation')}</h2>
          <PortfolioValuation
            tadawulSymbol={tadawulSymbol}
            vestedShares={totalVestedFromGrants}
            unvestedShares={totalUnvestedFromGrants}
          />
        </div>
      )}
      </div>

      {/* Grants Breakdown with Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-3 mb-4">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">{t('employeePortfolio.grantsBreakdown')}</h2>
          </div>
          
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('grants')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'grants'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Grants Breakdown
            </button>
            <button
              onClick={() => setActiveTab('cash')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'cash'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Cash Transactions
            </button>
            <button
              onClick={() => setActiveTab('transfers')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'transfers'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Share Transfers
            </button>
            <button
              onClick={() => setActiveTab('exercise')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'exercise'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Exercise Orders
            </button>
          </nav>
        </div>

        {/* Tab Content */}
          <div className="overflow-x-auto">
          {activeTab === 'grants' && grants.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.grantNumber')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.plan')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.totalShares')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.vested')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.unvested')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.grantDate')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {grants.map((grant) => (
                  <tr key={grant.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {grant.grant_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div className="font-medium">
                          {grant.incentive_plans?.plan_name_en || 'N/A'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {grant.incentive_plans?.plan_code || ''} ({grant.incentive_plans?.plan_type || ''})
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {Number(grant.total_shares || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                      {Number(grant.vested_shares || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {Number(grant.remaining_unvested_shares || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(grant.grant_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'grants' && grants.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No grants found</p>
        </div>
      )}

          {activeTab === 'cash' && (
            <>
              {cashTransactions.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {cashTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDateTime(transaction.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            transaction.transaction_type === 'deposit'
                              ? 'bg-green-100 text-green-800'
                              : transaction.transaction_type === 'exercise'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {transaction.transaction_type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {transaction.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            transaction.status === 'processed'
                              ? 'bg-green-100 text-green-800'
                              : transaction.status === 'approved'
                              ? 'bg-blue-100 text-blue-800'
                              : transaction.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {transaction.status.toUpperCase()}
                          </span>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                          transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {transaction.amount >= 0 ? '+' : ''}SAR {Math.abs(transaction.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No cash transactions yet</h3>
                  <p className="text-gray-500">Your cash transaction history will appear here</p>
        </div>
              )}
            </>
          )}
        
          {activeTab === 'transfers' && (
            <>
        {transfers.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.transferNumber')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.grant')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.shares')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.date')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeePortfolio.status')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {transfer.transfer_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transfer.grants?.grant_number || 'N/A'}
                      {transfer.grants?.incentive_plans?.plan_name_en && (
                        <div className="text-xs text-gray-500">
                          {transfer.grants.incentive_plans.plan_name_en}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {Number(transfer.shares_transferred || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(transfer.transfer_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        transfer.status === 'completed' 
                          ? 'bg-green-100 text-green-800'
                          : transfer.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {transfer.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>{t('employeePortfolio.noTransactions')}</p>
            <p className="text-sm mt-1">{t('employeePortfolio.noTransactionsMessage')}</p>
          </div>
        )}
            </>
          )}

          {activeTab === 'exercise' && (
            <>
              {exerciseOrders.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Grant
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Shares
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Exercise Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Cost
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {exerciseOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {order.order_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {order.grants?.grant_number || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {Number(order.shares_to_exercise || 0).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          SAR {Number(order.exercise_price_per_share || 0).toFixed(4)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          SAR {Number(order.total_exercise_cost || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDateTime(order.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            order.status === 'processed' 
                              ? 'bg-green-100 text-green-800'
                              : order.status === 'approved'
                              ? 'bg-blue-100 text-blue-800'
                              : order.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : order.status === 'cancelled'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No exercise orders found</p>
                  <p className="text-sm mt-1">Your exercise order history will appear here</p>
      </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Deposit Cash</h2>
              <button
                onClick={() => {
                  setShowDepositModal(false);
                  setDepositAmount('');
                  setDepositDescription('');
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (SAR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={depositDescription}
                  onChange={(e) => setDepositDescription(e.target.value)}
                  placeholder="e.g., Bank transfer, Wire transfer"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Current Balance</div>
                <div className="text-2xl font-bold text-gray-900">
                  SAR {cashPortfolio?.cash_balance?.toFixed(2) || '0.00'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Note: Deposit will be pending until approved by company
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowDepositModal(false);
                    setDepositAmount('');
                    setDepositDescription('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeposit}
                  disabled={processingDeposit || !depositAmount || parseFloat(depositAmount) <= 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingDeposit ? 'Processing...' : 'Deposit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
