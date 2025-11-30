// @ts-nocheck
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { DollarSign, Plus, X } from 'lucide-react';
import { formatDateTime } from '../lib/dateUtils';

export default function CompanyCashPortfolio() {
  const { t } = useTranslation();
  const [cashPortfolio, setCashPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDescription, setDepositDescription] = useState('');
  const [processingDeposit, setProcessingDeposit] = useState(false);

  useEffect(() => {
    loadCashPortfolio();
  }, []);

  const loadCashPortfolio = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser) return;

      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('company_id', companyUser.company_id)
        .eq('portfolio_type', 'company_cash')
        .is('employee_id', null)
        .maybeSingle();

      if (error) throw error;
      setCashPortfolio(data);
    } catch (error) {
      console.error('Error loading cash portfolio:', error);
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

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser) throw new Error('Company not found');

      const amount = parseFloat(depositAmount);

      // Create pending cash transfer record
      const transferNumber = `CT-${companyUser.company_id}-${Date.now()}`;
      const { error } = await supabase
        .from('cash_transfers')
        .insert({
          transfer_number: transferNumber,
          company_id: companyUser.company_id,
          transfer_type: 'company_deposit',
          to_portfolio_id: cashPortfolio.id,
          amount: amount,
          currency: 'SAR',
          status: 'pending',
          description: depositDescription || `Company deposit request`,
          created_by: user.id
        });

      if (error) throw error;

      alert(`Deposit request submitted for SAR ${amount.toFixed(2)}. It will be processed after approval by finance admin.`);
      setShowDepositModal(false);
      setDepositAmount('');
      setDepositDescription('');
      await loadCashPortfolio();
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
        <h1 className="text-3xl font-bold text-gray-900">Company Cash Portfolio</h1>
        <p className="text-gray-600 mt-2">Manage company cash balance for exercise settlements</p>
      </div>

      {/* Cash Balance Card */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-6">
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
          <div className="flex items-center justify-center w-20 h-20 bg-blue-200 rounded-full">
            <DollarSign className="w-10 h-10 text-blue-700" />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
            <p className="text-sm text-gray-600 mt-1">Deposit funds to company cash portfolio</p>
          </div>
          <button
            onClick={() => setShowDepositModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Deposit Cash
          </button>
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Current Balance</div>
                <div className="text-2xl font-bold text-gray-900">
                  SAR {cashPortfolio?.cash_balance?.toFixed(2) || '0.00'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Note: Deposit will be pending until approved by finance admin
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingDeposit ? 'Processing...' : 'Submit Deposit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

