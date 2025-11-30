import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { formatDate, formatVestingEventId } from '../lib/dateUtils';
import { formatShares } from '../lib/numberUtils';
import TransfersSummary from '../components/dashboard/TransfersSummary';
import { 
  ArrowRightLeft, 
  Search, 
  Filter, 
  CheckCircle, 
  Clock,
  XCircle,
  Eye,
  RefreshCw,
  Trash2
} from 'lucide-react';

interface TransferWithDetails {
  id: string;
  transfer_number: string;
  company_id: string;
  grant_id: string;
  employee_id: string;
  from_portfolio_id: string;
  to_portfolio_id: string;
  shares_transferred: number;
  transfer_type: string;
  transfer_date: string;
  market_price_at_transfer: number | null;
  processed_at: string | null;
  processed_by_system: boolean;
  notes: string | null;
  status: 'pending' | 'transferred' | 'cancelled';
  created_at: string;
  
  // Joined data
  grants?: {
    grant_number: string;
  };
  employees?: {
    first_name_en: string;
    last_name_en: string;
    email: string;
  };
  from_portfolio?: {
    portfolio_number: string;
    portfolio_type: string;
  };
  to_portfolio?: {
    portfolio_number: string;
    portfolio_type: string;
  };
  
  // Computed
  vestingEventId?: string | null;
  formattedEventId?: string;
}

export default function Transfers() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [transfers, setTransfers] = useState<TransferWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'transferred' | 'cancelled'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTransfer, setSelectedTransfer] = useState<TransferWithDetails | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [processingTransfer, setProcessingTransfer] = useState<string | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState<string | null>(null);

  useEffect(() => {
    loadTransfers();
  }, [selectedStatus]);

  const loadTransfers = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!companyUser) return;

      let query = supabase
        .from('share_transfers')
        .select(`
          *,
          grants (
            grant_number
          ),
          employees (
            first_name_en,
            last_name_en,
            email
          ),
          from_portfolio:from_portfolio_id (
            portfolio_number,
            portfolio_type
          ),
          to_portfolio:to_portfolio_id (
            portfolio_number,
            portfolio_type
          )
        `)
        .eq('company_id', companyUser.company_id)
        .order('created_at', { ascending: false });

      // Filter by status
      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      const transfersData = (data as TransferWithDetails[]) || [];
      
      // Extract vesting event IDs from notes and fetch vesting event details
      const transfersWithEvents = await Promise.all(
        transfersData.map(async (transfer) => {
          // Extract event ID from notes
          let vestingEventId: string | null = null;
          if (transfer.notes) {
            const match = transfer.notes.match(/vesting event ([a-f0-9-]+)/i);
            if (match && match[1]) {
              vestingEventId = match[1];
            }
          }
          
          // If not found in notes, try to find by matching grant_id, employee_id, shares_transferred, and status='transferred'
          if (!vestingEventId && transfer.grant_id && transfer.employee_id) {
            const { data: matchingEvent } = await supabase
              .from('vesting_events')
              .select('id')
              .eq('grant_id', transfer.grant_id)
              .eq('employee_id', transfer.employee_id)
              .eq('shares_to_vest', transfer.shares_transferred)
              .eq('status', 'transferred')
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (matchingEvent) {
              vestingEventId = matchingEvent.id;
            }
          }
          
          // Fetch vesting event details if found
          let formattedEventId: string | undefined;
          if (vestingEventId) {
            const { data: vestingEvent } = await supabase
              .from('vesting_events')
              .select('id, sequence_number, vesting_date, grants(grant_number)')
              .eq('id', vestingEventId)
              .maybeSingle();
            
            if (vestingEvent) {
              const formatResult = formatVestingEventId(
                vestingEvent.id,
                vestingEvent.sequence_number,
                vestingEvent.vesting_date,
                (vestingEvent.grants as any)?.grant_number || transfer.grant_id
              );
              formattedEventId = formatResult.displayId;
            }
          }
          
          return {
            ...transfer,
            vestingEventId,
            formattedEventId
          };
        })
      );
      
      setTransfers(transfersWithEvents);
    } catch (error) {
      console.error('Error loading transfers:', error);
      alert('Failed to load transfers');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessTransfer = async (transferId: string) => {
    if (!confirm('Are you sure you want to process this transfer? This will move the shares from the source portfolio to the destination portfolio.')) {
      return;
    }

    setProcessingTransfer(transferId);
    try {
      // First, get the transfer details
      const { data: transfer, error: fetchError } = await supabase
        .from('share_transfers')
        .select('from_portfolio_id, to_portfolio_id, shares_transferred, status')
        .eq('id', transferId)
        .single();

      if (fetchError) throw fetchError;
      if (!transfer) throw new Error('Transfer not found');

      // Check if already processed
      if (transfer.status === 'transferred') {
        alert('This transfer has already been processed.');
        await loadTransfers();
        return;
      }

      if (!transfer.from_portfolio_id || !transfer.to_portfolio_id) {
        throw new Error('Transfer is missing portfolio information');
      }

      const sharesToTransfer = Number(transfer.shares_transferred);
      if (sharesToTransfer <= 0) {
        throw new Error('Invalid shares amount to transfer');
      }

      // Get current portfolio balances to validate
      const { data: portfolios, error: portfolioError } = await supabase
        .from('portfolios')
        .select('id, available_shares, locked_shares, total_shares, portfolio_type')
        .in('id', [transfer.from_portfolio_id, transfer.to_portfolio_id]);

      if (portfolioError) throw portfolioError;
      if (!portfolios || portfolios.length !== 2) {
        throw new Error('Could not fetch portfolio information');
      }

      const fromPortfolio = portfolios.find(p => p.id === transfer.from_portfolio_id);
      const toPortfolio = portfolios.find(p => p.id === transfer.to_portfolio_id);

      if (!fromPortfolio || !toPortfolio) {
        throw new Error('Portfolio information is incomplete');
      }

      // Validate that source portfolio has enough available shares
      const fromAvailable = Number(fromPortfolio.available_shares || 0);
      if (fromAvailable < sharesToTransfer) {
        throw new Error(
          `Insufficient shares in source portfolio. Available: ${fromAvailable.toLocaleString()}, Required: ${sharesToTransfer.toLocaleString()}`
        );
      }

      // Calculate new balances for from_portfolio (company reserved)
      const newFromAvailable = fromAvailable - sharesToTransfer;
      const fromLocked = Number(fromPortfolio.locked_shares || 0);
      const newFromLocked = Math.max(0, fromLocked - sharesToTransfer); // Reduce locked shares if any

      // Calculate new balances for to_portfolio (employee vested)
      const toTotal = Number(toPortfolio.total_shares || 0);
      const toAvailable = Number(toPortfolio.available_shares || 0);
      const newToTotal = toTotal + sharesToTransfer;
      const newToAvailable = toAvailable + sharesToTransfer;

      // Update portfolios atomically - update both in parallel
      const [fromUpdateResult, toUpdateResult] = await Promise.all([
        // Deduct from company reserved portfolio
        supabase
          .from('portfolios')
          .update({
            available_shares: newFromAvailable,
            locked_shares: newFromLocked,
            updated_at: new Date().toISOString()
          })
          .eq('id', transfer.from_portfolio_id)
          .select(),
        
        // Credit to employee vested portfolio
        supabase
          .from('portfolios')
          .update({
            total_shares: newToTotal,
            available_shares: newToAvailable,
            updated_at: new Date().toISOString()
          })
          .eq('id', transfer.to_portfolio_id)
          .select()
      ]);

      if (fromUpdateResult.error) {
        throw new Error(`Failed to update source portfolio: ${fromUpdateResult.error.message}`);
      }

      if (toUpdateResult.error) {
        // If destination update fails, try to rollback source portfolio
        await supabase
          .from('portfolios')
          .update({
            available_shares: fromAvailable,
            locked_shares: fromLocked,
            updated_at: new Date().toISOString()
          })
          .eq('id', transfer.from_portfolio_id);
        
        throw new Error(`Failed to update destination portfolio: ${toUpdateResult.error.message}`);
      }

      // Only after portfolios are successfully updated, mark transfer as processed
      const { error: updateError } = await supabase
        .from('share_transfers')
        .update({
          status: 'transferred',
          processed_at: new Date().toISOString()
        })
        .eq('id', transferId);

      if (updateError) {
        // If transfer status update fails, the portfolios are already updated
        // This is acceptable as the transfer has been processed
        console.warn('Portfolios updated but transfer status update failed:', updateError);
      }

      alert(`Transfer processed successfully! ${sharesToTransfer.toLocaleString()} shares moved from company portfolio to employee portfolio.`);
      await loadTransfers();
    } catch (error: any) {
      console.error('Error processing transfer:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      alert(`Failed to process transfer: ${errorMessage}`);
    } finally {
      setProcessingTransfer(null);
    }
  };

  const handleDeleteTransfer = async (transferId: string, transfer: TransferWithDetails) => {
    // Show warning message
    const warningMessage = `Are you sure you want to delete this transfer?\n\n` +
      `⚠️ WARNING: The related vesting event status will be changed back to "vested".\n\n` +
      `Transfer: ${transfer.transfer_number}\n` +
      `Employee: ${transfer.employees?.first_name_en} ${transfer.employees?.last_name_en}\n` +
      `Shares: ${formatShares(transfer.shares_transferred)}`;

    if (!confirm(warningMessage)) {
      return;
    }

    setDeletingTransfer(transferId);
    try {
      // Find the related vesting event
      // Method 1: Try to extract event ID from notes field
      let vestingEventId: string | null = null;
      if (transfer.notes) {
        const match = transfer.notes.match(/vesting event ([a-f0-9-]+)/i);
        if (match && match[1]) {
          vestingEventId = match[1];
        }
      }

      // Method 2: If not found in notes, find by matching grant_id, employee_id, shares_transferred, and status='transferred'
      if (!vestingEventId && transfer.grant_id && transfer.employee_id) {
        const { data: matchingEvents, error: findError } = await supabase
          .from('vesting_events')
          .select('id, status')
          .eq('grant_id', transfer.grant_id)
          .eq('employee_id', transfer.employee_id)
          .eq('shares_to_vest', transfer.shares_transferred)
          .eq('status', 'transferred')
          .order('updated_at', { ascending: false })
          .limit(1);

        if (!findError && matchingEvents && matchingEvents.length > 0) {
          vestingEventId = matchingEvents[0].id;
        }
      }

      // Delete the transfer
      const { error: deleteError } = await supabase
        .from('share_transfers')
        .delete()
        .eq('id', transferId);

      if (deleteError) throw deleteError;

      // Update vesting event status back to 'vested' if found
      if (vestingEventId) {
        const { error: updateEventError } = await supabase
          .from('vesting_events')
          .update({
            status: 'vested',
            updated_at: new Date().toISOString()
          })
          .eq('id', vestingEventId);

        if (updateEventError) {
          console.error('Error updating vesting event status:', updateEventError);
          console.warn('⚠️ Transfer deleted but vesting event status update failed. Event ID:', vestingEventId);
          alert('Transfer deleted successfully, but failed to update vesting event status. Please update it manually.');
        } else {
          console.log('✅ Updated vesting event status back to "vested" for event:', vestingEventId);
          alert('Transfer deleted successfully. Vesting event status has been changed back to "vested".');
        }
      } else {
        console.warn('⚠️ Could not find related vesting event for transfer:', transferId);
        alert('Transfer deleted successfully, but related vesting event could not be found. Please update the vesting event status manually.');
      }

      await loadTransfers();
    } catch (error: any) {
      console.error('Error deleting transfer:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      alert(`Failed to delete transfer: ${errorMessage}`);
    } finally {
      setDeletingTransfer(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'transferred':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'transferred':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const filteredTransfers = transfers.filter(transfer => {
    const matchesSearch = 
      transfer.transfer_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transfer.grants?.grant_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${transfer.employees?.first_name_en} ${transfer.employees?.last_name_en}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transfer.employees?.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div id="transfers-section" className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div className={isRTL ? 'text-right' : ''}>
          <h1 className={`text-3xl font-bold text-gray-900 flex items-center gap-3 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
            <ArrowRightLeft className="w-8 h-8 text-blue-600" />
            {t('transfers.title')}
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white text-lg font-semibold">
              {transfers.length}
            </span>
          </h1>
          <p className="text-gray-600 mt-1">{t('transfers.description')}</p>
        </div>
      </div>

      {/* Transfer Summary */}
      <TransfersSummary />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('transfers.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'pending', 'transferred', 'cancelled'] as const).map((status) => {
              const statusLabels: Record<typeof status, string> = {
                all: t('transfers.all'),
                pending: t('transfers.pending'),
                transferred: t('transfers.transferred'),
                cancelled: t('transfers.cancelled'),
              };
              return (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  selectedStatus === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {statusLabels[status]}
              </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Transfers Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transfer Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shares
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  From Portfolio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  To Portfolio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transfer Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    <ArrowRightLeft className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p>{t('transfers.noTransfersFound')}</p>
                  </td>
                </tr>
              ) : (
                filteredTransfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedTransfer(transfer);
                          setShowDetailsModal(true);
                        }}
                        className="text-sm font-medium text-blue-600 hover:text-blue-900 hover:underline cursor-pointer"
                      >
                        {transfer.transfer_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {transfer.employees?.first_name_en} {transfer.employees?.last_name_en}
                      </div>
                      <div className="text-sm text-gray-500">
                        {transfer.employees?.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {transfer.grants?.grant_number || 'N/A'}
                      </div>
                      {transfer.formattedEventId && (
                        <div className="text-xs text-gray-400 mt-1">
                          {transfer.formattedEventId}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatShares(transfer.shares_transferred)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {transfer.from_portfolio?.portfolio_number || 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {transfer.from_portfolio?.portfolio_type || ''}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {transfer.to_portfolio?.portfolio_number || 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {transfer.to_portfolio?.portfolio_type || ''}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(transfer.transfer_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(transfer.status)}`}>
                        {getStatusIcon(transfer.status)}
                        {transfer.status.toUpperCase()}
                      </span>
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
                          <Eye className="w-5 h-5" />
                        </button>
                        {transfer.status === 'pending' && (
                          <button
                            onClick={() => handleProcessTransfer(transfer.id)}
                            disabled={processingTransfer === transfer.id}
                            className="text-green-600 hover:text-green-900 disabled:opacity-50"
                            title="Process Transfer"
                          >
                            <RefreshCw className={`w-5 h-5 ${processingTransfer === transfer.id ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTransfer(transfer.id, transfer)}
                          disabled={deletingTransfer === transfer.id}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          title="Delete Transfer"
                        >
                          <Trash2 className={`w-5 h-5 ${deletingTransfer === transfer.id ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfer Details Modal */}
      {showDetailsModal && selectedTransfer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{t('transfers.transferDetails')}</h2>
                  <p className="text-gray-600 mt-1">{selectedTransfer.transfer_number}</p>
                </div>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Transfer Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">{t('transfers.transferInformation')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">Transfer Number:</span>
                    <p className="text-sm font-medium text-gray-900">{selectedTransfer.transfer_number}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Status:</span>
                    <p className="text-sm font-medium">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedTransfer.status)}`}>
                        {selectedTransfer.status.toUpperCase()}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Transfer Date:</span>
                    <p className="text-sm font-medium text-gray-900">{formatDate(selectedTransfer.transfer_date)}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Transfer Type:</span>
                    <p className="text-sm font-medium text-gray-900">{selectedTransfer.transfer_type}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Shares Transferred:</span>
                    <p className="text-sm font-medium text-gray-900">{formatShares(selectedTransfer.shares_transferred)}</p>
                  </div>
                  {selectedTransfer.market_price_at_transfer && (
                    <div>
                      <span className="text-sm text-gray-600">Market Price:</span>
                      <p className="text-sm font-medium text-gray-900">
                        ${selectedTransfer.market_price_at_transfer.toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Employee Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">{t('transfers.employee')}</h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm text-gray-600">Name:</span>
                    <p className="text-sm font-medium text-gray-900">
                      {selectedTransfer.employees?.first_name_en} {selectedTransfer.employees?.last_name_en}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Email:</span>
                    <p className="text-sm font-medium text-gray-900">{selectedTransfer.employees?.email}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Grant:</span>
                    <p className="text-sm font-medium text-gray-900">{selectedTransfer.grants?.grant_number || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Portfolio Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">{t('transfers.portfolioDetails')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">From Portfolio:</span>
                    <p className="text-sm font-medium text-gray-900">
                      {selectedTransfer.from_portfolio?.portfolio_number || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500">{selectedTransfer.from_portfolio?.portfolio_type || ''}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">To Portfolio:</span>
                    <p className="text-sm font-medium text-gray-900">
                      {selectedTransfer.to_portfolio?.portfolio_number || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500">{selectedTransfer.to_portfolio?.portfolio_type || ''}</p>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              {selectedTransfer.notes && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">{t('transfers.notes')}</h3>
                  <p className="text-sm text-gray-600">{selectedTransfer.notes}</p>
                </div>
              )}

              {selectedTransfer.processed_at && (
                <div>
                  <span className="text-sm text-gray-600">Processed At:</span>
                  <p className="text-sm font-medium text-gray-900">{formatDate(selectedTransfer.processed_at)}</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Close
              </button>
              {selectedTransfer.status === 'pending' && (
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    handleProcessTransfer(selectedTransfer.id);
                  }}
                  disabled={processingTransfer === selectedTransfer.id}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                >
                  {processingTransfer === selectedTransfer.id ? t('transfers.processing') : t('transfers.processTransfer')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


