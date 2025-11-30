// @ts-nocheck
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { formatDate, formatDateTime } from '../lib/dateUtils';
import { formatShares } from '../lib/numberUtils';
import {
  ShoppingCart,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  DollarSign,
  User,
  Award,
  X,
  Eye,
  Check,
  X as XIcon,
} from 'lucide-react';

interface ExerciseOrder {
  id: string;
  order_number: string;
  company_id: string;
  employee_id: string;
  vesting_event_id: string;
  grant_id: string;
  shares_to_exercise: number;
  exercise_price_per_share: number;
  total_exercise_cost: number;
  cash_portfolio_id: string;
  cash_balance_at_order: number;
  sufficient_funds: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'processed' | 'cancelled';
  processed_at: string | null;
  processed_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  employees?: {
    id: string;
    employee_number: string;
    first_name_en: string;
    last_name_en: string;
    email: string;
  };
  grants?: {
    id: string;
    grant_number: string;
  };
  vesting_events?: {
    id: string;
    vesting_date: string;
    shares_to_vest: number;
  };
  incentive_plans?: {
    plan_name_en: string;
    plan_type: string;
  };
}

export default function ExerciseOrders() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [orders, setOrders] = useState<ExerciseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<ExerciseOrder | null>(null);
  const [showOrderDetailsModal, setShowOrderDetailsModal] = useState(false);
  const [processingOrder, setProcessingOrder] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [orderToReject, setOrderToReject] = useState<ExerciseOrder | null>(null);

  useEffect(() => {
    loadExerciseOrders();
  }, [selectedStatus]);

  const loadExerciseOrders = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser) return;

      let query = supabase
        .from('exercise_orders')
        .select(`
          *,
          employees (
            id,
            employee_number,
            first_name_en,
            last_name_en,
            email
          ),
          grants (
            id,
            grant_number,
            plan_id,
            incentive_plans (
              plan_name_en,
              plan_type
            )
          ),
          vesting_events (
            id,
            vesting_date,
            shares_to_vest
          )
        `)
        .eq('company_id', companyUser.company_id)
        .order('created_at', { ascending: false });

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading exercise orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (order: ExerciseOrder) => {
    if (!confirm(`Approve exercise order ${order.order_number}?`)) return;

    setProcessingOrder(order.id);
    try {
      const { error } = await supabase
        .from('exercise_orders')
        .update({
          status: 'approved',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;
      await loadExerciseOrders();
      alert('Order approved successfully');
    } catch (error) {
      console.error('Error approving order:', error);
      alert('Failed to approve order');
    } finally {
      setProcessingOrder(null);
    }
  };

  const handleReject = async () => {
    if (!orderToReject) return;
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    setProcessingOrder(orderToReject.id);
    try {
      const { error } = await supabase
        .from('exercise_orders')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderToReject.id);

      if (error) throw error;
      
      // Update vesting event status back to pending_exercise
      await supabase
        .from('vesting_events')
        .update({ status: 'pending_exercise' })
        .eq('id', orderToReject.vesting_event_id);

      await loadExerciseOrders();
      setShowRejectModal(false);
      setOrderToReject(null);
      setRejectionReason('');
      alert('Order rejected successfully');
    } catch (error) {
      console.error('Error rejecting order:', error);
      alert('Failed to reject order');
    } finally {
      setProcessingOrder(null);
    }
  };

  const handleProcess = async (order: ExerciseOrder) => {
    if (!confirm(`Process exercise order ${order.order_number}? This will deduct cash and transfer shares.`)) return;

    setProcessingOrder(order.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Get grant details to find company_id
      const { data: grant, error: grantError } = await supabase
        .from('grants')
        .select('id, company_id, employee_id')
        .eq('id', order.grant_id)
        .single();

      if (grantError) throw grantError;
      if (!grant) throw new Error('Grant not found');

      const companyId = grant.company_id || order.company_id;
      const employeeId = order.employee_id;
      const grantId = order.grant_id;
      const vestingEventId = order.vesting_event_id;
      const sharesToTransfer = order.shares_to_exercise;

      // Step 1: Get employee and company cash portfolios
      const { data: portfolios, error: portfolioError } = await supabase
        .from('portfolios')
        .select('id, portfolio_type, company_id, employee_id, cash_balance')
        .eq('company_id', companyId);

      if (portfolioError) throw portfolioError;

      // Find employee cash portfolio
      const employeeCashPortfolio = portfolios?.find(p =>
        p.portfolio_type === 'employee_cash' &&
        p.employee_id === employeeId
      );

      // Find company cash portfolio
      const companyCashPortfolio = portfolios?.find(p =>
        p.portfolio_type === 'company_cash' &&
        p.company_id === companyId &&
        p.employee_id === null
      );

      if (!employeeCashPortfolio) throw new Error('Employee cash portfolio not found');
      if (!companyCashPortfolio) throw new Error('Company cash portfolio not found');
      if (employeeCashPortfolio.cash_balance < order.total_exercise_cost) {
        throw new Error('Insufficient cash balance in employee portfolio');
      }

      // Step 1a: Deduct cash from employee's cash portfolio
      const newEmployeeCashBalance = employeeCashPortfolio.cash_balance - order.total_exercise_cost;
      const { error: employeeCashUpdateError } = await supabase
        .from('portfolios')
        .update({
          cash_balance: newEmployeeCashBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', employeeCashPortfolio.id);

      if (employeeCashUpdateError) throw employeeCashUpdateError;

      // Step 1b: Add cash to company's cash portfolio
      const newCompanyCashBalance = (companyCashPortfolio.cash_balance || 0) + order.total_exercise_cost;
      const { error: companyCashUpdateError } = await supabase
        .from('portfolios')
        .update({
          cash_balance: newCompanyCashBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', companyCashPortfolio.id);

      if (companyCashUpdateError) throw companyCashUpdateError;

      // Step 1c: Create cash transfer record for exercise settlement
      const cashTransferNumber = `CT-${companyId}-${Date.now()}`;
      const { error: cashTransferError } = await supabase
        .from('cash_transfers')
        .insert({
          transfer_number: cashTransferNumber,
          company_id: companyId,
          transfer_type: 'exercise_settlement',
          from_portfolio_id: employeeCashPortfolio.id,
          to_portfolio_id: companyCashPortfolio.id,
          employee_id: employeeId,
          exercise_order_id: order.id,
          amount: order.total_exercise_cost,
          currency: 'SAR',
          status: 'processed',
          description: `Exercise settlement for order ${order.order_number}`,
          created_by: user.id
        });

      if (cashTransferError) throw cashTransferError;

      // Step 2: Get portfolios for share transfer (reuse portfolios from Step 1)
      const { data: sharePortfolios, error: sharePortfolioError } = await supabase
        .from('portfolios')
        .select('id, portfolio_type, company_id, employee_id, portfolio_number, available_shares')
        .eq('company_id', companyId);

      if (sharePortfolioError) throw sharePortfolioError;

      // Find company reserved portfolio (from_portfolio)
      const fromPortfolio = sharePortfolios?.find(p =>
        p.portfolio_type === 'company_reserved' &&
        p.company_id === companyId &&
        p.employee_id === null
      );

      // Find employee vested portfolio (to_portfolio)
      let toPortfolio = sharePortfolios?.find(p =>
        p.portfolio_type === 'employee_vested' &&
        p.employee_id === employeeId &&
        p.company_id === companyId
      );

      if (!fromPortfolio) {
        throw new Error('Company reserved portfolio not found');
      }

      if (!toPortfolio) {
        // Create employee vested portfolio if it doesn't exist
        const { data: employee } = await supabase
          .from('employees')
          .select('employee_number')
          .eq('id', employeeId)
          .single();

        const portfolioNumber = `VEST-${companyId}-${employee?.employee_number || employeeId.substring(0, 8)}`;

        const { data: newPortfolio, error: createError } = await supabase
          .from('portfolios')
          .insert({
            portfolio_type: 'employee_vested',
            company_id: companyId,
            employee_id: employeeId,
            portfolio_number: portfolioNumber,
            total_shares: 0,
            available_shares: 0,
            locked_shares: 0
          })
          .select()
          .single();

        if (createError) throw createError;
        toPortfolio = newPortfolio;
      }

      // Check if company portfolio has enough shares
      if (fromPortfolio.available_shares < sharesToTransfer) {
        throw new Error('Insufficient shares in company reserved portfolio');
      }

      // Step 3: Transfer shares
      // Deduct from company reserved portfolio
      const { error: fromPortfolioError } = await supabase
        .from('portfolios')
        .update({
          available_shares: fromPortfolio.available_shares - sharesToTransfer,
          updated_at: new Date().toISOString()
        })
        .eq('id', fromPortfolio.id);

      if (fromPortfolioError) throw fromPortfolioError;

      // Add to employee vested portfolio
      const { error: toPortfolioError } = await supabase
        .from('portfolios')
        .update({
          total_shares: (toPortfolio.total_shares || 0) + sharesToTransfer,
          available_shares: (toPortfolio.available_shares || 0) + sharesToTransfer,
          updated_at: new Date().toISOString()
        })
        .eq('id', toPortfolio.id);

      if (toPortfolioError) throw toPortfolioError;

      // Step 4: Create share transfer record
      const transferNumber = `TRF-${companyId}-${Date.now()}`;
      const { error: transferError } = await supabase
        .from('share_transfers')
        .insert({
          transfer_number: transferNumber,
          company_id: companyId,
          grant_id: grantId,
          employee_id: employeeId,
          from_portfolio_id: fromPortfolio.id,
          to_portfolio_id: toPortfolio.id,
          shares_transferred: sharesToTransfer,
          transfer_type: 'exercise',
          transfer_date: new Date().toISOString().split('T')[0],
          processed_at: new Date().toISOString(),
          processed_by_system: false,
          notes: `Exercise order ${order.order_number}`
        });

      if (transferError) throw transferError;

      // Step 5: Update exercise order status
      const { error: orderUpdateError } = await supabase
        .from('exercise_orders')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          processed_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (orderUpdateError) throw orderUpdateError;

      // Step 6: Update vesting event status
      const { error: eventUpdateError } = await supabase
        .from('vesting_events')
        .update({
          status: 'exercised',
          updated_at: new Date().toISOString()
        })
        .eq('id', vestingEventId);

      if (eventUpdateError) throw eventUpdateError;

      await loadExerciseOrders();
      alert('Order processed successfully! Cash deducted and shares transferred.');
    } catch (error) {
      console.error('Error processing order:', error);
      alert('Failed to process order: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setProcessingOrder(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800',
      processed: 'bg-green-100 text-green-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  const statusCounts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    approved: orders.filter(o => o.status === 'approved').length,
    rejected: orders.filter(o => o.status === 'rejected').length,
    processed: orders.filter(o => o.status === 'processed').length,
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
        <h1 className="text-3xl font-bold text-gray-900">Exercise Orders</h1>
        <p className="text-gray-600 mt-2">Manage employee ESOP exercise requests</p>
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

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shares</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Exercise Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setShowOrderDetailsModal(true);
                        }}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {order.order_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {order.employees?.first_name_en} {order.employees?.last_name_en}
                      </div>
                      <div className="text-sm text-gray-500">{order.employees?.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.grants?.grant_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatShares(order.shares_to_exercise)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      SAR {order.exercise_price_per_share.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      SAR {order.total_exercise_cost.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(order.status)}`}>
                        {order.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowOrderDetailsModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {order.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(order)}
                              disabled={processingOrder === order.id}
                              className="text-green-600 hover:text-green-900 disabled:opacity-50"
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setOrderToReject(order);
                                setShowRejectModal(true);
                              }}
                              disabled={processingOrder === order.id}
                              className="text-red-600 hover:text-red-900 disabled:opacity-50"
                              title="Reject"
                            >
                              <XIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {order.status === 'approved' && (
                          <button
                            onClick={() => handleProcess(order)}
                            disabled={processingOrder === order.id}
                            className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                            title="Process Order"
                          >
                            {processingOrder === order.id ? 'Processing...' : 'Process'}
                          </button>
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
            <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No exercise orders found</h3>
            <p className="text-gray-500">No orders match the current filters.</p>
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {showOrderDetailsModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Order Details</h2>
              <button
                onClick={() => {
                  setShowOrderDetailsModal(false);
                  setSelectedOrder(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Order Number</div>
                  <div className="text-base font-medium text-gray-900">{selectedOrder.order_number}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Status</div>
                  <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(selectedOrder.status)}`}>
                    {selectedOrder.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Employee</div>
                  <div className="text-base font-medium text-gray-900">
                    {selectedOrder.employees?.first_name_en} {selectedOrder.employees?.last_name_en}
                  </div>
                  <div className="text-sm text-gray-500">{selectedOrder.employees?.email}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Grant Number</div>
                  <div className="text-base font-medium text-gray-900">
                    {selectedOrder.grants?.grant_number || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Plan</div>
                  <div className="text-base font-medium text-gray-900">
                    {selectedOrder.incentive_plans?.plan_name_en || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-500">{selectedOrder.incentive_plans?.plan_type}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Vesting Date</div>
                  <div className="text-base font-medium text-gray-900">
                    {selectedOrder.vesting_events?.vesting_date ? formatDate(selectedOrder.vesting_events.vesting_date) : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Shares to Exercise</div>
                  <div className="text-base font-medium text-gray-900">
                    {formatShares(selectedOrder.shares_to_exercise)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Exercise Price</div>
                  <div className="text-base font-medium text-gray-900">
                    SAR {selectedOrder.exercise_price_per_share.toFixed(2)}/share
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Total Cost</div>
                  <div className="text-lg font-bold text-gray-900">
                    SAR {selectedOrder.total_exercise_cost.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Cash Balance at Order</div>
                  <div className={`text-base font-medium ${
                    selectedOrder.sufficient_funds ? 'text-green-600' : 'text-red-600'
                  }`}>
                    SAR {selectedOrder.cash_balance_at_order.toFixed(2)}
                  </div>
                  {!selectedOrder.sufficient_funds && (
                    <div className="text-xs text-red-600 mt-1">Insufficient funds</div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-600">Created At</div>
                  <div className="text-base font-medium text-gray-900">
                    {formatDateTime(selectedOrder.created_at)}
                  </div>
                </div>
                {selectedOrder.processed_at && (
                  <div>
                    <div className="text-sm text-gray-600">Processed At</div>
                    <div className="text-base font-medium text-gray-900">
                      {formatDateTime(selectedOrder.processed_at)}
                    </div>
                  </div>
                )}
                {selectedOrder.rejection_reason && (
                  <div className="col-span-2">
                    <div className="text-sm text-gray-600">Rejection Reason</div>
                    <div className="text-base font-medium text-red-600 bg-red-50 p-3 rounded">
                      {selectedOrder.rejection_reason}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowOrderDetailsModal(false);
                    setSelectedOrder(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  Close
                </button>
                {selectedOrder.status === 'pending' && (
                  <>
                    <button
                      onClick={() => {
                        setShowOrderDetailsModal(false);
                        setSelectedOrder(null);
                        handleApprove(selectedOrder);
                      }}
                      disabled={processingOrder === selectedOrder.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setShowOrderDetailsModal(false);
                        setSelectedOrder(null);
                        setOrderToReject(selectedOrder);
                        setShowRejectModal(true);
                      }}
                      disabled={processingOrder === selectedOrder.id}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                {selectedOrder.status === 'approved' && (
                  <button
                    onClick={() => {
                      setShowOrderDetailsModal(false);
                      setSelectedOrder(null);
                      handleProcess(selectedOrder);
                    }}
                    disabled={processingOrder === selectedOrder.id}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                  >
                    {processingOrder === selectedOrder.id ? 'Processing...' : 'Process Order'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && orderToReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Reject Order</h2>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setOrderToReject(null);
                  setRejectionReason('');
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason *
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setOrderToReject(null);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={processingOrder === orderToReject.id || !rejectionReason.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingOrder === orderToReject.id ? 'Rejecting...' : 'Reject Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

