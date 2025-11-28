import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, Users, TrendingUp, Calendar, List, Filter, X } from 'lucide-react';
import { formatVestingEventId, formatDate } from '../lib/dateUtils';
import type { VestingEventWithDetails } from '../lib/vestingEventsService';

interface VestingEventsCalendarProps {
  events: VestingEventWithDetails[];
  onEventClick?: (event: VestingEventWithDetails) => void;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: VestingEventWithDetails[];
}

type ViewMode = 'monthly' | 'annually' | 'decade';
type DateRangeFilter = 'all' | 'past' | 'upcoming' | 'thisYear' | 'nextYear' | 'next3Months' | 'next6Months';

interface FilterState {
  status: string[]; // 'all' or specific statuses
  eventType: string[]; // 'all' or specific event types
  planType: string[]; // 'all' or specific plan types
  dateRange: DateRangeFilter;
  grantId: string | null; // null means all grants
  minShares: number | null;
  maxShares: number | null;
  performanceMet: boolean | null; // null means all, true/false for specific
}

export default function VestingEventsCalendar({ events, onEventClick }: VestingEventsCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('decade');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    status: ['all'],
    eventType: ['all'],
    planType: ['all'],
    dateRange: 'all',
    grantId: null,
    minShares: null,
    maxShares: null,
    performanceMet: null,
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Get unique values for filter options
  const uniqueGrants = useMemo(() => {
    const grantMap = new Map<string, { id: string; grant_number: string; plan_name: string }>();
    events.forEach(event => {
      if (event.grants) {
        grantMap.set(event.grant_id, {
          id: event.grant_id,
          grant_number: event.grants.grant_number || 'Unknown',
          plan_name: event.grants.incentive_plans?.plan_name_en || 'Unknown Plan'
        });
      }
    });
    return Array.from(grantMap.values());
  }, [events]);

  // Apply filters to events
  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    // Status filter
    if (!filters.status.includes('all')) {
      filtered = filtered.filter(event => filters.status.includes(event.status));
    }

    // Event type filter
    if (!filters.eventType.includes('all')) {
      filtered = filtered.filter(event => filters.eventType.includes(event.event_type));
    }

    // Plan type filter
    if (!filters.planType.includes('all')) {
      filtered = filtered.filter(event => {
        const planType = event.grants?.incentive_plans?.plan_type;
        return planType && filters.planType.includes(planType);
      });
    }

    // Grant filter
    if (filters.grantId) {
      filtered = filtered.filter(event => event.grant_id === filters.grantId);
    }

    // Date range filter
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (filters.dateRange) {
      case 'past':
        filtered = filtered.filter(event => new Date(event.vesting_date) < today);
        break;
      case 'upcoming':
        filtered = filtered.filter(event => new Date(event.vesting_date) >= today);
        break;
      case 'thisYear':
        const currentYear = today.getFullYear();
        filtered = filtered.filter(event => {
          const eventYear = new Date(event.vesting_date).getFullYear();
          return eventYear === currentYear;
        });
        break;
      case 'nextYear':
        const nextYear = today.getFullYear() + 1;
        filtered = filtered.filter(event => {
          const eventYear = new Date(event.vesting_date).getFullYear();
          return eventYear === nextYear;
        });
        break;
      case 'next3Months':
        const threeMonthsFromNow = new Date(today);
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
        filtered = filtered.filter(event => {
          const eventDate = new Date(event.vesting_date);
          return eventDate >= today && eventDate <= threeMonthsFromNow;
        });
        break;
      case 'next6Months':
        const sixMonthsFromNow = new Date(today);
        sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
        filtered = filtered.filter(event => {
          const eventDate = new Date(event.vesting_date);
          return eventDate >= today && eventDate <= sixMonthsFromNow;
        });
        break;
      case 'all':
      default:
        // No date filtering
        break;
    }

    // Share amount filters
    if (filters.minShares !== null) {
      filtered = filtered.filter(event => event.shares_to_vest >= filters.minShares!);
    }
    if (filters.maxShares !== null) {
      filtered = filtered.filter(event => event.shares_to_vest <= filters.maxShares!);
    }

    // Performance filter
    if (filters.performanceMet !== null) {
      filtered = filtered.filter(event => event.performance_condition_met === filters.performanceMet);
    }

    return filtered;
  }, [events, filters]);

  useEffect(() => {
    generateCalendarDays();
  }, [currentDate, filteredEvents]);

  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    
    // Start from the first Sunday before or on the first day
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    // End on the last Saturday after or on the last day
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
    
    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dayEvents = filteredEvents.filter(event => {
        const eventDate = new Date(event.vesting_date);
        return eventDate.toDateString() === date.toDateString();
      });
      
      days.push({
        date: new Date(date),
        isCurrentMonth: date.getMonth() === month,
        isToday: date.toDateString() === today.toDateString(),
        events: dayEvents
      });
    }
    
    setCalendarDays(days);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const navigateYear = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setFullYear(newDate.getFullYear() - 1);
    } else {
      newDate.setFullYear(newDate.getFullYear() + 1);
    }
    setCurrentDate(newDate);
  };

  const navigateDecade = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    const step = direction === 'prev' ? -10 : 10;
    newDate.setFullYear(newDate.getFullYear() + step);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getYearlyEventsByMonth = () => {
    const year = currentDate.getFullYear();
    const monthlyData = [];
    
    for (let month = 0; month < 12; month++) {
      const monthEvents = filteredEvents.filter(event => {
        const eventDate = new Date(event.vesting_date);
        return eventDate.getFullYear() === year && eventDate.getMonth() === month;
      });
      
      monthlyData.push({
        month,
        monthName: monthNames[month],
        events: monthEvents,
        totalShares: monthEvents.reduce((sum, event) => sum + event.shares_to_vest, 0),
        eventCount: monthEvents.length
      });
    }
    
    return monthlyData;
  };

  const yearlyEvents = useMemo(() => getYearlyEventsByMonth(), [currentDate, filteredEvents]);

  const monthlyEventCount = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    return filteredEvents.filter(event => {
      const eventDate = new Date(event.vesting_date);
      return eventDate.getFullYear() === year && eventDate.getMonth() === month;
    }).length;
  }, [filteredEvents, currentDate]);

  const decadeYearRange = useMemo(() => {
    const eventYears = filteredEvents
      .map(event => new Date(event.vesting_date).getFullYear())
      .filter(year => !Number.isNaN(year));

    if (eventYears.length === 0) {
      const start = currentDate.getFullYear();
      const end = start + 9;
      return {
        start,
        end,
        label: `Upcoming 10 Years (${start} – ${end})`,
        derivedFromEvents: false
      };
    }

    const start = Math.min(...eventYears);
    const end = Math.max(...eventYears);

      return {
        start,
        end,
        label: `Vesting Outlook (${start} – ${end})`,
        derivedFromEvents: true
      };
  }, [filteredEvents, currentDate]);

  const decadeEvents = useMemo(() => {
    const { start, end } = decadeYearRange;
    if (start === undefined || end === undefined || end < start) {
      return [];
    }

    const yearCount = end - start + 1;

    return Array.from({ length: Math.max(yearCount, 0) }, (_, offset) => {
      const year = start + offset;
      const yearEvents = filteredEvents.filter(event => {
        const eventDate = new Date(event.vesting_date);
        return eventDate.getFullYear() === year;
      });

      const totalShares = yearEvents.reduce((sum, event) => sum + event.shares_to_vest, 0);
      const monthlyCounts = yearEvents.reduce((acc, event) => {
        const month = new Date(event.vesting_date).getMonth();
        acc[month] = (acc[month] ?? 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      const [peakMonthIndex] = Object.entries(monthlyCounts).sort(([, a], [, b]) => b - a)[0] ?? [];

      return {
        year,
        eventCount: yearEvents.length,
        totalShares,
        peakMonth: peakMonthIndex !== undefined ? monthNames[Number(peakMonthIndex)] : null,
        sampleEvents: yearEvents.slice(0, 3)
      };
    });
  }, [filteredEvents, monthNames, decadeYearRange]);

  const decadeSummary = useMemo(() => {
    if (decadeEvents.length === 0) {
      return {
        totalEvents: 0,
        totalShares: 0,
        activeYears: 0,
        peakYear: null as number | null
      };
    }

    const totalEvents = decadeEvents.reduce((sum, year) => sum + year.eventCount, 0);
    const totalShares = decadeEvents.reduce((sum, year) => sum + year.totalShares, 0);
    const activeYears = decadeEvents.filter(year => year.eventCount > 0).length;
    const peakYearEntry = decadeEvents.reduce((peak, year) => {
      if (year.eventCount > peak.eventCount) {
        return year;
      }
      return peak;
    }, decadeEvents[0]);

    return {
      totalEvents,
      totalShares,
      activeYears,
      peakYear: peakYearEntry.eventCount > 0 ? peakYearEntry.year : null
    };
  }, [decadeEvents]);

  const totalEventsForView = useMemo(() => {
    switch (viewMode) {
      case 'monthly':
        return monthlyEventCount;
      case 'annually':
        return yearlyEvents.reduce((sum, month) => sum + month.eventCount, 0);
      case 'decade':
        return decadeEvents.reduce((sum, year) => sum + year.eventCount, 0);
      default:
        return 0;
    }
  }, [viewMode, monthlyEventCount, yearlyEvents, decadeEvents]);

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'cliff':
        return 'bg-orange-500';
      case 'time_based':
        return 'bg-blue-500';
      case 'performance_based':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'due':
        return 'border-red-500 bg-red-50';
      case 'pending':
        return 'border-blue-500 bg-blue-50';
      case 'vested':
        return 'border-green-500 bg-green-50';
      case 'exercised':
      case 'transferred':
        return 'border-gray-500 bg-gray-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 w-full max-w-full overflow-hidden">
      {/* Calendar Header */}
      <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-gray-200 w-full max-w-full">
        {/* Title Row */}
        <div className="flex items-center justify-between w-full max-w-full gap-2">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900 flex-1 min-w-0 truncate">
            {viewMode === 'monthly' ? (
              `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
            ) : viewMode === 'annually' ? (
              `${currentDate.getFullYear()}`
            ) : (
              <>
                <span className="hidden sm:inline truncate block">{decadeYearRange.label}</span>
                <span className="sm:hidden truncate block">{decadeYearRange.start} - {decadeYearRange.end}</span>
              </>
            )}
          </h3>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <button
              onClick={goToToday}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 active:bg-blue-300 transition whitespace-nowrap touch-manipulation"
            >
              Today
            </button>
            <div
              className="inline-flex h-7 sm:h-8 w-7 sm:w-8 items-center justify-center rounded-full bg-gray-900 text-xs sm:text-sm font-semibold text-white flex-shrink-0"
              title="Total vesting events in view"
            >
              {totalEventsForView}
            </div>
          </div>
        </div>
        
        {/* Controls Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full max-w-full">
          {/* View Mode Switch */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 sm:p-1 w-full sm:flex-1 sm:min-w-0 sm:max-w-full">
            <button
              onClick={() => setViewMode('monthly')}
              className={`flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-1.5 sm:py-1 rounded-md text-[10px] sm:text-sm font-medium transition flex-1 sm:flex-none touch-manipulation min-w-0 ${
                viewMode === 'monthly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 active:bg-gray-200'
              }`}
            >
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="hidden sm:inline truncate">Monthly</span>
              <span className="sm:hidden">M</span>
            </button>
            <button
              onClick={() => setViewMode('annually')}
              className={`flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-1.5 sm:py-1 rounded-md text-[10px] sm:text-sm font-medium transition flex-1 sm:flex-none touch-manipulation min-w-0 ${
                viewMode === 'annually'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 active:bg-gray-200'
              }`}
            >
              <List className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="hidden sm:inline truncate">Annually</span>
              <span className="sm:hidden">Y</span>
            </button>
            <button
              onClick={() => setViewMode('decade')}
              className={`flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-1.5 sm:py-1 rounded-md text-[10px] sm:text-sm font-medium transition flex-1 sm:flex-none touch-manipulation min-w-0 ${
                viewMode === 'decade'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 active:bg-gray-200'
              }`}
            >
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="hidden lg:inline truncate">10-Year Outlook</span>
              <span className="hidden sm:inline lg:hidden truncate">10Y Outlook</span>
              <span className="sm:hidden">10Y</span>
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 self-center sm:self-auto">
            <button
              onClick={() => {
                if (viewMode === 'monthly') {
                  navigateMonth('prev');
                } else if (viewMode === 'annually') {
                  navigateYear('prev');
                } else if (!decadeYearRange.derivedFromEvents) {
                  navigateDecade('prev');
                }
              }}
              className="p-1.5 sm:p-2 hover:bg-gray-100 active:bg-gray-200 rounded-md transition touch-manipulation"
              aria-label="Previous"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            </button>
            <button
              onClick={() => {
                if (viewMode === 'monthly') {
                  navigateMonth('next');
                } else if (viewMode === 'annually') {
                  navigateYear('next');
                } else if (!decadeYearRange.derivedFromEvents) {
                  navigateDecade('next');
                }
              }}
              className="p-1.5 sm:p-2 hover:bg-gray-100 active:bg-gray-200 rounded-md transition touch-manipulation"
              aria-label="Next"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Filter Toggle Button */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition"
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
                status: ['all'],
                eventType: ['all'],
                planType: ['all'],
                dateRange: 'all',
                grantId: null,
                minShares: null,
                maxShares: null,
                performanceMet: null,
              });
            }}
            className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Clear All
          </button>
        </div>

        {/* Filter Panel */}
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
                      status: ['due', 'pending'],
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
                      status: ['vested', 'exercised', 'transferred']
                    }));
                  }}
                  className="px-3 py-1.5 text-xs bg-green-100 text-green-800 rounded-md hover:bg-green-200 transition"
                >
                  Completed
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const quarterEnd = new Date(today);
                    quarterEnd.setMonth(quarterEnd.getMonth() + 3);
                    setFilters(prev => ({
                      ...prev,
                      dateRange: 'next3Months',
                      status: ['all']
                    }));
                  }}
                  className="px-3 py-1.5 text-xs bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition"
                >
                  Upcoming This Quarter
                </button>
                <button
                  onClick={() => {
                    setFilters(prev => ({
                      ...prev,
                      dateRange: 'thisYear',
                      status: ['all']
                    }));
                  }}
                  className="px-3 py-1.5 text-xs bg-purple-100 text-purple-800 rounded-md hover:bg-purple-200 transition"
                >
                  Upcoming This Year
                </button>
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Status</label>
              <div className="flex flex-wrap gap-2">
                {['all', 'due', 'pending', 'vested', 'exercised', 'transferred'].map(status => (
                  <button
                    key={status}
                    onClick={() => {
                      if (status === 'all') {
                        setFilters(prev => ({ ...prev, status: ['all'] }));
                      } else {
                        setFilters(prev => ({
                          ...prev,
                          status: prev.status.includes('all') 
                            ? [status] 
                            : prev.status.includes(status)
                            ? prev.status.filter(s => s !== status)
                            : [...prev.status.filter(s => s !== 'all'), status]
                        }));
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filters.status.includes(status) || (status === 'all' && filters.status.includes('all'))
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Event Type Filter */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Event Type</label>
              <div className="flex flex-wrap gap-2">
                {['all', 'cliff', 'time_based', 'performance_based'].map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      if (type === 'all') {
                        setFilters(prev => ({ ...prev, eventType: ['all'] }));
                      } else {
                        setFilters(prev => ({
                          ...prev,
                          eventType: prev.eventType.includes('all')
                            ? [type]
                            : prev.eventType.includes(type)
                            ? prev.eventType.filter(t => t !== type)
                            : [...prev.eventType.filter(t => t !== 'all'), type]
                        }));
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filters.eventType.includes(type) || (type === 'all' && filters.eventType.includes('all'))
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {type === 'all' ? 'All' : type === 'time_based' ? 'Time-based' : type === 'performance_based' ? 'Performance' : type.charAt(0).toUpperCase() + type.slice(1)}
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
                      if (planType === 'all') {
                        setFilters(prev => ({ ...prev, planType: ['all'] }));
                      } else {
                        setFilters(prev => ({
                          ...prev,
                          planType: prev.planType.includes('all')
                            ? [planType]
                            : prev.planType.includes(planType)
                            ? prev.planType.filter(p => p !== planType)
                            : [...prev.planType.filter(p => p !== 'all'), planType]
                        }));
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filters.planType.includes(planType) || (planType === 'all' && filters.planType.includes('all'))
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {planType === 'all' ? 'All Plans' : planType}
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
                    onClick={() => setFilters(prev => ({ ...prev, dateRange: range.value as DateRangeFilter }))}
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

            {/* Grant Filter */}
            {uniqueGrants.length > 1 && (
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">Grant</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFilters(prev => ({ ...prev, grantId: null }))}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filters.grantId === null
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    All Grants
                  </button>
                  {uniqueGrants.map(grant => (
                    <button
                      key={grant.id}
                      onClick={() => setFilters(prev => ({ ...prev, grantId: grant.id }))}
                      className={`px-3 py-1.5 text-xs rounded-md transition ${
                        filters.grantId === grant.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                      title={grant.plan_name}
                    >
                      {grant.grant_number}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Performance Filter */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Performance Condition</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: null, label: 'All' },
                  { value: true, label: 'Met' },
                  { value: false, label: 'Not Met' }
                ].map(perf => (
                  <button
                    key={perf.label}
                    onClick={() => setFilters(prev => ({ ...prev, performanceMet: perf.value }))}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filters.performanceMet === perf.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {perf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Share Amount Filter */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Share Amount</label>
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

      {/* Calendar Content */}
      <div className="p-2 sm:p-4 w-full max-w-full overflow-x-auto">
        {viewMode === 'monthly' ? (
          <div className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
            <div className="min-w-[600px]">
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {dayNames.map(day => (
                  <div key={day} className="p-1.5 sm:p-2 text-center text-xs sm:text-sm font-medium text-gray-500">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, index) => (
                  <div
                    key={index}
                    className={`min-h-[90px] sm:min-h-[100px] p-1.5 sm:p-2 border rounded-lg ${
                      day.isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                    } ${day.isToday ? 'ring-2 ring-blue-500' : 'border-gray-200'}`}
                  >
                    {/* Date Number */}
                    <div className={`text-xs sm:text-sm font-medium mb-1 ${
                      day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                    } ${day.isToday ? 'text-blue-600' : ''}`}>
                      {day.date.getDate()}
                    </div>

                    {/* Events */}
                    <div className="space-y-0.5 sm:space-y-1">
                      {day.events.slice(0, 2).map((event, eventIndex) => (
                        <div
                          key={event.id}
                          onClick={() => onEventClick?.(event)}
                          className={`p-0.5 sm:p-1 rounded text-[10px] sm:text-xs cursor-pointer hover:opacity-80 active:opacity-60 transition touch-manipulation ${getStatusColor(event.status)}`}
                          title={`${event.employee_name} - ${event.plan_name} (${event.shares_to_vest} shares)`}
                        >
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${getEventTypeColor(event.event_type)} flex-shrink-0`} />
                            <span className="truncate font-medium text-[10px] sm:text-xs">
                              {event.employee_name.split(' ')[0]}
                            </span>
                          </div>
                          <div className="text-gray-600 truncate text-[9px] sm:text-[10px]">
                            {Math.floor(event.shares_to_vest).toLocaleString()}
                          </div>
                        </div>
                      ))}
                      
                      {/* Show "more" indicator if there are additional events */}
                      {day.events.length > 2 && (
                        <div className="text-[9px] sm:text-[10px] text-gray-500 text-center py-0.5">
                          +{day.events.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : viewMode === 'annually' ? (
          /* Annual View */
          <div className="space-y-4 w-full max-w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 w-full max-w-full">
              {yearlyEvents.map((monthData) => (
                <div
                  key={monthData.month}
                  className={`p-3 sm:p-4 rounded-lg border transition hover:shadow-md ${
                    monthData.eventCount > 0 ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h4 className="text-sm sm:text-base font-semibold text-gray-900">{monthData.monthName}</h4>
                    {monthData.eventCount > 0 && (
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full whitespace-nowrap">
                        {monthData.eventCount} events
                      </span>
                    )}
                  </div>
                  
                  {monthData.eventCount > 0 ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-gray-600">Total Shares:</span>
                        <span className="font-medium">{Math.floor(monthData.totalShares).toLocaleString()}</span>
                      </div>
                      
                      <div className="space-y-1">
                        {monthData.events.slice(0, 3).map((event) => (
                          <div
                            key={event.id}
                            onClick={() => onEventClick?.(event)}
                            className="flex items-center justify-between p-2 bg-white rounded cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition touch-manipulation"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className={`w-2 h-2 rounded-full ${getEventTypeColor(event.event_type)} flex-shrink-0`} />
                              <span className="text-xs sm:text-sm font-medium truncate">
                                {event.employee_name.split(' ')[0]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {new Date(event.vesting_date).getDate()}
                              </span>
                              <span className={`px-1 py-0.5 text-xs rounded ${getStatusColor(event.status)} whitespace-nowrap`}>
                                {event.status.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                        ))}
                        
                        {monthData.events.length > 3 && (
                          <div className="text-center py-1">
                            <span className="text-xs text-gray-500">
                              +{monthData.events.length - 3} more events
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs sm:text-sm text-gray-400">No events</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Annual Summary */}
            <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">
                {currentDate.getFullYear()} Summary
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
                <div>
                  <span className="text-gray-600">Total Events:</span>
                  <span className="ml-2 font-medium block sm:inline">
                    {yearlyEvents.reduce((sum, month) => sum + month.eventCount, 0)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Total Shares:</span>
                  <span className="ml-2 font-medium block sm:inline">
                    {Math.floor(yearlyEvents.reduce((sum, month) => sum + month.totalShares, 0)).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Active Months:</span>
                  <span className="ml-2 font-medium block sm:inline">
                    {yearlyEvents.filter(month => month.eventCount > 0).length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Peak Month:</span>
                  <span className="ml-2 font-medium block sm:inline">
                    {yearlyEvents.reduce((peak, month) => 
                      month.eventCount > peak.eventCount ? month : peak
                    ).monthName}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Decade View */
          <div className="space-y-4 w-full max-w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 w-full max-w-full">
              {decadeEvents.map((yearData) => (
                <div
                  key={yearData.year}
                  className={`p-3 sm:p-4 rounded-lg border transition hover:shadow-md ${
                    yearData.eventCount > 0 ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h4 className="text-sm sm:text-base font-semibold text-gray-900">{yearData.year}</h4>
                    {yearData.eventCount > 0 && (
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full whitespace-nowrap">
                        {yearData.eventCount} events
                      </span>
                    )}
                  </div>

                  {yearData.eventCount > 0 ? (
                    <>
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 text-xs sm:text-sm mb-2 sm:mb-3">
                        <span className="text-gray-600">Total Shares:</span>
                        <span className="font-medium text-gray-900">{Math.floor(yearData.totalShares).toLocaleString()}</span>
                      </div>
                      {yearData.peakMonth && (
                        <div className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
                          <span className="hidden sm:inline">Peak month: </span>
                          <span className="font-medium text-gray-900">{yearData.peakMonth}</span>
                        </div>
                      )}
                      <div className="space-y-1.5 sm:space-y-2">
                        {yearData.sampleEvents.map((event) => (
                          <div
                            key={event.id}
                            onClick={() => onEventClick?.(event)}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 p-2 bg-white rounded cursor-pointer border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition touch-manipulation"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className={`w-2 h-2 rounded-full ${getEventTypeColor(event.event_type)} flex-shrink-0`} />
                              <span className="text-xs sm:text-sm font-medium truncate">
                                {event.employee_name.split(' ')[0]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-5 sm:ml-2">
                              <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap">
                                {monthNames[new Date(event.vesting_date).getMonth()]} {new Date(event.vesting_date).getDate()}
                              </span>
                              <span className={`px-1.5 py-0.5 text-[10px] sm:text-xs rounded ${getStatusColor(event.status)} whitespace-nowrap`}>
                                {event.status.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {yearData.sampleEvents.length < yearData.eventCount && (
                        <div className="text-center py-1">
                          <span className="text-[10px] sm:text-xs text-gray-500">
                            +{yearData.eventCount - yearData.sampleEvents.length} more events
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs sm:text-sm text-gray-400">No events</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Decade Summary */}
            <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">
                Upcoming 10-Year Summary
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
                <div>
                  <span className="text-gray-600">Total Events:</span>
                  <span className="ml-2 font-medium block sm:inline">
                    {decadeSummary.totalEvents}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Total Shares:</span>
                  <span className="ml-2 font-medium block sm:inline">
                    {Math.floor(decadeSummary.totalShares).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Active Years:</span>
                  <span className="ml-2 font-medium block sm:inline">
                    {decadeSummary.activeYears}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Peak Year:</span>
                  <span className="ml-2 font-medium block sm:inline">
                    {decadeSummary.peakYear ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-gray-200 pt-3 sm:pt-4 w-full max-w-full overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 sm:gap-4 text-xs sm:text-sm w-full max-w-full">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="font-medium text-gray-700">Event Types:</span>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-orange-500 flex-shrink-0" />
              <span className="text-gray-600">Cliff</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="text-gray-600">Vesting</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-purple-500 flex-shrink-0" />
              <span className="text-gray-600">Performance</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="font-medium text-gray-700">Status:</span>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-red-500 bg-red-50 flex-shrink-0" />
              <span className="text-gray-600">Due</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-blue-500 bg-blue-50 flex-shrink-0" />
              <span className="text-gray-600">Pending</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-green-500 bg-green-50 flex-shrink-0" />
              <span className="text-gray-600">Vested</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
