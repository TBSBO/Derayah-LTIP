// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { formatDate, formatDateTime } from '../lib/dateUtils';
import { generateIndividualVestingRecords, generateVestingEventsFromPreview, getGrantVestingDetails } from '../lib/vestingUtils';
import InteractiveVestingTimeline from '../components/InteractiveVestingTimeline';
import { Award, Plus, Search, Filter, FileText, CheckCircle, Clock, XCircle, X, MoreVertical, Eye, History, Edit, Trash2, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCompanyColor } from '../hooks/useCompanyColor';

interface Grant {
  id: string;
  grant_number: string;
  company_id: string;
  employee_id: string;
  plan_id: string;
  total_shares: number;
  vested_shares: number;
  remaining_unvested_shares: number;
  vesting_start_date: string;
  vesting_end_date: string;
  status: 'pending_signature' | 'active' | 'completed' | 'forfeited' | 'cancelled' | 'lapsed';
  grant_date: string;
  employees: {
    first_name_en: string;
    last_name_en: string;
    email: string;
    department: string | null;
  };
  incentive_plans: {
    plan_name_en: string;
    plan_code: string;
    plan_type: string;
  };
  grant_performance_metrics?: {
    performance_metric_id: string;
    performance_metrics?: {
      id: string;
      name: string;
      description: string | null;
      metric_type: string | null;
      unit_of_measure: string | null;
    } | null;
  }[];
}

interface Employee {
  id: string;
  employee_number: string;
  first_name_en: string;
  last_name_en: string;
  email: string;
  department: string | null;
}

interface Plan {
  id: string;
  plan_name_en: string;
  plan_code: string;
  shares_available: number;
  start_date: string;
  vesting_config: any;
  vesting_schedule_template_id?: string | null;
  vesting_schedules?: {
    total_duration_months: number;
    cliff_months: number;
    vesting_frequency: string;
  }[] | null;
  // Calculated fields
  actual_shares_available?: number;
}

interface PerformanceMetricOption {
  id: string;
  name: string;
  description: string | null;
  metric_type: string;
  unit_of_measure: string;
}

export default function Grants() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { brandColor, getBgColor } = useCompanyColor();
  const [searchParams, setSearchParams] = useSearchParams();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetricOption[]>([]);
  const [vestingSchedules, setVestingSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedGrant, setSelectedGrant] = useState<Grant | null>(null);
  const [selectedGrantVestingDetails, setSelectedGrantVestingDetails] = useState<any>(null);
  const [grantContract, setGrantContract] = useState<any>(null);
  const [grantHistory, setGrantHistory] = useState<any[]>([]);
  const [computedVestedShares, setComputedVestedShares] = useState<number | null>(null);
  const [transferredShares, setTransferredShares] = useState<number>(0);
  const [exercisedShares, setExercisedShares] = useState<number>(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPlanId, setFilterPlanId] = useState<string | null>(null);
  const [filterPlanName, setFilterPlanName] = useState<string | null>(null);
  const [showEmployeeFilterModal, setShowEmployeeFilterModal] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [employeeFilterSearch, setEmployeeFilterSearch] = useState('');
  const [newGrant, setNewGrant] = useState({
    employee_id: '',
    plan_id: '',
    total_shares: 0,
    vesting_start_date: '',
    vesting_schedule_id: '',
    performance_metric_ids: [] as string[],
    use_even_distribution: false,
  });
  const [editGrant, setEditGrant] = useState({
    total_shares: 0,
    grant_date: '',
    vesting_start_date: '',
    vesting_end_date: '',
    status: 'pending_signature' as 'pending_signature' | 'active' | 'completed' | 'forfeited' | 'cancelled',
  });
  const [editGrantMetrics, setEditGrantMetrics] = useState<string[]>([]);
  const { userRole, hasPermission } = useAuth();
  const [approvingContract, setApprovingContract] = useState(false);
  const [selectedGrants, setSelectedGrants] = useState<string[]>([]);

  useEffect(() => {
    const planId = searchParams.get('plan_id');
    const planName = searchParams.get('plan_name');

    if (planId) {
      setFilterPlanId(planId);
      setFilterPlanName(planName);
    } else {
      setFilterPlanId(null);
      setFilterPlanName(null);
    }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Clear selection when filters change
    setSelectedGrants([]);
  }, [searchTerm, filterStatus, filterPlanId, selectedEmployees]);

  const clearPlanFilter = () => {
    setFilterPlanId(null);
    setFilterPlanName(null);
    setSearchParams({});
  };

  const clearEmployeeFilter = () => {
    setSelectedEmployees([]);
  };

  const toggleEmployeeSelection = (employeeId: string) => {
    setSelectedEmployees(prev => 
      prev.includes(employeeId) 
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const toggleNewGrantMetric = (metricId: string) => {
    setNewGrant(prev => ({
      ...prev,
      performance_metric_ids: prev.performance_metric_ids.includes(metricId)
        ? prev.performance_metric_ids.filter(id => id !== metricId)
        : [...prev.performance_metric_ids, metricId],
    }));
  };

  const toggleEditGrantMetric = (metricId: string) => {
    setEditGrantMetrics(prev =>
      prev.includes(metricId)
        ? prev.filter(id => id !== metricId)
        : [...prev, metricId]
    );
  };

  const filteredEmployeesForModal = employees.filter(emp => 
    emp.first_name_en.toLowerCase().includes(employeeFilterSearch.toLowerCase()) ||
    emp.last_name_en.toLowerCase().includes(employeeFilterSearch.toLowerCase()) ||
    emp.employee_number.toLowerCase().includes(employeeFilterSearch.toLowerCase())
  );

  const resetNewGrantForm = () => {
    setNewGrant({
      employee_id: '',
      plan_id: '',
      total_shares: 0,
      vesting_start_date: '',
      vesting_schedule_id: '',
      performance_metric_ids: [],
      use_even_distribution: false,
    });
  };

  // Calculate vesting events preview
  const vestingEventsPreview = useMemo(() => {
    if (!newGrant.plan_id || !newGrant.total_shares || !newGrant.vesting_start_date) {
      return [];
    }

    const selectedPlan = plans.find((p) => p.id === newGrant.plan_id);
    if (!selectedPlan) return [];

    const selectedSchedule = newGrant.vesting_schedule_id 
      ? vestingSchedules.find(s => s.id === newGrant.vesting_schedule_id)
      : null;

    // Determine which schedule to use: selected schedule, plan template, or plan config
    let scheduleToUse: any = null;
    if (selectedSchedule) {
      scheduleToUse = selectedSchedule;
    } else if (selectedPlan.vesting_schedule_template_id) {
      scheduleToUse = vestingSchedules.find(s => s.id === selectedPlan.vesting_schedule_template_id);
    }

    // If no schedule found, use plan's vesting_config
    let totalMonths = 48;
    let cliffMonths = 12;
    let frequency = 12; // months

    if (scheduleToUse) {
      totalMonths = scheduleToUse.total_duration_months || 48;
      cliffMonths = scheduleToUse.cliff_months || 12;
      const vestingFreq = scheduleToUse.vesting_frequency || 'annually';
      frequency = vestingFreq === 'monthly' ? 1 : vestingFreq === 'quarterly' ? 3 : 12;
    } else if (selectedPlan.vesting_config) {
      totalMonths = (selectedPlan.vesting_config.years || 4) * 12;
      cliffMonths = selectedPlan.vesting_config.cliff_months || 12;
      const vestingFreq = selectedPlan.vesting_config.frequency || 'annually';
      frequency = vestingFreq === 'monthly' ? 1 : vestingFreq === 'quarterly' ? 3 : 12;
    }

    // Calculate vesting events
    const events: Array<{ type: string; date: string; shares: number; cumulative: number; monthsFromStart: number }> = [];
    const startDate = new Date(newGrant.vesting_start_date);
    let allocatedSoFar = 0;
    let cumulativeShares = 0;

    // Calculate frequency in months
    const remainingMonths = totalMonths - cliffMonths;
    
    // Use Math.floor for percentage-based (matches generateIndividualVestingRecords)
    // Use Math.ceil for even distribution (matches RPC function)
    const totalPeriods = newGrant.use_even_distribution 
      ? Math.ceil(remainingMonths / frequency)
      : Math.floor(remainingMonths / frequency);

    let cliffShares = 0;
    let sharesPerPeriod = 0;

    if (newGrant.use_even_distribution) {
      // Even distribution: divide shares equally among all periods (including cliff)
      if (cliffMonths > 0) {
        cliffShares = Math.floor(newGrant.total_shares / (totalPeriods + 1));
        sharesPerPeriod = Math.floor((newGrant.total_shares - cliffShares) / totalPeriods);
      } else {
        sharesPerPeriod = Math.floor(newGrant.total_shares / totalPeriods);
      }
    } else {
      // Percentage-based (25% cliff, 75% divided) - matches generateIndividualVestingRecords
      if (cliffMonths > 0) {
        cliffShares = Math.floor(newGrant.total_shares * 0.25);
        sharesPerPeriod = Math.floor((newGrant.total_shares - cliffShares) / totalPeriods);
      } else {
        sharesPerPeriod = Math.floor(newGrant.total_shares / totalPeriods);
      }
    }

    // Add cliff event
    if (cliffMonths > 0 && cliffShares > 0) {
      const cliffDate = new Date(startDate);
      cliffDate.setMonth(cliffDate.getMonth() + cliffMonths);
      cumulativeShares = cliffShares;
      allocatedSoFar = cliffShares;
      
      events.push({
        type: 'Cliff',
        date: cliffDate.toISOString().split('T')[0],
        shares: cliffShares,
        cumulative: cumulativeShares,
        monthsFromStart: cliffMonths,
      });
    }

    // Add regular vesting events
    for (let i = 1; i <= totalPeriods; i++) {
      const eventDate = new Date(startDate);
      eventDate.setMonth(eventDate.getMonth() + cliffMonths + (i * frequency));
      
      let sharesThisPeriod: number;
      if (i === totalPeriods) {
        // Last period: assign remaining shares
        sharesThisPeriod = newGrant.total_shares - allocatedSoFar;
      } else {
        sharesThisPeriod = sharesPerPeriod;
      }
      
      allocatedSoFar += sharesThisPeriod;
      cumulativeShares = allocatedSoFar;
      
      events.push({
        type: `Period ${i}`,
        date: eventDate.toISOString().split('T')[0],
        shares: sharesThisPeriod,
        cumulative: cumulativeShares,
        monthsFromStart: cliffMonths + (i * frequency),
      });
    }

    return events;
  }, [
    newGrant.plan_id,
    newGrant.total_shares,
    newGrant.vesting_start_date,
    newGrant.vesting_schedule_id,
    newGrant.use_even_distribution,
    plans,
    vestingSchedules,
  ]);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id, id')
        .eq('user_id', user.id)
        .single();

      if (companyUser) {
        const [grantsRes, employeesRes, plansRes, metricsRes, schedulesRes] = await Promise.all([
          supabase
            .from('grants')
            .select(`
              *,
              employees (first_name_en, last_name_en, email, department),
              incentive_plans (plan_name_en, plan_code, plan_type),
              grant_performance_metrics (
                performance_metric_id,
                performance_metrics (
                  id,
                  name,
                  description,
                  metric_type,
                  unit_of_measure
                )
              )
            `)
            .eq('company_id', companyUser.company_id)
            .order('created_at', { ascending: false }),
          supabase
            .from('employees')
            .select('id, employee_number, first_name_en, last_name_en, email, department')
            .eq('company_id', companyUser.company_id)
            .eq('employment_status', 'active'),
          supabase
            .from('incentive_plans')
            .select(`
              id, 
              plan_name_en, 
              plan_code, 
              shares_available,
              start_date,
              vesting_config, 
              vesting_schedule_template_id,
              vesting_schedules (
                total_duration_months,
                cliff_months,
                vesting_frequency
              )
            `)
            .eq('company_id', companyUser.company_id)
            .eq('status', 'active'),
          supabase
            .from('performance_metrics')
            .select('id, name, description, metric_type, unit_of_measure')
            .eq('company_id', companyUser.company_id)
            .order('name', { ascending: true }),
          supabase
            .from('vesting_schedules')
            .select('*')
            .eq('company_id', companyUser.company_id)
            .eq('is_template', true)
            .order('name', { ascending: true })
        ]);

        if (grantsRes.data) setGrants(grantsRes.data as any);
        if (employeesRes.data) setEmployees(employeesRes.data);
        
        // Plans loaded successfully
        
        // Calculate actual available shares for each plan (optimized - batch load)
        if (plansRes.data && plansRes.data.length > 0) {
          const planIds = plansRes.data.map(p => p.id);
          
          // Load all grants for all plans in ONE query instead of N queries
          const { data: allGrants, error: allGrantsError } = await supabase
            .from('grants')
            .select('plan_id, total_shares, status, grant_number, employee_id')
            .in('plan_id', planIds);
          
          if (allGrantsError) {
            console.error('Error loading grants for plans:', allGrantsError);
          }
          
          // Group grants by plan_id for efficient lookup
          const grantsByPlan = (allGrants || []).reduce((acc, grant) => {
            if (!acc[grant.plan_id]) {
              acc[grant.plan_id] = [];
            }
            acc[grant.plan_id].push(grant);
            return acc;
          }, {} as Record<string, any[]>);
          
          // Calculate available shares for each plan (no additional queries needed)
          const plansWithCalculatedShares = plansRes.data.map((plan) => {
            const planGrants = grantsByPlan[plan.id] || [];
            const actualGranted = planGrants.reduce(
              (sum, grant) => sum + Number(grant.total_shares || 0),
              0
            );
            
            // Use the plan data we already have (no need to query again)
            const totalAllocated = plan.total_shares_allocated || 0;
            const actualAvailable = totalAllocated - actualGranted;
            
            // Debug logging for Derayah Employee Stock Plan 2025
            if (plan.plan_name_en === 'Derayah Employee Stock Plan 2025') {
              console.log('=== DEBUGGING GRANTS PAGE CALCULATION ===');
              console.log('Plan:', plan.plan_name_en);
              console.log('Plan ID:', plan.id);
              console.log('Total Allocated:', totalAllocated);
              console.log('Grants Data:', planGrants);
              console.log('Number of grants found:', planGrants.length);
              console.log('Actual Granted:', actualGranted);
              console.log('Actual Available:', actualAvailable);
              console.log('Stored shares_available:', plan.shares_available);
              
              // Log each grant individually
              if (planGrants.length > 0) {
                planGrants.forEach((grant, index) => {
                  console.log(`Grant ${index + 1}:`, {
                    grant_number: grant.grant_number,
                    total_shares: grant.total_shares,
                    status: grant.status,
                    employee_id: grant.employee_id
                  });
                });
              } else {
                console.log('No grants found for this plan!');
              }
            }
            
            return {
              ...plan,
              actual_shares_available: Math.max(0, actualAvailable),
            };
          });
          
          setPlans(plansWithCalculatedShares);
        }

        if (metricsRes.data) {
          setPerformanceMetrics(metricsRes.data as PerformanceMetricOption[]);
        }

        if (schedulesRes.data) {
          setVestingSchedules(schedulesRes.data);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewGrant = async (grant: Grant) => {
    setSelectedGrant(grant);
    setShowDetailModal(true);
    setGrantContract(null);
    setGrantHistory([]);
    setSelectedGrantVestingDetails(null);
    setComputedVestedShares(null);
    setTransferredShares(0);
    setExercisedShares(0);

    // Load vesting details for the grant
    try {
      const vestingDetails = await getGrantVestingDetails(grant.id);
      
      // Load individual vesting records for this grant
      const { data: vestingRecords, error: vestingError } = await supabase
        .from('vesting_events')
        .select('*')
        .eq('grant_id', grant.id)
        .order('sequence_number', { ascending: true });

      if (vestingError) {
        console.error('Error loading vesting records:', vestingError);
      }

      // Calculate actual vested shares from vesting events (includes vested, transferred, exercised)
      let actualVestedShares = grant.vested_shares;
      if (vestingRecords && vestingRecords.length > 0) {
        const vestedFromEvents = vestingRecords
          .filter(record => record.status === 'vested' || record.status === 'transferred' || record.status === 'exercised')
          .reduce((sum, record) => sum + Number(record.shares_to_vest || 0), 0);
        actualVestedShares = vestedFromEvents;
        setComputedVestedShares(actualVestedShares);
        
        // Calculate transferred and exercised shares separately
        const totalTransferred = vestingRecords
          .filter(record => record.status === 'transferred')
          .reduce((sum, record) => sum + Number(record.shares_to_vest || 0), 0);
        const totalExercised = vestingRecords
          .filter(record => record.status === 'exercised')
          .reduce((sum, record) => sum + Number(record.shares_to_vest || 0), 0);
        
        setTransferredShares(totalTransferred);
        setExercisedShares(totalExercised);
      }

      // Debug logging for the specific grant
      if (grant.grant_number === 'GR-20251028-000007') {
        console.log('🔍 DEBUG: Grant GR-20251028-000007 vesting records:');
        console.log('Grant details:', {
          id: grant.id,
          grant_number: grant.grant_number,
          total_shares: grant.total_shares,
          vested_shares: grant.vested_shares,
          vesting_start_date: grant.vesting_start_date,
          vesting_end_date: grant.vesting_end_date,
          status: grant.status
        });
        console.log('Vesting records count:', vestingRecords?.length || 0);
        console.log('Vesting records (from vesting_events table):', vestingRecords);
        
        // Check for duplicates
        if (vestingRecords && vestingRecords.length > 0) {
          const sequenceNumbers = vestingRecords.map(r => r.sequence_number);
          const uniqueSequences = [...new Set(sequenceNumbers)];
          console.log('Sequence numbers:', sequenceNumbers);
          console.log('Unique sequences:', uniqueSequences);
          
          if (sequenceNumbers.length !== uniqueSequences.length) {
            console.warn('⚠️ DUPLICATE SEQUENCE NUMBERS DETECTED!');
          }

          // Check statuses and dates
          const today = new Date();
          console.log('📅 DEBUG: Vesting dates analysis:');
          vestingRecords.forEach((record, index) => {
            const vestingDate = new Date(record.vesting_date);
            const isPastDue = vestingDate <= today;
            console.log(`Record ${index + 1}:`, {
              sequence_number: record.sequence_number,
              vesting_date: record.vesting_date,
              formatted_date: vestingDate.toDateString(),
              shares_to_vest: record.shares_to_vest,
              status: record.status,
              isPastDue: isPastDue,
              daysPast: Math.floor((today.getTime() - vestingDate.getTime()) / (1000 * 60 * 60 * 24))
            });
          });
        }
      }

      // Combine vesting details with actual records
      const enrichedVestingDetails = {
        ...vestingDetails,
        individualVestingRecords: vestingRecords || []
      };

      setSelectedGrantVestingDetails(enrichedVestingDetails);
    } catch (error) {
      console.error('Error loading vesting details:', error);
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser) return;

      const { data: contractData, error: contractError } = await supabase
        .from('generated_documents')
        .select('*')
        .eq('grant_id', grant.id)
        .maybeSingle();

      if (contractError) {
        console.error('Error loading contract:', contractError);
      }

      if (contractData) {
        const { data: signaturesData } = await supabase
          .from('e_signatures')
          .select('*')
          .eq('document_id', contractData.id);

        // Update contract status based on employee acceptance timestamp
        const contractStatus = (contractData.status as string | null) ?? (
          grant.employee_acceptance_at ? 'signed' :
          grant.status === 'pending_signature' ? 'pending_signature' :
          'draft'
        );
        
        setGrantContract({
          ...contractData,
          status: contractStatus,
          e_signatures: signaturesData || []
        });
      }

      const { data: historyData } = await supabase
        .from('grant_modifications')
        .select('*')
        .eq('grant_id', grant.id)
        .order('created_at', { ascending: false });

      setGrantHistory(historyData || []);
    } catch (error) {
      console.error('Error loading grant details:', error);
    }
  };

  const canApproveContract = useMemo(() => {
    if (!selectedGrant || !grantContract || grantContract.status !== 'draft') {
      return false;
    }

    if (!userRole) return false;

    if (userRole.user_type === 'super_admin') return true;

    if (userRole.role === 'super_admin') return true;

    if (userRole.role === 'finance_admin') return true;

    if (userRole.role === 'hr_admin' || userRole.role === 'legal_admin' || userRole.role === 'company_admin') {
      return hasPermission('contract_approval');
    }

    return false;
  }, [selectedGrant, grantContract, userRole, hasPermission]);

  const handleApproveContract = async () => {
    if (!selectedGrant || !grantContract || approvingContract) return;

    try {
      setApprovingContract(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Unable to approve the contract because no active session was found.');
        return;
      }

      const timestamp = new Date().toISOString();

      const { error: documentError } = await supabase
        .from('generated_documents')
        .update({
          status: 'pending_signature',
          approved_by: user.id,
          approved_at: timestamp,
        })
        .eq('id', grantContract.id);

      if (documentError) throw documentError;

      await handleViewGrant(selectedGrant);

      alert('Contract approved successfully. The employee can now review and sign.');
    } catch (error) {
      console.error('Error approving contract:', error);
      alert('Failed to approve the contract. Please try again.');
    } finally {
      setApprovingContract(false);
    }
  };

  const handleEditGrant = (grant: Grant) => {
    setSelectedGrant(grant);
    setEditGrant({
      total_shares: grant.total_shares,
      grant_date: grant.grant_date,
      vesting_start_date: grant.vesting_start_date,
      vesting_end_date: grant.vesting_end_date,
      status: grant.status,
    });
    setEditGrantMetrics(
      grant.grant_performance_metrics?.map(link => link.performance_metric_id) || []
    );
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  const handleUpdateGrant = async () => {
    if (!selectedGrant) return;

    try {
      const { error } = await supabase
        .from('grants')
        .update({
          total_shares: editGrant.total_shares,
          grant_date: editGrant.grant_date,
          vesting_start_date: editGrant.vesting_start_date,
          vesting_end_date: editGrant.vesting_end_date,
          status: editGrant.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedGrant.id);

      if (error) throw error;

      await supabase
        .from('grant_performance_metrics')
        .delete()
        .eq('grant_id', selectedGrant.id);

      if (editGrantMetrics.length > 0) {
        const metricLinks = editGrantMetrics.map(metricId => ({
          company_id: selectedGrant.company_id,
          grant_id: selectedGrant.id,
          performance_metric_id: metricId,
        }));

        const { error: linkError } = await supabase
          .from('grant_performance_metrics')
          .insert(metricLinks);

        if (linkError) throw linkError;
      }

      setShowEditModal(false);
      setSelectedGrant(null);
      setEditGrantMetrics([]);
      loadData();
    } catch (error) {
      console.error('Error updating grant:', error);
      alert('Failed to update grant');
    }
  };

  const handleDeleteGrant = async (grant: Grant) => {
    try {
      // Count vesting events before deletion
      const { data: vestingEvents, error: countError } = await supabase
        .from('vesting_events')
        .select('id')
        .eq('grant_id', grant.id);
      
      if (countError) {
        console.error('Error counting vesting events:', countError);
      }
      
      const vestingEventsCount = vestingEvents?.length || 0;
      
      // Build detailed confirmation message
      let confirmMessage = `Are you sure you want to delete grant ${grant.grant_number}?\n\n`;
      confirmMessage += `This will permanently delete:\n`;
      confirmMessage += `• Grant: ${grant.grant_number}\n`;
      confirmMessage += `• ${vestingEventsCount} vesting event${vestingEventsCount !== 1 ? 's' : ''}\n`;
      confirmMessage += `• All generated documents\n\n`;
      confirmMessage += `⚠️ This action cannot be undone!`;
      
      if (!window.confirm(confirmMessage)) {
        return;
      }

      // Delete the grant - vesting events will be auto-deleted by ON DELETE CASCADE
      const { error } = await supabase
        .from('grants')
        .delete()
        .eq('id', grant.id);

      if (error) throw error;

      // Also manually delete related generated documents (if not CASCADE)
      await supabase
        .from('generated_documents')
        .delete()
        .eq('grant_id', grant.id);

      setOpenMenuId(null);
      loadData();
      alert(`Grant ${grant.grant_number} deleted successfully, including ${vestingEventsCount} vesting event${vestingEventsCount !== 1 ? 's' : ''}.`);
    } catch (error) {
      console.error('Error deleting grant:', error);
      alert('Failed to delete grant');
    }
  };

  const handleBulkDeleteGrants = async () => {
    if (selectedGrants.length === 0) {
      alert('Please select at least one grant to delete');
      return;
    }

    try {
      // Get all selected grants details
      const grantsToDelete = grants.filter(g => selectedGrants.includes(g.id));
      
      // Count vesting events for all selected grants
      let totalVestingEvents = 0;
      const vestingEventCounts: { [grantId: string]: number } = {};
      
      for (const grant of grantsToDelete) {
        const { data: vestingEvents, error: countError } = await supabase
          .from('vesting_events')
          .select('id')
          .eq('grant_id', grant.id);
        
        if (countError) {
          console.error(`Error counting vesting events for grant ${grant.grant_number}:`, countError);
        } else {
          const count = vestingEvents?.length || 0;
          vestingEventCounts[grant.id] = count;
          totalVestingEvents += count;
        }
      }
      
      // Build detailed confirmation message
      let confirmMessage = `Are you sure you want to delete ${selectedGrants.length} grant${selectedGrants.length !== 1 ? 's' : ''}?\n\n`;
      confirmMessage += `This will permanently delete:\n`;
      confirmMessage += `• ${selectedGrants.length} grant${selectedGrants.length !== 1 ? 's' : ''}\n`;
      confirmMessage += `• ${totalVestingEvents} vesting event${totalVestingEvents !== 1 ? 's' : ''}\n`;
      confirmMessage += `• All generated documents\n\n`;
      confirmMessage += `Grants to be deleted:\n`;
      grantsToDelete.forEach(grant => {
        confirmMessage += `  - ${grant.grant_number} (${vestingEventCounts[grant.id] || 0} events)\n`;
      });
      confirmMessage += `\n⚠️ This action cannot be undone!`;
      
      if (!window.confirm(confirmMessage)) {
        return;
      }

      // Delete all selected grants - vesting events will be auto-deleted by ON DELETE CASCADE
      const { error: deleteError } = await supabase
        .from('grants')
        .delete()
        .in('id', selectedGrants);

      if (deleteError) throw deleteError;

      // Also manually delete related generated documents (if not CASCADE)
      await supabase
        .from('generated_documents')
        .delete()
        .in('grant_id', selectedGrants);

      // Clear selection
      const deletedCount = selectedGrants.length;
      setSelectedGrants([]);
      loadData();
      alert(`Successfully deleted ${deletedCount} grant${deletedCount !== 1 ? 's' : ''}, including ${totalVestingEvents} vesting event${totalVestingEvents !== 1 ? 's' : ''}.`);
    } catch (error) {
      console.error('Error deleting grants:', error);
      alert('Failed to delete grants');
    }
  };

  const handleCreateGrant = async () => {
    try {
      console.log('🚀 Starting grant creation process...');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ No authenticated user found');
        return;
      }
      console.log('✅ User authenticated:', user.id);

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id, id')
        .eq('user_id', user.id)
        .single();

      if (!companyUser) {
        console.error('❌ No company user found');
        return;
      }
      console.log('✅ Company user found:', companyUser);

      const selectedPlan = plans.find((p) => p.id === newGrant.plan_id);
      if (!selectedPlan) {
        console.error('❌ Selected plan not found:', newGrant.plan_id);
        return;
      }
      console.log('✅ Selected plan:', selectedPlan);

      const availableShares = selectedPlan.actual_shares_available || selectedPlan.shares_available;
      console.log('📊 Available shares:', availableShares, 'Requested shares:', newGrant.total_shares);
      
      if (newGrant.total_shares > availableShares) {
        console.error('❌ Not enough shares available');
        alert('Not enough shares available in this plan');
        return;
      }

      // Calculate vesting end date based on selected schedule or plan's template or config
      let vestingYears = 4;
      if (newGrant.vesting_schedule_id) {
        // Use selected vesting schedule
        const selectedSchedule = vestingSchedules.find(s => s.id === newGrant.vesting_schedule_id);
        if (selectedSchedule) {
          vestingYears = Math.floor(selectedSchedule.total_duration_months / 12);
        }
      } else if (selectedPlan.vesting_schedule_template_id) {
        // Fallback to plan's template
        const { data: template } = await supabase
          .from('vesting_schedules')
          .select('total_duration_months')
          .eq('id', selectedPlan.vesting_schedule_template_id)
          .eq('is_template', true)
          .single();
        
        if (template) {
          vestingYears = Math.floor(template.total_duration_months / 12);
        }
      } else {
        vestingYears = selectedPlan.vesting_config?.years || 4;
      }

      const vestingEndDate = new Date(newGrant.vesting_start_date);
      vestingEndDate.setFullYear(vestingEndDate.getFullYear() + vestingYears);

      console.log('💾 Inserting grant into database...');
      const grantInsertData: any = {
        company_id: companyUser.company_id,
        plan_id: newGrant.plan_id,
        employee_id: newGrant.employee_id,
        total_shares: newGrant.total_shares,
        vesting_start_date: newGrant.vesting_start_date,
        vesting_end_date: vestingEndDate.toISOString().split('T')[0],
        grant_date: new Date().toISOString().split('T')[0],
        created_by: companyUser.id,
        status: 'active', // Set default status
        use_even_distribution: newGrant.use_even_distribution,
      };

      // Only include vesting_schedule_id if it has a value (to avoid errors if column doesn't exist)
      if (newGrant.vesting_schedule_id) {
        grantInsertData.vesting_schedule_id = newGrant.vesting_schedule_id;
      }

      console.log('📝 Grant data to insert:', grantInsertData);

      // Try to insert the grant
      let grantData;
      let grantError;
      
      // First attempt with vesting_schedule_id if provided
      const { data, error } = await supabase.from('grants').insert(grantInsertData).select('*, incentive_plans(plan_type)').single();
      grantData = data;
      grantError = error;

      // If error is about vesting_schedule_id or use_even_distribution column not existing, retry without them
      if (grantError && grantError.code === 'PGRST204' && 
          (grantError.message?.includes('vesting_schedule_id') || grantError.message?.includes('use_even_distribution'))) {
        console.warn('⚠️ Column not found in schema, retrying without optional columns');
        const { vesting_schedule_id, use_even_distribution, ...grantDataWithoutOptional } = grantInsertData;
        const { data: retryData, error: retryError } = await supabase
          .from('grants')
          .insert(grantDataWithoutOptional)
          .select('*, incentive_plans(plan_type)')
          .single();
        grantData = retryData;
        grantError = retryError;
      }

      if (grantError) {
        console.error('❌ Grant insertion error:', grantError);
        throw grantError;
      }
      console.log('✅ Grant created successfully:', grantData);

      // If vesting_schedule_id or use_even_distribution weren't saved due to column error, update them now
      // This ensures the RPC function uses the correct schedule when generating vesting events
      const updateFields: any = {};
      if (newGrant.vesting_schedule_id && !grantData.vesting_schedule_id) {
        updateFields.vesting_schedule_id = newGrant.vesting_schedule_id;
        console.log('🔄 Will update grant with vesting_schedule_id:', newGrant.vesting_schedule_id);
      }
      if (newGrant.use_even_distribution !== undefined && grantData.use_even_distribution === undefined) {
        updateFields.use_even_distribution = newGrant.use_even_distribution;
        console.log('🔄 Will update grant with use_even_distribution:', newGrant.use_even_distribution);
      }

      if (Object.keys(updateFields).length > 0) {
        const { error: updateError } = await supabase
          .from('grants')
          .update(updateFields)
          .eq('id', grantData.id);
        
        if (updateError) {
          console.warn('⚠️ Could not update grant fields:', updateError);
        } else {
          console.log('✅ Updated grant with missing fields:', updateFields);
          // Update grantData object so subsequent code uses the correct values
          Object.assign(grantData, updateFields);
        }
      }

      await supabase
        .from('incentive_plans')
        .update({
          shares_granted: selectedPlan.shares_available - newGrant.total_shares,
          shares_available: selectedPlan.shares_available - newGrant.total_shares,
        })
        .eq('id', newGrant.plan_id);

      if (grantData) {
        if (newGrant.performance_metric_ids.length > 0) {
          try {
            const metricLinks = newGrant.performance_metric_ids.map(metricId => ({
              company_id: companyUser.company_id,
              grant_id: grantData.id,
              performance_metric_id: metricId,
            }));

            const { error: metricLinkError } = await supabase
              .from('grant_performance_metrics')
              .insert(metricLinks);

            if (metricLinkError) {
              console.warn('⚠️ Could not link performance metrics (RLS policy issue):', metricLinkError);
              // Don't fail the grant creation if metrics can't be linked
              // This can happen if the RLS policy migration hasn't been applied yet
            }
          } catch (error) {
            console.warn('⚠️ Error linking performance metrics:', error);
            // Don't fail the grant creation
          }
        }

        // Auto-generate individual vesting records if grant has a vesting schedule
        let vestingEventsCreated = false;
        let vestingEventsError: any = null;
        
        // Helper function to try RPC as fallback
        const tryRPCFallback = async (): Promise<boolean> => {
          try {
            console.warn('⚠️ Trying RPC function as fallback (bypasses RLS)...');
            // Pass the schedule_id to ensure RPC uses the correct schedule
            const rpcParams: any = {
              p_grant_id: grantData.id
            };
            if (newGrant.vesting_schedule_id) {
              rpcParams.p_schedule_id = newGrant.vesting_schedule_id;
              console.log('📌 Passing schedule_id to RPC:', newGrant.vesting_schedule_id);
            }
            const { error: rpcError } = await supabase.rpc('generate_vesting_events_for_grant', rpcParams);
            if (!rpcError) {
              console.log('✅ Vesting events generated successfully using RPC function');
              return true;
            } else {
              console.error('❌ RPC function also failed:', rpcError);
              vestingEventsError = rpcError;
              return false;
            }
          } catch (rpcError) {
            console.error('❌ RPC function error:', rpcError);
            vestingEventsError = rpcError;
            return false;
          }
        };
        
        // Use the new function that matches the preview calculation exactly
        // This ensures the generated events match what's shown in the preview
        try {
          console.log('🔄 Generating vesting events using preview logic (matches preview exactly)...');
          console.log('   - Schedule ID:', newGrant.vesting_schedule_id || 'none');
          console.log('   - Total shares:', newGrant.total_shares);
          console.log('   - Start date:', newGrant.vesting_start_date);
          console.log('   - Even distribution:', newGrant.use_even_distribution);
          
          await generateVestingEventsFromPreview(
            grantData.id,
            newGrant.vesting_schedule_id || null,
            newGrant.total_shares,
            newGrant.vesting_start_date,
            newGrant.use_even_distribution
          );
          
          console.log('✅ Vesting events generated successfully using preview logic');
          vestingEventsCreated = true;
        } catch (error) {
          console.error('❌ Error generating vesting events using preview logic:', error);
          vestingEventsError = error;
          
          // If RLS error, try using the RPC function as fallback
          if (error && typeof error === 'object' && 'code' in error && error.code === '42501') {
            console.warn('⚠️ RLS error detected, trying RPC function as fallback...');
            vestingEventsCreated = await tryRPCFallback();
          }
          
          // If still failed, try the old milestone-based approach as last resort
          if (!vestingEventsCreated) {
            console.warn('⚠️ Preview-based generation failed, trying milestone-based approach as fallback...');
            try {
              if (newGrant.vesting_schedule_id) {
                await generateIndividualVestingRecords(grantData.id, newGrant.vesting_schedule_id, newGrant.use_even_distribution);
                vestingEventsCreated = true;
              } else if (selectedPlan.vesting_schedule_template_id) {
                await generateIndividualVestingRecords(grantData.id, selectedPlan.vesting_schedule_template_id, newGrant.use_even_distribution);
                vestingEventsCreated = true;
              } else {
                vestingEventsCreated = await tryRPCFallback();
              }
            } catch (fallbackError) {
              console.error('❌ Fallback generation also failed:', fallbackError);
              if (!vestingEventsCreated) {
                vestingEventsCreated = await tryRPCFallback();
              }
            }
          }
        }

        // Track warnings for summary
        const warnings: string[] = [];

        // Check if vesting events were created
        if (!vestingEventsCreated) {
          const errorMessage = vestingEventsError?.message || 'Unknown error';
          console.warn('⚠️ Grant created but vesting events were not generated:', errorMessage);
          warnings.push(`Vesting events could not be generated: ${errorMessage}`);
        }

        // Generate contract for the grant
        const contractResult = await generateContractForGrant(grantData, companyUser.company_id);
        if (!contractResult?.success) {
          const reason = contractResult?.reason || 'Unknown error';
          console.warn('⚠️ Grant created but contract could not be generated:', reason);
          warnings.push(`Contract could not be generated: ${reason}`);
        }

        setShowCreateModal(false);
        resetNewGrantForm();
        loadData();
        
        // Show summary message
        if (warnings.length === 0) {
          alert('Grant issued successfully with contract generated!');
        } else {
          const warningText = warnings.join('\n\n');
          alert(`Grant issued successfully!\n\nHowever, there were some issues:\n\n${warningText}\n\nPlease check the console for more details.`);
        }
      }
    } catch (error) {
      console.error('❌ Error creating grant:', error);
      
      // Provide more detailed error message
      let errorMessage = 'Failed to create grant';
      if (error instanceof Error) {
        errorMessage += ': ' + error.message;
      }
      
      alert(errorMessage);
    }
  };

  const generateContractForGrant = async (grant: any, companyId: string) => {
    try {
      const planType = grant.incentive_plans?.plan_type;
      console.log('📄 Generating contract for grant:', grant.grant_number, 'Plan type:', planType);

      let templateName = '';
      if (planType === 'ESOP') {
        templateName = 'ESOP Grant Agreement';
      } else if (planType === 'LTIP_RSU') {
        templateName = 'LTIP RSU Grant Agreement';
      } else {
        console.warn('⚠️ Contract generation skipped: Plan type', planType, 'is not supported for automatic contract generation');
        return { success: false, reason: `Plan type '${planType}' is not supported for automatic contract generation` };
      }

      const { data: template, error: templateError } = await supabase
        .from('document_templates')
        .select('*')
        .eq('company_id', companyId)
        .eq('template_name', templateName)
        .maybeSingle();

      if (templateError) {
        console.error('❌ Error fetching template:', templateError);
        return { success: false, reason: `Failed to fetch template: ${templateError.message}` };
      }

      if (!template) {
        console.warn('⚠️ No template found for plan type:', planType, 'Template name:', templateName);
        return { success: false, reason: `No document template found for '${templateName}'. Please create a template in the Document Templates section.` };
      }

      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select('*')
        .eq('id', grant.employee_id)
        .single();

      if (employeeError) {
        console.error('❌ Error fetching employee:', employeeError);
        return { success: false, reason: `Failed to fetch employee data: ${employeeError.message}` };
      }

      if (!employee) {
        console.error('❌ Employee not found for ID:', grant.employee_id);
        return { success: false, reason: 'Employee not found' };
      }

      const { data: plan, error: planError } = await supabase
        .from('incentive_plans')
        .select('*')
        .eq('id', grant.plan_id)
        .single();

      if (planError) {
        console.error('❌ Error fetching plan:', planError);
        return { success: false, reason: `Failed to fetch plan data: ${planError.message}` };
      }

      if (!plan) {
        console.error('❌ Plan not found for ID:', grant.plan_id);
        return { success: false, reason: 'Plan not found' };
      }

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (companyError) {
        console.error('❌ Error fetching company:', companyError);
        return { success: false, reason: `Failed to fetch company data: ${companyError.message}` };
      }

      if (!company) {
        console.error('❌ Company not found for ID:', companyId);
        return { success: false, reason: 'Company not found' };
      }

      let content = template.template_content;
      content = content.replace(/{{company_name_en}}/g, company.company_name_en || '');
      content = content.replace(/{{company_name_ar}}/g, company.company_name_ar || '');
      content = content.replace(/{{employee_first_name}}/g, employee.first_name_en || '');
      content = content.replace(/{{employee_last_name}}/g, employee.last_name_en || '');
      content = content.replace(/{{employee_number}}/g, employee.employee_number || '');
      content = content.replace(/{{employee_email}}/g, employee.email || '');
      content = content.replace(/{{employee_department}}/g, employee.department || 'N/A');
      content = content.replace(/{{employee_job_title}}/g, employee.job_title || 'N/A');
      content = content.replace(/{{plan_name}}/g, plan.plan_name_en || '');
      content = content.replace(/{{total_shares}}/g, grant.total_shares?.toString() || '');
      content = content.replace(/{{exercise_price}}/g, plan.exercise_price?.toString() || 'N/A');
      content = content.replace(/{{grant_number}}/g, grant.grant_number || '');
      content = content.replace(/{{grant_date}}/g, grant.grant_date || '');
      content = content.replace(/{{plan_description}}/g, plan.description_en || '');
      content = content.replace(/{{vesting_start_date}}/g, grant.vesting_start_date || '');
      content = content.replace(/{{vesting_end_date}}/g, grant.vesting_end_date || '');

      const vestingYears = plan.vesting_config?.years || 4;
      content = content.replace(/{{vesting_period}}/g, vestingYears.toString());

      const { error: insertError } = await supabase.from('generated_documents').insert({
        company_id: companyId,
        employee_id: grant.employee_id,
        grant_id: grant.id,
        template_id: template.id,
        document_type: 'grant_agreement',
        document_name: `${template.template_name} - ${employee.first_name_en} ${employee.last_name_en} (${grant.grant_number})`,
        document_content: content,
        status: 'draft'
      });

      if (insertError) {
        console.error('❌ Error inserting contract document:', insertError);
        return { success: false, reason: `Failed to create contract document: ${insertError.message}` };
      }

      console.log('✅ Contract generated successfully for grant:', grant.grant_number);
      return { success: true };
    } catch (error) {
      console.error('❌ Error generating contract:', error);
      return { success: false, reason: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  };

  const filteredGrants = grants.filter((grant) => {
    const matchesSearch =
      grant.employees?.first_name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      grant.employees?.last_name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      grant.grant_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      grant.incentive_plans?.plan_name_en.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterStatus === 'all' || grant.status === filterStatus;
    const matchesPlan = !filterPlanId || grant.plan_id === filterPlanId;
    const matchesEmployee = selectedEmployees.length === 0 || selectedEmployees.includes(grant.employee_id);

    return matchesSearch && matchesFilter && matchesPlan && matchesEmployee;
  });

  const handleSelectGrant = (grantId: string) => {
    setSelectedGrants(prev => 
      prev.includes(grantId) 
        ? prev.filter(id => id !== grantId)
        : [...prev, grantId]
    );
  };

  const handleSelectAll = () => {
    const filteredGrantIds = filteredGrants.map(g => g.id);
    const allFilteredSelected = filteredGrantIds.length > 0 && 
      filteredGrantIds.every(id => selectedGrants.includes(id));
    
    if (allFilteredSelected) {
      // Deselect all filtered grants, but keep any selected grants that aren't in the filtered list
      setSelectedGrants(prev => prev.filter(id => !filteredGrantIds.includes(id)));
    } else {
      // Select all filtered grants, keeping any previously selected grants
      setSelectedGrants(prev => {
        const newSelection = [...prev];
        filteredGrantIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

  const statusConfig = {
    pending_signature: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Pending Signature' },
    active: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'Active' },
    completed: { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Completed' },
    forfeited: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Forfeited' },
    cancelled: { icon: XCircle, color: 'text-gray-600', bg: 'bg-gray-100', label: 'Cancelled' },
    lapsed: { icon: XCircle, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Lapsed' },
  };

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
            {t('grants.title')}
            <span 
              className="inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-lg font-semibold"
              style={{ backgroundColor: brandColor }}
            >
              {grants.length}
            </span>
          </h1>
          <p className="text-gray-600 mt-1">{t('grants.description')}</p>
        </div>
        <button
          onClick={() => {
            resetNewGrantForm();
            setShowCreateModal(true);
          }}
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
          <span className="font-medium">{t('grants.createGrant')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <Award className="w-8 h-8" style={{ color: brandColor }} />
            <span className="text-2xl font-bold text-gray-900">{grants.length}</span>
          </div>
          <p className="text-gray-600 text-sm font-medium">{t('grants.totalGrants')}</p>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <span className="text-2xl font-bold text-gray-900">
              {grants.filter((g) => g.status === 'active').length}
            </span>
          </div>
          <p className="text-gray-600 text-sm font-medium">{t('grants.activeGrants')}</p>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 text-yellow-600" />
            <span className="text-2xl font-bold text-gray-900">
              {grants.filter((g) => g.status === 'pending_signature').length}
            </span>
          </div>
          <p className="text-gray-600 text-sm font-medium">{t('grants.pendingSignature')}</p>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <FileText className="w-8 h-8 text-purple-600" />
            <span className="text-2xl font-bold text-gray-900">
              {grants.reduce((sum, g) => sum + g.total_shares, 0).toLocaleString()}
            </span>
          </div>
          <p className="text-gray-600 text-sm font-medium">{t('grants.totalSharesGranted')}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4 flex-1">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search grants by employee, grant number, or plan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="pending_signature">Pending Signature</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="forfeited">Forfeited</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="lapsed">Lapsed</option>
                </select>
                <button
                  onClick={() => setShowEmployeeFilterModal(true)}
                  className={`flex items-center space-x-2 px-4 py-2 border rounded-lg transition ${
                    selectedEmployees.length > 0
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {selectedEmployees.length > 0 
                      ? `Employees (${selectedEmployees.length})` 
                      : 'Filter by Employee'
                    }
                  </span>
                </button>
              </div>
            </div>
            {selectedGrants.length > 0 && (
              <div className="ml-4 flex items-center space-x-2">
                <span className="text-sm text-gray-600 font-medium">
                  {selectedGrants.length} selected
                </span>
                <button
                  onClick={handleBulkDeleteGrants}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="font-medium">Delete Selected</span>
                </button>
              </div>
            )}
          </div>
          {(filterPlanId && filterPlanName || selectedEmployees.length > 0) && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {filterPlanId && filterPlanName && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium">
                  <FileText className="w-4 h-4" />
                  <span>Plan: {filterPlanName}</span>
                  <button
                    onClick={clearPlanFilter}
                    className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {selectedEmployees.length > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
                  <Users className="w-4 h-4" />
                  <span>
                    Employees: {selectedEmployees.length === 1 
                      ? employees.find(emp => emp.id === selectedEmployees[0])?.first_name_en + ' ' + 
                        employees.find(emp => emp.id === selectedEmployees[0])?.last_name_en
                      : `${selectedEmployees.length} selected`
                    }
                  </span>
                  <button
                    onClick={clearEmployeeFilter}
                    className="ml-1 hover:bg-green-200 rounded-full p-0.5 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {filteredGrants.length === 0 ? (
          <div className="p-12 text-center">
            <Award className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t('grants.noGrantsFound')}</h3>
            <p className="text-gray-600 mb-6">
              {searchTerm ? t('common.tryAdjustingSearch') : t('grants.issueFirstGrant')}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowCreateModal(true)}
                className={`inline-flex items-center space-x-2 px-6 py-3 text-white rounded-lg transition ${isRTL ? 'space-x-reverse' : ''}`}
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
                <span className="font-medium">{t('grants.issueFirstGrant')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    <input
                      type="checkbox"
                      checked={filteredGrants.length > 0 && filteredGrants.every(g => selectedGrants.includes(g.id))}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('grants.grantNumber')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('grants.employee')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('grants.plan')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('grants.planType')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('grants.totalShares')}
                  </th>
                  <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                    {t('grants.vested')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unvested
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vesting Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Grant Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredGrants.map((grant) => {
                  const config = statusConfig[grant.status] || statusConfig.active;
                  const StatusIcon = config.icon;
                  const vestingProgress = (grant.vested_shares / grant.total_shares) * 100;
                  const unvestedShares = grant.total_shares - grant.vested_shares;

                  return (
                    <tr key={grant.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedGrants.includes(grant.id)}
                          onChange={() => handleSelectGrant(grant.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleViewGrant(grant)}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition"
                        >
                          {grant.grant_number}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <Award className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {grant.employees?.first_name_en} {grant.employees?.last_name_en}
                            </div>
                            <div className="text-xs text-gray-500">{grant.employees?.department || 'No Department'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{grant.incentive_plans?.plan_name_en}</div>
                        <div className="text-xs text-gray-500">{grant.incentive_plans?.plan_code}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{grant.incentive_plans?.plan_type}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">{grant.total_shares.toLocaleString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-green-600">{Math.floor(grant.vested_shares).toLocaleString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-blue-600">{Math.floor(unvestedShares).toLocaleString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="w-32">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600 font-medium">{vestingProgress.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{ backgroundColor: brandColor, width: `${vestingProgress}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                          <StatusIcon className="w-3.5 h-3.5 mr-1" />
                          {config.label}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(grant.grant_date)}</div>
                        <div className="text-xs text-gray-500">
                          {formatDate(grant.vesting_start_date)} - {formatDate(grant.vesting_end_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="relative inline-block text-left">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const menuHeight = 180;
                              const menuWidth = 224;
                              
                              let top = rect.bottom + 8;
                              let left = rect.right - menuWidth;
                              
                              if (top + menuHeight > window.innerHeight) {
                                top = rect.top - menuHeight - 8;
                              }
                              
                              if (left < 0) {
                                left = rect.left;
                              }
                              
                              if (top < 0) {
                                top = 8;
                              }
                              
                              setDropdownPosition({ top, left });
                              setOpenMenuId(openMenuId === grant.id ? null : grant.id);
                            }}
                            className="p-1 hover:bg-gray-100 rounded-lg transition"
                          >
                            <MoreVertical className="w-5 h-5 text-gray-500" />
                          </button>
                          {openMenuId === grant.id && dropdownPosition && createPortal(
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDropdownPosition(null);
                                }}
                              ></div>
                              <div
                                className="fixed w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-20"
                                style={{
                                  top: `${dropdownPosition.top}px`,
                                  left: `${dropdownPosition.left}px`,
                                }}
                              >
                                <div className="py-1">
                                  <button
                                    onClick={() => {
                                      handleViewGrant(grant);
                                      setOpenMenuId(null);
                                      setDropdownPosition(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-3"
                                  >
                                    <Eye className="w-4 h-4" />
                                    <span>View Grant Details</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleEditGrant(grant);
                                      setOpenMenuId(null);
                                      setDropdownPosition(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-3"
                                  >
                                    <Edit className="w-4 h-4" />
                                    <span>Edit Grant</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleViewGrant(grant);
                                      setOpenMenuId(null);
                                      setDropdownPosition(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-3"
                                  >
                                    <FileText className="w-4 h-4" />
                                    <span>View Contract</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleViewGrant(grant);
                                      setOpenMenuId(null);
                                      setDropdownPosition(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-3"
                                  >
                                    <History className="w-4 h-4" />
                                    <span>View History</span>
                                  </button>
                                  <div className="border-t border-gray-200 my-1"></div>
                                  <button
                                    onClick={() => {
                                      handleDeleteGrant(grant);
                                      setOpenMenuId(null);
                                      setDropdownPosition(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-3"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    <span>Delete Grant</span>
                                  </button>
                                </div>
                              </div>
                            </>,
                            document.body
                          )}
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

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Issue New Grant</h2>
              <p className="text-gray-600 mt-1">Allocate shares to an employee from an active plan</p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Employee*
                </label>
                <select
                  value={newGrant.employee_id}
                  onChange={(e) => setNewGrant({ ...newGrant, employee_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Choose an employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name_en} {emp.last_name_en} - {emp.employee_number} ({emp.department || 'No Dept'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Plan*
                </label>
                <select
                  value={newGrant.plan_id}
                  onChange={(e) => setNewGrant({ ...newGrant, plan_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Choose a plan...</option>
                  {plans.length === 0 ? (
                    <option value="" disabled>No plans available</option>
                  ) : (
                    plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.plan_name_en} ({plan.plan_code}) - {(plan.actual_shares_available || plan.shares_available).toLocaleString()} shares available
                      </option>
                    ))
                  )}
                </select>
                {plans.length === 0 && (
                  <p className="text-sm text-red-600 mt-1">
                    No active plans found. Please create a plan first or check if plans are active.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Vesting Schedule
                  <span className="text-gray-500 text-xs ml-1">(optional - will use plan's default if not selected)</span>
                </label>
                <select
                  value={newGrant.vesting_schedule_id}
                  onChange={(e) => setNewGrant({ ...newGrant, vesting_schedule_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Choose a vesting schedule...</option>
                  {vestingSchedules.length === 0 ? (
                    <option value="" disabled>No vesting schedules available</option>
                  ) : (
                    vestingSchedules.map((schedule) => (
                      <option key={schedule.id} value={schedule.id}>
                        {schedule.name} - {schedule.total_duration_months} months, {schedule.cliff_months} month cliff, {schedule.vesting_frequency}
                      </option>
                    ))
                  )}
                </select>
                {vestingSchedules.length === 0 && (
                  <p className="text-sm text-red-600 mt-1">
                    No vesting schedules found. Please create a vesting schedule first.
                  </p>
                )}
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newGrant.use_even_distribution}
                    onChange={(e) => setNewGrant({ ...newGrant, use_even_distribution: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      Use Even Distribution
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      When enabled, shares are divided evenly across all periods (e.g., 5+5+5). 
                      When disabled, uses percentage-based calculation with floor rounding (e.g., 3+5+5, remainder to last).
                    </p>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Shares*
                  </label>
                  <input
                    type="number"
                    value={newGrant.total_shares}
                    onChange={(e) => setNewGrant({ ...newGrant, total_shares: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vesting Start Date*
                  </label>
                  <input
                    type="date"
                    value={newGrant.vesting_start_date}
                    onChange={(e) => setNewGrant({ ...newGrant, vesting_start_date: e.target.value })}
                    min={(() => {
                      const selectedPlan = plans.find((p) => p.id === newGrant.plan_id);
                      return selectedPlan?.start_date || '';
                    })()}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {(() => {
                    const selectedPlan = plans.find((p) => p.id === newGrant.plan_id);
                    if (selectedPlan?.start_date && newGrant.vesting_start_date < selectedPlan.start_date) {
                      return (
                        <p className="text-sm text-red-600 mt-1">
                          Vesting start date must be on or after the plan start date ({formatDate(selectedPlan.start_date)})
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {newGrant.plan_id && (() => {
                const selectedPlan = plans.find((p) => p.id === newGrant.plan_id);
                const selectedSchedule = newGrant.vesting_schedule_id 
                  ? vestingSchedules.find(s => s.id === newGrant.vesting_schedule_id)
                  : null;
                const planVestingSchedule = selectedPlan?.vesting_schedules?.[0]; // Get first vesting schedule from plan
                
                // Determine vesting period and cliff from selected schedule, plan schedule, or fallback to vesting_config
                const vestingYears = selectedSchedule
                  ? Math.floor(selectedSchedule.total_duration_months / 12)
                  : (planVestingSchedule 
                    ? Math.floor(planVestingSchedule.total_duration_months / 12)
                    : (selectedPlan?.vesting_config?.years || 4));
                  
                const cliffMonths = selectedSchedule
                  ? selectedSchedule.cliff_months
                  : (planVestingSchedule 
                    ? planVestingSchedule.cliff_months
                    : (selectedPlan?.vesting_config?.cliff_months || 12));
                
                return (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900 font-medium mb-2">Grant Summary</p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Shares to be granted: {newGrant.total_shares.toLocaleString()}</li>
                      <li>
                        • Available in plan:{' '}
                        {(selectedPlan?.actual_shares_available || selectedPlan?.shares_available || 0).toLocaleString()}
                      </li>
                      <li>
                        • Vesting period: {vestingYears} years
                      </li>
                      <li>
                        • Cliff period: {cliffMonths} months
                      </li>
                      <li className="pt-1 text-blue-700">
                        • Distribution method: {newGrant.use_even_distribution 
                          ? 'Even distribution (shares divided equally, remainder to last period)'
                          : 'Percentage-based with floor rounding (remainder to last period)'}
                      </li>
                    </ul>
                    
                    {newGrant.total_shares > 0 && vestingEventsPreview.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-blue-200">
                        <p className="text-sm text-blue-900 font-medium mb-2">Expected Vesting Events:</p>
                        <div className="max-h-48 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-blue-900 font-semibold border-b border-blue-300">
                                <th className="text-left py-1 px-2">Event</th>
                                <th className="text-left py-1 px-2">Date</th>
                                <th className="text-right py-1 px-2">Shares</th>
                                <th className="text-right py-1 px-2">Cumulative</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vestingEventsPreview.map((event, idx) => (
                                <tr key={idx} className="text-blue-800 border-b border-blue-100">
                                  <td className="py-1 px-2">{event.type}</td>
                                  <td className="py-1 px-2">{formatDate(event.date)}</td>
                                  <td className="py-1 px-2 text-right">{event.shares.toLocaleString()}</td>
                                  <td className="py-1 px-2 text-right font-medium">{event.cumulative.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="text-blue-900 font-semibold border-t-2 border-blue-300">
                                <td colSpan={2} className="py-1 px-2">Total</td>
                                <td className="py-1 px-2 text-right">{newGrant.total_shares.toLocaleString()}</td>
                                <td className="py-1 px-2 text-right">{newGrant.total_shares.toLocaleString()}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Link Performance Metrics
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Selected metrics will require confirmation before vesting performance events for this grant.
                </p>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {performanceMetrics.length > 0 ? (
                    performanceMetrics.map(metric => {
                      const isSelected = newGrant.performance_metric_ids.includes(metric.id);
                      return (
                        <label
                          key={metric.id}
                          className="flex items-start justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
                        >
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{metric.name}</div>
                            <div className="text-xs text-gray-500 flex flex-wrap gap-2 mt-1">
                              <span className="uppercase">{metric.metric_type}</span>
                              {metric.unit_of_measure && <span>{metric.unit_of_measure}</span>}
                            </div>
                            {metric.description && (
                              <p className="text-xs text-gray-500 mt-2 max-w-md break-words">{metric.description}</p>
                            )}
                          </div>
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            checked={isSelected}
                            onChange={() => toggleNewGrantMetric(metric.id)}
                          />
                        </label>
                      );
                    })
                  ) : (
                    <div className="px-4 py-6 text-sm text-gray-500">
                      No performance metrics defined yet. Create metrics on the Performance Metrics page to link them here.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="flex-shrink-0 p-6 border-t border-gray-200 bg-white flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetNewGrantForm();
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGrant}
                disabled={!newGrant.employee_id || !newGrant.plan_id || !newGrant.total_shares || !newGrant.vesting_start_date}
                className="px-6 py-2 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: brandColor }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    const rgb = parseInt(brandColor.slice(1, 3), 16) * 0.9;
                    const gg = parseInt(brandColor.slice(3, 5), 16) * 0.9;
                    const bb = parseInt(brandColor.slice(5, 7), 16) * 0.9;
                    e.currentTarget.style.backgroundColor = `rgb(${Math.round(rgb)}, ${Math.round(gg)}, ${Math.round(bb)})`;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = brandColor;
                }}
              >
                Issue Grant
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && selectedGrant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Grant Details</h2>
                  <p className="text-gray-600 mt-1">{selectedGrant.grant_number}</p>
                </div>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedGrant(null);
                    setGrantContract(null);
                    setGrantHistory([]);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Grant Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Employee</p>
                      <p className="text-base font-semibold text-gray-900">
                        {selectedGrant.employees?.first_name_en} {selectedGrant.employees?.last_name_en}
                      </p>
                      <p className="text-sm text-gray-500">{selectedGrant.employees?.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Department</p>
                      <p className="text-base font-semibold text-gray-900">
                        {selectedGrant.employees?.department || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Plan</p>
                      <p className="text-base font-semibold text-gray-900">
                        {selectedGrant.incentive_plans?.plan_name_en}
                      </p>
                      <p className="text-sm text-gray-500">{selectedGrant.incentive_plans?.plan_code}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Plan Type</p>
                      <p className="text-base font-semibold text-gray-900">
                        {selectedGrant.incentive_plans?.plan_type}
                      </p>
                    </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-600">Performance Metrics</p>
                    {selectedGrant.grant_performance_metrics && selectedGrant.grant_performance_metrics.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedGrant.grant_performance_metrics.map(link => (
                          <span
                            key={link.performance_metric_id}
                            className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
                          >
                            {link.performance_metrics?.name || 'Metric'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 mt-2">No performance metrics linked</p>
                    )}
                  </div>
                    <div>
                      <p className="text-sm text-gray-600">Grant Date</p>
                      <p className="text-base font-semibold text-gray-900">{formatDate(selectedGrant.grant_date)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Status</p>
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1">
                        {(() => {
                          const config = statusConfig[selectedGrant.status];
                          const StatusIcon = config.icon;
                          return (
                            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                              <StatusIcon className="w-3.5 h-3.5 mr-1" />
                              {config.label}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Vesting Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total Shares</p>
                      <p className="text-2xl font-bold text-gray-900">{selectedGrant.total_shares.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Vested Shares</p>
                      <p className="text-2xl font-bold text-green-600">
                        {Math.floor(computedVestedShares !== null ? computedVestedShares : selectedGrant.vested_shares).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Unvested Shares</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {Math.floor(selectedGrant.total_shares - (computedVestedShares !== null ? computedVestedShares : selectedGrant.vested_shares)).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {(transferredShares > 0 || exercisedShares > 0) && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {transferredShares > 0 && (
                        <div>
                          <p className="text-sm text-gray-600">Total Transferred</p>
                          <p className="text-2xl font-bold text-purple-600">{transferredShares.toLocaleString()}</p>
                        </div>
                      )}
                      {exercisedShares > 0 && (
                        <div>
                          <p className="text-sm text-gray-600">Total Exercised</p>
                          <p className="text-2xl font-bold text-orange-600">{exercisedShares.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-3 text-sm text-blue-800">
                    <p className="font-medium">Rounding policy</p>
                    <p>Vesting events are calculated in whole shares (floor). Fractions are not issued.</p>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-gray-600">Vesting Progress</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {(((computedVestedShares !== null ? computedVestedShares : selectedGrant.vested_shares) / selectedGrant.total_shares) * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="h-3 rounded-full transition-all"
                        style={{ backgroundColor: brandColor, width: `${((computedVestedShares !== null ? computedVestedShares : selectedGrant.vested_shares) / selectedGrant.total_shares) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Vesting Start</p>
                      <p className="text-base font-semibold text-gray-900">{formatDate(selectedGrant.vesting_start_date)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Vesting End</p>
                      <p className="text-base font-semibold text-gray-900">{formatDate(selectedGrant.vesting_end_date)}</p>
                    </div>
                    {selectedGrantVestingDetails && (
                      <>
                        <div>
                          <p className="text-sm text-gray-600">Cliff Period</p>
                          <p className="text-base font-semibold text-gray-900">{selectedGrantVestingDetails.cliffMonths} months</p>
                          <p className="text-xs text-gray-500">Cliff Date: {formatDate(selectedGrantVestingDetails.cliffDate)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Vesting Frequency</p>
                          <p className="text-base font-semibold text-gray-900 capitalize">{selectedGrantVestingDetails.vestingFrequency}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Vesting Type</p>
                          <p className="text-base font-semibold text-gray-900 capitalize">{selectedGrantVestingDetails.vestingType.replace('_', ' ')}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Total Vesting Period</p>
                          <p className="text-base font-semibold text-gray-900">{selectedGrantVestingDetails.vestingYears} years</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Vesting Timeline */}
                {selectedGrantVestingDetails && (
                  <div className="border border-gray-200 rounded-lg">
                    <InteractiveVestingTimeline
                      grantDate={selectedGrant.vesting_start_date}
                      totalShares={selectedGrant.total_shares}
                      vestedShares={computedVestedShares !== null ? computedVestedShares : selectedGrant.vested_shares}
                      vestingSchedule={{
                        cliff_months: selectedGrantVestingDetails.cliffMonths,
                        total_duration_months: selectedGrantVestingDetails.vestingYears * 12,
                        vesting_frequency: selectedGrantVestingDetails.vestingFrequency
                      }}
                      individualVestingRecords={selectedGrantVestingDetails.individualVestingRecords}
                    />
                  </div>
                )}

                <div className="border border-gray-200 rounded-lg">
                  <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <FileText className="w-5 h-5 mr-2" />
                      Linked Contract
                    </h3>
                  </div>
                  <div className="p-6">
                    {grantContract ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-gray-900">{grantContract.document_name}</p>
                            <p className="text-sm text-gray-600 mt-1">
                              Generated: {formatDate(grantContract.generated_at)}
                            </p>
                          {grantContract.approved_at && (
                            <p className="text-sm text-gray-600">
                              Approved on: {formatDateTime(grantContract.approved_at)}
                            </p>
                          )}
                          </div>
                          <div>
                            {grantContract.status === 'draft' && (
                              <span className="px-3 py-1 bg-gray-100 text-gray-800 text-sm font-medium rounded-full">
                                Draft
                              </span>
                            )}
                            {grantContract.status === 'pending_signature' && (
                              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">
                                Pending Signature
                              </span>
                            )}
                            {grantContract.status === 'signed' && (
                              <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full flex items-center">
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Signed
                              </span>
                            )}
                          </div>
                        </div>
                        {grantContract.status === 'draft' && canApproveContract && (
                          <div className="border-t border-gray-200 pt-4">
                            <button
                              onClick={handleApproveContract}
                              disabled={approvingContract}
                              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {approvingContract ? 'Approving…' : 'Approve for Signature'}
                            </button>
                          </div>
                        )}
                        {grantContract.e_signatures && grantContract.e_signatures.length > 0 && (
                          <div className="border-t border-gray-200 pt-4">
                            <p className="text-sm font-semibold text-gray-900 mb-2">Signature Status</p>
                            {grantContract.e_signatures.map((sig: any) => (
                              <div key={sig.id} className="flex items-center justify-between text-sm py-2">
                                <div>
                                  <p className="text-gray-900">{sig.signer_name}</p>
                                  <p className="text-gray-500 text-xs">{sig.signer_role}</p>
                                </div>
                                <div>
                                  {sig.signature_timestamp && (
                                    <p className="text-green-600 text-xs">
                                      Signed: {formatDate(sig.signature_timestamp)}
                                    </p>
                                  )}
                                  {!sig.signature_timestamp && (
                                    <span className="text-yellow-600 text-xs">Pending</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600">No contract generated for this grant</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg">
                  <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <History className="w-5 h-5 mr-2" />
                      Historical Actions
                    </h3>
                  </div>
                  <div className="p-6">
                    {grantHistory.length > 0 ? (
                      <div className="space-y-4">
                        {grantHistory.map((history) => (
                          <div key={history.id} className="flex items-start space-x-3 border-l-2 border-blue-500 pl-4">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-900">{history.modification_type}</p>
                              <p className="text-sm text-gray-600 mt-1">{history.reason || 'No reason provided'}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {formatDateTime(history.created_at)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <History className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600">No historical actions recorded</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="flex-shrink-0 p-6 border-t border-gray-200 bg-white flex justify-end">
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedGrant(null);
                  setGrantContract(null);
                  setGrantHistory([]);
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedGrant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Edit Grant</h2>
              <p className="text-sm text-gray-500 mt-1">Grant #{selectedGrant.grant_number}</p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Employee
                </label>
                <p className="text-gray-900 bg-gray-50 px-4 py-2 rounded-lg">
                  {selectedGrant.employees.first_name_en} {selectedGrant.employees.last_name_en}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Plan
                </label>
                <p className="text-gray-900 bg-gray-50 px-4 py-2 rounded-lg">
                  {selectedGrant.incentive_plans.plan_name_en}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Total Shares
                  </label>
                  <input
                    type="number"
                    value={editGrant.total_shares}
                    onChange={(e) => setEditGrant({ ...editGrant, total_shares: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={editGrant.status}
                    onChange={(e) => setEditGrant({ ...editGrant, status: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="pending_signature">Pending Signature</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="forfeited">Forfeited</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grant Date
                </label>
                <input
                  type="date"
                  value={editGrant.grant_date}
                  onChange={(e) => setEditGrant({ ...editGrant, grant_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vesting Start Date
                  </label>
                  <input
                    type="date"
                    value={editGrant.vesting_start_date}
                    onChange={(e) => setEditGrant({ ...editGrant, vesting_start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vesting End Date
                  </label>
                  <input
                    type="date"
                    value={editGrant.vesting_end_date}
                    onChange={(e) => setEditGrant({ ...editGrant, vesting_end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Linked Performance Metrics
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Adjust which performance metrics apply to this grant.
              </p>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {performanceMetrics.length > 0 ? (
                  performanceMetrics.map(metric => {
                    const isSelected = editGrantMetrics.includes(metric.id);
                    return (
                      <label
                        key={metric.id}
                        className="flex items-start justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{metric.name}</div>
                          <div className="text-xs text-gray-500 flex flex-wrap gap-2 mt-1">
                            <span className="uppercase">{metric.metric_type}</span>
                            {metric.unit_of_measure && <span>{metric.unit_of_measure}</span>}
                          </div>
                          {metric.description && (
                            <p className="text-xs text-gray-500 mt-2 max-w-md break-words">{metric.description}</p>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          checked={isSelected}
                          onChange={() => toggleEditGrantMetric(metric.id)}
                        />
                      </label>
                    );
                  })
                ) : (
                  <div className="px-4 py-6 text-sm text-gray-500">
                    No performance metrics defined yet. Create metrics on the Performance Metrics page to link them here.
                  </div>
                )}
              </div>
            </div>
            </div>

            {/* Fixed Footer */}
            <div className="flex-shrink-0 p-6 border-t border-gray-200 bg-white flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedGrant(null);
                setEditGrantMetrics([]);
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateGrant}
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
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Filter Modal */}
      {showEmployeeFilterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Filter by Employee</h2>
                  <p className="text-gray-600 text-sm mt-1">Select one or more employees to filter grants</p>
                </div>
                <button
                  onClick={() => setShowEmployeeFilterModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={employeeFilterSearch}
                  onChange={(e) => setEmployeeFilterSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2">
                {filteredEmployeesForModal.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 text-sm">No employees found</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-gray-600">
                        {filteredEmployeesForModal.length} employee{filteredEmployeesForModal.length !== 1 ? 's' : ''} available
                      </p>
                      {selectedEmployees.length > 0 && (
                        <button
                          onClick={() => setSelectedEmployees([])}
                          className="text-sm text-red-600 hover:text-red-800 transition"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    {filteredEmployeesForModal.map((employee) => {
                      const isSelected = selectedEmployees.includes(employee.id);
                      return (
                        <label
                          key={employee.id}
                          className={`flex items-center p-3 rounded-lg border cursor-pointer transition ${
                            isSelected 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleEmployeeSelection(employee.id)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div className="ml-3 flex-1">
                            <div className="flex items-center">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <Users className="w-4 h-4 text-blue-600" />
                              </div>
                              <div className="ml-3">
                                <div className="text-sm font-medium text-gray-900">
                                  {employee.first_name_en} {employee.last_name_en}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center space-x-2">
                                  <span>{employee.employee_number}</span>
                                  {employee.department && (
                                    <>
                                      <span>•</span>
                                      <span>{employee.department}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {selectedEmployees.length} employee{selectedEmployees.length !== 1 ? 's' : ''} selected
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowEmployeeFilterModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowEmployeeFilterModal(false)}
                  className="px-4 py-2 text-white rounded-lg transition text-sm font-medium"
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
                  Apply Filter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
