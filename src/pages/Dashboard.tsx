import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { getUpcomingVestingEvents, updateVestingEventStatuses, type VestingEventWithDetails } from '../lib/vestingEventsService';
import { formatDate, formatDaysRemaining, formatVestingEventId } from '../lib/dateUtils';
import { Users, FileText, Award, TrendingUp, DollarSign, Package, CheckCircle, Clock, XCircle, UserCheck, UserX, Info, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCompanyColor } from '../hooks/useCompanyColor';
import LTIPPoolsSummary from '../components/dashboard/LTIPPoolsSummary';
import IncentivePlansSummary from '../components/dashboard/IncentivePlansSummary';
import VestingEventsSummary from '../components/dashboard/VestingEventsSummary';
import VestingEventsCalendar from '../components/VestingEventsCalendar';

interface CompanyStats {
  totalEmployees: number;
  activePlans: number;
  activeGrants: number;
  totalShares: number;
  currentFMV: number;
  optionPoolBalance: number;
  totalGrants: number;
  grantsAccepted: number;
  grantsPending: number;
  grantsRejected: number;
  activeESOPEmployees: number;
  inactiveESOPEmployees: number;
  equityPoolSize: number;
  // Plan-type-specific metrics
  esopTotalAllocated: number;
  esopTotalShares: number;
  ltipTotalAllocated: number;
  ltipTotalShares: number;
}


export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { getCurrentCompanyId, userRole, isSuperAdmin } = useAuth();
  const { brandColor, getBgColor } = useCompanyColor();
  const [stats, setStats] = useState<CompanyStats>({
    totalEmployees: 0,
    activePlans: 0,
    activeGrants: 0,
    totalShares: 0,
    currentFMV: 0,
    optionPoolBalance: 0,
    totalGrants: 0,
    grantsAccepted: 0,
    grantsPending: 0,
    grantsRejected: 0,
    activeESOPEmployees: 0,
    inactiveESOPEmployees: 0,
    equityPoolSize: 0,
    esopTotalAllocated: 0,
    esopTotalShares: 0,
    ltipTotalAllocated: 0,
    ltipTotalShares: 0,
  });
  const [loading, setLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [upcomingVestingEvents, setUpcomingVestingEvents] = useState<VestingEventWithDetails[]>([]);
  const [dueVestingEvents, setDueVestingEvents] = useState<VestingEventWithDetails[]>([]);
  const [calendarVestingEvents, setCalendarVestingEvents] = useState<VestingEventWithDetails[]>([]);
  const [showVestingDetailsModal, setShowVestingDetailsModal] = useState(false);
  const [selectedVestingEvent, setSelectedVestingEvent] = useState<VestingEventWithDetails | null>(null);
  const [sharesBreakdown, setSharesBreakdown] = useState({
    granted: 0,
    ungranted: 0,
    vested: 0,
    unvested: 0,
  });
  const [roadmapData, setRoadmapData] = useState<any[]>([]);

  const currentCompanyId = getCurrentCompanyId();
  const isLoadingRef = useRef(false);
  const lastLoadedCompanyIdRef = useRef<string | null>(null);

  // Memoize loadDashboardData to prevent unnecessary re-creations
  const loadDashboardData = useCallback(async () => {
    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log('⏸️ Dashboard data already loading, skipping...');
      return;
    }

    try {
      isLoadingRef.current = true;
      const companyId = getCurrentCompanyId();
      
      // Skip if we already loaded data for this company
      if (companyId === lastLoadedCompanyIdRef.current && companyInfo) {
        console.log('⏸️ Data already loaded for this company, skipping...');
        return;
      }
      
      // For super admins, they need to select a company first
      if (isSuperAdmin() && !companyId) {
        console.log('Super admin - no company selected');
        setLoading(false);
        setCompanyInfo(null);
        return;
      }

      if (!companyId) {
        console.log('No company ID available');
        setLoading(false);
        return;
      }

      console.log('Loading dashboard for company ID:', companyId);
      lastLoadedCompanyIdRef.current = companyId;

      // Load company info
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .maybeSingle();

      if (companyError) {
        console.error('Error fetching company:', companyError);
        setLoading(false);
        return;
      }

      if (companyData) {
        setCompanyInfo({ company_id: companyId, companies: companyData });
        console.log('Company ID:', companyId);

        // Load vesting events and roadmap in parallel (they set state internally)
        Promise.all([
          loadUpcomingVestingEvents(companyId).catch(err => {
            console.error('Error loading vesting events:', err);
          }),
          loadRoadmapData(companyId).catch(err => {
            console.error('Error loading roadmap:', err);
          }),
        ]).catch(() => {
          // Errors already logged above
        });

        // Load all stats queries in parallel for better performance
        const [
          employeesRes,
          plansRes,
          activeGrantsRes,
          sharesRes,
          marketDataRes,
          companyRes,
          allGrantsRes,
          acceptedGrantsRes,
          pendingGrantsRes,
          rejectedGrantsRes,
          employeeShareholdersRes,
          allShareholdersRes,
          ltipPoolsRes,
        ] = await Promise.all([
          supabase
            .from('employees')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('employment_status', 'active'),
          supabase
            .from('incentive_plans')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'active'),
          supabase
            .from('grants')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'active'),
          supabase
            .from('grants')
            .select('total_shares')
            .eq('company_id', companyId)
            .eq('status', 'active'),
          supabase
            .from('market_data')
            .select('closing_price')
            .eq('tadawul_symbol', (companyData as any)?.tadawul_symbol || '4084')
            .order('trading_date', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('companies')
            .select('available_shares, tadawul_symbol, current_fmv, fmv_source')
            .eq('id', companyId)
            .maybeSingle(),
          supabase
            .from('grants')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId),
          supabase
            .from('grants')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'active'),
          supabase
            .from('grants')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'pending_signature'),
          supabase
            .from('grants')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'cancelled'),
          supabase
            .from('shareholders')
            .select('shares_owned')
            .eq('company_id', companyId)
            .eq('shareholder_type', 'employee')
            .eq('is_active', true),
          supabase
            .from('shareholders')
            .select('shares_owned')
            .eq('company_id', companyId)
            .eq('is_active', true),
          supabase
            .from('ltip_pools')
            .select('total_shares_allocated, shares_used, shares_available')
            .eq('company_id', companyId),
        ]);

        // Process results only if queries succeeded
        if (!employeesRes || !plansRes || !activeGrantsRes) {
          console.error('Critical queries failed');
          setLoading(false);
          return;
        }

        const totalShares = sharesRes.data?.reduce(
          (sum, grant) => sum + Number(grant.total_shares || 0),
          0
        ) || 0;

        // Load additional data in parallel
        const [
          activeEmployeeIdsRes,
          inactiveEmployeeIdsRes,
          esopPlansRes,
        ] = await Promise.all([
          supabase
            .from('grants')
            .select('employee_id')
            .eq('company_id', companyId)
            .eq('status', 'active'),
          supabase
            .from('grants')
            .select('employee_id, employees!inner(employment_status)')
            .eq('company_id', companyId)
            .neq('employees.employment_status', 'active'),
          supabase
            .from('incentive_plans')
            .select('id, total_shares_allocated, shares_granted, shares_available')
            .eq('company_id', companyId)
            .eq('plan_type', 'ESOP')
            .eq('status', 'active'),
        ]);

        const uniqueActiveESOPEmployees = new Set(
          activeEmployeeIdsRes.data?.map(g => g.employee_id) || []
        ).size;

        const uniqueInactiveESOPEmployees = new Set(
          inactiveEmployeeIdsRes.data?.map(g => g.employee_id) || []
        ).size;

        const esopPlanIds = esopPlansRes.data?.map(plan => plan.id) || [];

        const esopGrantsRes = esopPlanIds.length > 0 ? await supabase
          .from('grants')
          .select('total_shares')
          .eq('company_id', companyId)
          .eq('status', 'active')
          .in('plan_id', esopPlanIds) : { data: [] };

        const esopTotalShares = esopGrantsRes.data?.reduce(
          (sum, grant) => sum + Number(grant.total_shares || 0),
          0
        ) || 0;

        const esopTotalAllocated = esopPlansRes.data?.reduce(
          (sum, plan) => sum + Number(plan.total_shares_allocated || 0),
          0
        ) || 0;

        // Get LTIP plans data
        const { data: ltipPlansData } = await supabase
          .from('incentive_plans')
          .select('shares_granted, plan_type')
          .eq('company_id', companyId)
          .like('plan_type', 'LTIP%');
        
        const grantedFromPlans = (ltipPlansData || []).reduce(
          (sum, plan) => sum + Number(plan.shares_granted || 0),
          0
        );

        // Use grantedFromPlans as the source of truth (maintained by DB triggers)
        // Fallback to grantedSharesFromGrants if plans data is not available
        const grantedShares = grantedFromPlans > 0 ? grantedFromPlans : 0;

        console.log('📊 Shares Breakdown Debug:', {
          totalGrants: allGrantsRes.data?.length || 0,
          ltipTotalAllocated,
          grantedShares,
        });

        const ltipTotalAllocated = ltipPoolsRes.data?.reduce(
          (sum, pool) => sum + Number(pool.total_shares_allocated || 0),
          0
        ) || 0;

        const ltipTotalShares = ltipPoolsRes.data?.reduce(
          (sum, pool) => sum + Number(pool.shares_used || 0),
          0
        ) || 0;

        const ungrantedShares = Math.max(0, ltipTotalAllocated - grantedShares);

        // Calculate vested and unvested from active LTIP grants only
        const { data: allGrantsData } = await supabase
          .from('grants')
          .select('id, total_shares, vested_shares, remaining_unvested_shares, status, plan_id, incentive_plans!inner(plan_type)')
          .eq('company_id', companyId)
          .eq('status', 'active')
          .like('incentive_plans.plan_type', 'LTIP%');

        const validLtipGrants = (allGrantsData || []).filter(g => g.incentive_plans);

        // Calculate total shares from active grants
        const activeGrantedTotal = validLtipGrants.reduce(
          (sum, grant) => sum + Number(grant.total_shares || 0),
          0
        );

        // If vested_shares is null/0, calculate from vesting events
        let vestedShares = 0;
        let unvestedShares = 0;
        
        if (validLtipGrants.length > 0) {
          // Try to use grant fields first
          vestedShares = validLtipGrants.reduce(
            (sum, grant) => {
              const vested = Number(grant.vested_shares || 0);
              return sum + vested;
            },
            0
          );
          
          // Calculate unvested as: (active granted total) - vested
          // This is more accurate than summing remaining_unvested_shares
          unvestedShares = Math.max(0, activeGrantedTotal - vestedShares);
          
          // If vested shares are 0, try calculating from vesting events
          if (vestedShares === 0 && activeGrantedTotal > 0) {
            const grantIds = validLtipGrants.map(g => g.id);
            const { data: vestingEventsData } = await supabase
              .from('vesting_events')
              .select('grant_id, shares_to_vest, status')
              .in('grant_id', grantIds);
            
            if (vestingEventsData) {
              const vestedFromEvents = vestingEventsData
                .filter(e => e.status === 'vested' || e.status === 'transferred' || e.status === 'exercised')
                .reduce((sum, e) => sum + Number(e.shares_to_vest || 0), 0);
              
              vestedShares = vestedFromEvents;
              unvestedShares = Math.max(0, activeGrantedTotal - vestedFromEvents);
              
              console.log('📊 Calculated from vesting events:', {
                vestedFromEvents,
                activeGrantedTotal,
                unvestedShares
              });
            }
          }
        }

        console.log('📊 Calculated Breakdown:', {
          granted: grantedShares,
          ungranted: ungrantedShares,
          vested: vestedShares,
          unvested: unvestedShares,
        });

        setSharesBreakdown({
          granted: grantedShares,
          ungranted: ungrantedShares,
          vested: vestedShares,
          unvested: unvestedShares,
        });

        // Calculate equity pool size from employee shareholders
        const employeeSharesTotal = employeeShareholdersRes.data?.reduce(
          (sum, shareholder) => sum + Number(shareholder.shares_owned),
          0
        ) || 0;

        // Calculate total shares from all shareholders
        const totalSharesFromShareholders = allShareholdersRes.data?.reduce(
          (sum, shareholder) => sum + Number(shareholder.shares_owned),
          0
        ) || 0;

        // Calculate option pool balance (total - employee shares)
        const optionPoolBalance = totalSharesFromShareholders - employeeSharesTotal;

        const closingPriceRaw = marketDataRes?.data?.closing_price;
        const parsedClosingPrice =
          closingPriceRaw !== null && closingPriceRaw !== undefined
            ? Number(closingPriceRaw)
            : null;

        const manualFmvRaw = companyRes.data?.current_fmv;
        const parsedManualFmv =
          manualFmvRaw !== null && manualFmvRaw !== undefined
            ? Number(manualFmvRaw)
            : null;

        const resolvedCurrentFmv =
          parsedClosingPrice !== null && !Number.isNaN(parsedClosingPrice)
            ? parsedClosingPrice
            : parsedManualFmv !== null && !Number.isNaN(parsedManualFmv)
            ? parsedManualFmv
            : 30; // Default fallback

        console.log('Employee shares total:', employeeSharesTotal);
        console.log('Total shares from shareholders:', totalSharesFromShareholders);
        console.log('Option pool balance:', optionPoolBalance);
        console.log('Query results:', {
          employees: employeesRes.count,
          plans: plansRes.count,
          grants: allGrantsRes.count,
        });
        console.log('Full responses with errors:', {
          employeesRes,
          plansRes,
          activeGrantsRes,
        });

        setStats({
          totalEmployees: employeesRes.count || 0,
          activePlans: plansRes.count || 0,
          activeGrants: activeGrantsRes.count || 0,
          totalShares: totalShares,
          currentFMV: resolvedCurrentFmv,
          optionPoolBalance: optionPoolBalance,
          totalGrants: allGrantsRes.count || 0,
          grantsAccepted: acceptedGrantsRes.count || 0,
          grantsPending: pendingGrantsRes.count || 0,
          grantsRejected: rejectedGrantsRes.count || 0,
          activeESOPEmployees: uniqueActiveESOPEmployees,
          inactiveESOPEmployees: uniqueInactiveESOPEmployees,
          equityPoolSize: totalSharesFromShareholders,
          esopTotalAllocated: esopTotalAllocated,
          esopTotalShares: esopTotalShares,
          ltipTotalAllocated: ltipTotalAllocated,
          ltipTotalShares: ltipTotalShares,
        });

        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setLoading(false);
    } finally {
      isLoadingRef.current = false;
    }
  }, [getCurrentCompanyId, isSuperAdmin, companyInfo]);

  useEffect(() => {
    // Only load if we have a company ID and haven't loaded yet
    if (currentCompanyId && !lastLoadedCompanyIdRef.current) {
      loadDashboardData();
    }
  }, [currentCompanyId, loadDashboardData]);

  // Reload dashboard when active company changes (for super admins)
  useEffect(() => {
    if (currentCompanyId && companyInfo?.company_id !== currentCompanyId && lastLoadedCompanyIdRef.current !== currentCompanyId) {
      loadDashboardData();
    }
  }, [currentCompanyId, companyInfo?.company_id, loadDashboardData]);
  
  // Load calendar events when company info is available (deferred for better initial load)
  useEffect(() => {
    if (companyInfo?.company_id) {
      // Defer calendar loading slightly to prioritize critical data
      const timer = setTimeout(() => {
        loadCalendarVestingEvents(companyInfo.company_id);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [companyInfo?.company_id]);

  const loadUpcomingVestingEvents = async (companyId: string) => {
    try {
      console.log('🔍 Loading vesting events for company:', companyId);
      
      // Update vesting event statuses first
      await updateVestingEventStatuses();
      
      // Fetch upcoming vesting events using the new service (get more for "More" button)
      const events = await getUpcomingVestingEvents(companyId, 20);
      
      console.log('📅 Loaded vesting events:', events.length);
      console.log('🎯 Events data:', events);
      
      setUpcomingVestingEvents(events);

      // Also load due vesting events and calendar events
      await loadDueVestingEvents(companyId);
      await loadCalendarVestingEvents(companyId);
    } catch (error) {
      console.error('Error loading vesting events:', error);
      setUpcomingVestingEvents([]);
    }
  };

  const loadDueVestingEvents = async (companyId: string) => {
    try {
      console.log('🔍 Loading due vesting events for company:', companyId);
      
      const { data: events, error } = await supabase
        .from('vesting_events')
        .select(`
          *,
          employees (
            id,
            first_name_en,
            first_name_ar,
            last_name_en,
            last_name_ar
          ),
          grants (
            id,
            total_shares,
            vested_shares,
            plan_id,
            incentive_plans (
              plan_name_en,
              plan_code,
              plan_type
            )
          )
        `)
        .eq('company_id', companyId)
        .eq('status', 'due')
        .order('vesting_date', { ascending: true })
        .limit(10);

      if (error) throw error;

      console.log('📊 Raw due events from database:', events);
      
      // Check for events that shouldn't be due
      const today = new Date();
      const incorrectlyDueEvents = (events || []).filter(event => {
        const vestingDate = new Date(event.vesting_date);
        return vestingDate > today;
      });
      
      if (incorrectlyDueEvents.length > 0) {
        console.warn('⚠️ Found events marked as due but with future vesting dates:', incorrectlyDueEvents);
      }
      // Filter out events that shouldn't be due (client-side fix until database is corrected)
      const actuallyDueEvents = (events || []).filter(event => {
        const vestingDate = new Date(event.vesting_date);
        return vestingDate <= today; // Only include events that are actually due
      });

      const processedEvents = actuallyDueEvents.map(event => {
        const vestingDate = new Date(event.vesting_date);
        const daysRemaining = Math.ceil((vestingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const planType = event.grants?.incentive_plans?.plan_type || 'LTIP_RSU';
        
        return {
          ...event,
          employee_name: `${event.employees?.first_name_en || event.employees?.first_name_ar || 'Unknown'} ${event.employees?.last_name_en || event.employees?.last_name_ar || 'Employee'}`,
          plan_name: event.grants?.incentive_plans?.plan_name_en || 'Unknown Plan',
          plan_code: event.grants?.incentive_plans?.plan_code || 'N/A',
          plan_type: planType,
          days_remaining: daysRemaining,
          can_exercise: planType === 'ESOP' && event.status === 'vested',
          requires_exercise: planType === 'ESOP'
        } as VestingEventWithDetails;
      });

      console.log('✅ Filtered due events (only actually due):', processedEvents);
      setDueVestingEvents(processedEvents);
    } catch (error) {
      console.error('Error loading due vesting events:', error);
      setDueVestingEvents([]);
    }
  };

  const loadCalendarVestingEvents = async (companyId: string) => {
    try {
      console.log('📅 Loading calendar vesting events for company:', companyId);
      
      const { data: events, error } = await supabase
        .from('vesting_events')
        .select(`
          *,
          employees (
            id,
            first_name_en,
            first_name_ar,
            last_name_en,
            last_name_ar
          ),
          grants (
            id,
            total_shares,
            vested_shares,
            plan_id,
            incentive_plans (
              plan_name_en,
              plan_code,
              plan_type
            )
          )
        `)
        .eq('company_id', companyId)
        .gte('vesting_date', new Date().toISOString().split('T')[0]) // Only future events for calendar
        .order('vesting_date', { ascending: true })
        .limit(100); // Reduced from 500 for better performance

      if (error) throw error;

      const processedEvents = (events || []).map(event => {
        const vestingDate = new Date(event.vesting_date);
        const today = new Date();
        const daysRemaining = Math.ceil((vestingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const planType = event.grants?.incentive_plans?.plan_type || 'LTIP_RSU';
        
        return {
          ...event,
          employee_name: `${event.employees?.first_name_en || event.employees?.first_name_ar || 'Unknown'} ${event.employees?.last_name_en || event.employees?.last_name_ar || 'Employee'}`,
          plan_name: event.grants?.incentive_plans?.plan_name_en || 'Unknown Plan',
          plan_code: event.grants?.incentive_plans?.plan_code || 'N/A',
          plan_type: planType,
          days_remaining: daysRemaining,
          can_exercise: planType === 'ESOP' && event.status === 'vested',
          requires_exercise: planType === 'ESOP'
        } as VestingEventWithDetails;
      });

      console.log('📅 Loaded calendar events:', processedEvents.length);
      setCalendarVestingEvents(processedEvents);
    } catch (error) {
      console.error('Error loading calendar vesting events:', error);
      setCalendarVestingEvents([]);
    }
  };

  const loadRoadmapData = async (companyId: string) => {
    try {
      // Get company FMV
      const { data: companyData } = await supabase
        .from('companies')
        .select('current_fmv')
        .eq('id', companyId)
        .single();

      const fmvPerShare = companyData?.current_fmv || 30;

      // Fetch all vesting events for the company
      const { data: allEvents, error } = await supabase
        .from('vesting_events')
        .select(`
          *,
          grants (
            id,
            total_shares,
            vested_shares
          )
        `)
        .eq('company_id', companyId)
        .order('vesting_date', { ascending: true });

      if (error) throw error;

      // Initialize roadmap data for next 5 years
      const currentYear = new Date().getFullYear();
      const roadmap: any[] = [];
      for (let year = currentYear; year < currentYear + 5; year++) {
        roadmap.push({
          year: String(year),
          unvestedShares: 0,
          unvestedValuation: 0,
          vestedShares: 0,
          vestedValuation: 0
        });
      }

      // Calculate vested and unvested shares per year
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      (allEvents || []).forEach((event: any) => {
        const vestingDate = new Date(event.vesting_date);
        const eventYear = vestingDate.getFullYear();
        const sharesToVest = Number(event.shares_to_vest || 0);

        if (sharesToVest <= 0) return;

        const roadmapIndex = roadmap.findIndex((item: any) => {
          const roadmapYear = parseInt(item.year);
          return roadmapYear === eventYear;
        });

        if (roadmapIndex >= 0) {
          const isVested = vestingDate < today || 
                          event.status === 'vested' || 
                          event.status === 'transferred' || 
                          event.status === 'exercised' ||
                          event.status === 'due';

          if (isVested) {
            roadmap[roadmapIndex].vestedShares += sharesToVest;
            roadmap[roadmapIndex].vestedValuation += sharesToVest * fmvPerShare;
          } else if (event.status !== 'lapsed') {
            roadmap[roadmapIndex].unvestedShares += sharesToVest;
            roadmap[roadmapIndex].unvestedValuation += sharesToVest * fmvPerShare;
          }
        }
      });

      setRoadmapData(roadmap);
    } catch (error) {
      console.error('Error loading roadmap data:', error);
      setRoadmapData([]);
    }
  };

  const handleViewVestingDetails = (event: VestingEventWithDetails) => {
    setSelectedVestingEvent(event);
    setShowVestingDetailsModal(true);
  };

  // Memoize stat cards to prevent unnecessary recalculations
  const statCards = useMemo(() => [
    {
      name: 'Active Employees',
      value: stats.totalEmployees,
      icon: Users,
      change: '+12%',
      changeType: 'increase',
      color: 'blue',
      tooltip: 'Total number of employees with active employment status in the system',
    },
    {
      name: 'Active Plans',
      value: stats.activePlans,
      icon: FileText,
      change: '+3',
      changeType: 'increase',
      color: 'green',
      tooltip: 'Number of currently active LTIP or ESOP plans in your company',
    },
    {
      name: 'Shares Granted',
      value: stats.totalShares.toLocaleString(),
      icon: TrendingUp,
      change: '+8%',
      changeType: 'increase',
      color: 'orange',
      tooltip: 'Total number of shares granted to employees across all active grants',
    },
    {
      name: 'Current FMV',
      value: `SAR ${stats.currentFMV.toFixed(2)}`,
      icon: DollarSign,
      change: '+2.5%',
      changeType: 'increase',
      color: 'emerald',
      tooltip: 'Fair Market Value - The latest closing price from Tadawul stock exchange',
    },
    {
      name: 'Equity Pool Size',
      value: stats.equityPoolSize.toLocaleString(),
      icon: Package,
      change: '0%',
      changeType: 'increase',
      color: 'violet',
      tooltip: 'Total LTIP shares used across all pools compared to the overall LTIP allocation',
    },
    {
      name: 'Options Pool Used',
      value: stats.optionPoolBalance.toLocaleString(),
      icon: Package,
      change: '-5%',
      changeType: 'decrease',
      color: 'sky',
      tooltip: 'Total ESOP options used across the ESOP plan compared to the available pool',
    },
    {
      name: 'Total Grants',
      value: stats.totalGrants,
      icon: Award,
      change: '+15',
      changeType: 'increase',
      color: 'purple',
      tooltip: 'Total number of equity grants issued to employees, regardless of status',
    },
    {
      name: 'Grants Accepted',
      value: stats.grantsAccepted,
      icon: CheckCircle,
      change: '+8',
      changeType: 'increase',
      color: 'teal',
      tooltip: 'Number of grants that have been accepted and signed by employees',
    },
    {
      name: 'Grants Pending',
      value: stats.grantsPending,
      icon: Clock,
      change: '+3',
      changeType: 'increase',
      color: 'amber',
      tooltip: 'Number of grants awaiting employee signature and acceptance',
    },
    {
      name: 'Grants Rejected',
      value: stats.grantsRejected,
      icon: XCircle,
      change: '+1',
      changeType: 'increase',
      color: 'red',
      tooltip: 'Number of grants that have been cancelled or rejected',
    },
    {
      name: 'Active ESOP Employees',
      value: stats.activeESOPEmployees,
      icon: UserCheck,
      change: '+7',
      changeType: 'increase',
      color: 'cyan',
      tooltip: 'Number of currently employed individuals with active equity grants',
    },
    {
      name: 'Inactive ESOP Employees',
      value: stats.inactiveESOPEmployees,
      icon: UserX,
      change: '+2',
      changeType: 'increase',
      color: 'gray',
      tooltip: 'Number of former employees who had equity grants (terminated, resigned, or retired)',
    },
  ], [stats]);

  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    teal: 'bg-teal-500',
    red: 'bg-red-500',
    cyan: 'bg-cyan-500',
    gray: 'bg-gray-500',
    emerald: 'bg-emerald-500',
    violet: 'bg-violet-500',
    sky: 'bg-sky-500',
    amber: 'bg-amber-500',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show message for super admins who haven't selected a company
  if (isSuperAdmin() && !currentCompanyId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('dashboard.welcome')}
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
          <div className="max-w-md mx-auto">
            <Info className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Select a Company
            </h2>
            <p className="text-gray-600 mb-4">
              As a super admin, please select a company from the dropdown in the header to view its dashboard.
            </p>
            <p className="text-sm text-gray-500">
              You can also access the <a href="/operator/companies" className="text-blue-600 hover:underline">Operator Console</a> to manage all companies.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show message if no company info is available
  if (!companyInfo) {
    // Check if userRole is missing - this indicates the user account wasn't properly linked
    const isUserRoleMissing = !userRole || !userRole.company_id;
    
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('dashboard.welcome')}
          </p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
          <div className="max-w-md mx-auto">
            <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {isUserRoleMissing ? 'Account Setup Incomplete' : 'No Company Data Available'}
            </h2>
            <p className="text-gray-600 mb-4">
              {isUserRoleMissing 
                ? 'Your account was created but is not yet linked to a company. This may happen if you just signed up. Please try refreshing the page or contact support if the issue persists.'
                : 'Unable to load company information. Please contact support if this issue persists.'}
            </p>
            {isUserRoleMissing && (
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Refresh Page
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 w-full max-w-full overflow-x-hidden ${isRTL ? 'text-right' : 'text-left'}`}>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        <p className="text-gray-600 mt-1">
          {t('dashboard.welcome')}
        </p>
      </div>

      {companyInfo && (
        <div 
          className="rounded-xl p-6 text-white"
          style={{ 
            background: `linear-gradient(to right, ${brandColor}, ${getBgColor('700')})`
          }}
        >
          <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div>
              <h2 className="text-2xl font-bold">{companyInfo.companies?.company_name_en}</h2>
              <p className="mt-1 opacity-90">{t('dashboard.tadawul')}: {companyInfo.companies?.tadawul_symbol}</p>
            </div>
            <div className={isRTL ? 'text-left' : 'text-right'}>
              <p className="text-sm opacity-90">{t('dashboard.verificationStatus')}</p>
              <span className="inline-block mt-1 px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
                {companyInfo.companies?.verification_status}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-10">
        <LTIPPoolsSummary />
        <IncentivePlansSummary />
        <VestingEventsSummary />
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-lg transition">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-violet-500">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-gray-600 text-sm font-medium">{t('dashboard.equityPoolSize')}</p>
                    <div className="group relative">
                      <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      <div className={`absolute ${isRTL ? 'right-0' : 'left-0'} top-6 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg`}>
                        {t('dashboard.equityPoolSizeTooltip')}
                      </div>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.equityPoolSize.toLocaleString()} / {stats.ltipTotalAllocated.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">{t('dashboard.usedVsTotalPool')}</span>
                <span className="font-semibold text-gray-900">
                  {stats.ltipTotalAllocated > 0
                    ? ((stats.ltipTotalShares / stats.ltipTotalAllocated) * 100).toFixed(1)
                    : 0}% {t('dashboard.used')}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-violet-500 to-purple-600 h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.ltipTotalAllocated > 0
                      ? Math.min((stats.ltipTotalShares / stats.ltipTotalAllocated) * 100, 100)
                      : 0}%`
                  }}
                ></div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                <span>{stats.ltipTotalShares.toLocaleString()} {t('dashboard.sharesUsed')}</span>
                <span>{stats.ltipTotalAllocated.toLocaleString()} {t('dashboard.totalPool')}</span>
              </div>
            </div>
          </div>

          {/* Shares Breakdown - Style 1: Stacked Bar Chart */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-lg transition">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-indigo-500">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-gray-600 text-sm font-medium">Used Shares Breakdown</p>
                    <div className="group relative">
                      <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      <div className="absolute left-0 top-6 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg">
                        Breakdown of used shares showing granted vs ungranted, and vested vs unvested
                      </div>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {sharesBreakdown.granted.toLocaleString()} / {stats.ltipTotalAllocated.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-gray-600">{t('dashboard.breakdownOfUsedShares')}</span>
                <span className="font-semibold text-gray-900">
                  {stats.ltipTotalAllocated > 0
                    ? ((sharesBreakdown.granted / stats.ltipTotalAllocated) * 100).toFixed(1)
                    : 0}% {t('dashboard.granted')}
                </span>
              </div>
              
              {/* Stacked bar showing granted/ungranted */}
              <div className="w-full bg-gray-200 rounded-full h-4 mb-4 overflow-hidden">
                <div className="flex h-full">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500"
                    style={{
                      width: `${stats.ltipTotalAllocated > 0
                        ? Math.min((sharesBreakdown.granted / stats.ltipTotalAllocated) * 100, 100)
                        : 0}%`
                    }}
                    title={`Granted: ${sharesBreakdown.granted.toLocaleString()}`}
                  ></div>
                  <div
                    className="bg-gradient-to-r from-gray-300 to-gray-400 transition-all duration-500"
                    style={{
                      width: `${stats.ltipTotalAllocated > 0
                        ? Math.min((sharesBreakdown.ungranted / stats.ltipTotalAllocated) * 100, 100)
                        : 0}%`
                    }}
                    title={`Ungranted: ${sharesBreakdown.ungranted.toLocaleString()}`}
                  ></div>
                </div>
              </div>

              {/* Nested bar showing vested/unvested within granted */}
              <div className="w-full bg-gray-100 rounded-full h-3 mb-4 overflow-hidden">
                <div className="flex h-full">
                  <div
                    className="bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                    style={{
                      width: `${sharesBreakdown.granted > 0
                        ? Math.min((sharesBreakdown.vested / sharesBreakdown.granted) * 100, 100)
                        : 0}%`
                    }}
                    title={`Vested: ${sharesBreakdown.vested.toLocaleString()}`}
                  ></div>
                  <div
                    className="bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500"
                    style={{
                      width: `${sharesBreakdown.granted > 0
                        ? Math.min((sharesBreakdown.unvested / sharesBreakdown.granted) * 100, 100)
                        : 0}%`
                    }}
                    title={`Unvested: ${sharesBreakdown.unvested.toLocaleString()}`}
                  ></div>
                </div>
              </div>

              {/* Legend */}
              <div className={`grid grid-cols-2 gap-3 text-xs ${isRTL ? 'text-right' : 'text-left'}`}>
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="w-3 h-3 rounded bg-indigo-500"></div>
                  <span className="text-gray-600">{t('dashboard.grantedLabel')}: {sharesBreakdown.granted.toLocaleString()}</span>
                </div>
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="w-3 h-3 rounded bg-gray-400"></div>
                  <span className="text-gray-600">{t('dashboard.ungranted')}: {sharesBreakdown.ungranted.toLocaleString()}</span>
                </div>
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="w-3 h-3 rounded bg-green-500"></div>
                  <span className="text-gray-600">{t('dashboard.vested')}: {sharesBreakdown.vested.toLocaleString()}</span>
                </div>
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="w-3 h-3 rounded bg-amber-500"></div>
                  <span className="text-gray-600">{t('dashboard.unvested')}: {sharesBreakdown.unvested.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Shares Breakdown - Style 2: Segmented Horizontal Bars */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-lg transition">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-purple-500">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-gray-600 text-sm font-medium">{t('dashboard.usedSharesBreakdown')}</p>
                    <div className="group relative">
                      <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      <div className={`absolute ${isRTL ? 'right-0' : 'left-0'} top-6 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg`}>
                        {t('dashboard.usedSharesBreakdownTooltip')}
                      </div>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {sharesBreakdown.granted.toLocaleString()} / {stats.ltipTotalAllocated.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {/* Granted vs Ungranted */}
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600 font-medium">{t('dashboard.grantedVsUngranted')}</span>
                  <span className="font-semibold text-gray-900">
                    {stats.ltipTotalAllocated > 0
                      ? ((sharesBreakdown.granted / stats.ltipTotalAllocated) * 100).toFixed(1)
                      : 0}% {t('dashboard.granted')}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div className="flex h-full">
                    <div
                      className="bg-purple-500 transition-all duration-500 flex items-center justify-end pr-2"
                      style={{
                        width: `${stats.ltipTotalAllocated > 0
                          ? Math.min((sharesBreakdown.granted / stats.ltipTotalAllocated) * 100, 100)
                          : 0}%`
                      }}
                    >
                      <span className="text-xs font-semibold text-white">
                        {sharesBreakdown.granted > 0 ? sharesBreakdown.granted.toLocaleString() : ''}
                      </span>
                    </div>
                    <div
                      className="bg-gray-400 transition-all duration-500 flex items-center pl-2"
                      style={{
                        width: `${stats.ltipTotalAllocated > 0
                          ? Math.min((sharesBreakdown.ungranted / stats.ltipTotalAllocated) * 100, 100)
                          : 0}%`
                      }}
                    >
                      <span className="text-xs font-semibold text-white">
                        {sharesBreakdown.ungranted > 0 ? sharesBreakdown.ungranted.toLocaleString() : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                  <span>{t('dashboard.grantedLabel')}: {sharesBreakdown.granted.toLocaleString()}</span>
                  <span>{t('dashboard.ungranted')}: {sharesBreakdown.ungranted.toLocaleString()}</span>
                </div>
              </div>

              {/* Vested vs Unvested (within granted) */}
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600 font-medium">{t('dashboard.vestedVsUnvested')}</span>
                  <span className="font-semibold text-gray-900">
                    {sharesBreakdown.granted > 0
                      ? ((sharesBreakdown.vested / sharesBreakdown.granted) * 100).toFixed(1)
                      : 0}% {t('dashboard.vested').toLowerCase()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div className="flex h-full">
                    <div
                      className="bg-green-500 transition-all duration-500 flex items-center justify-end pr-2"
                      style={{
                        width: `${sharesBreakdown.granted > 0
                          ? Math.min((sharesBreakdown.vested / sharesBreakdown.granted) * 100, 100)
                          : 0}%`
                      }}
                    >
                      <span className="text-xs font-semibold text-white">
                        {sharesBreakdown.vested > 0 ? sharesBreakdown.vested.toLocaleString() : ''}
                      </span>
                    </div>
                    <div
                      className="bg-orange-500 transition-all duration-500 flex items-center pl-2"
                      style={{
                        width: `${sharesBreakdown.granted > 0
                          ? Math.min((sharesBreakdown.unvested / sharesBreakdown.granted) * 100, 100)
                          : 0}%`
                      }}
                    >
                      <span className="text-xs font-semibold text-white">
                        {sharesBreakdown.unvested > 0 ? sharesBreakdown.unvested.toLocaleString() : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                  <span>{t('dashboard.vested')}: {sharesBreakdown.vested.toLocaleString()}</span>
                  <span>{t('dashboard.unvested')}: {sharesBreakdown.unvested.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-lg transition">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-sky-500">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-gray-600 text-sm font-medium">{t('dashboard.optionsPoolUsed')}</p>
                    <div className="group relative">
                      <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      <div className={`absolute ${isRTL ? 'right-0' : 'left-0'} top-6 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg`}>
                        {t('dashboard.optionsPoolUsedTooltip')}
                      </div>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.optionPoolBalance.toLocaleString()} / {stats.esopTotalAllocated.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">{t('dashboard.usedVsAvailable')}</span>
                <span className="font-semibold text-gray-900">
                  {stats.esopTotalAllocated > 0
                    ? ((stats.esopTotalShares / stats.esopTotalAllocated) * 100).toFixed(1)
                    : 0}% {t('dashboard.used')}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-sky-500 to-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.esopTotalAllocated > 0
                      ? Math.min((stats.esopTotalShares / stats.esopTotalAllocated) * 100, 100)
                      : 0}%`
                  }}
                ></div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                <span>{stats.esopTotalShares.toLocaleString()} {t('dashboard.sharesUsed')}</span>
                <span>{stats.esopTotalAllocated.toLocaleString()} {t('dashboard.totalPool')}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {statCards.filter(card =>
              card.name !== 'Current FMV' &&
              card.name !== 'Equity Pool Size' &&
              card.name !== 'Options Pool Used'
            ).slice(0, 2).map((stat) => (
              <div
                key={stat.name}
                className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-lg transition"
              >
                <div className="flex items-center mb-3">
                  <div className={`p-2 rounded-lg ${colorClasses[stat.color as keyof typeof colorClasses]}`}>
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-gray-600 text-sm font-medium">{stat.name}</p>
                  <div className="group relative">
                    <Info className="w-4 h-4 text-gray-400 cursor-help" />
                    <div className="absolute left-0 top-6 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg">
                      {stat.tooltip}
                    </div>
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-lg transition">
            <div className="flex items-center mb-3">
              <div className="p-2 rounded-lg bg-emerald-500">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-gray-600 text-sm font-medium">{t('dashboard.currentFMV')}</p>
              <div className="group relative">
                <Info className="w-4 h-4 text-gray-400 cursor-help" />
                <div className={`absolute ${isRTL ? 'right-0' : 'left-0'} top-6 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg`}>
                  {t('dashboard.currentFMVTooltip')}
                </div>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">SAR {stats.currentFMV.toFixed(2)}</p>
          </div>

          {statCards.filter(card =>
            card.name !== 'Current FMV' &&
            card.name !== 'Equity Pool Size' &&
            card.name !== 'Options Pool Used'
          ).slice(2).map((stat) => (
            <div
              key={stat.name}
              className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-lg transition"
            >
              <div className="flex items-center mb-3">
                <div className={`p-2 rounded-lg ${colorClasses[stat.color as keyof typeof colorClasses]}`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-gray-600 text-sm font-medium">{stat.name}</p>
                <div className="group relative">
                  <Info className="w-4 h-4 text-gray-400 cursor-help" />
                  <div className="absolute left-0 top-6 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg">
                    {stat.tooltip}
                  </div>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{t('dashboard.recentActivity')}</h3>
          <div className="space-y-4">
            <div className={`flex items-center space-x-4 p-4 bg-gray-50 rounded-lg ${isRTL ? 'space-x-reverse' : ''}`}>
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Award className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{t('dashboard.newGrantIssued')}</p>
                <p className="text-xs text-gray-500">2 {t('dashboard.hoursAgo')}</p>
              </div>
            </div>
            <div className={`flex items-center space-x-4 p-4 bg-gray-50 rounded-lg ${isRTL ? 'space-x-reverse' : ''}`}>
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">25 {t('dashboard.employeesAdded')}</p>
                <p className="text-xs text-gray-500">1 {t('dashboard.daysAgo')}</p>
              </div>
            </div>
            <div className={`flex items-center space-x-4 p-4 bg-gray-50 rounded-lg ${isRTL ? 'space-x-reverse' : ''}`}>
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{t('dashboard.newLTIPPlanCreated')}</p>
                <p className="text-xs text-gray-500">3 {t('dashboard.daysAgo')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <h3 className="text-lg font-bold text-gray-900">{t('dashboard.upcomingVestingEvents')}</h3>
            <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <span className="text-sm text-gray-500">{t('dashboard.nextOf')} 3 {t('dashboard.of')} {upcomingVestingEvents.length}</span>
              {upcomingVestingEvents.length > 3 && (
                <button
                  onClick={() => window.location.href = '/dashboard/vesting-events'}
                  className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition"
                >
                  {t('dashboard.more')}
                </button>
              )}
            </div>
          </div>
          
          {upcomingVestingEvents.length > 0 ? (
            <div className="space-y-3">
              {upcomingVestingEvents.slice(0, 3).map((event) => {
                const isCliff = event.event_type === 'cliff';
                const borderColor = isCliff ? 'border-orange-500' : 'border-blue-500';
                const bgColor = isCliff ? 'bg-orange-50' : 'bg-blue-50';
                const badgeColor = isCliff ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800';
                const statusColor = event.status === 'due' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800';
                
                return (
                  <div key={event.id} className={`p-4 border-l-4 ${borderColor} ${bgColor} rounded-r-lg`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-gray-900">{event.employee_name}</p>
                          <button
                            onClick={() => handleViewVestingDetails(event)}
                            className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 transition cursor-pointer"
                          >
                            {formatVestingEventId(
                              event.id,
                              event.sequence_number,
                              event.vesting_date,
                              event.grants?.grant_number ?? event.grant_id
                            ).displayId}
                          </button>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${badgeColor}`}>
                            {isCliff ? t('dashboard.cliff') : t('dashboard.vesting')}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColor}`}>
                            {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                          </span>
                          {event.requires_exercise && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                              ESOP
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mb-1">
                          {Math.floor(event.shares_to_vest).toLocaleString()} {t('dashboard.shares')} • {event.plan_name} ({event.plan_code})
                        </p>
                        {event.exercise_price && (
                          <p className="text-xs text-gray-500 mb-1">
                            {t('dashboard.exercisePrice')}: ${event.exercise_price.toFixed(2)} • {t('dashboard.totalCost')}: ${(event.shares_to_vest * event.exercise_price).toFixed(2)}
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-500">
                            {formatDate(event.vesting_date)}
                          </p>
                          <span className="text-xs font-medium text-gray-700">
                            {formatDaysRemaining(event.days_remaining)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-500">{t('dashboard.noUpcomingVestingEvents')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('dashboard.noUpcomingVestingEventsDesc')}</p>
            </div>
          )}
          
          {upcomingVestingEvents.length > 3 && (
            <div className="mt-4 pt-4 border-t border-gray-200 text-center">
              <button
                onClick={() => window.location.href = '/dashboard/vesting-events'}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {t('dashboard.viewAllUpcomingEvents')} {upcomingVestingEvents.length} {t('dashboard.upcomingEvents')} →
              </button>
            </div>
          )}
        </div>

        {/* Vesting Events Due Section */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-lg font-bold text-gray-900">{t('dashboard.vestingEventsDue')}</h3>
              {dueVestingEvents.length > 0 && (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                  {dueVestingEvents.length} {t('dashboard.dueNow')}
                </span>
              )}
            </div>
            <span className="text-sm text-gray-500">{t('dashboard.requiresImmediateAttention')}</span>
          </div>
          
          {dueVestingEvents.length > 0 ? (
            <div className="space-y-3">
              {dueVestingEvents.map((event) => {
                const isCliff = event.event_type === 'cliff';
                const borderColor = 'border-red-500';
                const bgColor = 'bg-red-50';
                const badgeColor = isCliff ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800';
                
                return (
                  <div key={event.id} className={`p-4 border-l-4 ${borderColor} ${bgColor} rounded-r-lg`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-gray-900">{event.employee_name}</p>
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {formatVestingEventId(
                              event.id,
                              event.sequence_number,
                              event.vesting_date,
                              event.grants?.grant_number ?? event.grant_id
                            ).displayId}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${badgeColor}`}>
                            {isCliff ? 'Cliff' : 'Vesting'}
                          </span>
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            DUE NOW
                          </span>
                          {event.requires_exercise && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                              ESOP
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mb-1">
                          {Math.floor(event.shares_to_vest).toLocaleString()} shares • {event.plan_name} ({event.plan_code})
                        </p>
                        {event.exercise_price && (
                          <p className="text-xs text-gray-500 mb-1">
                            Exercise Price: ${event.exercise_price.toFixed(2)} • Total Cost: ${(event.shares_to_vest * event.exercise_price).toFixed(2)}
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-500">
                            {formatDate(event.vesting_date)}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-red-600">
                              {formatDaysRemaining(event.days_remaining)}
                            </span>
                            <button
                              onClick={() => handleViewVestingDetails(event)}
                              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No vesting events due</p>
              <p className="text-xs text-gray-400 mt-1">All vesting events are up to date</p>
            </div>
          )}
        </div>
      </div>

      {/* Shares Roadmap Chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">Shares Roadmap</h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Company-wide vesting schedule overview</p>
        </div>
        <div className="p-3 sm:p-6 overflow-x-auto">
          {roadmapData && roadmapData.length > 0 ? (
            <div className="space-y-4 min-w-[600px] sm:min-w-0">
              {/* Chart Bars */}
              <div className="flex items-end justify-between gap-2 sm:gap-3" style={{ height: '200px', minHeight: '200px' }}>
                {roadmapData.map((item: any, index: number) => {
                  const maxValue = Math.max(
                    ...roadmapData.map((d: any) => 
                      (d.unvestedValuation || 0) + (d.vestedValuation || 0)
                    ),
                    1
                  );
                  
                  const totalValuation = (item.unvestedValuation || 0) + (item.vestedValuation || 0);
                  const chartHeight = 200;
                  const totalBarHeightPx = maxValue > 0 ? (totalValuation / maxValue) * chartHeight : 0;
                  const vestedBarHeightPx = totalValuation > 0 
                    ? ((item.vestedValuation || 0) / totalValuation) * totalBarHeightPx 
                    : 0;
                  const unvestedBarHeightPx = totalBarHeightPx - vestedBarHeightPx;
                  
                  const finalVestedHeight = vestedBarHeightPx > 0 ? Math.max(vestedBarHeightPx, 4) : 0;
                  const finalUnvestedHeight = unvestedBarHeightPx > 0 ? Math.max(unvestedBarHeightPx, 4) : 0;
                  
                  return (
                    <div key={index} className="flex-1 h-full flex flex-col items-center group cursor-pointer relative">
                      {/* Tooltip */}
                      <div className="hidden group-hover:block absolute bottom-full mb-2 bg-gray-900 text-white text-xs rounded-lg px-2 sm:px-3 py-2 shadow-lg z-10 whitespace-nowrap transform -translate-x-1/2 left-1/2">
                        <div className="font-semibold mb-1">{item.year}</div>
                        {item.vestedValuation > 0 && (
                          <>
                            <div className="text-green-300">• Vested Valuation: <strong>SAR {item.vestedValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                            <div className="text-green-300">• Vested Shares: <strong>{item.vestedShares.toLocaleString()}</strong></div>
                          </>
                        )}
                        {item.unvestedValuation > 0 && (
                          <>
                            <div className="text-purple-300">• Unvested Valuation: <strong>SAR {item.unvestedValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                            <div className="text-purple-300">• Unvested Shares: <strong>{item.unvestedShares.toLocaleString()}</strong></div>
                          </>
                        )}
                        {totalValuation === 0 && (
                          <div className="text-gray-400">No shares in this period</div>
                        )}
                      </div>
                      
                      {/* Stacked Bar */}
                      <div className="relative w-full h-full flex flex-col items-center justify-end">
                        {/* Share count label above the block */}
                        {(item.unvestedShares > 0 || item.vestedShares > 0) && (
                          <div 
                            className="absolute text-[10px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap"
                            style={{ 
                              bottom: `${totalBarHeightPx + 4}px`,
                              left: '50%',
                              transform: 'translateX(-50%)'
                            }}
                          >
                            {(item.unvestedShares + item.vestedShares).toLocaleString()}
                          </div>
                        )}
                        
                        {/* Unvested portion (purple) - bottom */}
                        {finalUnvestedHeight > 0 && (
                          <div 
                            className="w-full bg-gradient-to-t from-purple-600 to-purple-500 rounded-t-lg transition-all duration-300 group-hover:from-purple-700 group-hover:to-purple-600 group-hover:shadow-lg"
                            style={{ 
                              height: `${finalUnvestedHeight}px`
                            }}
                          />
                        )}
                        {/* Vested portion (green) - top */}
                        {finalVestedHeight > 0 && (
                          <div 
                            className="w-full bg-gradient-to-t from-green-600 to-green-500 transition-all duration-300 group-hover:from-green-700 group-hover:to-green-600 group-hover:shadow-lg"
                            style={{ 
                              height: `${finalVestedHeight}px`,
                              borderRadius: finalUnvestedHeight === 0 ? '0.5rem 0.5rem 0 0' : '0'
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* X-Axis Labels */}
              <div className="flex items-center justify-between gap-2 sm:gap-3 mt-2 border-t border-gray-200 pt-3">
                {roadmapData.map((item: any, index: number) => (
                  <div key={index} className="flex-1 text-center">
                    <div className="text-xs sm:text-sm text-gray-600 font-medium">{item.year}</div>
                  </div>
                ))}
              </div>
              
              {/* Legend */}
              <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs text-gray-600 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-green-600 flex-shrink-0"></div>
                    <span>Vested Shares (SAR)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-purple-600 flex-shrink-0"></div>
                    <span>Unvested Shares (SAR)</span>
                  </div>
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500 text-center space-y-1">
                  <p><strong>Vested includes:</strong> vested, transferred, exercised, due, and past-dated events</p>
                  <p><strong>Unvested includes:</strong> pending and future-dated events</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <TrendingUp className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No roadmap data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Vesting Events Calendar */}
      <div className="mb-6 w-full max-w-full overflow-hidden">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Vesting Events Calendar</h3>
          <p className="text-sm text-gray-600">Visual timeline of upcoming vesting events</p>
        </div>
        <div className="w-full max-w-full overflow-hidden">
          <VestingEventsCalendar 
            events={calendarVestingEvents}
            onEventClick={handleViewVestingDetails}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">Quick Actions</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition group">
            <div className="w-10 h-10 bg-blue-100 group-hover:bg-blue-200 rounded-lg flex items-center justify-center transition">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-900">Create New Plan</p>
              <p className="text-xs text-gray-500">Define LTIP/ESOP parameters</p>
            </div>
          </button>
          <button className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition group">
            <div className="w-10 h-10 bg-green-100 group-hover:bg-green-200 rounded-lg flex items-center justify-center transition">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-900">Import Employees</p>
              <p className="text-xs text-gray-500">Bulk upload via CSV</p>
            </div>
          </button>
          <button className="flex items-center space-x-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition group">
            <div className="w-10 h-10 bg-purple-100 group-hover:bg-purple-200 rounded-lg flex items-center justify-center transition">
              <Award className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-900">Issue Grants</p>
              <p className="text-xs text-gray-500">Allocate shares to employees</p>
            </div>
          </button>
        </div>
      </div>

      {/* Vesting Event Details Modal */}
      {showVestingDetailsModal && selectedVestingEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  Vesting Event Details
                </h3>
                <p className="text-gray-600">
                  {formatVestingEventId(
                    selectedVestingEvent.id,
                    selectedVestingEvent.sequence_number,
                    selectedVestingEvent.vesting_date,
                    selectedVestingEvent.grants?.grant_number ?? selectedVestingEvent.grant_id
                  ).displayId}
                </p>
              </div>
              <button
                onClick={() => setShowVestingDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Event Information */}
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-3">Event Information</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Employee:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedVestingEvent.employee_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Event Type:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedVestingEvent.event_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Vesting Date:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatDate(selectedVestingEvent.vesting_date)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                      {selectedVestingEvent.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Days Remaining:</span>
                    <span className="text-sm font-medium text-red-600">
                      {formatDaysRemaining(selectedVestingEvent.days_remaining)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Shares Information */}
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-3">Shares & Financial</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Shares to Vest:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {Math.floor(selectedVestingEvent.shares_to_vest).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Plan:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedVestingEvent.plan_name} ({selectedVestingEvent.plan_code})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Plan Type:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedVestingEvent.plan_type}
                    </span>
                  </div>
                  {selectedVestingEvent.exercise_price && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Exercise Price:</span>
                        <span className="text-sm font-medium text-gray-900">
                          ${selectedVestingEvent.exercise_price.toFixed(2)} per share
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Total Exercise Cost:</span>
                        <span className="text-sm font-medium text-gray-900">
                          ${(selectedVestingEvent.shares_to_vest * selectedVestingEvent.exercise_price).toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Action Required - Only show for due events */}
              {selectedVestingEvent.status === 'due' && (
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-3">Action Required</h4>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-800">
                          This vesting event is due and requires processing
                        </p>
                        <p className="text-xs text-red-600 mt-1">
                          {selectedVestingEvent.requires_exercise 
                            ? 'Employee needs to exercise options to receive shares'
                            : 'Shares should be transferred to employee portfolio'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Information - Show for non-due events */}
              {selectedVestingEvent.status !== 'due' && (
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-3">Status Information</h4>
                  <div className={`border rounded-lg p-4 ${
                    selectedVestingEvent.status === 'pending' ? 'bg-blue-50 border-blue-200' :
                    selectedVestingEvent.status === 'vested' ? 'bg-green-50 border-green-200' :
                    selectedVestingEvent.status === 'exercised' || selectedVestingEvent.status === 'transferred' ? 'bg-gray-50 border-gray-200' :
                    'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <Info className={`w-5 h-5 mt-0.5 ${
                        selectedVestingEvent.status === 'pending' ? 'text-blue-600' :
                        selectedVestingEvent.status === 'vested' ? 'text-green-600' :
                        'text-gray-600'
                      }`} />
                      <div>
                        <p className={`text-sm font-medium ${
                          selectedVestingEvent.status === 'pending' ? 'text-blue-800' :
                          selectedVestingEvent.status === 'vested' ? 'text-green-800' :
                          'text-gray-800'
                        }`}>
                          {selectedVestingEvent.status === 'pending' && 'This vesting event is scheduled for the future'}
                          {selectedVestingEvent.status === 'vested' && 'This vesting event has been processed and shares are vested'}
                          {selectedVestingEvent.status === 'exercised' && 'This ESOP event has been exercised by the employee'}
                          {selectedVestingEvent.status === 'transferred' && 'These shares have been transferred to the employee portfolio'}
                          {!['pending', 'vested', 'exercised', 'transferred'].includes(selectedVestingEvent.status) && 'Event status information'}
                        </p>
                        <p className={`text-xs mt-1 ${
                          selectedVestingEvent.status === 'pending' ? 'text-blue-600' :
                          selectedVestingEvent.status === 'vested' ? 'text-green-600' :
                          'text-gray-600'
                        }`}>
                          {selectedVestingEvent.status === 'pending' && `Vesting date: ${formatDate(selectedVestingEvent.vesting_date)}`}
                          {selectedVestingEvent.status === 'vested' && 'No further action required'}
                          {(selectedVestingEvent.status === 'exercised' || selectedVestingEvent.status === 'transferred') && 'Transaction completed'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 pt-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowVestingDetailsModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Close
              </button>
              {/* Only show Process button for due events */}
              {selectedVestingEvent.status === 'due' && (
                <button
                  onClick={() => {
                    // Navigate to vesting events page for processing
                    window.location.href = '/dashboard/vesting-events';
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Process in Vesting Events
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
