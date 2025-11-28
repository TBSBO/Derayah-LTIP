import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Users, Award, Calendar, Clock, CheckCircle, XCircle, PieChart, TrendingUp } from 'lucide-react';
import PortfolioValuation from '../components/PortfolioValuation';
import { lazy, Suspense } from 'react';
import VestingEventsCalendar from '../components/VestingEventsCalendar';
import type { VestingEventWithDetails } from '../lib/vestingEventsService';
import { getCached, setCached, createCacheKey } from '../lib/queryCache';

// Lazy load heavy chart components
const PerformanceChart = lazy(() => import('../components/PerformanceChart'));

export default function EmployeeDashboard() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [grantData, setGrantData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tadawulSymbol, setTadawulSymbol] = useState('');
  const [sharePrice, setSharePrice] = useState<number>(30); // Default to 30 SAR
  const [showContractModal, setShowContractModal] = useState(false);
  const [selectedGrant, setSelectedGrant] = useState<any>(null);
  const [contractContent, setContractContent] = useState('');
  const [displayMode, setDisplayMode] = useState<'number' | 'valuation'>('number');
  const [employeeVestingEvents, setEmployeeVestingEvents] = useState<VestingEventWithDetails[]>([]);
  const [selectedVestingEvent, setSelectedVestingEvent] = useState<VestingEventWithDetails | null>(null);
  const [showVestingEventModal, setShowVestingEventModal] = useState(false);

  useEffect(() => {
    loadEmployeeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - loadEmployeeData is stable with useCallback

  // Function to fetch share price from Tadawul
  // Optimized: Skip actual fetch to avoid CORS issues and unnecessary network requests
  const fetchTadawulPrice = async (symbol: string) => {
    // Skip the fetch call that causes CORS issues and continuous loading
    // Use the manual FMV from company data instead, or default to 30
    // In production, implement a backend proxy for Tadawul API calls
    if (!symbol) return 30;
    
    // Return default immediately to avoid blocking
    return 30;
  };

  const loadEmployeeData = useCallback(async () => {
    try {
      // Get current user from Supabase auth
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No authenticated user, redirecting to login...');
        window.location.href = '/employee/login';
        return;
      }

      // Check cache for employee data
      const employeeCacheKey = createCacheKey('employee', user.id);
      let employee = getCached<any>(employeeCacheKey);

      if (!employee) {
        // Get employee data from database using user_id
        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .select('id, company_id, first_name_en, last_name_en, email, user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (employeeError || !employeeData) {
          console.error('Error loading employee data:', employeeError);
          window.location.href = '/employee/login';
          return;
        }

        employee = employeeData;
        setCached(employeeCacheKey, employee);
      }

      // Check cache for grants and company data
      const grantsCacheKey = createCacheKey('grants', employee.id);
      const companyCacheKey = createCacheKey('company', employee.company_id);
      const vestingEventsCacheKey = createCacheKey('vesting-events', employee.id);

      let cachedGrants = getCached<any[]>(grantsCacheKey);
      let cachedCompany = getCached<any>(companyCacheKey);
      let cachedVestingEvents = getCached<any[]>(vestingEventsCacheKey);

      // Prepare queries - use cache if available, otherwise fetch
      const grantsQuery = cachedGrants 
        ? Promise.resolve({ data: cachedGrants, error: null })
        : supabase
            .from('grants')
            .select(`
              id, 
              total_shares, 
              vested_shares, 
              remaining_unvested_shares, 
              status, 
              grant_number, 
              grant_date,
              vesting_start_date,
              vesting_end_date,
              employee_acceptance_at,
              generated_documents (
                id,
                status,
                document_type
              ),
              incentive_plans (
                plan_name_en,
                plan_type
              )
            `)
            .eq('employee_id', employee.id)
            .in('status', ['active', 'pending_signature'])
            .then((result) => {
              if (!result.error && result.data) {
                setCached(grantsCacheKey, result.data);
              }
              return result;
            });

      const companyQuery = cachedCompany
        ? Promise.resolve({ data: cachedCompany, error: null })
        : supabase
            .from('companies')
            .select('tadawul_symbol, current_fmv, fmv_source')
            .eq('id', employee.company_id)
            .maybeSingle()
            .then((result) => {
              if (!result.error && result.data) {
                setCached(companyCacheKey, result.data);
              }
              return result;
            });

      const vestingEventsQuery = cachedVestingEvents
        ? Promise.resolve({ data: cachedVestingEvents, error: null })
        : supabase
            .from('vesting_events')
            .select(`
              id,
              grant_id,
              employee_id,
              vesting_date,
              shares_to_vest,
              status,
              event_type,
              sequence_number,
              performance_condition_met,
              performance_notes,
              grants (
                id,
                grant_number,
                incentive_plans (
                  plan_name_en,
                  plan_code,
                  plan_type
                )
              )
            `)
            .eq('employee_id', employee.id)
            .order('vesting_date', { ascending: true })
            .then((result) => {
              if (!result.error && result.data) {
                setCached(vestingEventsCacheKey, result.data);
              }
              return result;
            });

      // Execute all queries in parallel
      const [grantsRes, companyRes, vestingEventsRes] = await Promise.all([
        grantsQuery,
        companyQuery,
        vestingEventsQuery
      ]);

      // Initialize variables outside the if block
      let totalShares = 0;
      let totalVested = 0;
      let totalUnvested = 0;
      let totalLapsed = 0;
      let nextVestingDate: Date | null = null;
      let roadmapData: any[] = [];

      const rawGrants = grantsRes.data || [];
      const rawVestingEvents = vestingEventsRes.data || [];

      if (vestingEventsRes.error) {
        console.error('Error loading vesting events:', vestingEventsRes.error);
      }

      const employeeFullName = [employee.first_name_en, employee.last_name_en].filter(Boolean).join(' ').trim() || employee.email;

      const transformedVestingEvents: VestingEventWithDetails[] = rawVestingEvents.map((event: any) => {
        const plan = event.grants?.incentive_plans;
        const vestingDate = new Date(event.vesting_date);
        const today = new Date();
        const diffTime = vestingDate.getTime() - today.setHours(0, 0, 0, 0);
        const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        return {
          ...event,
          employee_name: employeeFullName,
          plan_name: plan?.plan_name_en || event.grants?.grant_number || 'Grant',
          plan_code: plan?.plan_code || event.grants?.grant_number || '',
          plan_type: plan?.plan_type || 'ESOP',
          days_remaining: daysRemaining,
          can_exercise: event.status === 'due' || event.status === 'pending',
          requires_exercise: false,
        } as VestingEventWithDetails;
      });
 
      if (rawGrants.length > 0) {
        totalShares = rawGrants.reduce((sum, g) => sum + Number(g.total_shares), 0);
        
        // Calculate base vested shares from grants
        const baseVested = rawGrants.reduce((sum, g) => sum + Number(g.vested_shares || 0), 0);
        
        // Add shares from vesting events with status 'due', 'transferred', or 'exercised'
        const additionalVestedFromEvents = rawVestingEvents.reduce((sum, event) => {
          const status = event.status?.toLowerCase();
          if (status === 'due' || status === 'transferred' || status === 'exercised') {
            return sum + Number(event.shares_to_vest || 0);
          }
          return sum;
        }, 0);
        
        // Total vested includes base vested + due + transferred + exercised
        totalVested = baseVested + additionalVestedFromEvents;
        
        // Calculate unvested: total shares minus total vested
        totalUnvested = totalShares - totalVested;
        totalLapsed = rawGrants
          .filter(g => g.status === 'lapsed')
          .reduce((sum, g) => sum + Number(g.total_shares || 0), 0);

        // Calculate next vesting date (simplified - assumes monthly vesting after cliff)
        const activeGrants = rawGrants.filter(g => g.status === 'active' && g.vesting_end_date);
        if (activeGrants.length > 0) {
          const dates = activeGrants
            .map(g => new Date(g.vesting_end_date))
            .filter(d => d > new Date())
            .sort((a, b) => a.getTime() - b.getTime());
          nextVestingDate = dates[0] || null;
        }

        const manualFmv =
          companyRes.data?.current_fmv !== null && companyRes.data?.current_fmv !== undefined
            ? Number(companyRes.data.current_fmv)
            : null;

        // Use manual FMV if available, otherwise default to 30
        // Skip the fetchTadawulPrice call to avoid unnecessary network requests and CORS issues
        let latestPrice = 30;
        if (manualFmv !== null && !Number.isNaN(manualFmv)) {
          latestPrice = manualFmv;
        }

        setSharePrice(latestPrice);

        // Calculate roadmap data for next 5 years using vesting events
        const currentYear = new Date().getFullYear();
        const fmvPerShare = latestPrice;
        
        // Get all active grants for roadmap calculation
        const allActiveGrants = rawGrants.filter((g: any) => g.status === 'active');
        
        // Calculate total unvested shares across all grants
        const totalUnvestedShares = allActiveGrants.reduce((sum, grant) => {
          const totalShares = Number(grant.total_shares || 0);
          const alreadyVested = Number(grant.vested_shares || 0);
          return sum + (totalShares - alreadyVested);
        }, 0);
        
        // Calculate vested and unvested shares per fiscal year using vesting events
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // First, collect all unique years from vesting events
        const yearsWithEvents = new Set<number>();
        rawVestingEvents.forEach((event: any) => {
          const vestingDate = new Date(event.vesting_date);
          const eventYear = vestingDate.getFullYear();
          yearsWithEvents.add(eventYear);
        });
        
        // Determine the start year: minimum of current year and earliest event year, but ensure we show at least 5 years
        const earliestEventYear = yearsWithEvents.size > 0 ? Math.min(...Array.from(yearsWithEvents)) : currentYear;
        const latestEventYear = yearsWithEvents.size > 0 ? Math.max(...Array.from(yearsWithEvents)) : currentYear;
        const startYear = Math.min(currentYear, earliestEventYear);
        // Ensure we show at least 5 years from start, or extend to include all event years
        const endYear = Math.max(currentYear + 4, latestEventYear);
        
        // Initialize roadmap data for all years that have events or are in the 5-year window
        roadmapData = [];
        for (let year = startYear; year <= endYear; year++) {
          roadmapData.push({
            year: String(year),
            unvestedShares: 0,
            unvestedValuation: 0,
            vestedShares: 0,
            vestedValuation: 0
          });
        }
        
        // Group vesting events by fiscal year
        rawVestingEvents.forEach((event: any) => {
          const vestingDate = new Date(event.vesting_date);
          const eventYear = vestingDate.getFullYear();
          const sharesToVest = Number(event.shares_to_vest || 0);
          
          if (sharesToVest <= 0) return;
          
          // Find which fiscal year this event belongs to
          // Fiscal year format is FY-YYYY-YY where YYYY is the calendar year
          const fiscalYearStart = eventYear;
          
          // Find the corresponding roadmap entry
          const roadmapIndex = roadmapData.findIndex((item: any) => {
            const roadmapYear = parseInt(item.year);
            return roadmapYear === fiscalYearStart;
          });
          
          if (roadmapIndex >= 0) {
            // Check if event is vested (past date or status is 'vested', 'transferred', 'exercised', or 'due')
            const isVested = vestingDate < today || 
                            event.status === 'vested' || 
                            event.status === 'transferred' || 
                            event.status === 'exercised' ||
                            event.status === 'due';
            
            if (isVested) {
              roadmapData[roadmapIndex].vestedShares += sharesToVest;
              roadmapData[roadmapIndex].vestedValuation += sharesToVest * fmvPerShare;
            } else if (event.status !== 'lapsed') {
              // Future unvested events
              roadmapData[roadmapIndex].unvestedShares += sharesToVest;
              roadmapData[roadmapIndex].unvestedValuation += sharesToVest * fmvPerShare;
            }
          }
        });
        
        // If no vesting events found, fall back to distributing unvested shares evenly
        const totalRoadmapShares = roadmapData.reduce((sum, item) => sum + item.unvestedShares + item.vestedShares, 0);
        
        // If no events mapped to roadmap, distribute evenly across remaining vesting period
        if (totalRoadmapShares === 0 && totalUnvestedShares > 0) {
          // Calculate average shares per year
          const avgSharesPerYear = totalUnvestedShares / 5;
          roadmapData = roadmapData.map((item: any) => ({
            ...item,
            unvestedShares: Math.floor(avgSharesPerYear),
            unvestedValuation: Math.floor(avgSharesPerYear * fmvPerShare)
          }));
        }

        console.log('Grant Data:', {
          total_shares: totalShares,
          vested_shares: totalVested,
          remaining_unvested_shares: totalUnvested,
          totalUnvestedShares,
          allActiveGrants: allActiveGrants.length,
          roadmapData,
          fmvPerShare,
          vestingEventsCount: rawVestingEvents.length,
          roadmapTotalShares: roadmapData.reduce((sum, item) => sum + item.unvestedShares + item.vestedShares, 0)
        });
      }

      const enrichedGrants = rawGrants.map((grant: any) => {
        const documents = Array.isArray(grant.generated_documents) ? grant.generated_documents : [];
        const grantAgreementDoc = documents.find((doc: any) => doc.document_type === 'grant_agreement') || documents[0];
        const documentStatus = grantAgreementDoc?.status || grant.status || 'draft';

        return {
          ...grant,
          document_status: documentStatus,
          contract_document_id: grantAgreementDoc?.id || null
        };
      });

      if (companyRes.data) {
        setTadawulSymbol(companyRes.data.tadawul_symbol);
      }

      setGrantData({
        grants: enrichedGrants,
        total_shares: totalShares,
        vested_shares: totalVested,
        remaining_unvested_shares: totalUnvested,
        total_lapsed: totalLapsed,
        next_vesting_date: nextVestingDate,
        roadmapData
      });

      setEmployeeVestingEvents(transformedVestingEvents);
    } catch (error) {
      console.error('Error loading employee data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleReviewContract = (grant: any) => {
    setSelectedGrant(grant);
    
    // Generate contract content
    const employeeData = sessionStorage.getItem('employee');
    const employee = employeeData ? JSON.parse(employeeData) : {};
    
    const contractText = `
EMPLOYEE STOCK GRANT AGREEMENT

Grant Number: ${grant.grant_number}
Employee: ${employee.first_name_en} ${employee.last_name_en}
Email: ${employee.email}
Date: ${new Date().toLocaleDateString()}

GRANT TERMS:
- Total Shares: ${Number(grant.total_shares).toLocaleString()}
- Grant Date: ${new Date().toLocaleDateString()}
- Vesting Schedule: 4 years with 1-year cliff
- Vesting Start Date: ${new Date().toLocaleDateString()}
- Vesting End Date: ${new Date(Date.now() + 4 * 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}

VESTING SCHEDULE:
- 25% vests after 1 year (cliff)
- Remaining 75% vests monthly over 3 years

CONDITIONS:
1. Employment must continue for shares to vest
2. Shares subject to company's equity plan
3. Tax implications apply per local regulations
4. Shares may be subject to transfer restrictions

ACCEPTANCE:
By signing below, the employee acknowledges receipt and understanding of this grant agreement.

Employee Signature: _________________ Date: _________

Company Representative: _________________ Date: _________

This agreement is subject to the terms and conditions of the company's equity incentive plan.
    `.trim();
    
    setContractContent(contractText);
    setShowContractModal(true);
  };

  const handleAcceptContract = async () => {
    if (!selectedGrant) return;
    
    try {
      // Calculate vested shares based on grant date and current date
      const grantDate = new Date(selectedGrant.grant_date || new Date());
      const currentDate = new Date();
      const totalShares = Number(selectedGrant.total_shares) || 0;
      
      // Calculate months since grant date
      const monthsSinceGrant = Math.max(0, 
        (currentDate.getFullYear() - grantDate.getFullYear()) * 12 + 
        (currentDate.getMonth() - grantDate.getMonth())
      );
      
      // Standard 4-year vesting with 1-year cliff
      let vestedShares = 0;
      if (monthsSinceGrant >= 12) {
        // After 1-year cliff, 25% vests immediately, then monthly vesting
        const cliffShares = Math.floor(totalShares * 0.25);
        const remainingShares = totalShares - cliffShares;
        const monthlyVesting = remainingShares / 36; // 36 months remaining after cliff
        const additionalMonths = Math.min(monthsSinceGrant - 12, 36);
        vestedShares = cliffShares + (monthlyVesting * additionalMonths);
      }
      
      // Ensure vested shares don't exceed total shares
      vestedShares = Math.min(vestedShares, totalShares);
      const remainingUnvested = totalShares - vestedShares;
      
      // Update grant status to active with calculated vesting
      const { error } = await supabase
        .from('grants')
        .update({ 
          status: 'active',
          employee_acceptance_at: new Date().toISOString(),
          vested_shares: Math.floor(vestedShares),
          remaining_unvested_shares: Math.floor(remainingUnvested)
        })
        .eq('id', selectedGrant.id);
      
      if (error) {
        console.error('Error accepting contract:', error);
        alert(t('employeeDashboard.failedToAcceptContract'));
        return;
      }

      // Also update the document status to signed
      const { error: docError } = await supabase
        .from('generated_documents')
        .update({ 
          status: 'signed'
        })
        .eq('grant_id', selectedGrant.id);
      
      if (docError) {
        console.error('Error updating document status:', docError);
        // Don't fail the whole operation for this, just log it
      }
      
      // Close modal and reload data
      setShowContractModal(false);
      setSelectedGrant(null);
      await loadEmployeeData();
      
      alert(`Contract accepted successfully! Your grant is now active.\n\nVested shares: ${Math.floor(vestedShares).toLocaleString()}\nRemaining unvested: ${Math.floor(remainingUnvested).toLocaleString()}`);
    } catch (error) {
      console.error('Error accepting contract:', error);
      alert(t('employeeDashboard.failedToAcceptContract'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-500 mt-4">{t('employeeDashboard.loadingDashboard')}</p>
        </div>
      </div>
    );
  }

  // Memoize default grant data to prevent unnecessary recalculations
  const displayGrantData = useMemo(() => {
    return grantData || {
      grants: [],
      total_shares: 0,
      vested_shares: 0,
      remaining_unvested_shares: 0,
      total_lapsed: 0,
      next_vesting_date: null,
      roadmapData: []
    };
  }, [grantData]);

  // Memoize pending signature grants to avoid recalculating on every render
  const pendingSignatureGrants = useMemo(() => {
    return displayGrantData.grants.filter((grant: any) => {
      // Don't show grants that have been accepted (have employee_acceptance_at)
      // This is the source of truth - if the grant has been accepted, it shouldn't show in Action Required
      if (grant.employee_acceptance_at) {
        return false;
      }
      
      // Check document status or grant status
      const normalizedDocStatus = grant.document_status?.toLowerCase?.() || grant.status?.toLowerCase?.() || '';
      return normalizedDocStatus === 'pending_signature';
    });
  }, [displayGrantData.grants]);

  // Debug: Log roadmap data
  console.log('Display Grant Data Roadmap:', displayGrantData.roadmapData);

  // Simple pie chart component
  const SimplePieChart = ({ data, size = 60 }: { data: { label: string; value: number; color: string }[], size?: number }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return <div className={`w-${size/4} h-${size/4} rounded-full bg-gray-200`}></div>;

    let cumulativePercentage = 0;
    const radius = size / 2 - 2;
    const centerX = size / 2;
    const centerY = size / 2;

    const createPath = (startAngle: number, endAngle: number) => {
      const start = polarToCartesian(centerX, centerY, radius, endAngle);
      const end = polarToCartesian(centerX, centerY, radius, startAngle);
      const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
      return `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
    };

    const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
      const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
      return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
      };
    };

    return (
      <svg width={size} height={size} className="transform -rotate-90">
        {data.map((item, index) => {
          const percentage = (item.value / total) * 100;
          const startAngle = cumulativePercentage * 3.6;
          const endAngle = (cumulativePercentage + percentage) * 3.6;
          cumulativePercentage += percentage;

          return (
            <path
              key={index}
              d={createPath(startAngle, endAngle)}
              fill={item.color}
              stroke="white"
              strokeWidth="1"
            />
          );
        })}
      </svg>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('employeeDashboard.title')}</h1>
        <p className="text-gray-600 mt-2">{t('employeeDashboard.description')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 text-white">
          <p className="text-blue-100 mb-2">{t('employeeDashboard.totalSharesGranted')}</p>
          <p className="text-4xl font-bold">{displayGrantData.total_shares.toLocaleString()}</p>
          <p className="text-blue-200 text-sm mt-2">{displayGrantData.grants.length} {displayGrantData.grants.length === 1 ? t('employeeDashboard.grant') : t('employeeDashboard.grants')}</p>
        </div>

        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl shadow-lg p-6 text-white">
          <p className="text-green-100 mb-2">{t('employeeDashboard.vestedShares')}</p>
          <p className="text-4xl font-bold">{displayGrantData.vested_shares.toLocaleString()}</p>
          <p className="text-green-200 text-sm mt-2">{displayGrantData.total_shares > 0 ? ((displayGrantData.vested_shares / displayGrantData.total_shares) * 100).toFixed(1) : '0'}% {t('employeeDashboard.ofTotal')}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl shadow-lg p-6 text-white">
          <p className="text-purple-100 mb-2">{t('employeeDashboard.unvestedShares')}</p>
          <p className="text-4xl font-bold">{displayGrantData.remaining_unvested_shares.toLocaleString()}</p>
          <p className="text-purple-200 text-sm mt-2">{displayGrantData.total_shares > 0 ? ((displayGrantData.remaining_unvested_shares / displayGrantData.total_shares) * 100).toFixed(1) : '0'}% {t('employeeDashboard.remaining')}</p>
        </div>
      </div>

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Section: Status Card */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">{t('employeeDashboard.status')}</h3>
            {/* Toggle Switch */}
            <div className="flex items-center space-x-3 mt-4">
              <button
                onClick={() => setDisplayMode('number')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  displayMode === 'number'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t('employeeDashboard.number')}
              </button>
              <button
                onClick={() => setDisplayMode('valuation')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  displayMode === 'valuation'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t('employeeDashboard.valuation')}
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              {/* Vested Options */}
              <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-green-600 flex items-center">
                    {t('employeeDashboard.vested')} 
                    <span className="ml-1">›</span>
                    <svg className="w-4 h-4 ml-1 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <SimplePieChart
                    data={[
                      { label: t('employeeDashboard.vested'), value: displayGrantData.vested_shares, color: '#10B981' },
                      { label: t('employeeDashboard.unvested'), value: displayGrantData.remaining_unvested_shares, color: '#E5E7EB' }
                    ]}
                    size={40}
                  />
                </div>
                <div className="text-2xl font-bold text-purple-700">
                  {displayMode === 'number' 
                    ? displayGrantData.vested_shares.toLocaleString() 
                    : `SAR ${(displayGrantData.vested_shares * sharePrice).toLocaleString()}`}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {displayGrantData.total_shares > 0 
                    ? ((displayGrantData.vested_shares / displayGrantData.total_shares) * 100).toFixed(2) + '%' 
                    : '0%'}
                </div>
              </div>

              {/* Unvested Options */}
              <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-yellow-600 flex items-center">
                    {t('employeeDashboard.unvested')} 
                    <span className="ml-1">›</span>
                    <svg className="w-4 h-4 ml-1 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <SimplePieChart
                    data={[
                      { label: t('employeeDashboard.unvested'), value: displayGrantData.remaining_unvested_shares, color: '#F59E0B' },
                      { label: t('employeeDashboard.vested'), value: displayGrantData.vested_shares, color: '#E5E7EB' }
                    ]}
                    size={40}
                  />
                </div>
                <div className="text-2xl font-bold text-purple-700">
                  {displayMode === 'number' 
                    ? displayGrantData.remaining_unvested_shares.toLocaleString() 
                    : `SAR ${(displayGrantData.remaining_unvested_shares * sharePrice).toLocaleString()}`}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {displayGrantData.total_shares > 0 
                    ? ((displayGrantData.remaining_unvested_shares / displayGrantData.total_shares) * 100).toFixed(2) + '%' 
                    : '0%'}
                </div>
              </div>

              {/* Lapsed Options */}
              <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-orange-600 flex items-center">
                    {t('employeeDashboard.lapsed')} 
                    <span className="ml-1">›</span>
                    <svg className="w-4 h-4 ml-1 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <SimplePieChart
                    data={[
                      { label: t('employeeDashboard.lapsed'), value: displayGrantData.total_lapsed || 0, color: '#F97316' },
                      { label: t('employeeDashboard.active'), value: displayGrantData.total_shares - (displayGrantData.total_lapsed || 0), color: '#E5E7EB' }
                    ]}
                    size={40}
                  />
                </div>
                <div className="text-2xl font-bold text-purple-700">
                  {displayMode === 'number' 
                    ? (displayGrantData.total_lapsed || 0).toLocaleString() 
                    : `SAR ${((displayGrantData.total_lapsed || 0) * sharePrice).toLocaleString()}`}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {displayGrantData.total_shares > 0 
                    ? (((displayGrantData.total_lapsed || 0) / displayGrantData.total_shares) * 100).toFixed(2) + '%' 
                    : '0%'}
                </div>
              </div>

              {/* Exercised & Buy-Back (using same layout) */}
              <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                <div className="space-y-3">
                  <div>
                    <span className="text-xs font-medium text-purple-600 flex items-center">
                      {t('employeeDashboard.exercised')} 
                      <span className="ml-1">›</span>
                      <svg className="w-3 h-3 ml-1 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <div className="text-lg font-bold text-purple-700">0</div>
                  </div>
                  <div className="border-t border-gray-200 pt-2">
                    <span className="text-xs font-medium text-green-600 flex items-center">
                      {t('employeeDashboard.buyBack')} 
                      <span className="ml-1">›</span>
                      <svg className="w-3 h-3 ml-1 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <div className="text-lg font-bold text-purple-700">0</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Section: Vesting Date & Exercise Price */}
        <div className="lg:col-span-1 space-y-6">
          {/* When is my next vesting due? */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">{t('employeeDashboard.whenIsNextVesting')}</h3>
              {/* Tags/Filters */}
              <div className="flex flex-wrap gap-2 mt-3">
                {displayGrantData.grants
                  .filter((g: any) => g.status === 'active' && g.incentive_plans)
                  .slice(0, 2)
                  .map((grant: any, index: number) => (
                    <span 
                      key={grant.id}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        index === 0 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {grant.incentive_plans.plan_name_en || 'Grant'} - {grant.incentive_plans.plan_type || 'ESOP'}
                    </span>
                  ))}
              </div>
            </div>
            <div className="p-6">
              {displayGrantData.next_vesting_date && (
                <>
                  <div className="flex items-center justify-center mb-4">
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div className="text-center flex-1">
                      <div className="text-2xl font-bold text-red-600">
                        {displayGrantData.next_vesting_date.toLocaleDateString('en-GB', { 
                          day: '2-digit', 
                          month: 'short', 
                          year: 'numeric' 
                        })}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {displayGrantData.grants
                          .filter((g: any) => g.status === 'active' && g.incentive_plans)
                          .reduce((sum: number, g: any) => {
                            const unvested = Number(g.total_shares) - Number(g.vested_shares || 0);
                            return sum + unvested;
                          }, 0)} {t('employeeDashboard.options')}
                      </div>
                    </div>
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <div className="text-3xl font-bold text-green-600 mb-1">
                      {displayGrantData.vested_shares.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500">{t('employeeDashboard.options')}</div>
                    <div className="text-xs text-gray-400 mt-1">{t('employeeDashboard.cumulativeVestedOptions')}</div>
                  </div>
                </>
              )}
              {!displayGrantData.next_vesting_date && (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>{t('employeeDashboard.noUpcomingVestingDates')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Exercise Price Payable */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="text-4xl font-bold text-purple-700 mb-2">
              SAR {(displayGrantData.vested_shares * sharePrice).toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">{t('employeeDashboard.exercisePricePayable')}</div>
          </div>
        </div>

        {/* Right Section: Unvested Shares Roadmap */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">{t('employeeDashboard.sharesRoadmap')}</h3>
            <div className="text-xs text-gray-500 mt-2">
              {displayGrantData.roadmapData && displayGrantData.roadmapData.length > 0 ? (
                <>
                  {t('employeeDashboard.total')}: {displayGrantData.roadmapData.reduce((sum: number, item: any) => 
                    sum + (item.vestedShares || 0) + (item.unvestedShares || 0), 0
                  ).toLocaleString()} {t('employeeDashboard.shares')}
                </>
              ) : (
                t('employeeDashboard.noDataAvailable')
              )}
            </div>
          </div>
          <div className="p-6">
            {/* Bar Chart */}
            {displayGrantData.roadmapData && displayGrantData.roadmapData.length > 0 ? (
              <div className="space-y-4">
                {/* Chart Bars */}
                <div className="flex items-end justify-between gap-2" style={{ height: '256px' }}>
                  {displayGrantData.roadmapData.map((item: any, index: number) => {
                    // Calculate max value for scaling (include both vested and unvested)
                    const maxValue = Math.max(
                      ...displayGrantData.roadmapData.map((d: any) => 
                        (d.unvestedValuation || 0) + (d.vestedValuation || 0)
                      ),
                      1 // Ensure at least 1 to avoid division by zero
                    );
                    
                    const totalValuation = (item.unvestedValuation || 0) + (item.vestedValuation || 0);
                    const chartHeight = 256; // Fixed height in pixels
                    const totalBarHeightPx = maxValue > 0 ? (totalValuation / maxValue) * chartHeight : 0;
                    const vestedBarHeightPx = totalValuation > 0 
                      ? ((item.vestedValuation || 0) / totalValuation) * totalBarHeightPx 
                      : 0;
                    const unvestedBarHeightPx = totalBarHeightPx - vestedBarHeightPx;
                    
                    // Ensure minimum height for visibility (at least 4px if there's data)
                    const finalVestedHeight = vestedBarHeightPx > 0 ? Math.max(vestedBarHeightPx, 4) : 0;
                    const finalUnvestedHeight = unvestedBarHeightPx > 0 ? Math.max(unvestedBarHeightPx, 4) : 0;
                    
                    return (
                      <div key={index} className="flex-1 h-full flex flex-col items-center group cursor-pointer relative">
                        {/* Tooltip */}
                        <div className="hidden group-hover:block absolute bottom-full mb-2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10 whitespace-nowrap transform -translate-x-1/2 left-1/2">
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
                            <div className="text-gray-400">{t('employeeDashboard.noDataAvailable')}</div>
                          )}
                        </div>
                        
                        {/* Stacked Bar */}
                        <div className="relative w-full h-full flex flex-col items-center justify-end">
                          {/* Share count label above the block */}
                          {(item.unvestedShares > 0 || item.vestedShares > 0) && (
                            <div 
                              className="absolute text-xs font-semibold text-gray-700 whitespace-nowrap"
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
                <div className="flex items-center justify-between gap-2 mt-2 border-t border-gray-200 pt-3">
                  {displayGrantData.roadmapData.map((item: any, index: number) => (
                    <div key={index} className="flex-1 text-center">
                      <div className="text-xs text-gray-600 font-medium">{item.year}</div>
                    </div>
                  ))}
                </div>
                
                {/* Legend */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-center space-x-4 text-xs text-gray-600 mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded bg-green-600"></div>
                      <span>{t('employeeDashboard.vestedSharesSAR')}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded bg-purple-600"></div>
                      <span>{t('employeeDashboard.unvestedSharesSAR')}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 text-center space-y-1">
                    <p><strong>{t('employeeDashboard.vestedIncludes')}</strong></p>
                    <p><strong>{t('employeeDashboard.unvestedIncludes')}</strong></p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">{t('employeeDashboard.noRoadmapDataAvailable')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pending Signature Section */}
      {pendingSignatureGrants.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
              <Award className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-xl font-bold text-yellow-800">{t('employeeDashboard.actionRequired')}</h3>
          </div>
          <p className="text-yellow-700 mb-4">{t('employeeDashboard.actionRequiredMessage')}</p>
          <div className="space-y-3">
            {pendingSignatureGrants.map((grant: any) => (
                <div key={grant.id} className="flex items-center justify-between p-4 bg-white rounded-lg border border-yellow-300">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                      <Award className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{grant.grant_number}</p>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        {t('employeeDashboard.pendingSignature')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{Number(grant.total_shares).toLocaleString()}</p>
                      <p className="text-sm text-gray-600">{t('employeeDashboard.shares')}</p>
                    </div>
                    <button 
                      onClick={() => handleReviewContract(grant)}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition font-medium"
                    >
                      {t('employeeDashboard.reviewContract')}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              {t('employeeDashboard.yourVestingCalendar')}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {t('employeeDashboard.trackUpcomingVesting')}
            </p>
          </div>
        </div>

        {employeeVestingEvents.length > 0 ? (
          <VestingEventsCalendar
            events={employeeVestingEvents}
            onEventClick={(event) => {
              setSelectedVestingEvent(event);
              setShowVestingEventModal(true);
            }}
          />
        ) : (
          <div className="py-12 text-center text-gray-500 border border-dashed border-gray-200 rounded-lg">
            <Clock className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">{t('employeeDashboard.noVestingEventsScheduled')}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">{t('employeeDashboard.yourGrants')}</h3>
        {displayGrantData.grants.length > 0 ? (
          <div className="space-y-3">
            {displayGrantData.grants.map((grant: any) => {
              const normalizedDocStatus = grant.document_status?.toLowerCase?.() || '';
              const isPendingSignature = normalizedDocStatus === 'pending_signature';
              const badgeClasses = isPendingSignature
                ? 'bg-yellow-100 text-yellow-800'
                : grant.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-700';
              const badgeLabel = isPendingSignature
                ? t('employeeDashboard.pendingSignature')
                : grant.status === 'active'
                  ? 'Active'
                  : (grant.status || t('employeeDashboard.draft'));

              return (
                <div key={grant.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Award className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{grant.grant_number}</p>
                      <div className="flex items-center space-x-3 text-sm text-gray-600 mt-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClasses}`}>
                          {badgeLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">{Number(grant.total_shares).toLocaleString()}</p>
                    <p className="text-sm text-gray-600">{t('employeeDashboard.shares')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h4 className="text-lg font-semibold text-gray-900 mb-2">{t('employeeDashboard.noActiveGrants')}</h4>
            <p className="text-gray-600">{t('employeeDashboard.noActiveGrantsMessage')}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <PortfolioValuation
          tadawulSymbol={tadawulSymbol}
          vestedShares={displayGrantData.vested_shares}
          unvestedShares={displayGrantData.remaining_unvested_shares}
        />

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-6">{t('employeeDashboard.quickStats')}</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
              <div>
                <p className="text-sm text-gray-600 mb-1">{t('employeeDashboard.vestedSharesLabel')}</p>
                <p className="text-2xl font-bold text-green-600">{displayGrantData.vested_shares.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                <Award className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div>
                <p className="text-sm text-gray-600 mb-1">{t('employeeDashboard.unvestedSharesLabel')}</p>
                <p className="text-2xl font-bold text-blue-600">{displayGrantData.remaining_unvested_shares.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                <Award className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
        <PerformanceChart currentPrice={85.50} vestedShares={displayGrantData.vested_shares} />
      </Suspense>

      {/* Contract Review Modal */}
      {showContractModal && selectedGrant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{t('employeeDashboard.reviewGrantAgreement')}</h2>
              <button
                onClick={() => setShowContractModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {contractContent}
                </pre>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  <p className="font-medium">{t('employeeDashboard.byAcceptingAgreement')}</p>
                  <ul className="mt-2 space-y-1">
                    <li>• {t('employeeDashboard.understandingGrantTerms')}</li>
                    <li>• {t('employeeDashboard.acceptanceOfConditions')}</li>
                    <li>• {t('employeeDashboard.agreementToTaxImplications')}</li>
                  </ul>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowContractModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleAcceptContract}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                  >
                    {t('employeeDashboard.acceptAgreement')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showVestingEventModal && selectedVestingEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{t('employeeDashboard.vestingEventDetails')}</h2>
                <p className="text-sm text-gray-500">
                  {new Date(selectedVestingEvent.vesting_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  })}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowVestingEventModal(false);
                  setSelectedVestingEvent(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-xs uppercase tracking-wide text-gray-500">{t('employeeDashboard.plan')}</span>
                  <p className="text-base font-semibold text-gray-900">
                    {selectedVestingEvent.plan_name}
                  </p>
                  {selectedVestingEvent.plan_code && (
                    <p className="text-sm text-gray-500">{selectedVestingEvent.plan_code}</p>
                  )}
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wide text-gray-500">{t('employeeDashboard.sharesToVest')}</span>
                  <p className="text-base font-semibold text-gray-900">
                    {Math.floor(Number(selectedVestingEvent.shares_to_vest || 0)).toLocaleString()} {t('employeeDashboard.shares')}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wide text-gray-500">Status</span>
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                    {selectedVestingEvent.status.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wide text-gray-500">{t('employeeDashboard.eventType')}</span>
                  <p className="text-base font-semibold text-gray-900 capitalize">
                    {selectedVestingEvent.event_type?.replace('_', ' ') || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
                <div>
                  <span className="text-xs uppercase tracking-wide text-gray-500">{t('employeeDashboard.grant')}</span>
                  <p className="text-sm font-medium text-gray-900">{selectedVestingEvent.grants?.grant_number || '—'}</p>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wide text-gray-500">{t('employeeDashboard.daysRemaining')}</span>
                  <p className="text-sm font-medium text-gray-900">{selectedVestingEvent.days_remaining}</p>
                </div>
                {selectedVestingEvent.performance_notes && (
                  <div className="md:col-span-2">
                    <span className="text-xs uppercase tracking-wide text-gray-500">{t('employeeDashboard.performanceNotes')}</span>
                    <p className="text-sm text-gray-700 mt-1">
                      {selectedVestingEvent.performance_notes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end">
                <button
                  onClick={() => {
                    setShowVestingEventModal(false);
                    setSelectedVestingEvent(null);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  {t('employeeDashboard.close')}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
