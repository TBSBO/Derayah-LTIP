// @ts-nocheck
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, CheckCircle, TrendingUp, Award, FileText, ChevronRight, X } from 'lucide-react';
import { formatDate, formatDaysRemaining, formatVestingEventId } from '../lib/dateUtils';
import { getEmployeeVestingEvents, type VestingEventWithDetails } from '../lib/vestingEventsService';

interface DonutChartData {
  label: string;
  value: number;
  color: string;
}

interface Task {
  id: string;
  title: string;
  date: string;
  type: 'grant' | 'document' | 'exercise';
  status: string;
  documentId?: string;
  vestingEventId?: string;
  grantId?: string;
  exerciseCost?: number;
}

export default function EmployeeOverview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [portfolioData, setPortfolioData] = useState<any>(null);
  const [employeeName, setEmployeeName] = useState('');
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [sharePrice, setSharePrice] = useState<number>(30);
  const [tadawulSymbol, setTadawulSymbol] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<'share' | 'plans' | 'grants'>('share');
  const [selectedGrant, setSelectedGrant] = useState<any>(null);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [selectedVestingEvent, setSelectedVestingEvent] = useState<VestingEventWithDetails | null>(null);
  const [showVestingEventModal, setShowVestingEventModal] = useState(false);
  const [vestingEvents, setVestingEvents] = useState<any[]>([]);
  const [exerciseOrders, setExerciseOrders] = useState<any[]>([]);

  const loadOverviewData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get employee data
      const { data: employee } = await supabase
        .from('employees')
        .select('id, company_id, first_name_en, last_name_en, user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!employee) return;

      setEmployeeName([employee.first_name_en, employee.last_name_en].filter(Boolean).join(' ') || employee.user_id);

      // Get last login from auth metadata
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.last_sign_in_at) {
        setLastLogin(session.user.last_sign_in_at);
      }

      // Load vesting events, grants, exercise orders, and company data
      const [vestingEventsRes, grantsRes, exerciseOrdersRes, companyRes] = await Promise.all([
        supabase
          .from('vesting_events')
          .select('id, shares_to_vest, status, grant_id, vesting_date')
          .eq('employee_id', employee.id),
        supabase
          .from('grants')
          .select(`
            *,
            plan_id,
            generated_documents (
              id,
              status,
              document_type
            )
          `)
          .eq('employee_id', employee.id)
          .in('status', ['active', 'pending_signature']),
        supabase
          .from('exercise_orders')
          .select('id, vesting_event_id, status')
          .eq('employee_id', employee.id)
          .in('status', ['pending', 'approved']),
        supabase
          .from('companies')
          .select('tadawul_symbol, current_fmv')
          .eq('id', employee.company_id)
          .maybeSingle()
      ]);

      const vestingEventsData = vestingEventsRes.data || [];
      let grants = grantsRes.data || [];
      const exerciseOrdersData = exerciseOrdersRes.data || [];
      const company = companyRes.data;

      // Store vesting events and exercise orders in state for use in Plans/Grants calculations
      setVestingEvents(vestingEventsData);
      setExerciseOrders(exerciseOrdersData);

      // Fetch incentive_plans separately since RLS policies block the join for employees
      if (grants.length > 0) {
        const planIds = [...new Set(grants.map((g: any) => g.plan_id).filter(Boolean))];
        
        if (planIds.length > 0) {
          const { data: plansData } = await supabase
            .from('incentive_plans')
            .select('id, plan_name_en, plan_type, exercise_price')
            .in('id', planIds);
          
          // Create a map for quick lookup
          const plansMap = new Map((plansData || []).map((p: any) => [p.id, p]));
          
          // Attach plan data to each grant
          grants = grants.map((grant: any) => {
            if (grant.plan_id && plansMap.has(grant.plan_id)) {
              return {
                ...grant,
                incentive_plans: plansMap.get(grant.plan_id)
              };
            }
            return grant;
          });
        }
      }

      // Debug logging to check if incentive_plans data is being fetched
      if (grants.length > 0) {
        console.log('Grants loaded:', grants.length);
        console.log('First grant:', grants[0]);
        console.log('First grant incentive_plans:', grants[0]?.incentive_plans);
      }

      if (company?.current_fmv) {
        setSharePrice(Number(company.current_fmv));
      }
      if (company?.tadawul_symbol) {
        setTadawulSymbol(company.tadawul_symbol);
      }

      // Create a set of vesting event IDs that have pending/approved exercise orders
      const vestingEventsWithPendingExercise = new Set(
        exerciseOrdersData
          .filter((order: any) => order.vesting_event_id)
          .map((order: any) => order.vesting_event_id)
      );

      // Calculate portfolio breakdown based on vesting events
      let totalShares = 0; // Excludes transferred and exercised
      let availableShares = 0; // Only vested status
      let inProgressShares = 0; // Only due events
      let restrictedShares = 0; // Vested with pending exercise OR pending_exercise status
      let unavailableShares = 0; // All pending events
      let vestedWithPendingExercise = 0; // Track vested events with pending exercise separately

      vestingEventsData.forEach((event: any) => {
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
          vestedWithPendingExercise += shares; // Track this separately
        }

        // Unavailable: all pending events (but not pending_exercise, which is handled above)
        if (status === 'pending') {
          unavailableShares += shares;
        }
      });

      // Adjust available to account for restricted (only vested events with pending exercise)
      // Don't subtract pending_exercise events because they're not in availableShares
      availableShares = Math.max(0, availableShares - vestedWithPendingExercise);

      setPortfolioData({
        totalShares,
        availableShares,
        inProgressShares,
        restrictedShares,
        unavailableShares,
        grants
      });

      // Load tasks (pending grants, documents, and pending_exercise events)
      const taskList: Task[] = [];
      
      // 1. Pending signature grants
      grants.forEach((grant: any) => {
        if (grant.status === 'pending_signature') {
          taskList.push({
            id: grant.id,
            title: `Accept Grant Agreement: ${grant.grant_number}`,
            date: grant.grant_date || new Date().toISOString(),
            type: 'grant',
            status: 'pending_signature',
            grantId: grant.id
          });
        }
      });

      // 2. Pending signature contracts (generated_documents)
      // Only show documents where grant has NOT been accepted
      const { data: pendingDocuments } = await supabase
        .from('generated_documents')
        .select(`
          id, 
          document_name, 
          document_type, 
          grant_id, 
          status, 
          generated_at,
          grants!inner (
            id,
            employee_acceptance_at
          )
        `)
        .eq('employee_id', employee.id)
        .eq('status', 'pending_signature')
        .is('grants.employee_acceptance_at', null)  // Only show if grant NOT accepted
        .order('generated_at', { ascending: false });

      if (pendingDocuments) {
        pendingDocuments.forEach((doc: any) => {
          taskList.push({
            id: doc.id,
            title: `Sign Contract: ${doc.document_name || doc.document_type || 'Grant Agreement'}`,
            date: doc.generated_at || new Date().toISOString(),
            type: 'document',
            status: doc.status || 'pending_signature',
            documentId: doc.id,
            grantId: doc.grant_id
          });
        });
      }

      // 3. Vesting events with pending_exercise status
      const pendingExerciseEvents = vestingEventsData.filter((event: any) => 
        event.status === 'pending_exercise'
      );

      if (pendingExerciseEvents.length > 0) {
        // Get grant details with exercise price for these events
        const eventGrantIds = [...new Set(pendingExerciseEvents.map((e: any) => e.grant_id).filter(Boolean))];
        const { data: eventGrants } = await supabase
          .from('grants')
          .select(`
            id, 
            grant_number,
            exercise_price,
            incentive_plans:plan_id (
              exercise_price
            )
          `)
          .in('id', eventGrantIds);

        const grantMap = new Map((eventGrants || []).map((g: any) => [g.id, g]));

        pendingExerciseEvents.forEach((event: any) => {
          const grant = grantMap.get(event.grant_id);
          const shares = Number(event.shares_to_vest || 0);
          // Use grant-level exercise_price if available, otherwise fallback to plan-level
          const exercisePrice = grant?.exercise_price ?? grant?.incentive_plans?.exercise_price ?? 0;
          const totalExerciseCost = shares * exercisePrice;
          
          taskList.push({
            id: event.id,
            title: `${t('employeeOverview.exerciseOptions')}: ${shares.toLocaleString()} ${t('employeeOverview.shares')}${grant ? ` (${grant.grant_number})` : ''}`,
            date: event.vesting_date || new Date().toISOString(),
            type: 'exercise',
            status: 'pending_exercise',
            vestingEventId: event.id,
            grantId: event.grant_id,
            exerciseCost: totalExerciseCost
          });
        });
      }

      // Sort tasks by date
      taskList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setTasks(taskList.slice(0, 10)); // Show top 10 tasks

    } catch (error) {
      console.error('Error loading overview data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  // Calculate total potential value
  const totalPotentialValue = useMemo(() => {
    if (!portfolioData) return 0;
    return portfolioData.totalShares * sharePrice;
  }, [portfolioData, sharePrice]);

  // Donut chart data for main overview
  const mainDonutData = useMemo<DonutChartData[]>(() => {
    if (!portfolioData) return [];
    return [
      { label: t('employeeOverview.available'), value: portfolioData.availableShares, color: '#10B981' },
      { label: t('employeeOverview.inProgress'), value: portfolioData.inProgressShares, color: '#3B82F6' },
      { label: t('employeeOverview.availableWithRestrictions'), value: portfolioData.restrictedShares, color: '#F59E0B' },
      { label: t('employeeOverview.unavailable'), value: portfolioData.unavailableShares, color: '#6B7280' }
    ];
  }, [portfolioData]);

  // Helper function to calculate vested/unvested shares for grants
  const calculateGrantShares = useCallback((grantIds: string[]) => {
    if (!vestingEvents.length || !grantIds.length) {
      return {
        totalShares: 0,
        vestedShares: 0,
        unvestedShares: 0
      };
    }

    const grantIdSet = new Set(grantIds);
    let totalShares = 0;
    let vestedShares = 0;
    let unvestedShares = 0;

    vestingEvents
      .filter((event: any) => grantIdSet.has(event.grant_id))
      .forEach((event: any) => {
        const shares = Number(event.shares_to_vest || 0);
        const status = event.status;

        // Total: all shares (including transferred and exercised)
        totalShares += shares;

        // Vested: vested, transferred, exercised
        if (status === 'vested' || status === 'transferred' || status === 'exercised') {
          vestedShares += shares;
        }

        // Unvested: pending, due
        if (status === 'pending' || status === 'due') {
          unvestedShares += shares;
        }
      });

    return {
      totalShares,
      vestedShares,
      unvestedShares
    };
  }, [vestingEvents]);

  // Helper function to calculate shares from vesting events (same logic as Total Potential Value)
  const calculateSharesFromVestingEvents = useCallback((grantIds: string[]) => {
    if (!vestingEvents.length || !grantIds.length) {
      return {
        totalShares: 0,
        availableShares: 0,
        inProgressShares: 0,
        restrictedShares: 0,
        unavailableShares: 0
      };
    }

    const grantIdSet = new Set(grantIds);
    const vestingEventsWithPendingExercise = new Set(
      exerciseOrders
        .filter((order: any) => order.vesting_event_id)
        .map((order: any) => order.vesting_event_id)
    );

    let totalShares = 0;
    let availableShares = 0;
    let inProgressShares = 0;
    let restrictedShares = 0;
    let unavailableShares = 0;
    let vestedWithPendingExercise = 0;

    vestingEvents
      .filter((event: any) => grantIdSet.has(event.grant_id))
      .forEach((event: any) => {
        const shares = Number(event.shares_to_vest || 0);
        const status = event.status;

        // Total: exclude transferred and exercised
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

        // Available with restriction: pending_exercise OR vested with pending exercise
        if (status === 'pending_exercise') {
          restrictedShares += shares;
        } else if (status === 'vested' && vestingEventsWithPendingExercise.has(event.id)) {
          restrictedShares += shares;
          vestedWithPendingExercise += shares;
        }

        // Unavailable: all pending events
        if (status === 'pending') {
          unavailableShares += shares;
        }
      });

    // Adjust available to account for restricted
    availableShares = Math.max(0, availableShares - vestedWithPendingExercise);

    return {
      totalShares,
      availableShares,
      inProgressShares,
      restrictedShares,
      unavailableShares
    };
  }, [vestingEvents, exerciseOrders]);

  // Group grants by plan name for Plans tab
  const plansGrouped = useMemo(() => {
    if (!portfolioData?.grants) return [];
    
    const planMap = new Map<string, {
      planName: string;
      planType: string;
      totalShares: number;
      availableShares: number;
      inProgressShares: number;
      restrictedShares: number;
      unavailableShares: number;
      grants: any[];
    }>();

    portfolioData.grants.forEach((grant: any) => {
      const planName = grant.incentive_plans?.plan_name_en || 'Unnamed Plan';
      const planType = grant.incentive_plans?.plan_type || '';
      
      if (!planMap.has(planName)) {
        planMap.set(planName, {
          planName,
          planType,
          totalShares: 0,
          availableShares: 0,
          inProgressShares: 0,
          restrictedShares: 0,
          unavailableShares: 0,
          grants: []
        });
      }

      const plan = planMap.get(planName)!;
      plan.grants.push(grant);
    });

    // Calculate shares for each plan from vesting events
    planMap.forEach((plan) => {
      const grantIds = plan.grants.map((g: any) => g.id);
      const calculated = calculateSharesFromVestingEvents(grantIds);
      plan.totalShares = calculated.totalShares;
      plan.availableShares = calculated.availableShares;
      plan.inProgressShares = calculated.inProgressShares;
      plan.restrictedShares = calculated.restrictedShares;
      plan.unavailableShares = calculated.unavailableShares;
    });

    return Array.from(planMap.values());
  }, [portfolioData, calculateSharesFromVestingEvents]);

  // Format number with K/M/B abbreviations (shows lower value, e.g., 10.9K instead of 11.0K)
  const formatValue = (num: number): string => {
    const absNum = Math.abs(num);
    if (absNum >= 1000000000) {
      // Use Math.floor to get lower value, then format with 1 decimal
      const value = Math.floor(num / 100000) / 10;
      return value.toFixed(1) + 'B';
    } else if (absNum >= 1000000) {
      // Use Math.floor to get lower value, then format with 1 decimal
      const value = Math.floor(num / 100000) / 10;
      return value.toFixed(1) + 'M';
    } else if (absNum >= 1000) {
      // Use Math.floor to get lower value, then format with 1 decimal
      const value = Math.floor(num / 100) / 10;
      return value.toFixed(1) + 'K';
    } else {
      return Math.floor(num).toString();
    }
  };

  // Small Donut Chart Component for Plans
  const SmallDonutChart = ({ 
    available, 
    total, 
    size = 60, 
    totalValue, 
    color,
    segments
  }: { 
    available: number, 
    total: number, 
    size?: number, 
    totalValue?: number, 
    color?: string,
    segments?: Array<{ value: number; color: string }>
  }) => {
    if (total === 0) {
      return (
        <div className="flex items-center justify-center" style={{ width: size, height: size }}>
          <div className="text-gray-300 text-xs">—</div>
        </div>
      );
    }

    const radius = size / 2 - 4;
    const centerX = size / 2;
    const centerY = size / 2;
    const circumference = 2 * Math.PI * radius;

    // If segments provided, draw multiple segments
    if (segments && segments.length > 0) {
      const filteredSegments = segments.filter(s => s.value > 0);
      let currentAngle = 0; // Start from top (SVG is already rotated -90)
      
      return (
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx={centerX}
              cy={centerY}
              r={radius}
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="6"
            />
            {/* Multiple segments */}
            {filteredSegments.map((segment, index) => {
              const percentage = (segment.value / total) * 100;
              const angle = (percentage / 100) * 360;
              const startAngle = currentAngle;
              const endAngle = currentAngle + angle;
              currentAngle = endAngle;
              
              const startRad = (startAngle * Math.PI) / 180;
              const endRad = (endAngle * Math.PI) / 180;
              
              const x1 = centerX + radius * Math.cos(startRad);
              const y1 = centerY + radius * Math.sin(startRad);
              const x2 = centerX + radius * Math.cos(endRad);
              const y2 = centerY + radius * Math.sin(endRad);
              
              const largeArc = angle > 180 ? 1 : 0;
              
              // Create arc path
              let pathData;
              if (angle >= 360) {
                // Full circle
                pathData = `M ${centerX} ${centerY - radius} A ${radius} ${radius} 0 1 1 ${centerX - 0.001} ${centerY - radius}`;
              } else {
                pathData = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
              }
              
              return (
                <path
                  key={index}
                  d={pathData}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              );
            })}
            {/* Total value text - exactly centered */}
            {totalValue !== undefined && (
              <text
                x={centerX}
                y={centerY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-gray-900 font-semibold"
                style={{ fontSize: '9px' }}
                transform={`rotate(90 ${centerX} ${centerY})`}
              >
                {formatValue(totalValue)}
              </text>
            )}
          </svg>
        </div>
      );
    }

    // Single segment (original behavior)
    const percentage = (available / total) * 100;
    const offset = circumference - (percentage / 100) * circumference;
    const chartColor = color || (percentage > 50 ? '#10B981' : percentage > 25 ? '#F59E0B' : '#3B82F6');

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="6"
          />
          {/* Progress circle */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke={chartColor}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
          {/* Total value text - exactly centered */}
          {totalValue !== undefined && (
            <text
              x={centerX}
              y={centerY}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-gray-900 font-semibold"
              style={{ fontSize: '9px' }}
              transform={`rotate(90 ${centerX} ${centerY})`}
            >
              {formatValue(totalValue)}
            </text>
          )}
        </svg>
      </div>
    );
  };

  // Large Donut Chart Component
  const LargeDonutChart = ({ data, size = 280 }: { data: DonutChartData[], size?: number }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) {
      return (
        <div className="flex items-center justify-center" style={{ width: size, height: size }}>
          <div className="text-gray-400 text-sm">No data</div>
        </div>
      );
    }

    const centerX = size / 2;
    const centerY = size / 2;
    const outerRadius = size / 2 - 6; // Thinner ring, similar to SmallDonutChart style
    const innerRadius = size / 2 - 30; // Inner radius to create donut shape
    let cumulativePercentage = 0;

    const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
      const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
      return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
      };
    };

    const createArcPath = (startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) => {
      const startOuter = polarToCartesian(centerX, centerY, outerRadius, startAngle);
      const endOuter = polarToCartesian(centerX, centerY, outerRadius, endAngle);
      const startInner = polarToCartesian(centerX, centerY, innerRadius, endAngle);
      const endInner = polarToCartesian(centerX, centerY, innerRadius, startAngle);
      
      const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
      
      return [
        `M ${startOuter.x} ${startOuter.y}`, // Move to outer start
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`, // Arc to outer end
        `L ${startInner.x} ${startInner.y}`, // Line to inner end
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${endInner.x} ${endInner.y}`, // Arc to inner start
        'Z' // Close path
      ].join(' ');
    };

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {data.map((item, index) => {
            const percentage = (item.value / total) * 100;
            const startAngle = cumulativePercentage * 3.6;
            const endAngle = (cumulativePercentage + percentage) * 3.6;
            cumulativePercentage += percentage;

            return (
              <path
                key={index}
                d={createArcPath(startAngle, endAngle, innerRadius, outerRadius)}
                fill={item.color}
                stroke="white"
                strokeWidth="2"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold text-gray-900">
            <span className="text-lg text-gray-400 font-normal">SAR</span> {totalPotentialValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-lg text-gray-600 mt-1">
            ({portfolioData?.totalShares.toLocaleString() || 0} shares)
          </div>
        </div>
      </div>
    );
  };

  // Format last login
  const formatLastLogin = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = days[date.getDay()];
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day} at ${time}`;
  };

  // Handle task click
  const handleTaskClick = async (task: Task) => {
    if (task.type === 'document' && task.documentId) {
      // Navigate to documents page with the specific document
      navigate('/employee/documents', { state: { documentId: task.documentId } });
    } else if (task.type === 'exercise' && task.vestingEventId) {
      // Load and show vesting event details modal
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: employee } = await supabase
          .from('employees')
          .select('id, company_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!employee) return;

        // Load the specific vesting event with full details
        const events = await getEmployeeVestingEvents(employee.id, ['pending_exercise']);
        const event = events.find(e => e.id === task.vestingEventId);
        
        if (event) {
          setSelectedVestingEvent(event);
          setShowVestingEventModal(true);
        } else {
          // Fallback: navigate to portfolio if event not found
          navigate('/employee/portfolio', { state: { vestingEventId: task.vestingEventId, action: 'exercise' } });
        }
      } catch (error) {
        console.error('Error loading vesting event:', error);
        // Fallback: navigate to portfolio
        navigate('/employee/portfolio', { state: { vestingEventId: task.vestingEventId, action: 'exercise' } });
      }
    } else if (task.type === 'grant' && task.grantId) {
      // Navigate to vesting page to view grant details
      navigate('/employee/vesting', { state: { grantId: task.grantId } });
    }
  };

  // Get status badge color
  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      due: 'bg-yellow-100 text-yellow-800',
      pending_signature: 'bg-yellow-100 text-yellow-800',
      pending_exercise: 'bg-yellow-100 text-yellow-800',
      vested: 'bg-green-100 text-green-800',
      transferred: 'bg-blue-100 text-blue-800',
      exercised: 'bg-purple-100 text-purple-800',
      forfeited: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  // Format status text for display
  const formatStatusText = (status: string) => {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Handle exercise button click from modal
  const handleExerciseFromModal = () => {
    if (selectedVestingEvent) {
      setShowVestingEventModal(false);
      navigate('/employee/portfolio', { 
        state: { 
          vestingEventId: selectedVestingEvent.id, 
          action: 'exercise' 
        } 
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Portfolio Overview</h1>
        <p className="text-gray-600 mt-2">Reference site about Lorem Ipsum information.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Total Potential Value Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              {/* Large Donut Chart */}
              <LargeDonutChart data={mainDonutData} size={280} />

              {/* Value Breakdown */}
              <div className="flex-1 space-y-3">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">
                    {t('employeeOverview.totalPotentialValue')}
                  </h2>
                  <div className="text-3xl font-bold text-gray-900">
                    <span className="text-lg text-gray-400 font-normal">SAR</span> {totalPotentialValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xl text-gray-600 mt-1">
                    ({portfolioData?.totalShares.toLocaleString() || 0} {t('employeeOverview.shares')})
                  </div>
                </div>

                {/* Breakdown List */}
                <div className="space-y-2 mt-4">
                  {mainDonutData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm text-gray-700">{item.label}:</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          <span className="text-xs text-gray-400 font-normal">SAR</span> {(item.value * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-sm text-gray-600 ml-2">
                          ({item.value.toLocaleString()} shares)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="border-b border-gray-200">
              <div className="flex space-x-1 p-2">
                {[
                  { key: 'share', label: t('employeeOverview.accounts') },
                  { key: 'plans', label: t('employeeOverview.plans') },
                  { key: 'grants', label: t('employeeOverview.grants') }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                      activeTab === tab.key
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'share' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">{t('employeeOverview.shareOwnershipAccount')}</h3>
                  {portfolioData && portfolioData.totalShares > 0 && (
                    <div 
                      className="bg-white rounded-lg p-4 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => {
                        // Create a summary grant object for Share Ownership Account
                        setSelectedGrant({
                          id: 'share-ownership-account',
                          grant_number: t('employeeOverview.shareOwnershipAccount'),
                          isShareAccount: true,
                          total_shares: portfolioData.totalShares,
                          vested_shares: portfolioData.availableShares + portfolioData.restrictedShares,
                          remaining_unvested_shares: portfolioData.unavailableShares + portfolioData.inProgressShares,
                          status: 'active'
                        });
                        setShowGrantModal(true);
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0">
                          <SmallDonutChart 
                            available={portfolioData.availableShares + portfolioData.restrictedShares} 
                            total={portfolioData.totalShares} 
                            size={60}
                            totalValue={portfolioData.totalShares * sharePrice}
                            segments={[
                              { value: portfolioData.availableShares, color: '#10B981' }, // Green - Available
                              { value: portfolioData.restrictedShares, color: '#F59E0B' }, // Orange - Available w/ restrictions
                              { value: portfolioData.inProgressShares, color: '#3B82F6' }, // Blue - In Progress
                              { value: portfolioData.unavailableShares, color: '#9CA3AF' } // Light grey - Unavailable
                            ]}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 mb-2">
                            {t('employeeOverview.shareOwnershipAccount')}
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">Total:</span>{' '}
                              <span className="font-semibold text-gray-900">
                                <span className="text-xs text-gray-400 font-normal">SAR</span> {(portfolioData.totalShares * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              {' '}({portfolioData.totalShares.toLocaleString()} shares)
                            </div>
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">{t('employeeOverview.available')}:</span>{' '}
                              <span className="font-semibold text-green-600">
                                <span className="text-xs text-gray-400 font-normal">SAR</span> {(portfolioData.availableShares * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              {' '}({portfolioData.availableShares.toLocaleString()} shares)
                            </div>
                            {portfolioData.restrictedShares > 0 && (
                              <div className="text-sm text-gray-600">
                                <span className="font-medium">{t('employeeOverview.availableWithRestrictions')}:</span>{' '}
                                <span className="font-semibold text-amber-500">
                                  <span className="text-xs text-gray-400 font-normal">SAR</span> {(portfolioData.restrictedShares * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {' '}({portfolioData.restrictedShares.toLocaleString()} shares)
                              </div>
                            )}
                            {portfolioData.inProgressShares > 0 && (
                              <div className="text-sm text-gray-600">
                                <span className="font-medium">{t('employeeOverview.inProgress')}:</span>{' '}
                                <span className="font-semibold text-blue-600">
                                  <span className="text-xs text-gray-400 font-normal">SAR</span> {(portfolioData.inProgressShares * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {' '}({portfolioData.inProgressShares.toLocaleString()} shares)
                              </div>
                            )}
                            {portfolioData.unavailableShares > 0 && (
                              <div className="text-sm text-gray-600">
                                <span className="font-medium">{t('employeeOverview.unavailable')}:</span>{' '}
                                <span className="font-semibold text-gray-600">
                                  <span className="text-xs text-gray-400 font-normal">SAR</span> {(portfolioData.unavailableShares * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {' '}({portfolioData.unavailableShares.toLocaleString()} shares)
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'plans' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">{t('employeeOverview.shareIncentivePlans')}</h3>
                  <div className="space-y-3">
                    {plansGrouped.length > 0 ? (
                      plansGrouped.map((plan, index) => {
                        const totalValue = plan.totalShares * sharePrice;
                        const availableValue = plan.availableShares * sharePrice;
                        const restrictedValue = plan.restrictedShares * sharePrice;
                        const inProgressValue = plan.inProgressShares * sharePrice;
                        const unavailableValue = plan.unavailableShares * sharePrice;

                        // Determine segments based on plan type
                        let segments: Array<{ value: number; color: string }> = [];
                        const isESOP = plan.planType === 'ESOP';
                        
                        if (isESOP) {
                          // ESOP: available (green), available with restriction (orange), unavailable (light grey)
                          segments = [
                            { value: plan.availableShares, color: '#10B981' }, // Green
                            { value: plan.restrictedShares, color: '#F59E0B' }, // Orange
                            { value: plan.unavailableShares, color: '#9CA3AF' } // Light grey
                          ];
                        } else {
                          // LTIP_RSI, LTIP_RSA, and others: available (green), in progress (blue), unavailable (light grey)
                          segments = [
                            { value: plan.availableShares, color: '#10B981' }, // Green
                            { value: plan.inProgressShares, color: '#3B82F6' }, // Blue
                            { value: plan.unavailableShares, color: '#9CA3AF' } // Light grey
                          ];
                        }

                        return (
                          <div 
                            key={index} 
                            className="bg-white rounded-lg p-4 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-4">
                              {/* Small Donut Chart */}
                              <div className="flex-shrink-0">
                                <SmallDonutChart 
                                  available={plan.availableShares + plan.restrictedShares} 
                                  total={plan.totalShares} 
                                  size={60}
                                  totalValue={totalValue}
                                  segments={segments}
                                />
                              </div>

                              {/* Plan Details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <div className="font-semibold text-gray-900">
                                    {plan.planName}
                                  </div>
                                  {plan.planType && (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                                      {plan.planType}
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <div className="text-sm text-gray-600">
                                    <span className="font-medium">Total:</span>{' '}
                                    <span className="font-semibold text-gray-900">
                                      <span className="text-xs text-gray-400 font-normal">SAR</span> {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    {' '}({plan.totalShares.toLocaleString()} shares)
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    <span className="font-medium">{t('employeeOverview.available')}:</span>{' '}
                                    <span className="font-semibold text-green-600">
                                      <span className="text-xs text-gray-400 font-normal">SAR</span> {availableValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    {' '}({plan.availableShares.toLocaleString()} shares)
                                  </div>
                                  {plan.restrictedShares > 0 && (
                                    <div className="text-sm text-gray-600">
                                      <span className="font-medium">{t('employeeOverview.availableWithRestrictions')}:</span>{' '}
                                      <span className="font-semibold text-amber-500">
                                        <span className="text-xs text-gray-400 font-normal">SAR</span> {restrictedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                      {' '}({plan.restrictedShares.toLocaleString()} shares)
                                    </div>
                                  )}
                                  {plan.inProgressShares > 0 && (
                                    <div className="text-sm text-gray-600">
                                      <span className="font-medium">{t('employeeOverview.inProgress')}:</span>{' '}
                                      <span className="font-semibold text-blue-600">
                                        <span className="text-xs text-gray-400 font-normal">SAR</span> {inProgressValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                      {' '}({plan.inProgressShares.toLocaleString()} shares)
                                    </div>
                                  )}
                                  {plan.unavailableShares > 0 && (
                                    <div className="text-sm text-gray-600">
                                      <span className="font-medium">{t('employeeOverview.unavailable')}:</span>{' '}
                                      <span className="font-semibold text-gray-600">
                                        <span className="text-xs text-gray-400 font-normal">SAR</span> {unavailableValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                      {' '}({plan.unavailableShares.toLocaleString()} shares)
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Arrow Icon */}
                              <div className="flex-shrink-0">
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <Award className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>No plans available</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'grants' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">{t('employeeOverview.grants')}</h3>
                  <div className="space-y-3">
                    {portfolioData?.grants && portfolioData.grants.length > 0 ? (
                      portfolioData.grants.map((grant: any) => {
                        // Calculate vested/unvested shares for this grant
                        const calculated = calculateGrantShares([grant.id]);
                        const totalShares = calculated.totalShares;
                        const vestedShares = calculated.vestedShares;
                        const unvestedShares = calculated.unvestedShares;
                        
                        const totalValue = totalShares * sharePrice;
                        const vestedValue = vestedShares * sharePrice;
                        const unvestedValue = unvestedShares * sharePrice;

                        // Find upcoming vesting event for this grant
                        const upcomingEvent = vestingEvents
                          .filter((event: any) => 
                            event.grant_id === grant.id && 
                            (event.status === 'pending' || event.status === 'due')
                          )
                          .sort((a: any, b: any) => {
                            const dateA = new Date(a.vesting_date || 0).getTime();
                            const dateB = new Date(b.vesting_date || 0).getTime();
                            return dateA - dateB;
                          })[0];

                        // Calculate days remaining
                        let daysRemainingText = null;
                        let upcomingDate = null;
                        if (upcomingEvent && upcomingEvent.vesting_date) {
                          upcomingDate = upcomingEvent.vesting_date;
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const vestDate = new Date(upcomingEvent.vesting_date);
                          vestDate.setHours(0, 0, 0, 0);
                          const diffTime = vestDate.getTime() - today.getTime();
                          const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          daysRemainingText = formatDaysRemaining(days);
                        }

                        // Check for due and pending_exercise events
                        const hasDueEvents = vestingEvents.some((event: any) => 
                          event.grant_id === grant.id && event.status === 'due'
                        );
                        const hasPendingExerciseEvents = vestingEvents.some((event: any) => 
                          event.grant_id === grant.id && event.status === 'pending_exercise'
                        );

                        return (
                          <div 
                            key={grant.id} 
                            className="bg-white rounded-lg p-4 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                            onClick={() => {
                              setSelectedGrant(grant);
                              setShowGrantModal(true);
                            }}
                          >
                            <div className="flex items-center gap-4">
                              {/* Small Donut Chart */}
                              <div className="flex-shrink-0">
                                <SmallDonutChart 
                                  available={vestedShares} 
                                  total={totalShares} 
                                  size={60}
                                  totalValue={totalValue}
                                  color="#10B981"
                                />
                              </div>

                              {/* Grant Details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <div className="font-semibold text-gray-900">
                                    {grant.grant_number || `Grant ${grant.id}`}
                                  </div>
                                  {grant.incentive_plans?.plan_type && (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                                      {grant.incentive_plans.plan_type}
                                    </span>
                                  )}
                                  {grant.status && (
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${getStatusBadge(grant.status)}`}>
                                      {formatStatusText(grant.status)}
                                    </span>
                                  )}
                                  {upcomingDate && (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                                      {t('employeeOverview.upcoming')}: {formatDate(upcomingDate)} {daysRemainingText && `(${daysRemainingText})`}
                                    </span>
                                  )}
                                  {hasDueEvents && (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
                                      {t('employeeOverview.due')}
                                    </span>
                                  )}
                                  {hasPendingExerciseEvents && (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
                                      {t('employeeOverview.pendingExercise')}
                                    </span>
                                  )}
                                </div>
                                {grant.incentive_plans?.plan_name_en && (
                                  <div className="text-xs text-gray-500 mb-2">
                                    {grant.incentive_plans.plan_name_en}
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <div className="text-sm text-gray-600">
                                    <span className="font-medium">Total:</span>{' '}
                                    <span className="font-semibold text-gray-900">
                                      <span className="text-xs text-gray-400 font-normal">SAR</span> {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    {' '}({totalShares.toLocaleString()} {t('employeeOverview.shares')})
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    <span className="font-medium">{t('employeeOverview.vested')}:</span>{' '}
                                    <span className="font-semibold text-green-600">
                                      <span className="text-xs text-gray-400 font-normal">SAR</span> {vestedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    {' '}({vestedShares.toLocaleString()} shares)
                                  </div>
                                  {unvestedShares > 0 && (
                                    <div className="text-sm text-gray-600">
                                      <span className="font-medium">{t('employeeOverview.unvested')}:</span>{' '}
                                      <span className="font-semibold text-gray-600">
                                        <span className="text-xs text-gray-400 font-normal">SAR</span> {unvestedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                      {' '}({unvestedShares.toLocaleString()} shares)
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Arrow Icon */}
                              <div className="flex-shrink-0">
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <Award className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>{t('employeeOverview.noGrantsAvailable', 'No grants available')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Welcome Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Welcome back, {employeeName}.
            </h3>
            <p className="text-sm text-gray-600">
              Good to see you again. {lastLogin && `You last signed in on ${formatLastLogin(lastLogin)}.`}
            </p>
          </div>

          {/* Market Data Card */}
          {tadawulSymbol && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Market Data</h3>
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-900">{tadawulSymbol}</div>
                <div className="text-2xl font-bold text-gray-900">
                  SAR {sharePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-sm text-green-600">
                  +SAR 0.00 (+0.00%)
                </div>
                <div className="text-xs text-gray-500">
                  {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} +GMT
                </div>
                <a href="#" className="text-xs text-blue-600 hover:underline">
                  View Share Price Details
                </a>
              </div>
            </div>
          )}

          {/* My Tasks Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('employeeOverview.completeYourTasks')}</h3>
            {tasks.length > 0 ? (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div 
                    key={task.id} 
                    onClick={() => handleTaskClick(task)}
                    className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                  >
                    <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <div className="text-sm font-medium text-gray-900">{task.title}</div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(task.status)}`}>
                          {formatStatusText(task.status)}
                        </span>
                        {task.type === 'exercise' && task.exerciseCost && task.exerciseCost > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            SAR {task.exerciseCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(task.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                {t('employeeOverview.noTasks')}
              </div>
            )}
            <a href="#" className="block text-center text-sm text-blue-600 hover:underline mt-4">
              Review Task History
            </a>
            <p className="text-xs text-gray-500 mt-3">
              Tasks are how you accept grants, elect tax payment methods, and vote in certain elections.
            </p>
          </div>
        </div>
      </div>

      {/* Grant Details Modal */}
      {showGrantModal && selectedGrant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {selectedGrant.isShareAccount ? t('employeeOverview.shareOwnershipAccount') + ' ' + t('employeeOverview.details', 'Details') : t('employeeOverview.grantDetails')}
              </h2>
              <button
                onClick={() => {
                  setShowGrantModal(false);
                  setSelectedGrant(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Grant Header */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {selectedGrant.isShareAccount 
                        ? 'Share Ownership Account'
                        : selectedGrant.incentive_plans?.plan_name_en || selectedGrant.grant_number}
                    </h3>
                    {!selectedGrant.isShareAccount && selectedGrant.grant_number && (
                      <p className="text-sm text-gray-600">Grant Number: {selectedGrant.grant_number}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Total Value</div>
                    <div className="text-2xl font-bold text-gray-900">
                      <span className="text-lg text-gray-400 font-normal">SAR</span> {((Number(selectedGrant.total_shares || 0)) * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Grant Information Grid */}
              {selectedGrant.isShareAccount ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">{t('employeeOverview.total')}</div>
                    <div className="text-xl font-bold text-gray-900">
                      {Number(selectedGrant.total_shares || 0).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      <span className="text-xs text-gray-400 font-normal">SAR</span> {(Number(selectedGrant.total_shares || 0) * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">{t('employeeOverview.available')}</div>
                    <div className="text-xl font-bold text-green-600">
                      {Number(portfolioData?.availableShares || 0).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      <span className="text-xs text-gray-400 font-normal">SAR</span> {(Number(portfolioData?.availableShares || 0) * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  {portfolioData?.restrictedShares > 0 && (
                    <div className="bg-orange-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">{t('employeeOverview.availableWithRestrictions')}</div>
                      <div className="text-xl font-bold text-orange-600">
                        {Number(portfolioData.restrictedShares || 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        <span className="text-xs text-gray-400 font-normal">SAR</span> {(Number(portfolioData.restrictedShares || 0) * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}

                  {portfolioData?.inProgressShares > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">{t('employeeOverview.inProgress')}</div>
                      <div className="text-xl font-bold text-blue-600">
                        {Number(portfolioData.inProgressShares || 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        <span className="text-xs text-gray-400 font-normal">SAR</span> {(Number(portfolioData.inProgressShares || 0) * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}

                  {portfolioData?.unavailableShares > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">{t('employeeOverview.unavailable')}</div>
                      <div className="text-xl font-bold text-gray-700">
                        {Number(portfolioData.unavailableShares || 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        <span className="text-xs text-gray-400 font-normal">SAR</span> {(Number(portfolioData.unavailableShares || 0) * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">{t('employeeOverview.totalShares')}</div>
                    <div className="text-xl font-bold text-gray-900">
                      {Number(selectedGrant.total_shares || 0).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">Shares</div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">{t('employeeOverview.availableShares')}</div>
                    <div className="text-xl font-bold text-green-600">
                      {Number(selectedGrant.vested_shares || 0).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      <span className="text-xs text-gray-400 font-normal">SAR</span> {(Number(selectedGrant.vested_shares || 0) * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Unvested Shares</div>
                    <div className="text-xl font-bold text-gray-700">
                      {Number(selectedGrant.remaining_unvested_shares || 0).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      <span className="text-xs text-gray-400 font-normal">SAR</span> {(Number(selectedGrant.remaining_unvested_shares || 0) * sharePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Vesting Progress</div>
                    <div className="text-xl font-bold text-blue-600">
                      {selectedGrant.total_shares > 0 
                        ? ((Number(selectedGrant.vested_shares || 0) / Number(selectedGrant.total_shares)) * 100).toFixed(1)
                        : '0'}%
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ 
                          width: `${selectedGrant.total_shares > 0 
                            ? (Number(selectedGrant.vested_shares || 0) / Number(selectedGrant.total_shares)) * 100
                            : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Grant Details */}
              {!selectedGrant.isShareAccount && (
                <div className="border-t border-gray-200 pt-6 space-y-4">
                  <h4 className="text-lg font-semibold text-gray-900">Grant Information</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedGrant.grant_date && (
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Grant Date</div>
                        <div className="text-base font-medium text-gray-900">
                          {new Date(selectedGrant.grant_date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                    )}

                    {selectedGrant.vesting_start_date && (
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Vesting Start Date</div>
                        <div className="text-base font-medium text-gray-900">
                          {new Date(selectedGrant.vesting_start_date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                    )}

                    {selectedGrant.vesting_end_date && (
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Vesting End Date</div>
                        <div className="text-base font-medium text-gray-900">
                          {new Date(selectedGrant.vesting_end_date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                    )}

                    {selectedGrant.incentive_plans?.plan_type && (
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Plan Type</div>
                        <div className="text-base font-medium text-gray-900">
                          {selectedGrant.incentive_plans.plan_type}
                        </div>
                      </div>
                    )}

                    {selectedGrant.status && (
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Status</div>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          selectedGrant.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : selectedGrant.status === 'pending_signature'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {selectedGrant.status === 'active' ? 'Active' : 
                           selectedGrant.status === 'pending_signature' ? 'Pending Signature' : 
                           selectedGrant.status}
                        </span>
                      </div>
                    )}

                    {selectedGrant.employee_acceptance_at && (
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Accepted On</div>
                        <div className="text-base font-medium text-gray-900">
                          {new Date(selectedGrant.employee_acceptance_at).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="border-t border-gray-200 pt-6 flex items-center justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowGrantModal(false);
                    setSelectedGrant(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  Close
                </button>
                {!selectedGrant.isShareAccount && (
                  <button
                    onClick={() => {
                      setShowGrantModal(false);
                      setSelectedGrant(null);
                      // Navigate to vesting timeline for this grant
                      window.location.href = '/employee/vesting';
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    View Vesting Timeline
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vesting Event Details Modal */}
      {showVestingEventModal && selectedVestingEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Vesting Event Details</h2>
              <button
                onClick={() => {
                  setShowVestingEventModal(false);
                  setSelectedVestingEvent(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">{t('employeeOverview.eventId')}</div>
                  <div className="text-base font-medium text-gray-900">
                    {formatVestingEventId(
                      selectedVestingEvent.id,
                      selectedVestingEvent.sequence_number,
                      selectedVestingEvent.vesting_date,
                      selectedVestingEvent.grants?.grant_number ?? selectedVestingEvent.grant_id
                    ).displayId}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">{t('employeeOverview.status')}</div>
                  <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(selectedVestingEvent.status)}`}>
                    {selectedVestingEvent.status.toUpperCase().replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <div className="text-sm text-gray-600">{t('employeeOverview.plan')}</div>
                  <div className="text-base font-medium text-gray-900">
                    {selectedVestingEvent.plan_name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {selectedVestingEvent.plan_code} • {selectedVestingEvent.plan_type}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Grant Number</div>
                  <div className="text-base font-medium text-gray-900">
                    {selectedVestingEvent.grants?.grant_number || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">{t('employeeOverview.vestingDate')}</div>
                  <div className="text-base font-medium text-gray-900">
                    {formatDate(selectedVestingEvent.vesting_date)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDaysRemaining(selectedVestingEvent.days_remaining)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">{t('employeeOverview.sharesToVest')}</div>
                  <div className="text-base font-medium text-gray-900">
                    {Math.floor(selectedVestingEvent.shares_to_vest).toLocaleString()}
                  </div>
                </div>
                {selectedVestingEvent.exercise_price && (
                  <div>
                    <div className="text-sm text-gray-600">{t('employeeOverview.exercisePrice')}</div>
                    <div className="text-base font-medium text-gray-900">
                      SAR {selectedVestingEvent.exercise_price.toFixed(2)}/share
                    </div>
                  </div>
                )}
                {selectedVestingEvent.total_exercise_cost && (
                  <div>
                    <div className="text-sm text-gray-600">{t('employeeOverview.totalCost')}</div>
                    <div className="text-base font-medium text-gray-900">
                      SAR {selectedVestingEvent.total_exercise_cost.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowVestingEventModal(false);
                      setSelectedVestingEvent(null);
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                  >
                    {t('employeeOverview.close')}
                  </button>
                  {(selectedVestingEvent.status === 'pending_exercise' || (selectedVestingEvent.status === 'vested' && selectedVestingEvent.requires_exercise)) && (
                    <button
                      onClick={handleExerciseFromModal}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                    >
                      {t('employeeOverview.createExerciseOrder')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

