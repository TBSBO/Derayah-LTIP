// @ts-nocheck
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { DollarSign, Plus, ArrowDown, ArrowUp, Clock, X } from 'lucide-react';
import { formatDate, formatDateTime } from '../lib/dateUtils';

interface CashTransaction {
  id: string;
  amount: number;
  transaction_type: 'deposit' | 'withdrawal' | 'exercise' | 'refund';
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'processed';
  created_at: string;
}

export default function EmployeeCashPortfolio() {
  const { t } = useTranslation();
  const [cashPortfolio, setCashPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDescription, setDepositDescription] = useState('');
  const [processingDeposit, setProcessingDeposit] = useState(false);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);

  useEffect(() => {
    loadCashPortfolio();
    loadTransactions();
  }, []);

  const loadCashPortfolio = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!employee) return;

      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('portfolio_type', 'employee_cash')
        .maybeSingle();

      if (error) throw error;
      setCashPortfolio(data);
    } catch (error) {
      console.error('Error loading cash portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!employee) return;

      // Load cash transfers for this employee
      const { data: transfers, error: transfersError } = await supabase
        .from('cash_transfers')
        .select('id, amount, transfer_type, status, description, created_at, exercise_order_id, exercise_orders(order_number)')
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (transfersError) throw transfersError;

      // Convert transfers to transactions
      const transferTransactions: CashTransaction[] = (transfers || []).map((transfer: any) => {
        let type: 'deposit' | 'withdrawal' | 'exercise' | 'refund' = 'deposit';
        let amount = transfer.amount;
        let description = transfer.description || '';

        if (transfer.transfer_type === 'employee_deposit') {
          type = 'deposit';
          description = `Deposit: ${description}`;
        } else if (transfer.transfer_type === 'exercise_settlement') {
          type = 'exercise';
          amount = -amount; // Negative for exercise
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

      setTransactions(transferTransactions);
    } catch (error) {
      console.error('Error loading transactions:', error);
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

      // Create pending cash transfer record
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
      await loadCashPortfolio();
      await loadTransactions();
    } catch (error) {
      console.error('Error processing deposit:', error);
      alert('Failed to submit deposit request: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setProcessingDeposit(false);
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Cash Portfolio</h1>
        <p className="text-gray-600 mt-2">Manage your cash balance for exercising ESOP options</p>
      </div>

      {/* Cash Balance Card */}
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600 mb-1">Available Balance</div>
            <div className="text-4xl font-bold text-gray-900">
              SAR {cashPortfolio?.cash_balance?.toFixed(2) || '0.00'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {cashPortfolio?.currency || 'SAR'}
            </div>
          </div>
          <div className="flex items-center justify-center w-20 h-20 bg-green-200 rounded-full">
            <DollarSign className="w-10 h-10 text-green-700" />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
            <p className="text-sm text-gray-600 mt-1">Deposit funds to your cash portfolio</p>
          </div>
          <button
            onClick={() => setShowDepositModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Deposit Cash
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Transaction History</h3>
        </div>
        {transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
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
                {transactions.map((transaction) => (
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
          </div>
        ) : (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions yet</h3>
            <p className="text-gray-500">Your transaction history will appear here</p>
          </div>
        )}
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

