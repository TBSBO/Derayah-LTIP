import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/dateUtils';
import { formatCompactNumber } from '../lib/numberUtils';
import { FileText, Plus, Calendar, TrendingUp, Users, Award, MoreVertical, Edit, Trash2, PieChart, ChevronDown, ChevronUp } from 'lucide-react';
import { useCompanyColor } from '../hooks/useCompanyColor';

interface IncentivePlan {
  id: string;
  plan_name_en: string;
  plan_type: 'LTIP_RSU' | 'LTIP_RSA' | 'LTIP_ESOP';
  plan_code: string;
  vesting_config: {
    type?: 'time_based' | 'performance_based' | 'hybrid';
    vesting_years?: number;
    cliff_months?: number;
  } | null;
  vesting_schedule_template_id?: string | null;
  ltip_pool_id?: string | null;
  total_shares_allocated: number;
  shares_granted: number;
  shares_available: number;
  start_date: string;
  end_date: string | null;
  status: 'draft' | 'active' | 'closed' | 'suspended';
  approval_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  // Calculated fields
  actual_shares_granted?: number;
  actual_shares_available?: number;
  actual_shares_vested?: number;
}

interface VestingScheduleTemplate {
  id: string;
  name: string;
  description: string | null;
  schedule_type: 'time_based' | 'performance_based' | 'hybrid';
  total_duration_months: number;
  cliff_months: number;
  vesting_frequency: 'monthly' | 'quarterly' | 'annually';
  is_template: boolean;
}

interface LTIPPool {
  id: string;
  pool_name_en: string;
  pool_code: string;
  total_shares_allocated: number;
  shares_used: number;
  shares_available: number;
  pool_type: 'general' | 'executive' | 'employee' | 'retention' | 'performance';
  status: 'active' | 'inactive' | 'exhausted';
}

export default function Plans() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const navigate = useNavigate();
  const { brandColor, getBgColor } = useCompanyColor();
  const [plans, setPlans] = useState<IncentivePlan[]>([]);
  const [vestingTemplates, setVestingTemplates] = useState<VestingScheduleTemplate[]>([]);
  const [ltipPools, setLtipPools] = useState<LTIPPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<IncentivePlan | null>(null);
  const [openOptionsMenuId, setOpenOptionsMenuId] = useState<string | null>(null);
  const [optionsMenuPosition, setOptionsMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [employeeShares, setEmployeeShares] = useState({ total: 0, allocated: 0 });
  const [ltipPoolTotals, setEsopPoolTotals] = useState({ total: 0, allocated: 0, available: 0 });
  const [validationError, setValidationError] = useState<string>('');
  const [pieChartExpanded, setPieChartExpanded] = useState(false);
  const [hoveredPlan, setHoveredPlan] = useState<{ plan: IncentivePlan; percentage: number; x: number; y: number } | null>(null);
  const [highlightedPlanId, setHighlightedPlanId] = useState<string | null>(null);
  const [planHighlightLocked, setPlanHighlightLocked] = useState<string | null>(null);
  const pieChartContainerRef = useRef<HTMLDivElement>(null);
  const [ltipPieChartExpanded, setLtipPieChartExpanded] = useState(false);
  const [hoveredLtipSegment, setHoveredLtipSegment] = useState<{ label: string; value: number; percentage: number; x: number; y: number } | null>(null);
  const [ltipHighlightedLabel, setLtipHighlightedLabel] = useState<'Planned Shares' | 'Unplanned Shares' | null>(null);
  const [ltipHighlightLocked, setLtipHighlightLocked] = useState<'Planned Shares' | 'Unplanned Shares' | null>(null);
  const ltipPieChartContainerRef = useRef<HTMLDivElement>(null);
  const [newPlan, setNewPlan] = useState({
    plan_name_en: '',
    plan_name_ar: '',
    plan_type: 'LTIP_RSU' as 'LTIP_RSU' | 'LTIP_RSA' | 'LTIP_ESOP',
    plan_code: '',
    description_en: '',
    description_ar: '',
    vesting_schedule_type: 'time_based' as 'time_based' | 'performance_based' | 'hybrid',
    vesting_schedule_template_id: '',
    ltip_pool_id: '',
    total_shares_allocated: 0,
    start_date: '',
    end_date: '',
    status: 'active' as 'draft' | 'active' | 'closed' | 'suspended',
    vesting_years: 4,
    cliff_months: 12,
    vesting_frequency: 'monthly' as 'monthly' | 'quarterly' | 'annually',
  });

  useEffect(() => {
    loadPlans();
  }, []);


  // Auto-calculate vesting parameters from template (works without start date)
  useEffect(() => {
    if (newPlan.vesting_schedule_template_id && vestingTemplates.length > 0) {
      const selectedTemplate = vestingTemplates.find(t => t.id === newPlan.vesting_schedule_template_id);
      
      if (selectedTemplate) {
        const calculatedData = {
          vesting_years: Math.floor(selectedTemplate.total_duration_months / 12),
          cliff_months: selectedTemplate.cliff_months,
          vesting_frequency: selectedTemplate.vesting_frequency
        };
        
        // Only calculate end date if start date is provided
        if (newPlan.start_date) {
          const startDate = new Date(newPlan.start_date);
          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + selectedTemplate.total_duration_months);
          calculatedData.end_date = endDate.toISOString().split('T')[0];
        }
        
        setNewPlan(prev => ({
          ...prev,
          ...calculatedData
        }));
      }
    }
  }, [newPlan.vesting_schedule_template_id, newPlan.start_date, vestingTemplates]);

  // Auto-calculate end date when start date changes (if template is selected)
  useEffect(() => {
    if (newPlan.start_date && newPlan.vesting_schedule_template_id && vestingTemplates.length > 0) {
      const selectedTemplate = vestingTemplates.find(t => t.id === newPlan.vesting_schedule_template_id);
      if (selectedTemplate) {
        const startDate = new Date(newPlan.start_date);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + selectedTemplate.total_duration_months);
        
        setNewPlan(prev => ({
          ...prev,
          end_date: endDate.toISOString().split('T')[0]
        }));
      }
    }
  }, [newPlan.start_date, newPlan.vesting_schedule_template_id, vestingTemplates]);

  const loadPlans = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (companyUser) {
        const [plansRes, employeeSharesRes, allocatedSharesRes, templatesRes, ltipPoolsRes] = await Promise.all([
          supabase
            .from('incentive_plans')
            .select('*')
            .eq('company_id', companyUser.company_id)
            .order('created_at', { ascending: false }),
          supabase
            .from('shareholders')
            .select('shares_owned')
            .eq('company_id', companyUser.company_id)
            .eq('shareholder_type', 'employee')
            .eq('is_active', true),
          supabase
            .from('incentive_plans')
            .select('total_shares_allocated')
            .eq('company_id', companyUser.company_id)
            .eq('status', 'active'),
          supabase
            .from('vesting_schedules')
            .select('*')
            .eq('company_id', companyUser.company_id)
            .eq('is_template', true)
            .order('created_at', { ascending: false }),
          supabase
            .from('ltip_pools')
            .select('*')
            .eq('company_id', companyUser.company_id)
            .eq('status', 'active')
            .order('created_at', { ascending: false }),
        ]);

        if (plansRes.error) throw plansRes.error;
        
        // Load vesting templates
        if (templatesRes.data) {
          setVestingTemplates(templatesRes.data as VestingScheduleTemplate[]);
        }
        
        // Load LTIP pools
        if (ltipPoolsRes.data) {
          setLtipPools(ltipPoolsRes.data as LTIPPool[]);

          // Calculate LTIP pool totals
          const poolTotals = (ltipPoolsRes.data as LTIPPool[]).reduce(
            (acc, pool) => ({
              total: acc.total + Number(pool.total_shares_allocated || 0),
              allocated: acc.allocated + Number(pool.shares_used || 0),
              available: acc.available + Number(pool.shares_available || 0),
            }),
            { total: 0, allocated: 0, available: 0 }
          );
          setEsopPoolTotals(poolTotals);
        }
        
        // Calculate actual granted and available shares for each plan
        const plansWithCalculatedShares = await Promise.all(
          (plansRes.data || []).map(async (plan) => {
            // Get actual grants for this plan (include ALL grants to debug)
            const { data: grantsData } = await supabase
              .from('grants')
              .select('id, total_shares, status, grant_number, employee_id')
              .eq('plan_id', plan.id);
            
            const actualGranted = grantsData?.reduce(
              (sum, grant) => sum + Number(grant.total_shares || 0),
              0
            ) || 0;

            let actualVested = 0;
            const grantIds = (grantsData || []).map((grant) => grant.id as string).filter(Boolean);
            if (grantIds.length > 0) {
              const { data: vestingData } = await supabase
                .from('vesting_events')
                .select('grant_id, shares_to_vest, status')
                .in('grant_id', grantIds);

              const vestedStatuses = ['vested', 'transferred', 'exercised'];
              actualVested = vestingData?.reduce((sum, event) => {
                return vestedStatuses.includes(event.status as string)
                  ? sum + Number(event.shares_to_vest || 0)
                  : sum;
              }, 0) || 0;
            }
            
            // Debug logging
            if (plan.plan_name_en === 'Derayah Employee Stock Plan 2025') {
              console.log('=== DEBUGGING DERAYAH EMPLOYEE STOCK PLAN 2025 ===');
              console.log('Plan ID:', plan.id);
              console.log('Plan Name:', plan.plan_name_en);
              console.log('Plan Total Allocated:', plan.total_shares_allocated);
              console.log('Grants Data:', grantsData);
              console.log('Number of grants found:', grantsData?.length || 0);
              console.log('Actual Granted (calculated):', actualGranted);
              console.log('Plan Shares Granted (stored):', plan.shares_granted);
              console.log('Plan Shares Available (stored):', plan.shares_available);
              
              // Log each grant individually
              if (grantsData && grantsData.length > 0) {
                grantsData.forEach((grant, index) => {
                  console.log(`Grant ${index + 1}:`, {
                    grant_number: grant.grant_number,
                    total_shares: grant.total_shares,
                    status: grant.status,
                    employee_id: grant.employee_id
                  });
                });
              } else {
                console.log('No grants found for this plan!');
                console.log('This could mean:');
                console.log('1. No grants exist for this plan');
                console.log('2. Grants exist but have different plan_id');
                console.log('3. Database connection issue');
              }
            }
            
            const actualAvailable = plan.total_shares_allocated - actualGranted;
            
            return {
              ...plan,
              actual_shares_granted: actualGranted,
              actual_shares_available: Math.max(0, actualAvailable),
              actual_shares_vested: actualVested,
            };
          })
        );
        
        setPlans(plansWithCalculatedShares);

        const totalEmployeeShares = (employeeSharesRes.data || []).reduce(
          (sum, s) => sum + Number(s.shares_owned),
          0
        );
        const totalAllocated = (allocatedSharesRes.data || []).reduce(
          (sum, p) => sum + Number(p.total_shares_allocated),
          0
        );
        setEmployeeShares({ total: totalEmployeeShares, allocated: totalAllocated });
      }
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const closeOptionsMenu = () => {
    setOpenOptionsMenuId(null);
    setOptionsMenuPosition(null);
  };

  const validateSharesAllocation = (sharesAllocated: number, ltipPoolId: string, excludePlanId?: string): boolean => {
    // If LTIP pool is selected, validate against pool availability
    if (ltipPoolId) {
      const selectedPool = ltipPools.find(p => p.id === ltipPoolId);
      if (!selectedPool) {
        setValidationError('Selected LTIP Pool not found');
        return false;
      }

      let adjustedAvailable = selectedPool.shares_available;
      if (excludePlanId) {
        const existingPlan = plans.find(p => p.id === excludePlanId);
        if (existingPlan && existingPlan.ltip_pool_id === ltipPoolId) {
          adjustedAvailable += existingPlan.total_shares_allocated;
        }
      }

      if (sharesAllocated > adjustedAvailable) {
        setValidationError(
          `Cannot allocate ${sharesAllocated.toLocaleString()} shares. ` +
          `Only ${adjustedAvailable.toLocaleString()} shares available in LTIP pool "${selectedPool.pool_name_en}" ` +
          `(Pool Total: ${selectedPool.total_shares_allocated.toLocaleString()}, Used: ${selectedPool.shares_used.toLocaleString()})`
        );
        return false;
      }
    } else {
      // Fallback to old validation if no LTIP pool selected
      const availableShares = employeeShares.total - employeeShares.allocated;

      let adjustedAllocated = employeeShares.allocated;
      if (excludePlanId) {
        const existingPlan = plans.find(p => p.id === excludePlanId);
        if (existingPlan) {
          adjustedAllocated -= existingPlan.total_shares_allocated;
        }
      }

      const remainingShares = employeeShares.total - adjustedAllocated;

      if (sharesAllocated > remainingShares) {
        setValidationError(
          `Cannot allocate ${sharesAllocated.toLocaleString()} shares. ` +
          `Only ${remainingShares.toLocaleString()} shares available from Employee shares in Cap Table ` +
          `(Total: ${employeeShares.total.toLocaleString()}, Already Allocated: ${adjustedAllocated.toLocaleString()})`
        );
        return false;
      }
    }

    setValidationError('');
    return true;
  };

  const handleCreatePlan = async () => {
    // Validate required fields
    if (!newPlan.plan_name_en.trim()) {
      alert('Plan name (English) is required');
      return;
    }
    if (!newPlan.plan_code.trim()) {
      alert('Plan code is required');
      return;
    }
    if (!newPlan.start_date) {
      alert('Start date is required');
      return;
    }
    if (!newPlan.ltip_pool_id) {
      alert('LTIP pool is required. Please select an LTIP pool for this plan.');
      return;
    }
    if (newPlan.total_shares_allocated <= 0) {
      alert('Total shares allocated must be greater than 0');
      return;
    }

    if (!validateSharesAllocation(newPlan.total_shares_allocated, newPlan.ltip_pool_id)) {
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

      const vestingConfig = {
        years: newPlan.vesting_years,
        cliff_months: newPlan.cliff_months,
        frequency: newPlan.vesting_frequency,
      };

      // Create the insert object without the potentially missing column
      const insertData: any = {
        company_id: companyUser.company_id,
        plan_name_en: newPlan.plan_name_en,
        plan_name_ar: newPlan.plan_name_ar || newPlan.plan_name_en, // Use English name if Arabic is empty
        plan_type: newPlan.plan_type,
        plan_code: newPlan.plan_code,
        description_en: newPlan.description_en,
        description_ar: newPlan.description_ar,
        vesting_schedule_type: newPlan.vesting_schedule_type,
        vesting_config: vestingConfig,
        total_shares_allocated: newPlan.total_shares_allocated,
        shares_available: newPlan.total_shares_allocated,
        status: newPlan.status,
        start_date: newPlan.start_date,
        end_date: newPlan.end_date || null,
        created_by: companyUser.id,
      };

      // Only add vesting_schedule_template_id if it's provided and not empty
      if (newPlan.vesting_schedule_template_id) {
        insertData.vesting_schedule_template_id = newPlan.vesting_schedule_template_id;
      }

      // Add ltip_pool_id (required field)
      insertData.ltip_pool_id = newPlan.ltip_pool_id;

      const { error } = await supabase
        .from('incentive_plans')
        .insert(insertData);

      if (error) {
        console.error('Plan creation error:', error);
        throw error;
      }

      setShowCreateModal(false);
      setValidationError('');
      setNewPlan({
        plan_name_en: '',
        plan_name_ar: '',
        plan_type: 'LTIP_RSU',
        plan_code: '',
        description_en: '',
        description_ar: '',
        vesting_schedule_type: 'time_based',
        vesting_schedule_template_id: '',
        ltip_pool_id: '',
        total_shares_allocated: 0,
        start_date: '',
        end_date: '',
        status: 'draft',
        vesting_years: 4,
        cliff_months: 12,
        vesting_frequency: 'monthly',
      });
      loadPlans();
    } catch (error) {
      console.error('Error creating plan:', error);
      
      // Show more specific error message
      if (error && typeof error === 'object' && 'message' in error) {
        alert(`Failed to create plan: ${error.message}`);
      } else {
        alert('Failed to create plan. Please check the console for details.');
      }
    }
  };

  const handleDeletePlan = async (planId: string) => {
    try {
      const { error } = await supabase
        .from('incentive_plans')
        .delete()
        .eq('id', planId);

      if (error) throw error;

      setShowDeleteConfirm(null);
      loadPlans();
    } catch (error) {
      console.error('Error deleting plan:', error);
      alert('Failed to delete plan');
    }
  };

  const handleEditPlan = (plan: IncentivePlan) => {
    setSelectedPlan(plan);
    setNewPlan({
      plan_name_en: plan.plan_name_en,
      plan_name_ar: '',
      plan_type: plan.plan_type,
      plan_code: plan.plan_code,
      description_en: '',
      description_ar: '',
      vesting_schedule_type: plan.vesting_config?.type || 'time_based',
      vesting_schedule_template_id: plan.vesting_schedule_template_id || '',
      ltip_pool_id: plan.ltip_pool_id || '',
      vesting_years: plan.vesting_config?.vesting_years || 4,
      cliff_months: plan.vesting_config?.cliff_months || 12,
      vesting_frequency: plan.vesting_config?.frequency || 'monthly',
      total_shares_allocated: plan.total_shares_allocated,
      start_date: plan.start_date,
      end_date: plan.end_date || '',
      status: plan.status,
    });
    closeOptionsMenu();
  };

  const handleUpdatePlan = async () => {
    if (!selectedPlan) return;

    if (!newPlan.ltip_pool_id) {
      alert('LTIP pool is required. Please select an LTIP pool for this plan.');
      return;
    }

    if (!validateSharesAllocation(newPlan.total_shares_allocated, newPlan.ltip_pool_id, selectedPlan.id)) {
      return;
    }

    try {
      const vestingConfig = {
        type: newPlan.vesting_schedule_type,
        vesting_years: newPlan.vesting_years,
        cliff_months: newPlan.cliff_months,
        frequency: newPlan.vesting_frequency,
      };

      // Create the update object without the potentially missing column
      const updateData: any = {
        plan_name_en: newPlan.plan_name_en,
        plan_type: newPlan.plan_type,
        plan_code: newPlan.plan_code,
        vesting_config: vestingConfig,
        total_shares_allocated: newPlan.total_shares_allocated,
        start_date: newPlan.start_date,
        end_date: newPlan.end_date || null,
        status: newPlan.status,
      };

      // Only add vesting_schedule_template_id if it's provided and not empty
      if (newPlan.vesting_schedule_template_id) {
        updateData.vesting_schedule_template_id = newPlan.vesting_schedule_template_id;
      }

      // Only add ltip_pool_id if it's provided and not empty
      if (newPlan.ltip_pool_id) {
        updateData.ltip_pool_id = newPlan.ltip_pool_id;
      }

      const { error } = await supabase
        .from('incentive_plans')
        .update(updateData)
        .eq('id', selectedPlan.id);

      if (error) {
        console.error('Plan update error:', error);
        throw error;
      }

      setSelectedPlan(null);
      setValidationError('');
      setNewPlan({
        plan_name_en: '',
        plan_name_ar: '',
        plan_type: 'LTIP_RSU',
        plan_code: '',
        description_en: '',
        description_ar: '',
        vesting_schedule_type: 'time_based',
        vesting_schedule_template_id: '',
        ltip_pool_id: '',
        total_shares_allocated: 0,
        start_date: '',
        end_date: '',
        status: 'draft',
        vesting_years: 4,
        cliff_months: 12,
        vesting_frequency: 'monthly',
      });
      loadPlans();
    } catch (error) {
      console.error('Error updating plan:', error);
      alert('Failed to update plan');
    }
  };

  const handleViewGrants = (plan: IncentivePlan) => {
    closeOptionsMenu();
    navigate(`/dashboard/grants?plan_id=${plan.id}&plan_name=${encodeURIComponent(plan.plan_name_en)}`);
  };

  const planTypeColors = {
    LTIP_RSU: 'bg-blue-100 text-blue-800',
    LTIP_RSA: 'bg-purple-100 text-purple-800',
    LTIP_ESOP: 'bg-green-100 text-green-800',
  };

  const statusColors = {
    draft: 'bg-gray-100 text-gray-800',
    active: 'bg-green-100 text-green-800',
    closed: 'bg-red-100 text-red-800',
    suspended: 'bg-yellow-100 text-yellow-800',
  };

  // Aggregates for LTIP Pool card breakdown (planned/granted/available under plans)
  const totalPlannedShares = plans.reduce((sum, p) => sum + Number(p.total_shares_allocated || 0), 0);
  const totalGrantedUnderPlans = plans.reduce(
    (sum, p) => sum + Number((p.actual_shares_granted ?? p.shares_granted) || 0),
    0
  );
  const totalAvailableUnderPlans = plans.reduce(
    (sum, p) =>
      sum + Number((p.actual_shares_available ?? p.shares_available ?? (p.total_shares_allocated - (p.actual_shares_granted ?? 0))) || 0),
    0
  );

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
            {t('plans.title')}
            <span 
              className="inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-lg font-semibold"
              style={{ backgroundColor: brandColor }}
            >
              {plans.length}
            </span>
          </h1>
          <p className="text-gray-600 mt-1">{t('plans.description')}</p>
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
          <span className="font-medium">{t('plans.createNewPlan')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <FileText className="w-6 h-6" style={{ color: brandColor }} />
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className={isRTL ? 'text-left' : 'text-right'}>
              <div className="text-xs text-gray-500">{t('plans.totalPlans')}</div>
              <div className="text-2xl font-bold text-gray-900">{plans.length}</div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('plans.active')}</span>
              <span className="text-sm font-semibold text-gray-900">
                {plans.filter((p) => p.status === 'active').length} / {plans.length}
              </span>
            </div>
            {(() => {
              const active = plans.filter((p) => p.status === 'active').length;
              const total = plans.length || 1;
              const percent = Math.round((active / total) * 100);
              return (
                <div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-green-500 rounded-full"
                      style={{ width: `${percent}%`, transition: 'width 200ms linear' }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{percent}% {t('plans.activePercent')}</div>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-slate-100 rounded-lg">
              <Users className="w-6 h-6 text-slate-600" />
            </div>
            <span className="text-2xl font-bold text-gray-900">{ltipPoolTotals.total.toLocaleString()}</span>
          </div>
          <p className="text-gray-600 font-medium mb-2">{t('plans.ltipPool')}</p>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">{t('plans.totalAllocated')}:</span>
              <span className="text-sm font-bold text-gray-900">{ltipPoolTotals.total.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">{t('plans.plannedShares')}:</span>
              <span className="text-sm font-bold text-gray-900">{totalPlannedShares.toLocaleString()}</span>
            </div>
            <div className={isRTL ? 'pr-4' : 'pl-4'}>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-gray-500">{t('plans.granted')}:</span>
                <span className="text-xs font-medium text-gray-900">{totalGrantedUnderPlans.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-gray-500">{t('plans.ungranted')}:</span>
                <span className="text-xs font-medium text-gray-900">{totalAvailableUnderPlans.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">{t('plans.availableToPlan')}:</span>
              <span className="text-sm font-bold text-green-600">{ltipPoolTotals.available.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6">
          <div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div 
                onClick={() => setLtipPieChartExpanded(!ltipPieChartExpanded)}
                className="flex items-center justify-between mb-4 cursor-pointer hover:bg-gray-50 transition p-2 -m-2 rounded"
                title={ltipPieChartExpanded ? "Collapse legend" : "Expand legend"}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setLtipPieChartExpanded(!ltipPieChartExpanded);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="p-3 bg-cyan-100 rounded-lg">
                    <PieChart className="w-6 h-6 text-cyan-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">LTIP Pool vs Planned</p>
                </div>
                <div className="text-gray-500">
                  {ltipPieChartExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </div>
              {(() => {
                const totalPool = ltipPoolTotals.total || 0;
                const plannedShares = totalPlannedShares || 0;
                const unplannedShares = Math.max(0, totalPool - plannedShares);
                const totalForChart = totalPool || 1;
                
                if (totalPool === 0) {
                  return (
                    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                      No LTIP pool data
                    </div>
                  );
                }

                const plannedPercentage = (plannedShares / totalForChart) * 100;
                const unplannedPercentage = (unplannedShares / totalForChart) * 100;
                const plannedAngle = (plannedShares / totalForChart) * 360;
                const unplannedAngle = (unplannedShares / totalForChart) * 360;

                const plannedStartAngle = -90;
                const plannedEndAngle = plannedStartAngle + plannedAngle;
                const unplannedStartAngle = plannedEndAngle;
                const unplannedEndAngle = unplannedStartAngle + unplannedAngle;

                const plannedStartRad = plannedStartAngle * (Math.PI / 180);
                const plannedEndRad = plannedEndAngle * (Math.PI / 180);
                const unplannedStartRad = unplannedStartAngle * (Math.PI / 180);
                const unplannedEndRad = unplannedEndAngle * (Math.PI / 180);

                const getPath = (startAngle: number, endAngle: number, angle: number) => {
                  const startRad = startAngle * (Math.PI / 180);
                  const endRad = endAngle * (Math.PI / 180);
                  const x1 = 60 + 50 * Math.cos(startRad);
                  const y1 = 60 + 50 * Math.sin(startRad);
                  const x2 = 60 + 50 * Math.cos(endRad);
                  const y2 = 60 + 50 * Math.sin(endRad);
                  const largeArc = angle > 180 ? 1 : 0;
                  return `M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`;
                };

                return (
                  <div className="space-y-3">
                    <div 
                      ref={ltipPieChartContainerRef} 
                      className="relative w-full h-40 flex items-center justify-center"
                      onClick={(e) => {
                        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg') {
                          setLtipHighlightLocked(null);
                          setLtipHighlightedLabel(null);
                          setHoveredLtipSegment(null);
                        }
                      }}
                    >
                      <svg 
                        viewBox="0 0 120 120" 
                        className="w-full max-w-40 h-40 cursor-pointer"
                        onMouseLeave={() => {
                          setHoveredLtipSegment(null);
                          if (!ltipHighlightLocked) {
                            setLtipHighlightedLabel(null);
                          }
                        }}
                      >
                        {/* Planned Shares Segment */}
                        {plannedShares > 0 && (() => {
                          const isLocked = ltipHighlightLocked === 'Planned Shares';
                          const isHighlighted = ltipHighlightedLabel === 'Planned Shares';
                          const isDimmed = ltipHighlightLocked
                            ? !isLocked
                            : ltipHighlightedLabel !== null && !isHighlighted;
                          return (
                            <path
                              d={getPath(plannedStartAngle, plannedEndAngle, plannedAngle)}
                              fill="#3b82f6"
                              stroke="white"
                              strokeWidth={isLocked || isHighlighted ? 3 : 2}
                              className="cursor-pointer"
                              style={{
                                opacity: isLocked ? 1 : isDimmed ? 0.3 : isHighlighted ? 1 : 0.85,
                                filter:
                                  isLocked || isHighlighted
                                    ? 'brightness(1.2)'
                                    : ltipHighlightLocked
                                    ? 'brightness(0.5)'
                                    : 'none',
                                transition: 'none'
                              }}
                              onMouseEnter={(e) => {
                                if (ltipPieChartContainerRef.current) {
                                  const containerRect = ltipPieChartContainerRef.current.getBoundingClientRect();
                                  const mouseX = e.clientX - containerRect.left;
                                  const mouseY = e.clientY - containerRect.top;
                                  setHoveredLtipSegment({
                                    label: 'Planned Shares',
                                    value: plannedShares,
                                    percentage: plannedPercentage,
                                    x: mouseX,
                                    y: mouseY
                                  });
                                  if (!ltipHighlightLocked) {
                                    setLtipHighlightedLabel('Planned Shares');
                                  }
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (ltipPieChartContainerRef.current) {
                                  const containerRect = ltipPieChartContainerRef.current.getBoundingClientRect();
                                  const mouseX = e.clientX - containerRect.left;
                                  const mouseY = e.clientY - containerRect.top;
                                  setHoveredLtipSegment({
                                    label: 'Planned Shares',
                                    value: plannedShares,
                                    percentage: plannedPercentage,
                                    x: mouseX,
                                    y: mouseY
                                  });
                                }
                                setLtipHighlightLocked((prev) => {
                                  const next = prev === 'Planned Shares' ? null : 'Planned Shares';
                                  setLtipHighlightedLabel(next);
                                  return next;
                                });
                              }}
                            />
                          );
                        })()}
                        
                        {/* Unplanned Shares Segment */}
                        {unplannedShares > 0 && (() => {
                          const isLocked = ltipHighlightLocked === 'Unplanned Shares';
                          const isHighlighted = ltipHighlightedLabel === 'Unplanned Shares';
                          const isDimmed = ltipHighlightLocked
                            ? !isLocked
                            : ltipHighlightedLabel !== null && !isHighlighted;
                          return (
                            <path
                              d={getPath(unplannedStartAngle, unplannedEndAngle, unplannedAngle)}
                              fill="#94a3b8"
                              stroke="white"
                              strokeWidth={isLocked || isHighlighted ? 3 : 2}
                              className="cursor-pointer"
                              style={{
                                opacity: isLocked ? 1 : isDimmed ? 0.3 : isHighlighted ? 1 : 0.85,
                                filter:
                                  isLocked || isHighlighted
                                    ? 'brightness(1.2)'
                                    : ltipHighlightLocked
                                    ? 'brightness(0.5)'
                                    : 'none',
                                transition: 'none'
                              }}
                              onMouseEnter={(e) => {
                                if (ltipPieChartContainerRef.current) {
                                  const containerRect = ltipPieChartContainerRef.current.getBoundingClientRect();
                                  const mouseX = e.clientX - containerRect.left;
                                  const mouseY = e.clientY - containerRect.top;
                                  setHoveredLtipSegment({
                                    label: 'Unplanned Shares',
                                    value: unplannedShares,
                                    percentage: unplannedPercentage,
                                    x: mouseX,
                                    y: mouseY
                                  });
                                  if (!ltipHighlightLocked) {
                                    setLtipHighlightedLabel('Unplanned Shares');
                                  }
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (ltipPieChartContainerRef.current) {
                                  const containerRect = ltipPieChartContainerRef.current.getBoundingClientRect();
                                  const mouseX = e.clientX - containerRect.left;
                                  const mouseY = e.clientY - containerRect.top;
                                  setHoveredLtipSegment({
                                    label: 'Unplanned Shares',
                                    value: unplannedShares,
                                    percentage: unplannedPercentage,
                                    x: mouseX,
                                    y: mouseY
                                  });
                                }
                                setLtipHighlightLocked((prev) => {
                                  const next = prev === 'Unplanned Shares' ? null : 'Unplanned Shares';
                                  setLtipHighlightedLabel(next);
                                  return next;
                                });
                              }}
                            />
                          );
                        })()}

                        <circle cx="60" cy="60" r="30" fill="white" />
                        {(() => {
                          const sharesText = formatCompactNumber(totalPool);
                          const fontSize = sharesText.length > 12 ? '9' : sharesText.length > 9 ? '10' : sharesText.length > 6 ? '11' : '12';
                          return (
                            <text x="60" y="56" textAnchor="middle" className="font-bold" fill="#111827" fontSize={fontSize}>
                              {sharesText}
                            </text>
                          );
                        })()}
                        <text x="60" y="70" textAnchor="middle" fill="#6b7280" fontSize="9">
                          Total Pool
                        </text>
                      </svg>
                      {hoveredLtipSegment && (
                        <div 
                          className="absolute z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap"
                          style={{
                            left: `${hoveredLtipSegment.x + 10}px`,
                            top: `${hoveredLtipSegment.y - 10}px`,
                            transform: 'translate(-50%, -100%)'
                          }}
                        >
                          <div className="font-semibold">{hoveredLtipSegment.label}</div>
                          <div className="text-gray-300">{hoveredLtipSegment.percentage.toFixed(2)}%</div>
                          <div className="text-gray-400 text-[10px] mt-1">
                            {hoveredLtipSegment.value.toLocaleString()} shares
                          </div>
                        </div>
                      )}
                    </div>
                    {ltipPieChartExpanded && (
                      <div className="space-y-2 max-h-32 overflow-y-auto border-t pt-2">
                        {(['Planned Shares', 'Unplanned Shares'] as const).map((label) => {
                          const isLocked = ltipHighlightLocked === label;
                          const isHighlighted = ltipHighlightedLabel === label;
                          const value = label === 'Planned Shares' ? plannedShares : unplannedShares;
                          const percentage = label === 'Planned Shares' ? plannedPercentage : unplannedPercentage;
                          const color = label === 'Planned Shares' ? 'bg-blue-500' : 'bg-slate-400';
                          if (value <= 0) return null;
                          return (
                            <div
                              key={label}
                              className={`flex items-center gap-2 text-xs p-1 rounded cursor-pointer transition-colors ${
                                isLocked || isHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50'
                              }`}
                              onMouseEnter={() => {
                                if (ltipPieChartContainerRef.current) {
                                  const containerRect = ltipPieChartContainerRef.current.getBoundingClientRect();
                                  setHoveredLtipSegment({
                                    label,
                                    value,
                                    percentage,
                                    x: containerRect.width / 2,
                                    y: containerRect.height / 2
                                  });
                                  if (!ltipHighlightLocked) {
                                    setLtipHighlightedLabel(label);
                                  }
                                }
                              }}
                              onMouseLeave={() => {
                                setHoveredLtipSegment(null);
                                if (!ltipHighlightLocked) {
                                  setLtipHighlightedLabel(null);
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLtipHighlightLocked((prev) => {
                                  const next = prev === label ? null : label;
                                  setLtipHighlightedLabel(next);
                                  return next;
                                });
                              }}
                            >
                              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${color}`} />
                              <span className="text-gray-600 flex-1">{label}</span>
                              <span className="text-gray-900 font-medium">
                                {value.toLocaleString()} ({percentage.toFixed(1)}%)
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
        <div className="grid grid-cols-1 gap-6">
          <div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div 
                onClick={() => setPieChartExpanded(!pieChartExpanded)}
                className="flex items-center justify-between mb-4 cursor-pointer hover:bg-gray-50 transition p-2 -m-2 rounded"
                title={pieChartExpanded ? "Collapse legend" : "Expand legend"}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPieChartExpanded(!pieChartExpanded);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <PieChart className="w-6 h-6 text-purple-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">Planned Shares by Plan</p>
                </div>
                <div className="text-gray-500">
                  {pieChartExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </div>
              {(() => {
                const plansWithShares = plans.filter(p => p.total_shares_allocated > 0);
                const totalShares = plansWithShares.reduce((sum, p) => sum + p.total_shares_allocated, 0);
                const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
               
                if (plansWithShares.length === 0) {
                  return (
                    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                      No shares allocated
                    </div>
                  );
                }
 
                return (
                  <div className="space-y-3">
                    <div 
                      ref={pieChartContainerRef} 
                      className="relative w-full h-40 flex items-center justify-center"
                    onClick={(e) => {
                        // Click on background (not on a path) resets highlight
                        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg') {
                          setPlanHighlightLocked(null);
                          setHighlightedPlanId(null);
                          setHoveredPlan(null);
                        }
                      }}
                    >
                      <svg 
                        viewBox="0 0 120 120" 
                        className="w-full max-w-40 h-40 cursor-pointer"
                      onMouseLeave={() => {
                        setHoveredPlan(null);
                        if (!planHighlightLocked) {
                          setHighlightedPlanId(null);
                        }
                      }}
                      >
                        {plansWithShares.map((plan, index) => {
                          const startAngle = plansWithShares
                            .slice(0, index)
                            .reduce((sum, p) => sum + (p.total_shares_allocated / totalShares) * 360, 0);
                          const angle = (plan.total_shares_allocated / totalShares) * 360;
                          const endAngle = startAngle + angle;
 
                          const startRad = (startAngle - 90) * (Math.PI / 180);
                          const endRad = (endAngle - 90) * (Math.PI / 180);
 
                          const x1 = 60 + 50 * Math.cos(startRad);
                          const y1 = 60 + 50 * Math.sin(startRad);
                          const x2 = 60 + 50 * Math.cos(endRad);
                          const y2 = 60 + 50 * Math.sin(endRad);
 
                          const largeArc = angle > 180 ? 1 : 0;
 
                          const percentage = (plan.total_shares_allocated / totalShares) * 100;
                          
                          const isLocked = planHighlightLocked === plan.id;
                          const isHighlighted = highlightedPlanId === plan.id;
                          const isDimmed = planHighlightLocked
                            ? !isLocked
                            : highlightedPlanId !== null && !isHighlighted;
                          
                          return (
                            <path
                              key={plan.id}
                              d={`M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                              fill={colors[index % colors.length]}
                              stroke="white"
                              strokeWidth={isLocked || isHighlighted ? "3" : "2"}
                              className="cursor-pointer"
                            style={{
                              opacity: isLocked
                                ? 1
                                : isDimmed
                                ? 0.3
                                : isHighlighted
                                ? 1
                                : 0.8,
                              filter:
                                isLocked || isHighlighted
                                  ? 'brightness(1.2)'
                                  : planHighlightLocked
                                  ? 'brightness(0.5)'
                                  : 'none',
                              transition: 'none'
                            }}
                              onMouseEnter={(e) => {
                                if (pieChartContainerRef.current) {
                                  const containerRect = pieChartContainerRef.current.getBoundingClientRect();
                                  const mouseX = e.clientX - containerRect.left;
                                  const mouseY = e.clientY - containerRect.top;
                                if (!planHighlightLocked) {
                                  setHighlightedPlanId(plan.id);
                                }
                                  setHoveredPlan({
                                    plan,
                                    percentage,
                                    x: mouseX,
                                    y: mouseY
                                  });
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (pieChartContainerRef.current) {
                                  const containerRect = pieChartContainerRef.current.getBoundingClientRect();
                                  const mouseX = e.clientX - containerRect.left;
                                  const mouseY = e.clientY - containerRect.top;
                                  setHoveredPlan({
                                    plan,
                                    percentage,
                                    x: mouseX,
                                    y: mouseY
                                  });
                                }
                                setPlanHighlightLocked((prev) => {
                                  const next = prev === plan.id ? null : plan.id;
                                  setHighlightedPlanId(next);
                                  return next;
                                });
                              }}
                            />
                          );
                        })}
                        <circle cx="60" cy="60" r="30" fill="white" />
                        {(() => {
                          const sharesText = formatCompactNumber(totalShares);
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
                      {hoveredPlan && (
                        <div 
                          className="absolute z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap"
                          style={{
                            left: `${hoveredPlan.x + 10}px`,
                            top: `${hoveredPlan.y - 10}px`,
                            transform: 'translate(-50%, -100%)'
                          }}
                        >
                          <div className="font-semibold">{hoveredPlan.plan.plan_name_en}</div>
                          <div className="text-gray-300">{hoveredPlan.percentage.toFixed(2)}%</div>
                          <div className="text-gray-400 text-[10px] mt-1">
                            {hoveredPlan.plan.total_shares_allocated.toLocaleString()} shares
                          </div>
                        </div>
                      )}
                    </div>
                    {pieChartExpanded && (
                      <div className="space-y-1 max-h-32 overflow-y-auto border-t pt-2">
                        {plansWithShares
                          .sort((a, b) => b.total_shares_allocated - a.total_shares_allocated)
                          .map((plan, index) => {
                            const percentage = (plan.total_shares_allocated / totalShares) * 100;
                            const isLocked = planHighlightLocked === plan.id;
                            const isHighlighted = highlightedPlanId === plan.id;
                            return (
                              <div 
                                key={plan.id} 
                                className={`flex items-center gap-2 text-xs p-1 rounded cursor-pointer transition-colors ${
                                  isLocked || isHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50'
                                }`}
                                onMouseEnter={() => {
                                  if (pieChartContainerRef.current) {
                                    const containerRect = pieChartContainerRef.current.getBoundingClientRect();
                                    setHoveredPlan({
                                      plan,
                                      percentage,
                                      x: containerRect.width / 2,
                                      y: containerRect.height / 2
                                    });
                                    if (!planHighlightLocked) {
                                      setHighlightedPlanId(plan.id);
                                    }
                                  }
                                }}
                                onMouseLeave={() => {
                                  setHoveredPlan(null);
                                  if (!planHighlightLocked) {
                                    setHighlightedPlanId(null);
                                  }
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPlanHighlightLocked((prev) => {
                                    const next = prev === plan.id ? null : plan.id;
                                    setHighlightedPlanId(next);
                                    return next;
                                  });
                                }}
                              >
                                <div 
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: colors[index % colors.length] }}
                                />
                                <span className="text-gray-600 truncate flex-1" title={plan.plan_name_en}>
                                  {plan.plan_name_en}
                                </span>
                                <span className="text-gray-900 font-medium">{plan.total_shares_allocated.toLocaleString()} ({percentage.toFixed(1)}%)</span>
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
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {plans.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">No Plans Created Yet</h3>
            <p className="text-gray-600 mb-6">
              Create your first incentive plan to start allocating shares to employees
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
              <span className="font-medium">Create First Plan</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('plans.planName')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('plans.planType')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('plans.planCode')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('plans.totalShares')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('plans.granted')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('employees.vested')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('plans.ungranted')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('plans.vestingScheduleType')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    Period
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('plans.status')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-left' : 'text-right'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('plans.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50 transition relative">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleViewGrants(plan)}
                        className="text-left"
                      >
                        <div className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition">{plan.plan_name_en}</div>
                        <div className="text-xs text-gray-500">{plan.plan_name_ar}</div>
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${planTypeColors[plan.plan_type]}`}>
                        {plan.plan_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{plan.plan_code}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900">{plan.total_shares_allocated.toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-blue-600">
                        {plan.actual_shares_granted?.toLocaleString() || plan.shares_granted.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-green-600">
                        {(plan as any).actual_shares_vested?.toLocaleString() || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900">
                        {plan.actual_shares_available?.toLocaleString() || plan.shares_available.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 capitalize">
                        {plan.vesting_config?.type ? plan.vesting_config.type.replace('_', ' ') : 'Time Based'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Calendar className="w-3.5 h-3.5 mr-1" />
                        <span>{formatDate(plan.start_date)}</span>
                      </div>
                      {plan.end_date && (
                        <div className="text-xs text-gray-500">to {formatDate(plan.end_date)}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[plan.status]}`}>
                        {plan.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap relative">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            if (openOptionsMenuId === plan.id) {
                              closeOptionsMenu();
                              return;
                            }

                            const rect = event.currentTarget.getBoundingClientRect();
                            const menuHeight = 144;
                            const menuWidth = 176;

                            let top = rect.bottom + 8;
                            let left = rect.right - menuWidth;

                            if (top + menuHeight > window.innerHeight) {
                              top = rect.top - menuHeight - 8;
                            }

                            if (left < 16) {
                              left = Math.max(16, rect.left);
                            }

                            const maxLeft = window.innerWidth - menuWidth - 16;
                            if (left > maxLeft) {
                              left = Math.max(16, maxLeft);
                            }

                            if (top < 16) {
                              top = 16;
                            }

                            setOptionsMenuPosition({ top, left });
                            setOpenOptionsMenuId(plan.id);
                          }}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition"
                          title="Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                      {openOptionsMenuId === plan.id && optionsMenuPosition && createPortal(
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={closeOptionsMenu}
                          ></div>
                          <div
                            className="fixed z-50 w-44 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
                            style={{
                              top: `${optionsMenuPosition.top}px`,
                              left: `${optionsMenuPosition.left}px`,
                            }}
                          >
                            <button
                              onClick={() => {
                                handleViewGrants(plan);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Users className="w-4 h-4 text-blue-500" />
                              <span>View grants</span>
                            </button>
                            <button
                              onClick={() => {
                                handleEditPlan(plan);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Edit className="w-4 h-4 text-gray-500" />
                              <span>Edit plan</span>
                            </button>
                            <button
                              onClick={() => {
                                setShowDeleteConfirm(plan.id);
                                closeOptionsMenu();
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete plan</span>
                            </button>
                          </div>
                        </>,
                        document.body
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Create New Incentive Plan</h2>
              <p className="text-gray-600 mt-1">Define plan parameters and vesting schedule</p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-900">LTIP Pool Details</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Total: {ltipPoolTotals.total.toLocaleString()} |
                      Already Allocated: {ltipPoolTotals.allocated.toLocaleString()} |
                      Available: {ltipPoolTotals.available.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {validationError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800">{validationError}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('plans.planNameEnglish')}*
                  </label>
                  <input
                    type="text"
                    value={newPlan.plan_name_en}
                    onChange={(e) => setNewPlan({ ...newPlan, plan_name_en: e.target.value })}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                    placeholder="e.g., Executive LTIP 2025"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('plans.planNameArabic')}*
                  </label>
                  <input
                    type="text"
                    value={newPlan.plan_name_ar}
                    onChange={(e) => setNewPlan({ ...newPlan, plan_name_ar: e.target.value })}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right`}
                    dir="rtl"
                    placeholder="خطة الحوافز التنفيذية 2025"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('plans.planCode')}*
                  </label>
                  <input
                    type="text"
                    value={newPlan.plan_code}
                    onChange={(e) => setNewPlan({ ...newPlan, plan_code: e.target.value })}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                    placeholder="LTIP-2025-001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('plans.planType')}*
                  </label>
                  <select
                    value={newPlan.plan_type}
                    onChange={(e) => setNewPlan({ ...newPlan, plan_type: e.target.value as any })}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                  >
                    <option value="LTIP_RSU">LTIP - Restricted Stock Units</option>
                    <option value="LTIP_RSA">LTIP - Restricted Stock Awards</option>
                    <option value="LTIP_ESOP">Employee Stock Option Plan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('plans.vestingScheduleType')}*
                  </label>
                  <select
                    value={newPlan.vesting_schedule_type}
                    onChange={(e) => setNewPlan({ ...newPlan, vesting_schedule_type: e.target.value as any })}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                  >
                    <option value="time_based">Time-Based Vesting</option>
                    <option value="performance_based">Performance-Based Vesting</option>
                    <option value="hybrid">Hybrid (Time + Performance)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('plans.vestingScheduleTemplate')}
                  </label>
                  <select
                    value={newPlan.vesting_schedule_template_id}
                    onChange={(e) => setNewPlan({ ...newPlan, vesting_schedule_template_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a template (optional)</option>
                    {vestingTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.cliff_months}mo cliff, {template.vesting_frequency})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Select a template to automatically configure vesting rules for all grants under this plan
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    LTIP Pool*
                  </label>
                  <select
                    value={newPlan.ltip_pool_id}
                    onChange={(e) => setNewPlan({ ...newPlan, ltip_pool_id: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select LTIP Pool</option>
                    {ltipPools.map((pool) => (
                      <option key={pool.id} value={pool.id}>
                        {pool.pool_name_en} ({pool.shares_available.toLocaleString()} available)
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Select an LTIP pool to allocate shares from.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Total Shares Allocated*
                  </label>
                  <input
                    type="number"
                    value={newPlan.total_shares_allocated}
                    onChange={(e) => setNewPlan({ ...newPlan, total_shares_allocated: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="10000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={newPlan.status}
                    onChange={(e) => setNewPlan({ ...newPlan, status: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="suspended">Suspended</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('plans.startDate')}*
                  </label>
                  <input
                    type="date"
                    value={newPlan.start_date}
                    onChange={(e) => setNewPlan({ ...newPlan, start_date: e.target.value })}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('plans.endDate')}
                  </label>
                  <input
                    type="date"
                    value={newPlan.end_date}
                    onChange={(e) => setNewPlan({ ...newPlan, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={!!newPlan.vesting_schedule_template_id}
                  />
                  {newPlan.vesting_schedule_template_id && (
                    <p className="text-xs text-blue-600 mt-1">
                      Auto-generated from selected template duration
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vesting Period (Years)*
                  </label>
                  <input
                    type="number"
                    value={newPlan.vesting_years}
                    onChange={(e) => setNewPlan({ ...newPlan, vesting_years: parseInt(e.target.value) || 4 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="4"
                    disabled={!!newPlan.vesting_schedule_template_id}
                  />
                  {newPlan.vesting_schedule_template_id && (
                    <p className="text-xs text-blue-600 mt-1">
                      Auto-generated from selected template
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cliff Period (Months)
                  </label>
                  <input
                    type="number"
                    value={newPlan.cliff_months}
                    onChange={(e) => setNewPlan({ ...newPlan, cliff_months: parseInt(e.target.value) || 12 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="12"
                    disabled={!!newPlan.vesting_schedule_template_id}
                  />
                  {newPlan.vesting_schedule_template_id && (
                    <p className="text-xs text-blue-600 mt-1">
                      Auto-generated from selected template
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vesting Frequency
                  </label>
                  <input
                    type="text"
                    value={newPlan.vesting_frequency === 'monthly' ? 'Monthly' : 
                           newPlan.vesting_frequency === 'quarterly' ? 'Quarterly' : 
                           newPlan.vesting_frequency === 'annually' ? 'Annually' : 'Monthly'}
                    onChange={(e) => setNewPlan({ ...newPlan, vesting_frequency: e.target.value.toLowerCase() as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={!!newPlan.vesting_schedule_template_id}
                    placeholder="Monthly"
                  />
                  {newPlan.vesting_schedule_template_id && (
                    <p className="text-xs text-blue-600 mt-1">
                      Auto-generated from selected template
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('plans.descriptionEnglish')}
                </label>
                <textarea
                  value={newPlan.description_en}
                  onChange={(e) => setNewPlan({ ...newPlan, description_en: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Describe the plan objectives and eligibility criteria..."
                />
              </div>
            </div>

            {/* Fixed Footer */}
            <div className={`flex-shrink-0 p-6 border-t border-gray-200 bg-white flex items-center ${isRTL ? 'justify-start flex-row-reverse' : 'justify-end'} space-x-3 ${isRTL ? 'space-x-reverse' : ''}`}>
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCreatePlan}
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
                {t('plans.createPlan')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Plan</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this plan? This action cannot be undone and all associated grants will be affected.
            </p>
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeletePlan(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Delete Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Edit Plan</h2>
              <p className="text-gray-600 mt-1">{selectedPlan.plan_name_en}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div>
                  <p className="text-sm font-medium text-blue-900">LTIP Pool Details</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Total: {ltipPoolTotals.total.toLocaleString()} |
                    Already Allocated: {ltipPoolTotals.allocated.toLocaleString()} |
                    Available: {ltipPoolTotals.available.toLocaleString()}
                  </p>
                </div>
              </div>

              {validationError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800">{validationError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name (English)</label>
                <input
                  type="text"
                  value={newPlan.plan_name_en}
                  onChange={(e) => setNewPlan({ ...newPlan, plan_name_en: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 2024 Executive LTIP"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan Type</label>
                <select
                  value={newPlan.plan_type}
                  onChange={(e) => setNewPlan({ ...newPlan, plan_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="LTIP_RSU">LTIP - RSU (Restricted Stock Units)</option>
                  <option value="LTIP_RSA">LTIP - RSA (Restricted Stock Awards)</option>
                  <option value="LTIP_ESOP">ESOP (Employee Stock Ownership Plan)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan Code</label>
                <input
                  type="text"
                  value={newPlan.plan_code}
                  onChange={(e) => setNewPlan({ ...newPlan, plan_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., LTIP-2024-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vesting Schedule Type</label>
                <select
                  value={newPlan.vesting_schedule_type}
                  onChange={(e) => setNewPlan({ ...newPlan, vesting_schedule_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="time_based">Time-Based Vesting</option>
                  <option value="performance_based">Performance-Based Vesting</option>
                  <option value="hybrid">Hybrid (Time + Performance)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vesting Schedule Template</label>
                <select
                  value={newPlan.vesting_schedule_template_id}
                  onChange={(e) => setNewPlan({ ...newPlan, vesting_schedule_template_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a template (optional)</option>
                  {vestingTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.cliff_months}mo cliff, {template.vesting_frequency})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select a template to automatically configure vesting rules for all grants under this plan
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LTIP Pool*</label>
                <select
                  value={newPlan.ltip_pool_id}
                  onChange={(e) => setNewPlan({ ...newPlan, ltip_pool_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {!newPlan.ltip_pool_id && (
                    <option value="">Select LTIP Pool</option>
                  )}
                  {ltipPools.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.pool_name_en} ({pool.shares_available.toLocaleString()} available)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Shares Allocated</label>
                <input
                  type="number"
                  value={newPlan.total_shares_allocated}
                  onChange={(e) => setNewPlan({ ...newPlan, total_shares_allocated: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="100000"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newPlan.start_date}
                    onChange={(e) => setNewPlan({ ...newPlan, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date (Optional)</label>
                  <input
                    type="date"
                    value={newPlan.end_date}
                    onChange={(e) => setNewPlan({ ...newPlan, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={!!newPlan.vesting_schedule_template_id}
                  />
                  {newPlan.vesting_schedule_template_id && (
                    <p className="text-xs text-blue-600 mt-1">
                      Auto-generated from selected template duration
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vesting Period (Years)</label>
                  <input
                    type="number"
                    value={newPlan.vesting_years}
                    onChange={(e) => setNewPlan({ ...newPlan, vesting_years: parseInt(e.target.value) || 4 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="4"
                    disabled={!!newPlan.vesting_schedule_template_id}
                  />
                  {newPlan.vesting_schedule_template_id && (
                    <p className="text-xs text-blue-600 mt-1">
                      Auto-generated from selected template
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliff Period (Months)</label>
                  <input
                    type="number"
                    value={newPlan.cliff_months}
                    onChange={(e) => setNewPlan({ ...newPlan, cliff_months: parseInt(e.target.value) || 12 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="12"
                    disabled={!!newPlan.vesting_schedule_template_id}
                  />
                  {newPlan.vesting_schedule_template_id && (
                    <p className="text-xs text-blue-600 mt-1">
                      Auto-generated from selected template
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vesting Frequency</label>
                <input
                  type="text"
                  value={newPlan.vesting_frequency === 'monthly' ? 'Monthly' : 
                         newPlan.vesting_frequency === 'quarterly' ? 'Quarterly' : 
                         newPlan.vesting_frequency === 'annually' ? 'Annually' : 'Monthly'}
                  onChange={(e) => setNewPlan({ ...newPlan, vesting_frequency: e.target.value.toLowerCase() as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={!!newPlan.vesting_schedule_template_id}
                  placeholder="Monthly"
                />
                {newPlan.vesting_schedule_template_id && (
                  <p className="text-xs text-blue-600 mt-1">
                    Auto-generated from selected template
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={newPlan.status}
                  onChange={(e) => setNewPlan({ ...newPlan, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setSelectedPlan(null);
                  setNewPlan({
                    plan_name_en: '',
                    plan_name_ar: '',
                    plan_type: 'LTIP_RSU',
                    plan_code: '',
                    description_en: '',
                    description_ar: '',
                    vesting_schedule_type: 'time_based',
                    total_shares_allocated: 0,
                    start_date: '',
                    end_date: '',
                    status: 'draft',
                    vesting_years: 4,
                    cliff_months: 12,
                    vesting_frequency: 'monthly',
                  });
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdatePlan}
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
                Update Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
