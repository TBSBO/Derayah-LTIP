// @ts-nocheck
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { formatDate, formatDateTime } from '../lib/dateUtils';
import {
  ArrowRightLeft,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  User,
  Building2,
  X,
  Eye,
} from 'lucide-react';

interface CashTransfer {
  id: string;
  transfer_number: string;
  company_id: string;
  transfer_type: 'company_deposit' | 'employee_deposit' | 'exercise_settlement';
  from_portfolio_id: string | null;
  to_portfolio_id: string | null;
  employee_id: string | null;
  exercise_order_id: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'processed';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  description: string | null;
  created_at: string;
  employees?: {
    first_name_en: string;
    last_name_en: string;
    email: string;
  };
  exercise_orders?: {
    order_number: string;
  };
}

export default function CashTransfers() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [transfers, setTransfers] = useState<CashTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedTransfer, setSelectedTransfer] = useState<CashTransfer | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [processingTransfer, setProcessingTransfer] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [transferToReject, setTransferToReject] = useState<CashTransfer | null>(null);
  const [hasFinancePermission, setHasFinancePermission] = useState(false);

  useEffect(() => {
    checkPermissions();
    loadCashTransfers();
  }, [selectedStatus, selectedType]);

  const checkPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('role, permissions')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser) return;

      // Check if user has the permission explicitly set
      const permissions = (companyUser.permissions || {}) as Record<string, boolean>;
      const hasPermission = permissions.approve_cash_transfers === true;

      // Check if user has one of the allowed roles
      const hasAllowedRole = [
        'super_admin',
        'finance_admin',
        'company_admin',
        'hr_admin',
        'operations_admin'
      ].includes(companyUser.role);

      setHasFinancePermission(hasPermission || hasAllowedRole);
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  };

  const loadCashTransfers = async () => {
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
        .from('cash_transfers')
        .select(`
          *,
          employees (
            first_name_en,
            last_name_en,
            email
          ),
          exercise_orders (
            order_number
          )
        `)
        .eq('company_id', companyUser.company_id)
        .order('created_at', { ascending: false });

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      if (selectedType !== 'all') {
        query = query.eq('transfer_type', selectedType);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTransfers(data || []);
    } catch (error) {
      console.error('Error loading cash transfers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (transfer: CashTransfer) => {
    if (!confirm(`Approve cash transfer ${transfer.transfer_number}?`)) return;

    setProcessingTransfer(transfer.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Get portfolio to update
      const { data: portfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .select('id, cash_balance')
        .eq('id', transfer.to_portfolio_id)
        .single();

      if (portfolioError) throw portfolioError;
      if (!portfolio) throw new Error('Portfolio not found');

      // Update portfolio balance
      const newBalance = (portfolio.cash_balance || 0) + transfer.amount;
      const { error: updateError } = await supabase
        .from('portfolios')
        .update({
          cash_balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', transfer.to_portfolio_id);

      if (updateError) throw updateError;

      // Update transfer status
      const { error: transferError } = await supabase
        .from('cash_transfers')
        .update({
          status: 'processed',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', transfer.id);

      if (transferError) throw transferError;

      await loadCashTransfers();
      alert('Transfer approved and processed successfully');
    } catch (error) {
      console.error('Error approving transfer:', error);
      alert('Failed to approve transfer: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setProcessingTransfer(null);
    }
  };

  const handleReject = async () => {
    if (!transferToReject) return;
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    setProcessingTransfer(transferToReject.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { error } = await supabase
        .from('cash_transfers')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', transferToReject.id);

      if (error) throw error;

      await loadCashTransfers();
      setShowRejectModal(false);
      setTransferToReject(null);
      setRejectionReason('');
      alert('Transfer rejected successfully');
    } catch (error) {
      console.error('Error rejecting transfer:', error);
      alert('Failed to reject transfer');
    } finally {
      setProcessingTransfer(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800',
      processed: 'bg-green-100 text-green-800',
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  const getTypeBadge = (type: string) => {
    const badges: Record<string, string> = {
      company_deposit: 'bg-blue-100 text-blue-800',
      employee_deposit: 'bg-purple-100 text-purple-800',
      exercise_settlement: 'bg-green-100 text-green-800',
    };
    return badges[type] || 'bg-gray-100 text-gray-800';
  };

  const statusCounts = {
    all: transfers.length,
    pending: transfers.filter(t => t.status === 'pending').length,
    approved: transfers.filter(t => t.status === 'approved').length,
    rejected: transfers.filter(t => t.status === 'rejected').length,
    processed: transfers.filter(t => t.status === 'processed').length,
  };

  const typeCounts = {
    all: transfers.length,
    company_deposit: transfers.filter(t => t.transfer_type === 'company_deposit').length,
    employee_deposit: transfers.filter(t => t.transfer_type === 'employee_deposit').length,
    exercise_settlement: transfers.filter(t => t.transfer_type === 'exercise_settlement').length,
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
        <h1 className="text-3xl font-bold text-gray-900">Cash Transfers</h1>
        <p className="text-gray-600 mt-2">View and manage all cash transfers and deposits</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Status</div>
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
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Type</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(typeCounts).map(([type, count]) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  selectedType === type
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} ({count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transfers Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {transfers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transfer #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedTransfer(transfer);
                          setShowDetailsModal(true);
                        }}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {transfer.transfer_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadge(transfer.transfer_type)}`}>
                        {transfer.transfer_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {transfer.employees ? (
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {transfer.employees.first_name_en} {transfer.employees.last_name_en}
                          </div>
                          <div className="text-sm text-gray-500">{transfer.employees.email}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">Company</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      SAR {transfer.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(transfer.status)}`}>
                        {transfer.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(transfer.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedTransfer(transfer);
                            setShowDetailsModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {hasFinancePermission && transfer.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(transfer)}
                              disabled={processingTransfer === transfer.id}
                              className="text-green-600 hover:text-green-900 disabled:opacity-50"
                              title="Approve"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setTransferToReject(transfer);
                                setShowRejectModal(true);
                              }}
                              disabled={processingTransfer === transfer.id}
                              className="text-red-600 hover:text-red-900 disabled:opacity-50"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
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
            <ArrowRightLeft className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No cash transfers found</h3>
            <p className="text-gray-500">No transfers match the current filters.</p>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedTransfer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Transfer Details</h2>
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedTransfer(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Transfer Number</div>
                  <div className="text-base font-medium text-gray-900">{selectedTransfer.transfer_number}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Status</div>
                  <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(selectedTransfer.status)}`}>
                    {selectedTransfer.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Type</div>
                  <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getTypeBadge(selectedTransfer.transfer_type)}`}>
                    {selectedTransfer.transfer_type.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Amount</div>
                  <div className="text-lg font-bold text-gray-900">
                    SAR {selectedTransfer.amount.toFixed(2)}
                  </div>
                </div>
                {selectedTransfer.employees && (
                  <div>
                    <div className="text-sm text-gray-600">Employee</div>
                    <div className="text-base font-medium text-gray-900">
                      {selectedTransfer.employees.first_name_en} {selectedTransfer.employees.last_name_en}
                    </div>
                    <div className="text-sm text-gray-500">{selectedTransfer.employees.email}</div>
                  </div>
                )}
                {selectedTransfer.exercise_orders && (
                  <div>
                    <div className="text-sm text-gray-600">Exercise Order</div>
                    <div className="text-base font-medium text-gray-900">
                      {selectedTransfer.exercise_orders.order_number}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-gray-600">Created At</div>
                  <div className="text-base font-medium text-gray-900">
                    {formatDateTime(selectedTransfer.created_at)}
                  </div>
                </div>
                {selectedTransfer.approved_at && (
                  <div>
                    <div className="text-sm text-gray-600">Approved At</div>
                    <div className="text-base font-medium text-gray-900">
                      {formatDateTime(selectedTransfer.approved_at)}
                    </div>
                  </div>
                )}
                {selectedTransfer.description && (
                  <div className="col-span-2">
                    <div className="text-sm text-gray-600">Description</div>
                    <div className="text-base font-medium text-gray-900">{selectedTransfer.description}</div>
                  </div>
                )}
                {selectedTransfer.rejection_reason && (
                  <div className="col-span-2">
                    <div className="text-sm text-gray-600">Rejection Reason</div>
                    <div className="text-base font-medium text-red-600 bg-red-50 p-3 rounded">
                      {selectedTransfer.rejection_reason}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedTransfer(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  Close
                </button>
                {hasFinancePermission && selectedTransfer.status === 'pending' && (
                  <>
                    <button
                      onClick={() => {
                        setShowDetailsModal(false);
                        setSelectedTransfer(null);
                        handleApprove(selectedTransfer);
                      }}
                      disabled={processingTransfer === selectedTransfer.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setShowDetailsModal(false);
                        setSelectedTransfer(null);
                        setTransferToReject(selectedTransfer);
                        setShowRejectModal(true);
                      }}
                      disabled={processingTransfer === selectedTransfer.id}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && transferToReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Reject Transfer</h2>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setTransferToReject(null);
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
                    setTransferToReject(null);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={processingTransfer === transferToReject.id || !rejectionReason.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingTransfer === transferToReject.id ? 'Rejecting...' : 'Reject Transfer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

