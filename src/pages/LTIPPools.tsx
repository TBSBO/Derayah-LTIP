import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/dateUtils';
import { formatCompactNumber } from '../lib/numberUtils';
import { Plus, Users, TrendingUp, DollarSign, MoreVertical, Edit, Trash2, Eye, Layers, PieChart, ChevronDown, ChevronUp } from 'lucide-react';
import { useCompanyColor } from '../hooks/useCompanyColor';

interface LTIPPool {
  id: string;
  pool_name_en: string;
  pool_name_ar: string | null;
  pool_code: string;
  description_en: string | null;
  description_ar: string | null;
  total_shares_allocated: number;
  shares_used: number;
  shares_available: number;
  pool_type: 'general' | 'executive' | 'employee' | 'retention' | 'performance';
  status: 'active' | 'inactive' | 'exhausted';
  created_at: string;
  updated_at: string;
}

interface IncentivePlan {
  id: string;
  plan_name_en: string;
  total_shares_allocated: number;
}

export default function LTIPPools() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { brandColor, getBgColor } = useCompanyColor();
  const [pools, setPools] = useState<LTIPPool[]>([]);
  const [grantedByPool, setGrantedByPool] = useState<Record<string, number>>({});
  const [vestedByPool, setVestedByPool] = useState<Record<string, number>>({});
  const [unvestedByPool, setUnvestedByPool] = useState<Record<string, number>>({});
  const [poolsChartExpanded, setPoolsChartExpanded] = useState(true);
  const [metricsChartExpanded, setMetricsChartExpanded] = useState(true);
  const [grantedChartExpanded, setGrantedChartExpanded] = useState(true);
  const [highlightedPoolId, setHighlightedPoolId] = useState<string | null>(null);
  const [poolsHighlightLocked, setPoolsHighlightLocked] = useState<string | null>(null);
  const [highlightedMetric, setHighlightedMetric] = useState<string | null>(null);
  const [metricsHighlightLocked, setMetricsHighlightLocked] = useState<string | null>(null);
  const [highlightedGrantedMetric, setHighlightedGrantedMetric] = useState<string | null>(null);
  const [grantedHighlightLocked, setGrantedHighlightLocked] = useState<string | null>(null);
  const [hoveredPoolItem, setHoveredPoolItem] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const [hoveredMetricItem, setHoveredMetricItem] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const [hoveredGrantedItem, setHoveredGrantedItem] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const poolsChartRef = useRef<HTMLDivElement>(null);
  const metricsChartRef = useRef<HTMLDivElement>(null);
  const grantedChartRef = useRef<HTMLDivElement>(null);
  const formatShares = (value: number) => {
    const n = Number(value) || 0;
    return Math.floor(n).toLocaleString();
  };
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPool, setSelectedPool] = useState<LTIPPool | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [poolPlans, setPoolPlans] = useState<IncentivePlan[]>([]);
  
  const [newPool, setNewPool] = useState({
    pool_name_en: '',
    pool_name_ar: '',
    pool_code: '',
    description_en: '',
    description_ar: '',
    total_shares_allocated: 0,
    pool_type: 'general' as const,
    status: 'active' as const,
  });

  const [editPool, setEditPool] = useState({
    pool_name_en: '',
    pool_name_ar: '',
    pool_code: '',
    description_en: '',
    description_ar: '',
    total_shares_allocated: 0,
    pool_type: 'general' as const,
    status: 'active' as const,
  });

  useEffect(() => {
    loadPools();
  }, []);

  const loadPools = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser, error: companyUserError } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (companyUserError || !companyUser) {
        console.error('Error loading company user or user not linked to company:', companyUserError);
        return;
      }

      const { data, error } = await supabase
        .from('ltip_pools')
        .select('*')
        .eq('company_id', companyUser.company_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPools(data || []);

      // Load granted shares grouped by LTIP pool (from grants linked to incentive plans)
      const { data: grantsData, error: grantsError } = await supabase
        .from('grants')
        .select('id, total_shares, incentive_plans(id, ltip_pool_id)')
        .eq('company_id', companyUser.company_id);

      console.log('Grants loaded:', grantsData?.length || 0);
      console.log('Grants data:', grantsData);

      if (grantsError) {
        console.error('Error loading grants:', grantsError);
      } else {
        const grantedMap: Record<string, number> = {};
        const grantIdToPoolId: Record<string, string> = {};

        for (const row of (grantsData || []) as any[]) {
          const poolId = row?.incentive_plans?.ltip_pool_id as string | null;
          console.log(`Grant ${row.id}: poolId=${poolId}, total_shares=${row.total_shares}, incentive_plans=`, row.incentive_plans);
          if (!poolId) continue;
          const shares = Number(row.total_shares || 0);
          grantedMap[poolId] = (grantedMap[poolId] || 0) + shares;
          grantIdToPoolId[row.id as string] = poolId;
        }
        
        console.log('Granted map:', grantedMap);
        console.log('Grant ID to Pool ID mapping:', grantIdToPoolId);
        setGrantedByPool(grantedMap);

        // Load vested shares from vesting_events (vested, transferred, exercised, due)
        const grantIds = Object.keys(grantIdToPoolId);
        console.log('Grant IDs to query vesting events:', grantIds);
        
        if (grantIds.length > 0) {
          // Fetch all vesting events for these grants to avoid URL encoding issues
          const { data: allVestingEvents, error: vestingError } = await supabase
            .from('vesting_events')
            .select('grant_id, shares_to_vest, status')
            .in('grant_id', grantIds);

          console.log('All vesting events query result:', { count: allVestingEvents?.length || 0, error: vestingError });

          if (!vestingError && allVestingEvents) {
            // Valid statuses from vesting_event_status enum:
            // 'pending', 'due', 'vested', 'transferred', 'exercised', 'forfeited', 'cancelled'
            const vestedStatuses = ['vested', 'transferred', 'exercised', 'due'];
            const unvestedStatuses = ['pending', 'forfeited', 'cancelled'];
            
            const vestedMap: Record<string, number> = {};
            const unvestedMap: Record<string, number> = {};
            const statusCounts: Record<string, number> = {};
            
            // Track detailed unvested events per pool for debugging
            const unvestedDetailsByPool: Record<string, Array<{grantId: string, shares: number, status: string}>> = {};

            // Calculate shares by status for each pool
            for (const ev of allVestingEvents) {
              const poolId = grantIdToPoolId[ev.grant_id as string];
              if (!poolId) {
                console.warn(`No pool found for grant ${ev.grant_id} in vesting event`);
                continue;
              }
              
              const shares = Math.floor(Number(ev.shares_to_vest || 0));
              const status = ev.status as string;
              
              // Track status counts for debugging
              statusCounts[status] = (statusCounts[status] || 0) + shares;
              
              if (vestedStatuses.includes(status)) {
                vestedMap[poolId] = (vestedMap[poolId] || 0) + shares;
              } else if (unvestedStatuses.includes(status)) {
                unvestedMap[poolId] = (unvestedMap[poolId] || 0) + shares;
                
                // Track unvested details for debugging
                if (!unvestedDetailsByPool[poolId]) {
                  unvestedDetailsByPool[poolId] = [];
                }
                unvestedDetailsByPool[poolId].push({
                  grantId: ev.grant_id as string,
                  shares: shares,
                  status: status
                });
              } else {
                // Unknown status - log it
                console.warn(`Unknown vesting event status: ${status} for grant ${ev.grant_id}`);
              }
            }
            
            // Log detailed unvested breakdown per pool
            console.log('=== UNVESTED SHARES BREAKDOWN BY POOL ===');
            for (const poolId of Object.keys(unvestedDetailsByPool)) {
              const pool = pools.find(p => p.id === poolId);
              const poolName = pool ? pool.pool_name_en : 'Unknown Pool';
              const details = unvestedDetailsByPool[poolId];
              const totalUnvested = details.reduce((sum, d) => sum + d.shares, 0);
              console.log(`\n📊 Pool: "${poolName}" (${poolId})`);
              console.log(`   Total Unvested: ${totalUnvested.toLocaleString()} shares`);
              
              // Group by grant for easier reading
              const byGrant: Record<string, {total: number, events: Array<{shares: number, status: string}>}> = {};
              for (const detail of details) {
                if (!byGrant[detail.grantId]) {
                  byGrant[detail.grantId] = { total: 0, events: [] };
                }
                byGrant[detail.grantId].total += detail.shares;
                byGrant[detail.grantId].events.push({ shares: detail.shares, status: detail.status });
              }
              
              console.log(`   Breakdown by Grant (${Object.keys(byGrant).length} grants):`);
              for (const grantId of Object.keys(byGrant)) {
                const grantData = byGrant[grantId];
                console.log(`     • Grant ${grantId.substring(0, 8)}...: ${grantData.total.toLocaleString()} unvested shares (${grantData.events.length} events)`);
                // Only show event details if there are few events
                if (grantData.events.length <= 5) {
                  console.log(`       Events:`, grantData.events.map(e => `${e.shares.toLocaleString()} shares (${e.status})`).join(', '));
                }
              }
              
              // Group by status
              const byStatus: Record<string, number> = {};
              for (const detail of details) {
                byStatus[detail.status] = (byStatus[detail.status] || 0) + detail.shares;
              }
              console.log(`   By Status:`);
              for (const status of Object.keys(byStatus)) {
                console.log(`     • ${status}: ${byStatus[status].toLocaleString()} shares`);
              }
            }
            
            // Debug: Check if granted = vested + unvested for each pool
            console.log('\n=== VESTING BALANCE CHECK ===');
            for (const poolId of Object.keys(grantedMap)) {
              const pool = pools.find(p => p.id === poolId);
              const poolName = pool ? pool.pool_name_en : 'Unknown Pool';
              const granted = grantedMap[poolId] || 0;
              const vested = vestedMap[poolId] || 0;
              const unvested = unvestedMap[poolId] || 0;
              const totalFromEvents = vested + unvested;
              const difference = granted - totalFromEvents;
              
              console.log(`\n📈 Pool: "${poolName}" (${poolId})`);
              console.log(`   Granted: ${granted.toLocaleString()}`);
              console.log(`   Vested: ${vested.toLocaleString()}`);
              console.log(`   Unvested: ${unvested.toLocaleString()}`);
              console.log(`   Total from events: ${totalFromEvents.toLocaleString()}`);
              if (difference !== 0) {
                console.log(`   ⚠️  Difference (unaccounted): ${difference.toLocaleString()}`);
                console.log(`   This means ${Math.abs(difference).toLocaleString()} shares are ${difference > 0 ? 'granted but don\'t have vesting events yet' : 'in vesting events but not in grants (data inconsistency)'}`);
              } else {
                console.log(`   ✅ Balance matches: Granted = Vested + Unvested`);
              }
            }
            console.log('Status counts across all events:', statusCounts);
            console.log('Final vested map:', vestedMap);
            console.log('Final unvested map:', unvestedMap);
            
            setVestedByPool(vestedMap);
            setUnvestedByPool(unvestedMap);
          } else if (vestingError) {
            console.error('Error loading vesting events:', vestingError);
          }
        } else {
          console.warn('No grant IDs found to query vesting events');
        }
      }
    } catch (error) {
      console.error('Error loading LTIP pools:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPoolPlans = async (poolId: string) => {
    try {
      const { data, error } = await supabase
        .from('incentive_plans')
        .select('id, plan_name_en, total_shares_allocated')
        .eq('ltip_pool_id', poolId);

      if (error) throw error;
      setPoolPlans(data || []);
    } catch (error) {
      console.error('Error loading pool plans:', error);
      setPoolPlans([]);
    }
  };

  const handleCreatePool = async () => {
    // Validate required fields
    if (!newPool.pool_name_en.trim()) {
      alert('Pool name (English) is required');
      return;
    }
    if (!newPool.pool_code.trim()) {
      alert('Pool code is required');
      return;
    }
    if (newPool.total_shares_allocated <= 0) {
      alert('Total shares allocated must be greater than 0');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id, id')
        .eq('user_id', user.id)
        .single();

      if (!companyUser) return;

      const { error } = await supabase
        .from('ltip_pools')
        .insert({
          company_id: companyUser.company_id,
          ...newPool,
          created_by: companyUser.id,
        });

      if (error) {
        if (error.code === '23505') {
          alert('Pool code already exists. Please choose a different code.');
        } else {
          throw error;
        }
        return;
      }

      setShowCreateModal(false);
      setNewPool({
        pool_name_en: '',
        pool_name_ar: '',
        pool_code: '',
        description_en: '',
        description_ar: '',
        total_shares_allocated: 0,
        pool_type: 'general',
        status: 'active',
      });
      loadPools();
    } catch (error) {
      console.error('Error creating LTIP pool:', error);
      alert('Failed to create LTIP pool');
    }
  };

  const handleEditPool = (pool: LTIPPool) => {
    setSelectedPool(pool);
    setEditPool({
      pool_name_en: pool.pool_name_en,
      pool_name_ar: pool.pool_name_ar || '',
      pool_code: pool.pool_code,
      description_en: pool.description_en || '',
      description_ar: pool.description_ar || '',
      total_shares_allocated: pool.total_shares_allocated,
      pool_type: pool.pool_type,
      status: pool.status,
    });
    setShowEditModal(true);
  };

  const handleUpdatePool = async () => {
    if (!selectedPool) return;

    // Validate that new allocation is not less than currently used shares
    if (editPool.total_shares_allocated < selectedPool.shares_used) {
      alert(`Cannot reduce allocation below ${selectedPool.shares_used.toLocaleString()} shares (currently used by incentive plans)`);
      return;
    }

    try {
      const { error } = await supabase
        .from('ltip_pools')
        .update({
          pool_name_en: editPool.pool_name_en,
          pool_name_ar: editPool.pool_name_ar || null,
          pool_code: editPool.pool_code,
          description_en: editPool.description_en || null,
          description_ar: editPool.description_ar || null,
          total_shares_allocated: editPool.total_shares_allocated,
          pool_type: editPool.pool_type,
          status: editPool.status,
        })
        .eq('id', selectedPool.id);

      if (error) {
        if (error.code === '23505') {
          alert('Pool code already exists. Please choose a different code.');
        } else {
          throw error;
        }
        return;
      }

      setShowEditModal(false);
      setSelectedPool(null);
      loadPools();
    } catch (error) {
      console.error('Error updating pool:', error);
      alert('Failed to update pool');
    }
  };

  const handleViewPool = async (pool: LTIPPool) => {
    setSelectedPool(pool);
    await loadPoolPlans(pool.id);
    setShowViewModal(true);
  };

  const handleDeletePool = async (poolId: string) => {
    try {
      // Check if pool is being used by any incentive plans
      const { data: plans } = await supabase
        .from('incentive_plans')
        .select('id')
        .eq('ltip_pool_id', poolId);

      if (plans && plans.length > 0) {
        alert('Cannot delete pool that is being used by incentive plans. Please remove or reassign the plans first.');
        return;
      }

      const { error } = await supabase
        .from('ltip_pools')
        .delete()
        .eq('id', poolId);

      if (error) throw error;

      setShowDeleteConfirm(null);
      loadPools();
    } catch (error) {
      console.error('Error deleting pool:', error);
      alert('Failed to delete pool');
    }
  };

  const poolTypeColors = {
    general: 'bg-blue-100 text-blue-800',
    executive: 'bg-purple-100 text-purple-800',
    employee: 'bg-green-100 text-green-800',
    retention: 'bg-yellow-100 text-yellow-800',
    performance: 'bg-red-100 text-red-800',
  };

  const poolTypeLabels = {
    general: t('ltipPools.general'),
    executive: t('ltipPools.executive'),
    employee: t('ltipPools.employee'),
    retention: t('ltipPools.retention'),
    performance: t('ltipPools.performance'),
  };

  const statusColors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    exhausted: 'bg-red-100 text-red-800',
  };

  const totalAllocated = pools.reduce((sum, pool) => sum + pool.total_shares_allocated, 0);
  const totalUsed = pools.reduce((sum, pool) => sum + pool.shares_used, 0);
  const totalAvailable = pools.reduce((sum, pool) => sum + pool.shares_available, 0);
  const totalGranted = Object.values(grantedByPool).reduce((sum, val) => sum + val, 0);
  const totalVested = Object.values(vestedByPool).reduce((sum, val) => sum + val, 0);
  const totalUnvested = Object.values(unvestedByPool).reduce((sum, val) => sum + val, 0);
  const totalGrantedWithEvents = totalVested + totalUnvested;
  const grantedWithoutEvents = Math.max(totalGranted - totalGrantedWithEvents, 0);
  const allocatedButNotGranted = Math.max(totalUsed - totalGranted, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div className={isRTL ? 'text-right' : ''}>
          <h1 className={`text-3xl font-bold text-gray-900 flex items-center gap-3 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
            {t('ltipPools.title')}
            <span 
              className="inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-lg font-semibold"
              style={{ backgroundColor: brandColor }}
            >
              {pools.length}
            </span>
          </h1>
          <p className="text-gray-600 mt-1">
            {t('ltipPools.description')}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className={`flex items-center space-x-2 px-4 py-2 text-white rounded-lg transition ${isRTL ? 'space-x-reverse' : ''}`}
          style={{ backgroundColor: brandColor }}
          onMouseEnter={(e) => {
            const rgb = parseInt(brandColor.slice(1, 3), 16) * 0.9;
            const gg = parseInt(brandColor.slice(3, 5), 16) * 0.9;
            const bb = parseInt(brandColor.slice(5, 7), 16) * 0.9;
            e.currentTarget.style.backgroundColor = `rgb(${Math.round(rgb)}, ${Math.round(gg)}, ${Math.round(bb)})`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = brandColor;
          }}
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium">{t('ltipPools.createPool')}</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div 
              className="p-3 rounded-lg"
              style={{ backgroundColor: getBgColor('100') }}
            >
              <Layers className="w-6 h-6" style={{ color: brandColor }} />
            </div>
            <span className="text-2xl font-bold text-gray-900">{pools.length}</span>
          </div>
          <p className="text-gray-600 font-medium">{t('ltipPools.totalPools')}</p>
        </div>
        
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-2xl font-bold text-gray-900">
              {totalAllocated.toLocaleString()}
            </span>
          </div>
          <p className="text-gray-600 font-medium">{t('ltipPools.totalAllocated')}</p>
        </div>
        
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-yellow-600" />
            </div>
            <span className="text-2xl font-bold text-gray-900">
              {totalUsed.toLocaleString()}
            </span>
          </div>
          <p className="text-gray-600 font-medium">{t('ltipPools.sharesUsed')}</p>
        </div>
        
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-2xl font-bold text-gray-900">
              {totalAvailable.toLocaleString()}
            </span>
          </div>
          <p className="text-gray-600 font-medium">Available</p>
        </div>
      </div>

      {/* Pie Chart Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pools Breakdown Pie Chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div 
            onClick={() => setPoolsChartExpanded(!poolsChartExpanded)}
            className="p-4 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
            title={poolsChartExpanded ? "Collapse legend" : "Expand legend"}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setPoolsChartExpanded(!poolsChartExpanded);
              }
            }}
          >
            <div className="flex items-center space-x-2">
              <PieChart className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Shares by Pool</h3>
            </div>
            <div className="text-gray-500">
              {poolsChartExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
          <div className="p-4">
            {(() => {
              const poolsWithShares = pools.filter(p => p.total_shares_allocated > 0);
              const totalPoolShares = poolsWithShares.reduce((sum, p) => sum + p.total_shares_allocated, 0);
              
              if (poolsWithShares.length === 0 || totalPoolShares === 0) {
                return (
                  <div className="text-center py-8 text-gray-500">
                    No pool shares allocated
                  </div>
                );
              }

              const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

              return (
                <div className="space-y-3">
                  <div 
                    ref={poolsChartRef} 
                    className="relative w-full h-40 flex items-center justify-center"
                    onClick={(e) => {
                      if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg') {
                        setPoolsHighlightLocked(null);
                        setHighlightedPoolId(null);
                        setHoveredPoolItem(null);
                      }
                    }}
                  >
                    <svg 
                      viewBox="0 0 120 120" 
                      className="w-full max-w-40 h-40 cursor-pointer"
                      onMouseLeave={() => {
                        setHoveredPoolItem(null);
                        if (!poolsHighlightLocked) {
                          setHighlightedPoolId(null);
                        }
                      }}
                    >
                      {poolsWithShares.map((pool, index) => {
                        const startAngle = poolsWithShares
                          .slice(0, index)
                          .reduce((sum, p) => sum + (p.total_shares_allocated / totalPoolShares) * 360, 0);
                        const angle = (pool.total_shares_allocated / totalPoolShares) * 360;
                        const endAngle = startAngle + angle;

                        const startRad = (startAngle - 90) * (Math.PI / 180);
                        const endRad = (endAngle - 90) * (Math.PI / 180);

                        const x1 = 60 + 50 * Math.cos(startRad);
                        const y1 = 60 + 50 * Math.sin(startRad);
                        const x2 = 60 + 50 * Math.cos(endRad);
                        const y2 = 60 + 50 * Math.sin(endRad);

                        const largeArc = angle > 180 ? 1 : 0;
                        const percentage = (pool.total_shares_allocated / totalPoolShares) * 100;
                        const isHighlighted = highlightedPoolId === pool.id;
                        const isDimmed = highlightedPoolId !== null && highlightedPoolId !== pool.id;
                        
                        return (
                          <path
                            key={pool.id}
                            d={`M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                            fill={colors[index % colors.length]}
                            stroke="white"
                            strokeWidth={isHighlighted ? "3" : "2"}
                            className="cursor-pointer"
                            style={{
                              opacity: isDimmed ? 0.3 : (isHighlighted ? 1 : 0.8),
                              filter: isHighlighted ? 'brightness(1.2)' : (isDimmed ? 'brightness(0.5)' : 'none'),
                              transition: 'none'
                            }}
                            onMouseEnter={(e) => {
                              if (poolsChartRef.current) {
                                const containerRect = poolsChartRef.current.getBoundingClientRect();
                                const mouseX = e.clientX - containerRect.left;
                                const mouseY = e.clientY - containerRect.top;
                                if (!poolsHighlightLocked) {
                                  setHighlightedPoolId(pool.id);
                                }
                                setHoveredPoolItem({
                                  label: pool.pool_name_en,
                                  value: pool.total_shares_allocated,
                                  percentage,
                                  x: mouseX,
                                  y: mouseY
                                });
                              }
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (poolsChartRef.current) {
                                const containerRect = poolsChartRef.current.getBoundingClientRect();
                                const mouseX = e.clientX - containerRect.left;
                                const mouseY = e.clientY - containerRect.top;
                                setHoveredPoolItem({
                                  label: pool.pool_name_en,
                                  value: pool.total_shares_allocated,
                                  percentage,
                                  x: mouseX,
                                  y: mouseY
                                });
                                setPoolsHighlightLocked((prev) => (prev === pool.id ? null : pool.id));
                                setHighlightedPoolId((prev) => (prev === pool.id && poolsHighlightLocked === pool.id ? null : pool.id));
                              }
                            }}
                          />
                        );
                      })}
                      <circle cx="60" cy="60" r="30" fill="white" />
                      {(() => {
                        const sharesText = formatCompactNumber(totalPoolShares);
                        const fontSize = sharesText.length > 12 ? '9' : sharesText.length > 9 ? '10' : sharesText.length > 6 ? '11' : '12';
                        return (
                          <text x="60" y="56" textAnchor="middle" className="font-bold" fill="#111827" fontSize={fontSize}>
                            {sharesText}
                          </text>
                        );
                      })()}
                      <text x="60" y="70" textAnchor="middle" fill="#6b7280" fontSize="9">
                        Shares
                      </text>
                    </svg>
                    {hoveredPoolItem && (
                      <div 
                        className="absolute z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap"
                        style={{
                          left: `${hoveredPoolItem.x}px`,
                          top: `${hoveredPoolItem.y - 30}px`,
                          transform: 'translateX(-50%)'
                        }}
                      >
                        <div className="font-semibold">{hoveredPoolItem.label}</div>
                        <div className="text-gray-300">
                          {hoveredPoolItem.value.toLocaleString()} shares ({hoveredPoolItem.percentage.toFixed(1)}%)
                        </div>
                      </div>
                    )}
                  </div>
                  {poolsChartExpanded && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {poolsWithShares.map((pool, index) => {
                        const percentage = (pool.total_shares_allocated / totalPoolShares) * 100;
                        const isHighlighted = highlightedPoolId === pool.id;
                        return (
                          <div 
                            key={pool.id} 
                            className={`flex items-center gap-2 text-xs hover:bg-gray-50 p-1 rounded cursor-pointer transition-colors ${isHighlighted ? 'bg-blue-50' : ''}`}
                            onMouseEnter={() => {
                              if (poolsChartRef.current) {
                                const containerRect = poolsChartRef.current.getBoundingClientRect();
                                setHoveredPoolItem({
                                  label: pool.pool_name_en,
                                  value: pool.total_shares_allocated,
                                  percentage,
                                  x: containerRect.width / 2,
                                  y: containerRect.height / 2
                                });
                                if (!poolsHighlightLocked) {
                                  setHighlightedPoolId(pool.id);
                                }
                              }
                            }}
                            onMouseLeave={() => {
                              setHoveredPoolItem(null);
                              if (!poolsHighlightLocked) {
                                setHighlightedPoolId(null);
                              }
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPoolsHighlightLocked((prev) => (prev === pool.id ? null : pool.id));
                              setHighlightedPoolId((prev) => (prev === pool.id && poolsHighlightLocked === pool.id ? null : pool.id));
                            }}
                          >
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: colors[index % colors.length] }}
                            />
                            <span className="flex-1 truncate">{pool.pool_name_en}</span>
                            <span className="font-medium">{pool.total_shares_allocated.toLocaleString()} ({percentage.toFixed(1)}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Metrics Breakdown Pie Chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div 
            onClick={() => setMetricsChartExpanded(!metricsChartExpanded)}
            className="p-4 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
            title={metricsChartExpanded ? "Collapse legend" : "Expand legend"}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setMetricsChartExpanded(!metricsChartExpanded);
              }
            }}
          >
            <div className="flex items-center space-x-2">
              <PieChart className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Shares by Status</h3>
            </div>
            <div className="text-gray-500">
              {metricsChartExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
          <div className="p-4">
            {(() => {
              const metrics = [
                { label: 'Used', value: totalUsed, color: '#10b981' },
                { label: 'Available', value: totalAvailable, color: '#f59e0b' },
              ].filter(m => m.value > 0);
              
              const totalMetrics = metrics.reduce((sum, m) => sum + m.value, 0);
              
              if (metrics.length === 0 || totalMetrics === 0) {
                return (
                  <div className="text-center py-8 text-gray-500">
                    No metrics available
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  <div 
                    ref={metricsChartRef} 
                    className="relative w-full h-40 flex items-center justify-center"
                    onClick={(e) => {
                      if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg') {
                        setMetricsHighlightLocked(null);
                        setHighlightedMetric(null);
                        setHoveredMetricItem(null);
                      }
                    }}
                  >
                    <svg 
                      viewBox="0 0 120 120" 
                      className="w-full max-w-40 h-40 cursor-pointer"
                      onMouseLeave={() => {
                        setHoveredMetricItem(null);
                        if (!metricsHighlightLocked) {
                          setHighlightedMetric(null);
                        }
                      }}
                    >
                      {metrics.map((metric, index) => {
                        const startAngle = metrics
                          .slice(0, index)
                          .reduce((sum, m) => sum + (m.value / totalMetrics) * 360, 0);
                        const angle = (metric.value / totalMetrics) * 360;
                        const endAngle = startAngle + angle;

                        const startRad = (startAngle - 90) * (Math.PI / 180);
                        const endRad = (endAngle - 90) * (Math.PI / 180);

                        const x1 = 60 + 50 * Math.cos(startRad);
                        const y1 = 60 + 50 * Math.sin(startRad);
                        const x2 = 60 + 50 * Math.cos(endRad);
                        const y2 = 60 + 50 * Math.sin(endRad);

                        const largeArc = angle > 180 ? 1 : 0;
                        const percentage = (metric.value / totalMetrics) * 100;
                        const isHighlighted = highlightedMetric === metric.label;
                        const isDimmed = highlightedMetric !== null && highlightedMetric !== metric.label;
                        
                        return (
                          <path
                            key={metric.label}
                            d={`M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                            fill={metric.color}
                            stroke="white"
                            strokeWidth={isHighlighted ? "3" : "2"}
                            className="cursor-pointer"
                            style={{
                              opacity: isDimmed ? 0.3 : (isHighlighted ? 1 : 0.8),
                              filter: isHighlighted ? 'brightness(1.2)' : (isDimmed ? 'brightness(0.5)' : 'none'),
                              transition: 'none'
                            }}
                            onMouseEnter={(e) => {
                              if (metricsChartRef.current) {
                                const containerRect = metricsChartRef.current.getBoundingClientRect();
                                const mouseX = e.clientX - containerRect.left;
                                const mouseY = e.clientY - containerRect.top;
                                if (!metricsHighlightLocked) {
                                  setHighlightedMetric(metric.label);
                                }
                                setHoveredMetricItem({
                                  label: metric.label,
                                  value: metric.value,
                                  percentage,
                                  x: mouseX,
                                  y: mouseY
                                });
                              }
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (metricsChartRef.current) {
                                const containerRect = metricsChartRef.current.getBoundingClientRect();
                                const mouseX = e.clientX - containerRect.left;
                                const mouseY = e.clientY - containerRect.top;
                                setHighlightedMetric(metric.label);
                                setHoveredMetricItem({
                                  label: metric.label,
                                  value: metric.value,
                                  percentage,
                                  x: mouseX,
                                  y: mouseY
                                });
                                setMetricsHighlightLocked((prev) => (prev === metric.label ? null : metric.label));
                              }
                            }}
                          />
                        );
                      })}
                      <circle cx="60" cy="60" r="30" fill="white" />
                      {(() => {
                        const sharesText = formatCompactNumber(totalMetrics);
                        const fontSize = sharesText.length > 12 ? '9' : sharesText.length > 9 ? '10' : sharesText.length > 6 ? '11' : '12';
                        return (
                          <text x="60" y="56" textAnchor="middle" className="font-bold" fill="#111827" fontSize={fontSize}>
                            {sharesText}
                          </text>
                        );
                      })()}
                      <text x="60" y="70" textAnchor="middle" fill="#6b7280" fontSize="9">
                        Shares
                      </text>
                    </svg>
                    {hoveredMetricItem && (
                      <div 
                        className="absolute z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap"
                        style={{
                          left: `${hoveredMetricItem.x}px`,
                          top: `${hoveredMetricItem.y - 30}px`,
                          transform: 'translateX(-50%)'
                        }}
                      >
                        <div className="font-semibold">{hoveredMetricItem.label}</div>
                        <div className="text-gray-300">
                          {hoveredMetricItem.value.toLocaleString()} shares ({hoveredMetricItem.percentage.toFixed(1)}%)
                        </div>
                      </div>
                    )}
                  </div>
                  {metricsChartExpanded && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {metrics.map((metric) => {
                        const percentage = (metric.value / totalMetrics) * 100;
                        const isHighlighted = highlightedMetric === metric.label;
                        return (
                          <div 
                            key={metric.label} 
                            className={`flex items-center gap-2 text-xs hover:bg-gray-50 p-1 rounded cursor-pointer transition-colors ${isHighlighted ? 'bg-blue-50' : ''}`}
                            onMouseEnter={() => {
                              if (metricsChartRef.current) {
                                const containerRect = metricsChartRef.current.getBoundingClientRect();
                                setHoveredMetricItem({
                                  label: metric.label,
                                  value: metric.value,
                                  percentage,
                                  x: containerRect.width / 2,
                                  y: containerRect.height / 2
                                });
                                if (!metricsHighlightLocked) {
                                  setHighlightedMetric(metric.label);
                                }
                              }
                            }}
                            onMouseLeave={() => {
                              setHoveredMetricItem(null);
                              if (!metricsHighlightLocked) {
                                setHighlightedMetric(null);
                              }
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMetricsHighlightLocked((prev) => (prev === metric.label ? null : metric.label));
                              setHighlightedMetric((prev) => (prev === metric.label && metricsHighlightLocked === metric.label ? null : metric.label));
                            }}
                          >
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: metric.color }}
                            />
                            <span className="flex-1 truncate">{metric.label}</span>
                            <span className="font-medium">
                              {metric.value.toLocaleString()} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Used Shares Breakdown Pie Chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div 
            onClick={() => setGrantedChartExpanded(!grantedChartExpanded)}
            className="p-4 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
            title={grantedChartExpanded ? "Collapse legend" : "Expand legend"}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setGrantedChartExpanded(!grantedChartExpanded);
              }
            }}
          >
            <div className="flex items-center space-x-2">
              <PieChart className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Used Shares Breakdown</h3>
            </div>
            <div className="text-gray-500">
              {grantedChartExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
          <div className="p-4">
            {(() => {
              const metrics = [
                { label: 'Vested', value: totalVested, color: '#22c55e' },
                { label: 'Unvested', value: totalUnvested, color: '#ec4899' },
                { label: 'Granted (no vesting events)', value: grantedWithoutEvents, color: '#f97316' },
                { label: 'Allocated (not granted)', value: allocatedButNotGranted, color: '#6366f1' },
              ].filter(m => m.value > 0);

              const totalMetrics = metrics.reduce((sum, m) => sum + m.value, 0);
              const percentageBase = totalUsed > 0 ? totalUsed : totalMetrics;

              if (metrics.length === 0 || percentageBase === 0) {
                return (
                  <div className="text-center py-8 text-gray-500">
                    No metrics available
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  <div 
                    ref={grantedChartRef} 
                    className="relative w-full h-40 flex items-center justify-center"
                    onClick={(e) => {
                      if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg') {
                        setGrantedHighlightLocked(null);
                        setHighlightedGrantedMetric(null);
                        setHoveredGrantedItem(null);
                      }
                    }}
                  >
                    <svg 
                      viewBox="0 0 120 120" 
                      className="w-full max-w-40 h-40 cursor-pointer"
                      onMouseLeave={() => {
                        setHoveredGrantedItem(null);
                        if (!grantedHighlightLocked) {
                          setHighlightedGrantedMetric(null);
                        }
                      }}
                    >
                      {metrics.map((metric, index) => {
                        const startAngle = metrics
                          .slice(0, index)
                          .reduce((sum, m) => sum + (m.value / totalMetrics) * 360, 0);
                        const angle = (metric.value / totalMetrics) * 360;
                        const endAngle = startAngle + angle;

                        const startRad = (startAngle - 90) * (Math.PI / 180);
                        const endRad = (endAngle - 90) * (Math.PI / 180);

                        const x1 = 60 + 50 * Math.cos(startRad);
                        const y1 = 60 + 50 * Math.sin(startRad);
                        const x2 = 60 + 50 * Math.cos(endRad);
                        const y2 = 60 + 50 * Math.sin(endRad);

                        const largeArc = angle > 180 ? 1 : 0;
                        const percentage = percentageBase > 0 ? (metric.value / percentageBase) * 100 : 0;
                        const isHighlighted = highlightedGrantedMetric === metric.label;
                        const isDimmed = highlightedGrantedMetric !== null && highlightedGrantedMetric !== metric.label;

                        return (
                          <path
                            key={metric.label}
                            d={`M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                            fill={metric.color}
                            stroke="white"
                            strokeWidth={isHighlighted ? "3" : "2"}
                            className="cursor-pointer"
                            style={{
                              opacity: isDimmed ? 0.3 : (isHighlighted ? 1 : 0.8),
                              filter: isHighlighted ? 'brightness(1.2)' : (isDimmed ? 'brightness(0.5)' : 'none'),
                              transition: 'none'
                            }}
                            onMouseEnter={(e) => {
                              if (grantedChartRef.current) {
                                const containerRect = grantedChartRef.current.getBoundingClientRect();
                                const mouseX = e.clientX - containerRect.left;
                                const mouseY = e.clientY - containerRect.top;
                                if (!grantedHighlightLocked) {
                                  setHighlightedGrantedMetric(metric.label);
                                }
                                setHoveredGrantedItem({
                                  label: metric.label,
                                  value: metric.value,
                                  percentage,
                                  x: mouseX,
                                  y: mouseY
                                });
                              }
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (grantedChartRef.current) {
                                const containerRect = grantedChartRef.current.getBoundingClientRect();
                                const mouseX = e.clientX - containerRect.left;
                                const mouseY = e.clientY - containerRect.top;
                                setGrantedHighlightLocked((prev) => (prev === metric.label ? null : metric.label));
                                setHighlightedGrantedMetric((prev) => (prev === metric.label && grantedHighlightLocked === metric.label ? null : metric.label));
                                setHoveredGrantedItem({
                                  label: metric.label,
                                  value: metric.value,
                                  percentage,
                                  x: mouseX,
                                  y: mouseY
                                });
                              }
                            }}
                          />
                        );
                      })}
                      <circle cx="60" cy="60" r="30" fill="white" />
                      {(() => {
                        const sharesText = formatCompactNumber(totalUsed);
                        const fontSize = sharesText.length > 12 ? '9' : sharesText.length > 9 ? '10' : sharesText.length > 6 ? '11' : '12';
                        return (
                          <text x="60" y="56" textAnchor="middle" className="font-bold" fill="#111827" fontSize={fontSize}>
                            {sharesText}
                          </text>
                        );
                      })()}
                      <text x="60" y="70" textAnchor="middle" fill="#6b7280" fontSize="9">
                        Shares (used)
                      </text>
                    </svg>
                    {hoveredGrantedItem && (
                      <div 
                        className="absolute z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap"
                        style={{
                          left: `${hoveredGrantedItem.x}px`,
                          top: `${hoveredGrantedItem.y - 30}px`,
                          transform: 'translateX(-50%)'
                        }}
                      >
                        <div className="font-semibold">{hoveredGrantedItem.label}</div>
                        <div className="text-gray-300">
                          {hoveredGrantedItem.value.toLocaleString()} shares ({hoveredGrantedItem.percentage.toFixed(1)}%)
                        </div>
                      </div>
                    )}
                  </div>
                  {grantedChartExpanded && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {metrics.map((metric) => {
                        const percentage = percentageBase > 0 ? (metric.value / percentageBase) * 100 : 0;
                        const isHighlighted = highlightedGrantedMetric === metric.label;
                        return (
                          <div 
                            key={metric.label} 
                            className={`flex items-center gap-2 text-xs hover:bg-gray-50 p-1 rounded cursor-pointer transition-colors ${isHighlighted ? 'bg-blue-50' : ''}`}
                            onMouseEnter={() => {
                              if (grantedChartRef.current) {
                                const containerRect = grantedChartRef.current.getBoundingClientRect();
                                setHoveredGrantedItem({
                                  label: metric.label,
                                  value: metric.value,
                                  percentage,
                                  x: containerRect.width / 2,
                                  y: containerRect.height / 2
                                });
                                if (!grantedHighlightLocked) {
                                  setHighlightedGrantedMetric(metric.label);
                                }
                              }
                            }}
                            onMouseLeave={() => {
                              setHoveredGrantedItem(null);
                              if (!grantedHighlightLocked) {
                                setHighlightedGrantedMetric(null);
                              }
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setGrantedHighlightLocked((prev) => (prev === metric.label ? null : metric.label));
                              setHighlightedGrantedMetric((prev) => (prev === metric.label && grantedHighlightLocked === metric.label ? null : metric.label));
                            }}
                          >
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: metric.color }}
                            />
                            <span className="flex-1 truncate">{metric.label}</span>
                            <span className="font-medium">
                              {metric.value.toLocaleString()} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Pools Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        {pools.length === 0 ? (
          <div className="p-12 text-center">
            <Layers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t('ltipPools.noPoolsYet')}</h3>
            <p className="text-gray-600 mb-6">
              {t('ltipPools.createFirstPool')}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center space-x-2 px-6 py-3 text-white rounded-lg transition"
              style={{ backgroundColor: brandColor }}
              onMouseEnter={(e) => {
                const rgb = parseInt(brandColor.slice(1, 3), 16) * 0.9;
                const gg = parseInt(brandColor.slice(3, 5), 16) * 0.9;
                const bb = parseInt(brandColor.slice(5, 7), 16) * 0.9;
                e.currentTarget.style.backgroundColor = `rgb(${Math.round(rgb)}, ${Math.round(gg)}, ${Math.round(bb)})`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = brandColor;
              }}
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">{t('ltipPools.createFirstPoolButton')}</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.poolName')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.poolCode')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.poolType')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.totalAllocated')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.used')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.available')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.utilization')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.granted')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.vested')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.unvested')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('ltipPools.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pools.map((pool) => {
                  const utilizationPercent = pool.total_shares_allocated > 0 
                    ? (pool.shares_used / pool.total_shares_allocated) * 100 
                    : 0;
                  const granted = grantedByPool[pool.id] || 0;
                  const vested = vestedByPool[pool.id] || 0;
                  const unvested = unvestedByPool[pool.id] || 0;
                  
                  return (
                    <tr key={pool.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{pool.pool_name_en}</div>
                        {pool.pool_name_ar && (
                          <div className="text-xs text-gray-500">{pool.pool_name_ar}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 font-mono">{pool.pool_code}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${poolTypeColors[pool.pool_type]}`}>
                          {poolTypeLabels[pool.pool_type]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">
                          {pool.total_shares_allocated.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-blue-600">
                          {pool.shares_used.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-green-600">
                          {pool.shares_available.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div 
                              className="h-2 rounded-full" 
                              style={{ 
                                width: `${Math.min(utilizationPercent, 100)}%`,
                                backgroundColor: brandColor
                              }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-600">
                            {utilizationPercent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">
                          {formatShares(granted)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-green-600">
                          {formatShares(vested)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-orange-600">
                          {formatShares(unvested)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[pool.status]}`}>
                          {pool.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleViewPool(pool)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
                            title={t('ltipPools.viewDetails')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditPool(pool)}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition"
                            title={t('ltipPools.editPool')}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(pool.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                            title={t('ltipPools.deletePool')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Pool Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{t('ltipPools.createNewPool')}</h2>
              <p className="text-gray-600 mt-1">{t('ltipPools.definePoolParameters')}</p>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pool Name (English)*
                  </label>
                  <input
                    type="text"
                    value={newPool.pool_name_en}
                    onChange={(e) => setNewPool({ ...newPool, pool_name_en: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Executive LTIP Pool 2025"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pool Name (Arabic)
                  </label>
                  <input
                    type="text"
                    value={newPool.pool_name_ar}
                    onChange={(e) => setNewPool({ ...newPool, pool_name_ar: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="مجموعة خيارات الأسهم التنفيذية 2025"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pool Code*
                  </label>
                  <input
                    type="text"
                    value={newPool.pool_code}
                    onChange={(e) => setNewPool({ ...newPool, pool_code: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="LTIP-EXEC-2025"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pool Type*
                  </label>
                  <select
                    value={newPool.pool_type}
                    onChange={(e) => setNewPool({ ...newPool, pool_type: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="general">General Pool</option>
                    <option value="executive">Executive Pool</option>
                    <option value="employee">Employee Pool</option>
                    <option value="retention">Retention Pool</option>
                    <option value="performance">Performance Pool</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Total Shares Allocated*
                  </label>
                  <input
                    type="number"
                    value={newPool.total_shares_allocated}
                    onChange={(e) => setNewPool({ ...newPool, total_shares_allocated: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1000000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('ltipPools.poolStatus')}
                  </label>
                  <select
                    value={newPool.status}
                    onChange={(e) => setNewPool({ ...newPool, status: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">{t('ltipPools.active')}</option>
                    <option value="inactive">{t('ltipPools.inactive')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (English)
                </label>
                <textarea
                  value={newPool.description_en}
                  onChange={(e) => setNewPool({ ...newPool, description_en: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Describe the purpose and eligibility criteria for this LTIP pool..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCreatePool}
                className="px-6 py-2 text-white rounded-lg transition"
                style={{ backgroundColor: brandColor }}
                onMouseEnter={(e) => {
                  const rgb = parseInt(brandColor.slice(1, 3), 16) * 0.9;
                  const gg = parseInt(brandColor.slice(3, 5), 16) * 0.9;
                  const bb = parseInt(brandColor.slice(5, 7), 16) * 0.9;
                  e.currentTarget.style.backgroundColor = `rgb(${Math.round(rgb)}, ${Math.round(gg)}, ${Math.round(bb)})`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = brandColor;
                }}
              >
                {t('ltipPools.createPool')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Pool Modal */}
      {showEditModal && selectedPool && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{t('ltipPools.updatePool')}</h2>
              <p className="text-gray-600 mt-1">{selectedPool.pool_name_en}</p>
            </div>

            <div className="p-6 space-y-6">
              <div 
                className="border rounded-lg p-4"
                style={{ 
                  backgroundColor: getBgColor('50'),
                  borderColor: getBgColor('200')
                }}
              >
                <p className="text-sm font-medium" style={{ color: getBgColor('900') }}>Current Usage</p>
                <p className="text-xs mt-1" style={{ color: getBgColor('700') }}>
                  {selectedPool.shares_used.toLocaleString()} shares currently used by incentive plans
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pool Name (English)*
                  </label>
                  <input
                    type="text"
                    value={editPool.pool_name_en}
                    onChange={(e) => setEditPool({ ...editPool, pool_name_en: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pool Name (Arabic)
                  </label>
                  <input
                    type="text"
                    value={editPool.pool_name_ar}
                    onChange={(e) => setEditPool({ ...editPool, pool_name_ar: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pool Code*
                  </label>
                  <input
                    type="text"
                    value={editPool.pool_code}
                    onChange={(e) => setEditPool({ ...editPool, pool_code: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pool Type*
                  </label>
                  <select
                    value={editPool.pool_type}
                    onChange={(e) => setEditPool({ ...editPool, pool_type: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="general">General Pool</option>
                    <option value="executive">Executive Pool</option>
                    <option value="employee">Employee Pool</option>
                    <option value="retention">Retention Pool</option>
                    <option value="performance">Performance Pool</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Total Shares Allocated*
                  </label>
                  <input
                    type="number"
                    value={editPool.total_shares_allocated}
                    onChange={(e) => setEditPool({ ...editPool, total_shares_allocated: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min={selectedPool.shares_used}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Minimum: {selectedPool.shares_used.toLocaleString()} (currently used)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={editPool.status}
                    onChange={(e) => setEditPool({ ...editPool, status: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="exhausted">Exhausted</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (English)
                </label>
                <textarea
                  value={editPool.description_en}
                  onChange={(e) => setEditPool({ ...editPool, description_en: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedPool(null);
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdatePool}
                className="px-6 py-2 text-white rounded-lg transition"
                style={{ backgroundColor: brandColor }}
                onMouseEnter={(e) => {
                  const rgb = parseInt(brandColor.slice(1, 3), 16) * 0.9;
                  const gg = parseInt(brandColor.slice(3, 5), 16) * 0.9;
                  const bb = parseInt(brandColor.slice(5, 7), 16) * 0.9;
                  e.currentTarget.style.backgroundColor = `rgb(${Math.round(rgb)}, ${Math.round(gg)}, ${Math.round(bb)})`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = brandColor;
                }}
              >
                Update Pool
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Pool Modal */}
      {showViewModal && selectedPool && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{selectedPool.pool_name_en}</h2>
              <p className="text-gray-600 mt-1">Pool Details and Usage</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Pool Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Pool Code</label>
                    <p className="text-lg font-mono text-gray-900">{selectedPool.pool_code}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Pool Type</label>
                    <p className="text-lg text-gray-900">
                      <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${poolTypeColors[selectedPool.pool_type]}`}>
                        {poolTypeLabels[selectedPool.pool_type]}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <p className="text-lg text-gray-900">
                      <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${statusColors[selectedPool.status]}`}>
                        {selectedPool.status}
                      </span>
                    </p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Total Allocated</label>
                    <p className="text-2xl font-bold text-gray-900">{selectedPool.total_shares_allocated.toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Shares Used</label>
                    <p className="text-2xl font-bold text-blue-600">{selectedPool.shares_used.toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Available</label>
                    <p className="text-2xl font-bold text-green-600">{selectedPool.shares_available.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Granted, Vested, Unvested Shares Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-200">
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Granted Shares</label>
                  <p className="text-2xl font-bold text-gray-900">{formatShares(grantedByPool[selectedPool.id] || 0)}</p>
                  <p className="text-xs text-gray-500 mt-1">From grants linked to this pool</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Vested Shares</label>
                  <p className="text-2xl font-bold text-green-600">{formatShares(vestedByPool[selectedPool.id] || 0)}</p>
                  <p className="text-xs text-gray-500 mt-1">Includes transferred, exercised, and due shares</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Unvested Shares</label>
                  <p className="text-2xl font-bold text-orange-600">{formatShares(unvestedByPool[selectedPool.id] || 0)}</p>
                  <p className="text-xs text-gray-500 mt-1">Pending, forfeited, and cancelled shares</p>
                </div>
              </div>

              {/* Vested vs Unvested Chart */}
              {((grantedByPool[selectedPool.id] || 0) > 0) && (
                <div>
                  <label className="text-sm font-medium text-gray-500 mb-2 block">Vesting Progress</label>
                  <div className="bg-gray-200 rounded-full h-4 relative">
                    {(() => {
                      const total = (grantedByPool[selectedPool.id] || 0);
                      const vested = (vestedByPool[selectedPool.id] || 0);
                      const vestedPercent = total > 0 ? (vested / total) * 100 : 0;
                      return (
                        <>
                          <div 
                            className="bg-green-600 h-4 rounded-full flex items-center justify-center text-white text-xs font-medium absolute left-0" 
                            style={{ 
                              width: `${Math.max(0, Math.min(100, vestedPercent))}%` 
                            }}
                          >
                            {vestedPercent > 10 ? `${vestedPercent.toFixed(1)}%` : ''}
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600 font-medium">
                            {formatShares(vested)} vested / {formatShares(total)} granted
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedPool.description_en && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Description</label>
                  <p className="text-gray-900 mt-1">{selectedPool.description_en}</p>
                </div>
              )}

              {/* Utilization Chart */}
              <div>
                <label className="text-sm font-medium text-gray-500 mb-2 block">Pool Utilization</label>
                <div className="bg-gray-200 rounded-full h-4">
                  <div 
                    className="h-4 rounded-full flex items-center justify-center text-white text-xs font-medium" 
                    style={{ 
                      width: `${Math.max(10, (selectedPool.shares_used / selectedPool.total_shares_allocated) * 100)}%`,
                      backgroundColor: brandColor
                    }}
                  >
                    {((selectedPool.shares_used / selectedPool.total_shares_allocated) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Associated Incentive Plans */}
              <div>
                <label className="text-sm font-medium text-gray-500 mb-3 block">Associated Incentive Plans</label>
                {poolPlans.length === 0 ? (
                  <p className="text-gray-500 italic">No incentive plans are currently using this pool</p>
                ) : (
                  <div className="space-y-2">
                    {poolPlans.map((plan) => (
                      <div key={plan.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium text-gray-900">{plan.plan_name_en}</span>
                        <span className="text-sm text-gray-600">{plan.total_shares_allocated.toLocaleString()} shares</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div>
                  <label className="text-sm font-medium text-gray-500">Created</label>
                  <p className="text-sm text-gray-900">{formatDate(selectedPool.created_at)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Last Updated</label>
                  <p className="text-sm text-gray-900">{formatDate(selectedPool.updated_at)}</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedPool(null);
                  setPoolPlans([]);
                }}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete LTIP Pool</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this LTIP pool? This action cannot be undone and may affect associated incentive plans.
            </p>
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeletePool(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Delete Pool
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
