// @ts-nocheck
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  getAllVestingEvents,
  exerciseVestingEvent,
  updateVestingEventStatuses,
  type VestingEventWithDetails 
} from '../lib/vestingEventsService';
import { formatDate, formatDaysRemaining, formatVestingEventId } from '../lib/dateUtils';
import { formatShares } from '../lib/numberUtils';
import { supabase } from '../lib/supabase';
import { 
  Calendar, 
  Clock, 
  Award, 
  CheckCircle, 
  AlertCircle, 
  DollarSign,
  X,
  TrendingUp
} from 'lucide-react';

export default function EmployeeVestingEvents() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [vestingEvents, setVestingEvents] = useState<VestingEventWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [processingEvent, setProcessingEvent] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<VestingEventWithDetails | null>(null);
  const [showEventDetailsModal, setShowEventDetailsModal] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [exerciseEvent, setExerciseEvent] = useState<VestingEventWithDetails | null>(null);
  const [cashPortfolio, setCashPortfolio] = useState<any>(null);
  const [loadingCashPortfolio, setLoadingCashPortfolio] = useState(false);

  useEffect(() => {
    loadVestingEvents();
  }, [selectedStatus, selectedEventType]);

  const loadVestingEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: employee } = await supabase
        .from('employees')
        .select('id, company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!employee) return;

      // Update vesting event statuses before loading (mark pending events as due, and ESOP due as pending_exercise)
      await updateVestingEventStatuses();

      // Load all events for the company, then filter to employee's events
      const allEvents = await getAllVestingEvents(
        employee.company_id, 
        'all', // Load all statuses, we'll filter by employee
        'all', // Load all event types
        1000  // High limit to get all events
      );

      // Filter to only this employee's events
      const employeeEvents = allEvents.filter(event => 
        event.employee_id === employee.id
      );

      // Apply status filter
      let filteredEvents = employeeEvents;
      if (selectedStatus !== 'all') {
        filteredEvents = filteredEvents.filter(event => event.status === selectedStatus);
      }

      // Apply event type filter
      if (selectedEventType !== 'all') {
        filteredEvents = filteredEvents.filter(event => event.event_type === selectedEventType);
      }

      // Sort by vesting date (upcoming first)
      filteredEvents.sort((a, b) => {
        const dateA = new Date(a.vesting_date).getTime();
        const dateB = new Date(b.vesting_date).getTime();
        return dateA - dateB;
      });

      setVestingEvents(filteredEvents);
    } catch (error) {
      console.error('Error loading vesting events:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCashPortfolio = async (employeeId: string) => {
    setLoadingCashPortfolio(true);
    try {
      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('portfolio_type', 'employee_cash')
        .maybeSingle();
      
      if (error) throw error;
      setCashPortfolio(data || { cash_balance: 0, currency: 'SAR' });
    } catch (error) {
      console.error('Error loading cash portfolio:', error);
      setCashPortfolio({ cash_balance: 0, currency: 'SAR' });
    } finally {
      setLoadingCashPortfolio(false);
    }
  };

  const handleExerciseClick = async (event: VestingEventWithDetails) => {
    // Load employee data
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (!employee) return;
    
    // Load cash portfolio
    await loadCashPortfolio(employee.id);
    
    // Show confirmation modal
    setExerciseEvent(event);
    setShowExerciseModal(true);
  };

  const handleConfirmExercise = async () => {
    if (!exerciseEvent) return;
    
    setProcessingEvent(exerciseEvent.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: employee } = await supabase
        .from('employees')
        .select('id, company_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!employee) return;
      
      const totalCost = exerciseEvent.shares_to_vest * (exerciseEvent.exercise_price || 0);
      
      // Check if sufficient funds
      if (!cashPortfolio || cashPortfolio.cash_balance < totalCost) {
        alert('Insufficient funds in your cash portfolio. Please deposit funds first.');
        setProcessingEvent(null);
        return;
      }
      
      // Generate order number
      const orderNumber = `EX-${employee.company_id}-${Date.now()}`;
      
      // Create exercise order
      const { data: order, error } = await supabase
        .from('exercise_orders')
        .insert({
          order_number: orderNumber,
          company_id: employee.company_id,
          employee_id: employee.id,
          vesting_event_id: exerciseEvent.id,
          grant_id: exerciseEvent.grant_id,
          shares_to_exercise: exerciseEvent.shares_to_vest,
          exercise_price_per_share: exerciseEvent.exercise_price || 0,
          total_exercise_cost: totalCost,
          cash_portfolio_id: cashPortfolio.id,
          cash_balance_at_order: cashPortfolio.cash_balance,
          sufficient_funds: true,
          status: 'pending'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update vesting event status to pending_exercise (if not already)
      await supabase
        .from('vesting_events')
        .update({ status: 'pending_exercise' })
        .eq('id', exerciseEvent.id);
      
      alert('Exercise order created successfully! It will be processed by the company.');
      setShowExerciseModal(false);
      setExerciseEvent(null);
      await loadVestingEvents();
    } catch (error) {
      console.error('Error creating exercise order:', error);
      alert('Failed to create exercise order: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setProcessingEvent(null);
    }
  };

  const handleEventIdClick = (event: VestingEventWithDetails) => {
    setSelectedEvent(event);
    setShowEventDetailsModal(true);
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      due: 'bg-yellow-100 text-yellow-800',
      vested: 'bg-green-100 text-green-800',
      transferred: 'bg-blue-100 text-blue-800',
      exercised: 'bg-purple-100 text-purple-800',
      forfeited: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  const getEventTypeBadge = (eventType: string) => {
    const badges: Record<string, string> = {
      cliff: 'bg-blue-100 text-blue-800',
      time_based: 'bg-green-100 text-green-800',
      performance: 'bg-purple-100 text-purple-800',
      performance_based: 'bg-purple-100 text-purple-800',
      hybrid: 'bg-orange-100 text-orange-800',
      acceleration: 'bg-yellow-100 text-yellow-800',
    };
    return badges[eventType] || 'bg-gray-100 text-gray-800';
  };

  const statusCounts = {
    all: vestingEvents.length,
    pending: vestingEvents.filter(e => e.status === 'pending').length,
    due: vestingEvents.filter(e => e.status === 'due').length,
    pending_exercise: vestingEvents.filter(e => e.status === 'pending_exercise').length,
    vested: vestingEvents.filter(e => e.status === 'vested').length,
    exercised: vestingEvents.filter(e => e.status === 'exercised').length,
    transferred: vestingEvents.filter(e => e.status === 'transferred').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('employeeVestingEvents.title')}</h1>
        <p className="text-gray-600 mt-2">{t('employeeVestingEvents.description')}</p>
      </div>

      {/* Status Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusCounts).map(([status, count]) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                selectedStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Event Type Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Event Type
        </label>
        <select
          value={selectedEventType}
          onChange={(e) => setSelectedEventType(e.target.value)}
          className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">{t('employeeVestingEvents.allTypes')}</option>
          <option value="cliff">Cliff</option>
          <option value="time_based">Time Based</option>
          <option value="performance">Performance</option>
          <option value="performance_based">Performance Based</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>

      {/* Vesting Events Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{t('employeeVestingEvents.yourVestingEvents', 'Your Vesting Events')}</h3>
        </div>

        {vestingEvents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeeVestingEvents.eventId', 'Event ID')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeeVestingEvents.plan', 'Plan')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeeVestingEvents.eventType', 'Event Type')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeeVestingEvents.vestingDate', 'Vesting Date')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeeVestingEvents.shares', 'Shares')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeeVestingEvents.status', 'Status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employeeVestingEvents.actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {vestingEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <button
                          onClick={() => handleEventIdClick(event)}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          {formatVestingEventId(
                            event.id,
                            event.sequence_number,
                            event.vesting_date,
                            event.grants?.grant_number ?? event.grant_id
                          ).displayId}
                        </button>
                        <div className="text-sm text-gray-500 font-mono">
                          {formatVestingEventId(
                            event.id,
                            event.sequence_number,
                            event.vesting_date,
                            event.grants?.grant_number ?? event.grant_id
                          ).dateInfo}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {event.plan_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {event.plan_code} • {event.plan_type}
                        </div>
                        <div className="text-xs text-gray-400">
                          Grant: {event.grants?.grant_number || 'N/A'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getEventTypeBadge(event.event_type)}`}>
                        {event.event_type.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm text-gray-900">
                          {formatDate(event.vesting_date)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatDaysRemaining(event.days_remaining)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {Math.floor(event.shares_to_vest).toLocaleString()}
                        </div>
                        {event.exercise_price && (
                          <div className="text-sm text-gray-500">
                            SAR {event.exercise_price.toFixed(2)}/share
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(event.status)}`}>
                        {event.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        {(event.status === 'pending_exercise' || (event.status === 'vested' && event.requires_exercise)) && (
                          <button
                            onClick={() => handleExerciseClick(event)}
                            disabled={processingEvent === event.id}
                            className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                          >
                            {t('employeeVestingEvents.exercise')}
                          </button>
                        )}
                        {event.status === 'vested' && !event.requires_exercise && (
                          <span className="text-gray-400 text-xs">Auto-transferred</span>
                        )}
                        {event.status === 'due' && (
                          <span className="text-gray-400 text-xs">Pending vesting</span>
                        )}
                        {!['pending_exercise', 'vested', 'due'].includes(event.status) && (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Award className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('employeeVestingEvents.noEvents')}</h3>
            <p className="text-gray-500">{t('employeeVestingEvents.noEventsMatchFilters', 'No vesting events match the current filters.')}</p>
          </div>
        )}
      </div>

      {/* Event Details Modal */}
      {showEventDetailsModal && selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{t('employeeVestingEvents.eventDetails')}</h2>
              <button
                onClick={() => {
                  setShowEventDetailsModal(false);
                  setSelectedEvent(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Event ID</div>
                  <div className="text-base font-medium text-gray-900">
                    {formatVestingEventId(
                      selectedEvent.id,
                      selectedEvent.sequence_number,
                      selectedEvent.vesting_date,
                      selectedEvent.grants?.grant_number ?? selectedEvent.grant_id
                    ).displayId}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Status</div>
                  <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(selectedEvent.status)}`}>
                    {selectedEvent.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Plan</div>
                  <div className="text-base font-medium text-gray-900">
                    {selectedEvent.plan_name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {selectedEvent.plan_code} • {selectedEvent.plan_type}
                  </div>
                </div>
                <div>
                    <div className="text-sm text-gray-600">{t('employeeVestingEvents.grantNumber')}</div>
                  <div className="text-base font-medium text-gray-900">
                    {selectedEvent.grants?.grant_number || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Vesting Date</div>
                  <div className="text-base font-medium text-gray-900">
                    {formatDate(selectedEvent.vesting_date)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDaysRemaining(selectedEvent.days_remaining)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Shares to Vest</div>
                  <div className="text-base font-medium text-gray-900">
                    {Math.floor(selectedEvent.shares_to_vest).toLocaleString()}
                  </div>
                </div>
                {selectedEvent.exercise_price && (
                  <div>
                    <div className="text-sm text-gray-600">{t('employeeVestingEvents.exercisePrice')}</div>
                    <div className="text-base font-medium text-gray-900">
                      SAR {selectedEvent.exercise_price.toFixed(2)}/share
                    </div>
                  </div>
                )}
                {selectedEvent.total_exercise_cost && (
                  <div>
                    <div className="text-sm text-gray-600">{t('employeeVestingEvents.totalExerciseCost')}</div>
                    <div className="text-base font-medium text-gray-900">
                      SAR {selectedEvent.total_exercise_cost.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowEventDetailsModal(false);
                      setSelectedEvent(null);
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                  >
                    {t('employeeVestingEvents.close')}
                  </button>
                  {(selectedEvent.status === 'pending_exercise' || (selectedEvent.status === 'vested' && selectedEvent.requires_exercise)) && (
                    <button
                      onClick={() => {
                        setShowEventDetailsModal(false);
                        setSelectedEvent(null);
                        handleExerciseClick(selectedEvent);
                      }}
                      disabled={processingEvent === selectedEvent.id}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                    >
                      {t('employeeVestingEvents.exerciseNow')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Exercise Confirmation Modal */}
      {showExerciseModal && exerciseEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{t('employeeVestingEvents.confirmExercise')}</h2>
              <button
                onClick={() => {
                  setShowExerciseModal(false);
                  setExerciseEvent(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Exercise Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('employeeVestingEvents.sharesToExercise')}:</span>
                    <span className="font-medium">{Math.floor(exerciseEvent.shares_to_vest).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('employeeVestingEvents.exercisePrice')}:</span>
                    <span className="font-medium">SAR {exerciseEvent.exercise_price?.toFixed(2) || '0.00'}/share</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-900 font-semibold">Total Cost:</span>
                    <span className="text-lg font-bold text-gray-900">
                      SAR {((exerciseEvent.shares_to_vest * (exerciseEvent.exercise_price || 0))).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Cash Portfolio</h3>
                {loadingCashPortfolio ? (
                  <div className="text-sm text-gray-500">{t('employeeVestingEvents.loading')}</div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('employeeVestingEvents.availableBalance')}:</span>
                      <span className={`font-medium ${
                        cashPortfolio?.cash_balance >= (exerciseEvent.shares_to_vest * (exerciseEvent.exercise_price || 0))
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}>
                        SAR {cashPortfolio?.cash_balance?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    {cashPortfolio?.cash_balance < (exerciseEvent.shares_to_vest * (exerciseEvent.exercise_price || 0)) && (
                      <div className="text-red-600 text-xs mt-2 bg-red-50 p-2 rounded">
                        <div className="mb-2">
                          ⚠️ {t('employeeVestingEvents.insufficientFunds')}. {t('employeeVestingEvents.depositRequired')} SAR {
                            ((exerciseEvent.shares_to_vest * (exerciseEvent.exercise_price || 0)) - (cashPortfolio?.cash_balance || 0)).toFixed(2)
                          } to your cash portfolio.
                        </div>
                        <a
                          href="/employee/portfolio"
                          className="text-blue-600 hover:text-blue-800 underline font-medium"
                        >
                          Go to Portfolio →
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowExerciseModal(false);
                    setExerciseEvent(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleConfirmExercise}
                  disabled={
                    loadingCashPortfolio ||
                    !cashPortfolio || 
                    cashPortfolio.cash_balance < (exerciseEvent.shares_to_vest * (exerciseEvent.exercise_price || 0))
                  }
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingEvent === exerciseEvent.id ? t('employeeVestingEvents.processing') : t('employeeVestingEvents.confirmExercise')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

