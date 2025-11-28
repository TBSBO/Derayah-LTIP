import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { getBatchGrantVestingDetails } from '../lib/vestingUtils';
import InteractiveVestingTimeline from '../components/InteractiveVestingTimeline';
import { ChevronDown, ChevronUp, Filter } from 'lucide-react';

interface FilterState {
  grantStatus: string[]; // 'all' or specific statuses
  planType: string[]; // 'all' or specific plan types
  vestingRecordStatus: string[]; // 'all' or specific statuses
  dateRange: 'all' | 'past' | 'upcoming' | 'thisYear' | 'nextYear' | 'next3Months' | 'next6Months';
  minShares: number | null;
  maxShares: number | null;
}

export default function EmployeeVesting() {
  const { t } = useTranslation();
  const [grants, setGrants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGrants, setExpandedGrants] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    grantStatus: ['all'],
    planType: ['all'],
    vestingRecordStatus: ['all'],
    dateRange: 'all',
    minShares: null,
    maxShares: null,
  });

  const loadVestingData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!employee) return;

      // Load grants with their individual vesting records in ONE query (optimized)
      const { data: grantsData, error: grantsError } = await supabase
        .from('grants')
        .select(`
          *,
          incentive_plans (
            plan_name_en,
            vesting_schedule_template_id,
            vesting_config
          ),
          vesting_events (
            *
          ),
          generated_documents (
            id,
            status,
            document_type,
            document_name,
            generated_at
          )
        `)
        .eq('employee_id', employee.id)
        .in('status', ['active', 'pending_signature'])
        .order('grant_date', { ascending: true });

      if (grantsError) throw grantsError;

      if (!grantsData || grantsData.length === 0) {
        setGrants([]);
        return;
      }

      // Batch load all vesting details in parallel (not per grant)
      const grantIds = grantsData.map(g => g.id);
      const vestingDetailsMap = await getBatchGrantVestingDetails(grantIds);

      // Process grants with their vesting records (no additional queries needed)
      const grantsWithVesting = grantsData.map((grant) => {
        // Sort vesting events by sequence number
        const sortedVestingRecords = (grant.vesting_events || [])
          .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0));

        return {
          ...grant,
          individualVestingRecords: sortedVestingRecords,
          vestingDetails: vestingDetailsMap[grant.id] || null
        };
      });

      setGrants(grantsWithVesting);
    } catch (error) {
      console.error('Error loading vesting data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVestingData();
  }, [loadVestingData]);

  // Apply filters to grants - MUST be before any early returns
  const filteredGrants = useMemo(() => {
    let filtered = [...grants];

    // Grant status filter
    if (!filters.grantStatus.includes('all')) {
      filtered = filtered.filter(grant => filters.grantStatus.includes(grant.status));
    }

    // Plan type filter
    if (!filters.planType.includes('all')) {
      filtered = filtered.filter(grant => {
        const planType = grant.incentive_plans?.plan_type;
        return planType && filters.planType.includes(planType);
      });
    }

    // Share amount filters
    if (filters.minShares !== null) {
      filtered = filtered.filter(grant => Number(grant.total_shares) >= filters.minShares!);
    }
    if (filters.maxShares !== null) {
      filtered = filtered.filter(grant => Number(grant.total_shares) <= filters.maxShares!);
    }

    // Filter vesting records within each grant
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    filtered = filtered.map(grant => {
      let vestingRecords = grant.individualVestingRecords || [];

      // Vesting record status filter
      if (!filters.vestingRecordStatus.includes('all')) {
        vestingRecords = vestingRecords.filter((record: any) =>
          filters.vestingRecordStatus.includes(record.status)
        );
      }

      // Date range filter for vesting records
      switch (filters.dateRange) {
        case 'past':
          vestingRecords = vestingRecords.filter((record: any) => {
            const recordDate = new Date(record.vesting_date);
            return recordDate < today;
          });
          break;
        case 'upcoming':
          vestingRecords = vestingRecords.filter((record: any) => {
            const recordDate = new Date(record.vesting_date);
            return recordDate >= today;
          });
          break;
        case 'thisYear':
          const currentYear = today.getFullYear();
          vestingRecords = vestingRecords.filter((record: any) => {
            const recordDate = new Date(record.vesting_date);
            return recordDate.getFullYear() === currentYear;
          });
          break;
        case 'nextYear':
          const nextYear = today.getFullYear() + 1;
          vestingRecords = vestingRecords.filter((record: any) => {
            const recordDate = new Date(record.vesting_date);
            return recordDate.getFullYear() === nextYear;
          });
          break;
        case 'next3Months':
          const threeMonthsFromNow = new Date(today);
          threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
          vestingRecords = vestingRecords.filter((record: any) => {
            const recordDate = new Date(record.vesting_date);
            return recordDate >= today && recordDate <= threeMonthsFromNow;
          });
          break;
        case 'next6Months':
          const sixMonthsFromNow = new Date(today);
          sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
          vestingRecords = vestingRecords.filter((record: any) => {
            const recordDate = new Date(record.vesting_date);
            return recordDate >= today && recordDate <= sixMonthsFromNow;
          });
          break;
        case 'all':
        default:
          // No date filtering
          break;
      }

      return {
        ...grant,
        individualVestingRecords: vestingRecords
      };
    });

    // If vesting record filters are active, hide grants with no matching vesting records
    const hasVestingRecordFilters = !filters.vestingRecordStatus.includes('all') || filters.dateRange !== 'all';
    if (hasVestingRecordFilters) {
      filtered = filtered.filter(grant => (grant.individualVestingRecords || []).length > 0);
    }

    return filtered;
  }, [
    grants, 
    filters.grantStatus, 
    filters.planType, 
    filters.vestingRecordStatus, 
    filters.dateRange, 
    filters.minShares, 
    filters.maxShares
  ]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  if (!grants || grants.length === 0) {
    return <div className="text-center py-12"><p className="text-gray-600">{t('employeeVesting.noVestingData')}</p></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            {t('employeeVesting.title')}
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white text-lg font-semibold">
              {filteredGrants.length}
            </span>
          </h1>
          <p className="text-gray-600 mt-1">{t('employeeVesting.description')}</p>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition"
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {Object.values(filters).some(v => {
              if (Array.isArray(v)) return !v.includes('all') && v.length > 0;
              if (typeof v === 'string') return v !== 'all';
              return v !== null;
            }) && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                Active
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setFilters({
                grantStatus: ['all'],
                planType: ['all'],
                vestingRecordStatus: ['all'],
                dateRange: 'all',
                minShares: null,
                maxShares: null,
              });
            }}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Clear All
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
            {/* Quick Filter Buttons */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Quick Filters</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setFilters(prev => ({
                      ...prev,
                      vestingRecordStatus: ['due', 'pending'],
                      dateRange: 'upcoming'
                    }));
                  }}
                  className="px-3 py-1.5 text-xs bg-yellow-100 text-yellow-800 rounded-md hover:bg-yellow-200 transition"
                >
                  Action Required
                </button>
                <button
                  onClick={() => {
                    setFilters(prev => ({
                      ...prev,
                      vestingRecordStatus: ['vested', 'exercised', 'transferred']
                    }));
                  }}
                  className="px-3 py-1.5 text-xs bg-green-100 text-green-800 rounded-md hover:bg-green-200 transition"
                >
                  Completed
                </button>
                <button
                  onClick={() => {
                    setFilters(prev => ({
                      ...prev,
                      dateRange: 'next3Months',
                      vestingRecordStatus: ['all']
                    }));
                  }}
                  className="px-3 py-1.5 text-xs bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition"
                >
                  Upcoming This Quarter
                </button>
              </div>
            </div>

            {/* Grant Status Filter */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Grant Status</label>
              <div className="flex flex-wrap gap-2">
                {['all', 'active', 'pending_signature'].map(status => (
                  <button
                    key={status}
                    onClick={() => {
                      // Single select - clicking a status selects only that status
                      setFilters(prev => ({ ...prev, grantStatus: [status] }));
                    }}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filters.grantStatus.includes(status) && filters.grantStatus.length === 1
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {status === 'all' ? 'All' : status === 'pending_signature' ? 'Pending Signature' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Plan Type Filter */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Plan Type</label>
              <div className="flex flex-wrap gap-2">
                {['all', 'ESOP', 'LTIP_RSU', 'LTIP_RSA'].map(planType => (
                  <button
                    key={planType}
                    onClick={() => {
                      // Single select - clicking a plan type selects only that type
                      setFilters(prev => ({ ...prev, planType: [planType] }));
                    }}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filters.planType.includes(planType) && filters.planType.length === 1
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {planType === 'all' ? 'All Plans' : planType}
                  </button>
                ))}
              </div>
            </div>

            {/* Vesting Record Status Filter */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Vesting Record Status</label>
              <div className="flex flex-wrap gap-2">
                {['all', 'pending', 'due', 'vested', 'exercised', 'transferred'].map(status => (
                  <button
                    key={status}
                    onClick={() => {
                      // Single select - clicking a status selects only that status
                      setFilters(prev => ({ ...prev, vestingRecordStatus: [status] }));
                    }}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filters.vestingRecordStatus.includes(status) && filters.vestingRecordStatus.length === 1
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Date Range</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: 'All Dates' },
                  { value: 'past', label: 'Past' },
                  { value: 'upcoming', label: 'Upcoming' },
                  { value: 'thisYear', label: 'This Year' },
                  { value: 'nextYear', label: 'Next Year' },
                  { value: 'next3Months', label: 'Next 3 Months' },
                  { value: 'next6Months', label: 'Next 6 Months' }
                ].map(range => (
                  <button
                    key={range.value}
                    onClick={() => setFilters(prev => ({ ...prev, dateRange: range.value as any }))}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filters.dateRange === range.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Share Amount Filter */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Grant Share Amount</label>
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">Min:</label>
                  <input
                    type="number"
                    min="0"
                    value={filters.minShares ?? ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                      setFilters(prev => ({ ...prev, minShares: value }));
                    }}
                    placeholder="0"
                    className="w-24 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">Max:</label>
                  <input
                    type="number"
                    min="0"
                    value={filters.maxShares ?? ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                      setFilters(prev => ({ ...prev, maxShares: value }));
                    }}
                    placeholder="No limit"
                    className="w-24 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {(filters.minShares !== null || filters.maxShares !== null) && (
                  <button
                    onClick={() => setFilters(prev => ({ ...prev, minShares: null, maxShares: null }))}
                    className="text-xs text-gray-600 hover:text-gray-900 underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {filteredGrants.map((grant) => (
        <div key={grant.id} className="bg-white rounded-lg border-2 border-gray-300 shadow-sm p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900">{grant.grant_number}</h2>
            <div className="flex items-center space-x-4 mt-2 flex-wrap gap-2">
              <span className="text-sm text-gray-600">
                <span className="font-medium">{Number(grant.total_shares).toLocaleString()}</span> {t('employeeVesting.shares')}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                grant.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {grant.status === 'active' ? t('employeeVesting.active') : t('employeeVesting.pendingSignature')}
              </span>
              {grant.incentive_plans && (
                <span className="text-sm text-gray-600">
                  {t('employeeVesting.plan')}: <span className="font-medium">{grant.incentive_plans.plan_name_en}</span>
                </span>
              )}
              {/* Contract Status */}
              {(() => {
                // Check grant acceptance first - this is the source of truth
                if (grant.employee_acceptance_at) {
                  return (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {t('employeeVesting.contractSigned')}
                    </span>
                  );
                }
                
                // Fallback to document status if grant hasn't been accepted
                const documents = Array.isArray(grant.generated_documents) ? grant.generated_documents : [];
                const contractDoc = documents.find((doc: any) => doc.document_type === 'grant_agreement') || documents[0];
                if (contractDoc) {
                  const docStatus = contractDoc.status || 'draft';
                  const statusColors: Record<string, string> = {
                    'signed': 'bg-green-100 text-green-800',
                    'executed': 'bg-green-100 text-green-800',
                    'pending_signature': 'bg-yellow-100 text-yellow-800',
                    'draft': 'bg-gray-100 text-gray-600'
                  };
                  const statusLabels: Record<string, string> = {
                    'signed': t('employeeVesting.contractSigned'),
                    'executed': t('employeeVesting.contractExecuted'),
                    'pending_signature': t('employeeVesting.pendingSignature'),
                    'draft': t('employeeVesting.draftContract')
                  };
                  return (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[docStatus] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[docStatus] || t('employeeVesting.contract')}
                    </span>
                  );
                }
                return null;
              })()}
            </div>

            {/* Vesting Details */}
            {grant.vestingDetails && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">{t('employeeVesting.cliffPeriod')}:</span>
                  <span className="ml-1 font-medium">{grant.vestingDetails.cliffMonths} {t('employeeVesting.months')}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t('employeeVesting.frequency')}:</span>
                  <span className="ml-1 font-medium capitalize">{grant.vestingDetails.vestingFrequency}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t('employeeVesting.type')}:</span>
                  <span className="ml-1 font-medium capitalize">{grant.vestingDetails.vestingType.replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t('employeeVesting.duration')}:</span>
                  <span className="ml-1 font-medium">{grant.vestingDetails.vestingYears} {t('employeeVesting.years')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Individual Vesting Records Timeline */}
          {grant.individualVestingRecords && grant.individualVestingRecords.length > 0 ? (
            <div className="mt-4">
              <button
                onClick={() => {
                  const newExpanded = new Set(expandedGrants);
                  if (newExpanded.has(grant.id)) {
                    newExpanded.delete(grant.id);
                  } else {
                    newExpanded.add(grant.id);
                  }
                  setExpandedGrants(newExpanded);
                }}
                className="flex items-center justify-between w-full text-left p-4 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg transition-all duration-200 cursor-pointer"
              >
                <h3 className="text-lg font-medium text-gray-900">{t('employeeVesting.vestingSchedule')}</h3>
                {expandedGrants.has(grant.id) ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>
              {expandedGrants.has(grant.id) && (
                <div className="space-y-2">
                  {grant.individualVestingRecords.map((record, index) => (
                    <div key={record.id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">
                          {(() => {
                            const date = new Date(record.vesting_date);
                            const day = String(date.getDate()).padStart(2, '0');
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const year = date.getFullYear();
                            return `${day}/${month}/${year}`;
                          })()}
                        </p>
                        <p className="text-sm text-gray-600">
                          {t('employeeVesting.vestingEvent')} #{record.sequence_number}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">
                          {Number(record.shares_to_vest).toLocaleString()} {t('employeeVesting.shares')}
                        </p>
                        <p className="text-sm text-gray-600">
                          {((record.shares_to_vest / grant.total_shares) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="ml-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          record.status === 'vested' 
                            ? 'bg-green-100 text-green-800'
                            : record.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {record.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-sm">
                {t('employeeVesting.noIndividualRecords')}
              </p>
            </div>
          )}

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{t('employeeVesting.vestingProgress')}</span>
              <span className="text-sm text-gray-600">
                {(() => {
                  const vestedShares = Number(grant.vested_shares || 0);
                  // Calculate due shares from vesting events
                  const dueShares = (grant.individualVestingRecords || []).reduce((sum: number, record: any) => {
                    if (record.status === 'due') {
                      return sum + Number(record.shares_to_vest || 0);
                    }
                    return sum;
                  }, 0);
                  const totalVestedIncludingDue = vestedShares + dueShares;
                  return `${totalVestedIncludingDue.toLocaleString()} / ${Number(grant.total_shares).toLocaleString()} ${t('employeeVesting.shares')}`;
                })()}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              {(() => {
                const totalShares = Number(grant.total_shares || 0);
                const vestedShares = Number(grant.vested_shares || 0);
                // Calculate due shares from vesting events
                const dueShares = (grant.individualVestingRecords || []).reduce((sum: number, record: any) => {
                  if (record.status === 'due') {
                    return sum + Number(record.shares_to_vest || 0);
                  }
                  return sum;
                }, 0);
                const totalVestedIncludingDue = vestedShares + dueShares;
                const percentage = totalShares > 0 ? (totalVestedIncludingDue / totalShares) * 100 : 0;
                return (
                  <div
                    className="bg-gradient-to-r from-green-500 to-green-600 h-full transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                );
              })()}
            </div>
            <div className="mt-1 text-xs text-gray-500 text-right">
              {(() => {
                const totalShares = Number(grant.total_shares || 0);
                const vestedShares = Number(grant.vested_shares || 0);
                // Calculate due shares from vesting events
                const dueShares = (grant.individualVestingRecords || []).reduce((sum: number, record: any) => {
                  if (record.status === 'due') {
                    return sum + Number(record.shares_to_vest || 0);
                  }
                  return sum;
                }, 0);
                const totalVestedIncludingDue = vestedShares + dueShares;
                const percentage = totalShares > 0 ? (totalVestedIncludingDue / totalShares) * 100 : 0;
                return `${percentage.toFixed(1)}% ${t('employeeVesting.vested')}`;
              })()}
            </div>
          </div>

          {/* Fallback to InteractiveVestingTimeline if no individual records */}
          {(!grant.individualVestingRecords || grant.individualVestingRecords.length === 0) && grant.vestingDetails && (
            <div className="mt-4">
              <InteractiveVestingTimeline
                grantDate={grant.grant_date}
                totalShares={grant.total_shares}
                vestedShares={grant.vested_shares}
                vestingSchedule={grant.vestingDetails}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}