import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/dateUtils';
import { Users, Plus, Upload, Search, Filter, MoreVertical, Edit, Trash2, Eye, Send, RefreshCw } from 'lucide-react';
import { useCompanyColor } from '../hooks/useCompanyColor';

interface Employee {
  id: string;
  employee_number: string;
  national_id: string;
  first_name_en: string;
  last_name_en: string;
  email: string;
  phone: string | null;
  department: string | null;
  job_title: string | null;
  employment_status: 'active' | 'terminated' | 'resigned' | 'retired';
  hire_date: string | null;
  total_shares?: number;
  vested_shares?: number;
  unvested_shares?: number;
  vesting_progress?: number;
  // Credential fields
  portal_username?: string;
  portal_password?: string;
  portal_access_enabled?: boolean;
}

export default function Employees() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { brandColor, getBgColor } = useCompanyColor();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showOptionsMenu, setShowOptionsMenu] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'financial'>('details');
  const [employeeGrants, setEmployeeGrants] = useState<any[]>([]);
  const [employeeShares, setEmployeeShares] = useState<any>(null);
  const [employeeFinancialInfo, setEmployeeFinancialInfo] = useState<any>(null);
  const [loadingFinancials, setLoadingFinancials] = useState(false);
  const [editingFinancialInfo, setEditingFinancialInfo] = useState(false);
  const [editingInViewModal, setEditingInViewModal] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoveredGrant, setHoveredGrant] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [editForm, setEditForm] = useState({
    national_id: '',
    first_name_en: '',
    last_name_en: '',
    email: '',
    phone: '',
    department: '',
    job_title: '',
    employment_status: 'active' as 'active' | 'terminated' | 'resigned' | 'retired',
    hire_date: '',
    // Credential fields
    portal_username: '',
    portal_password: '',
    portal_access_enabled: false,
  });

  const [addForm, setAddForm] = useState({
    first_name_en: '',
    last_name_en: '',
    email: '',
    phone: '',
    department: '',
    job_title: '',
    employment_status: 'active' as 'active' | 'terminated' | 'resigned' | 'retired',
    hire_date: '',
    // Credential fields
    portal_username: '',
    portal_password: '',
    portal_access_enabled: false,
  });

  const [financialInfoForm, setFinancialInfoForm] = useState({
    iban: '',
    bank_name: '',
    bank_branch_code: '',
    account_holder_name_ar: '',
    investment_account_number: '',
    broker_custodian_name: '',
    broker_account_number: '',
    tadawul_investor_number: '',
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowOptionsMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadEmployees = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (companyUser) {
        const { data: employeesData, error } = await supabase
          .from('employees')
          .select('*')
          .eq('company_id', companyUser.company_id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (employeesData) {
          const { data: grantsData } = await supabase
            .from('grants')
            .select('employee_id, total_shares, vested_shares, remaining_unvested_shares, status')
            .eq('company_id', companyUser.company_id)
            .in('status', ['active', 'pending_signature']);

          const grantsByEmployee = (grantsData || []).reduce((acc: any, grant) => {
            if (!acc[grant.employee_id]) {
              acc[grant.employee_id] = {
                total_shares: 0,
                vested_shares: 0,
                unvested_shares: 0,
              };
            }
            acc[grant.employee_id].total_shares += Number(grant.total_shares) || 0;
            acc[grant.employee_id].vested_shares += Number(grant.vested_shares) || 0;
            // Calculate unvested shares dynamically: total - vested
            const grantUnvested = (Number(grant.total_shares) || 0) - (Number(grant.vested_shares) || 0);
            acc[grant.employee_id].unvested_shares += grantUnvested;
            return acc;
          }, {});

          const employeesWithGrants = employeesData.map((employee) => {
            const grantSummary = grantsByEmployee[employee.id] || {
              total_shares: 0,
              vested_shares: 0,
              unvested_shares: 0,
            };
            const vesting_progress = grantSummary.total_shares > 0
              ? (grantSummary.vested_shares / grantSummary.total_shares) * 100
              : 0;

            return {
              ...employee,
              ...grantSummary,
              vesting_progress,
            };
          });

          setEmployees(employeesWithGrants);
        }
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch =
      employee.first_name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.last_name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.employee_number.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterStatus === 'all' || employee.employment_status === filterStatus;

    return matchesSearch && matchesFilter;
  });

  const handleViewEmployee = async (employee: Employee) => {
    setSelectedEmployee(employee);
    setShowViewModal(true);
    setShowOptionsMenu(null);
    setActiveTab('details');
    await loadEmployeeFinancials(employee.id);
  };

  const loadEmployeeFinancials = async (employeeId: string) => {
    setLoadingFinancials(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser) return;

      const { data: grantsData, error: grantsError } = await supabase
        .from('grants')
        .select(`
          *,
          incentive_plans:plan_id (
            plan_name_en,
            plan_type,
            exercise_price
          )
        `)
        .eq('employee_id', employeeId)
        .order('grant_date', { ascending: false });

      if (grantsError) throw grantsError;

      if (grantsData) {
        const activeGrants = grantsData.filter(g => g.status === 'active' || g.status === 'pending_signature');
        
        // Load vesting events for all grants to calculate actual vested shares
        const grantsWithVesting = await Promise.all(activeGrants.map(async (grant) => {
          const { data: vestingEvents } = await supabase
            .from('vesting_events')
            .select('*')
            .eq('grant_id', grant.id)
            .order('sequence_number', { ascending: true });
          
          // Calculate actual vested shares from vesting events (includes vested, transferred, exercised)
          let actualVestedShares = Number(grant.vested_shares) || 0;
          if (vestingEvents && vestingEvents.length > 0) {
            actualVestedShares = vestingEvents
              .filter(event => event.status === 'vested' || event.status === 'transferred' || event.status === 'exercised')
              .reduce((sum, event) => sum + Number(event.shares_to_vest || 0), 0);
          }
          
          return {
            ...grant,
            computed_vested_shares: actualVestedShares,
            total_transferred: vestingEvents?.filter(e => e.status === 'transferred').reduce((sum, e) => sum + Number(e.shares_to_vest || 0), 0) || 0,
            total_exercised: vestingEvents?.filter(e => e.status === 'exercised').reduce((sum, e) => sum + Number(e.shares_to_vest || 0), 0) || 0,
          };
        }));
        
        setEmployeeGrants(grantsWithVesting);

        const totalGrantedShares = activeGrants.reduce((sum, grant) => sum + (Number(grant.total_shares) || 0), 0);
        const totalVestedShares = grantsWithVesting.reduce((sum, grant) => sum + (grant.computed_vested_shares || 0), 0);
        // Calculate unvested shares dynamically: total - vested
        const totalUnvestedShares = totalGrantedShares - totalVestedShares;

        const totalValue = activeGrants.reduce((sum, grant) => {
          const totalShares = Number(grant.total_shares) || 0;
          const price = Number(grant.incentive_plans?.exercise_price) || 0;
          return sum + (totalShares * price);
        }, 0);

        const { data: companyData } = await supabase
          .from('companies')
          .select('total_shares_authorized')
          .eq('id', companyUser.company_id)
          .maybeSingle();

        const ownershipPercentage = companyData?.total_shares_authorized
          ? (totalGrantedShares / Number(companyData.total_shares_authorized)) * 100
          : 0;

        setEmployeeShares({
          total_shares: totalGrantedShares,
          vested_shares: totalVestedShares,
          unvested_shares: totalUnvestedShares,
          ownership_percentage: ownershipPercentage,
          market_value: totalValue
        });
      }

      // Load employee financial info
      const { data: financialInfo, error: financialInfoError } = await supabase
        .from('employee_financial_info')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle();

      if (financialInfoError) {
        console.error('Error loading financial info:', financialInfoError);
      } else {
        setEmployeeFinancialInfo(financialInfo);
        if (financialInfo) {
          setFinancialInfoForm({
            iban: financialInfo.iban || '',
            bank_name: financialInfo.bank_name || '',
            bank_branch_code: financialInfo.bank_branch_code || '',
            account_holder_name_ar: financialInfo.account_holder_name_ar || '',
            investment_account_number: financialInfo.investment_account_number || '',
            broker_custodian_name: financialInfo.broker_custodian_name || '',
            broker_account_number: financialInfo.broker_account_number || '',
            tadawul_investor_number: financialInfo.tadawul_investor_number || '',
          });
        }
      }
    } catch (error) {
      console.error('Error loading employee financials:', error);
    } finally {
      setLoadingFinancials(false);
    }
  };

  const handleEditEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEditForm({
      national_id: employee.national_id || '',
      first_name_en: employee.first_name_en,
      last_name_en: employee.last_name_en,
      email: employee.email,
      phone: employee.phone || '',
      department: employee.department || '',
      job_title: employee.job_title || '',
      employment_status: employee.employment_status,
      hire_date: employee.hire_date || '',
      // Credential fields
      portal_username: employee.portal_username || '',
      portal_password: employee.portal_password || '',
      portal_access_enabled: employee.portal_access_enabled || false,
    });
    setShowEditModal(true);
    setShowOptionsMenu(null);
  };

  const generatePassword = (firstName?: string, lastName?: string): string => {
    // If name is not provided, generate a random easy password
    if (!firstName || !lastName || firstName.trim() === '' || lastName.trim() === '') {
      // Generate random easy password: random word + numbers + special char
      const easyWords = ['password', 'employee', 'portal', 'access', 'secure', 'user', 'login', 'account'];
      const randomWord = easyWords[Math.floor(Math.random() * easyWords.length)];
      const numbers = Math.floor(Math.random() * 9000) + 1000; // 4-digit random number
      const specialChars = ['!', '@', '#', '$'];
      const specialChar = specialChars[Math.floor(Math.random() * specialChars.length)];
      return `${randomWord}${numbers}${specialChar}`;
    }
    
    // Extract parts from name only
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();
    const firstPart = firstName.substring(0, Math.min(3, firstName.length)).toLowerCase();
    const lastPart = lastName.substring(0, Math.min(2, lastName.length)).toLowerCase();
    
    // Create a password inspired by name only
    // Format: FirstInitial + LastInitial + firstPart + lastPart + numbers + specialChar
    const numbers = Math.floor(Math.random() * 900) + 100; // 3-digit random number
    const specialChars = ['!', '@', '#', '$', '%'];
    const specialChar = specialChars[Math.floor(Math.random() * specialChars.length)];
    
    // Build password: Initials + name parts + numbers + special char
    const password = `${firstInitial}${lastInitial}${firstPart}${lastPart}${numbers}${specialChar}`;
    
    return password;
  };

  const handleAddEmployee = () => {
    setAddForm({
      first_name_en: '',
      last_name_en: '',
      email: '',
      phone: '',
      department: '',
      job_title: '',
      employment_status: 'active',
      hire_date: '',
      // Credential fields
      portal_username: '',
      portal_password: '',
      portal_access_enabled: false,
    });
    setShowAddModal(true);
  };

  const handleCreateEmployee = async () => {
    try {
      // Get company ID
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('company_name_en', 'Derayah Financial')
        .maybeSingle();

      if (companyError || !companyData) {
        alert('Company not found. Please contact your administrator.');
        return;
      }

      // Generate employee number
      const employeeCount = employees.length;
      const employeeNumber = `EMP-${new Date().getFullYear()}-${String(employeeCount + 1).padStart(3, '0')}`;

      const { data, error } = await supabase
        .from('employees')
        .insert({
          company_id: companyData.id,
          employee_number: employeeNumber,
          national_id: `ID${Date.now()}`, // Generate unique national ID
          first_name_en: addForm.first_name_en,
          last_name_en: addForm.last_name_en,
          email: addForm.email,
          phone: addForm.phone || null,
          department: addForm.department || null,
          job_title: addForm.job_title || null,
          employment_status: addForm.employment_status,
          hire_date: addForm.hire_date || null,
          // Credential fields
          portal_username: addForm.portal_username || null,
          portal_password: addForm.portal_password || null,
          portal_access_enabled: addForm.portal_access_enabled,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating employee:', error);
        alert(`Failed to create employee: ${error.message}`);
        return;
      }

      // If portal access is enabled, automatically create auth user
      if (addForm.portal_access_enabled && addForm.portal_username && addForm.portal_password) {
        console.log('Creating auth user for new employee...');
        
        try {
          const { data: authResult, error: authError } = await supabase.rpc('create_employee_auth_user_auto', {
            p_employee_id: data.id,
            p_email: addForm.email,
            p_portal_username: addForm.portal_username,
            p_portal_password: addForm.portal_password
          });

          if (authError) {
            console.error('Error creating auth user:', authError);
            alert(`Employee created but portal access setup failed: ${authError.message}`);
          } else if (authResult && authResult.success) {
            console.log('Portal access enabled:', authResult);
            if (authResult.requires_manual_auth_creation) {
              alert(`Employee created successfully! Portal access enabled.\n\nTo complete the setup, please:\n1. Go to Supabase Dashboard > Authentication > Users\n2. Click "Add user"\n3. Email: ${addForm.email}\n4. Password: ${addForm.portal_password}\n5. Set Email Confirm to true\n6. Click "Create user"\n\nAfter creating the auth user, the employee can log in immediately!`);
            } else {
              alert(`Employee created successfully! Portal access enabled. They can now log in using their email: ${addForm.email}`);
            }
          } else {
            console.error('Portal access setup failed:', authResult);
            alert('Employee created but portal access setup failed. Please enable portal access manually.');
          }
        } catch (authError) {
          console.error('Error in auth user creation:', authError);
          alert('Employee created but portal access setup failed. Please enable portal access manually.');
        }
      } else {
        alert('Employee created successfully!');
      }

      // Reload employees
      await loadEmployees();
      
      // Close modal
      setShowAddModal(false);
    } catch (error) {
      console.error('Error creating employee:', error);
      alert('Failed to create employee. Please try again.');
    }
  };

  const handleUpdateEmployee = async () => {
    if (!selectedEmployee) return;

    try {
      const updateData: any = {
        national_id: editForm.national_id || null,
        first_name_en: editForm.first_name_en,
        last_name_en: editForm.last_name_en,
        email: editForm.email,
        phone: editForm.phone || null,
        department: editForm.department || null,
        job_title: editForm.job_title || null,
        employment_status: editForm.employment_status,
        hire_date: editForm.hire_date || null,
        // Credential fields
        portal_username: editForm.portal_username || null,
        portal_password: editForm.portal_password || null,
        portal_access_enabled: editForm.portal_access_enabled,
      };

      console.log('Updating employee with data:', updateData);
      console.log('Employee ID:', selectedEmployee.id);

      // If portal access is being enabled, automatically create auth user
      if (editForm.portal_access_enabled && editForm.portal_username && editForm.portal_password) {
        console.log('Creating auth user for employee portal access...');
        
        try {
          const { data: authResult, error: authError } = await supabase.rpc('create_employee_auth_user_auto', {
            p_employee_id: selectedEmployee.id,
            p_email: editForm.email,
            p_portal_username: editForm.portal_username,
            p_portal_password: editForm.portal_password
          });

          if (authError) {
            console.error('Error creating auth user:', authError);
            alert(`Employee updated but portal access setup failed: ${authError.message}`);
          } else if (authResult && authResult.success) {
            console.log('Portal access enabled:', authResult);
            if (authResult.requires_manual_auth_creation) {
              alert(`Employee updated successfully! Portal access enabled.\n\nTo complete the setup, please:\n1. Go to Supabase Dashboard > Authentication > Users\n2. Click "Add user"\n3. Email: ${editForm.email}\n4. Password: ${editForm.portal_password}\n5. Set Email Confirm to true\n6. Click "Create user"\n\nAfter creating the auth user, the employee can log in immediately!`);
            } else {
              alert(`Employee updated successfully! Portal access enabled. They can now log in using their email: ${editForm.email}`);
            }
          } else {
            console.error('Portal access setup failed:', authResult);
            alert('Employee updated but portal access setup failed. Please enable portal access manually.');
          }
        } catch (authError) {
          console.error('Error in auth user creation:', authError);
          alert('Employee updated but portal access setup failed. Please enable portal access manually.');
        }
      }

      const { error } = await supabase
        .from('employees')
        .update(updateData)
        .eq('id', selectedEmployee.id);

      if (error) throw error;

      alert('Employee updated successfully!');
      
      // If updating from view modal, don't close it - just reload data
      if (editingInViewModal) {
        // Data will be reloaded by the calling function
      } else {
        setShowEditModal(false);
        setSelectedEmployee(null);
        loadEmployees();
      }
    } catch (error) {
      console.error('Error updating employee:', error);
      console.error('Error details:', error);
      
      // Show more specific error message
      if (error && typeof error === 'object' && 'message' in error) {
        alert(`Failed to update employee: ${error.message}`);
      } else {
        alert('Failed to update employee. Please check the console for details.');
      }
    }
  };

  const handleDeleteEmployee = async (employee: Employee) => {
    if (confirm(`Are you sure you want to delete ${employee.first_name_en} ${employee.last_name_en}?`)) {
      try {
        const { error } = await supabase
          .from('employees')
          .delete()
          .eq('id', employee.id);

        if (error) throw error;
        loadEmployees();
      } catch (error) {
        console.error('Error deleting employee:', error);
        alert('Failed to delete employee');
      }
    }
    setShowOptionsMenu(null);
  };

  const handleSaveFinancialInfo = async () => {
    if (!selectedEmployee) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id, id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser) return;

      const financialInfoData: any = {
        employee_id: selectedEmployee.id,
        company_id: companyUser.company_id,
        iban: financialInfoForm.iban || null,
        bank_name: financialInfoForm.bank_name || null,
        bank_branch_code: financialInfoForm.bank_branch_code || null,
        account_holder_name_ar: financialInfoForm.account_holder_name_ar || null,
        investment_account_number: financialInfoForm.investment_account_number || null,
        broker_custodian_name: financialInfoForm.broker_custodian_name || null,
        broker_account_number: financialInfoForm.broker_account_number || null,
        tadawul_investor_number: financialInfoForm.tadawul_investor_number || null,
        created_by: companyUser.id,
      };

      // Try UPDATE first if we have the record locally
      if (employeeFinancialInfo) {
        const { error } = await supabase
          .from('employee_financial_info')
          .update(financialInfoData)
          .eq('employee_id', selectedEmployee.id);

        if (error) {
          // If update fails with conflict, try upsert
          if (error.code === 'PGRST116' || error.message?.includes('duplicate')) {
            const { error: upsertError } = await supabase
              .from('employee_financial_info')
              .upsert(financialInfoData, {
                onConflict: 'employee_id',
                ignoreDuplicates: false
              });

            if (upsertError) throw upsertError;
          } else {
            throw error;
          }
        }
        alert('Financial information updated successfully!');
      } else {
        // Try INSERT, but handle 409 conflict (record exists but we couldn't read it due to RLS)
        const { error } = await supabase
          .from('employee_financial_info')
          .insert(financialInfoData);

        if (error) {
          // If insert fails with unique constraint violation, try update instead
          if (error.code === '23505' || error.message?.includes('duplicate key')) {
            const { error: updateError } = await supabase
              .from('employee_financial_info')
              .update(financialInfoData)
              .eq('employee_id', selectedEmployee.id);

            if (updateError) throw updateError;
            alert('Financial information updated successfully!');
          } else {
            throw error;
          }
        } else {
          alert('Financial information saved successfully!');
        }
      }

      // Reload financial info
      await loadEmployeeFinancials(selectedEmployee.id);
      setEditingFinancialInfo(false);
    } catch (error: any) {
      console.error('Error saving financial info:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      alert(`Failed to save financial information: ${errorMessage}. Please try again.`);
    }
  };

  const handleVerifyFinancialInfo = async (status: 'verified' | 'rejected') => {
    if (!selectedEmployee || !employeeFinancialInfo) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('id, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser || !['super_admin', 'finance_admin', 'company_admin'].includes(companyUser.role)) {
        alert('Only finance admins and company admins can verify financial information.');
        return;
      }

      const { error } = await supabase
        .from('employee_financial_info')
        .update({
          account_status: status,
          verified_by: companyUser.id,
          verified_at: new Date().toISOString(),
          account_verification_date: new Date().toISOString().split('T')[0],
        })
        .eq('employee_id', selectedEmployee.id);

      if (error) throw error;

      alert(`Financial information ${status === 'verified' ? 'verified' : 'rejected'} successfully!`);
      await loadEmployeeFinancials(selectedEmployee.id);
    } catch (error) {
      console.error('Error verifying financial info:', error);
      alert('Failed to verify financial information. Please try again.');
    }
  };

  const handleSendCredentials = async (employee: Employee) => {
    if (!employee.portal_username || !employee.portal_password) {
      alert('Employee must have portal credentials set before sending. Please edit the employee first.');
      return;
    }

    if (window.confirm(`Send portal credentials to ${employee.first_name_en} ${employee.last_name_en} at ${employee.email}?`)) {
      try {
        // Here you would integrate with your email service
        // For now, we'll just show a success message
        alert(`Portal credentials sent to ${employee.email}!\n\nUsername: ${employee.portal_username}\nPassword: ${employee.portal_password}`);
        setShowOptionsMenu(null);
      } catch (error) {
        console.error('Error sending credentials:', error);
        alert('Failed to send credentials');
      }
    }
  };

  const statusColors = {
    active: 'bg-green-100 text-green-800',
    terminated: 'bg-red-100 text-red-800',
    resigned: 'bg-yellow-100 text-yellow-800',
    retired: 'bg-gray-100 text-gray-800',
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
          <h1 className="text-3xl font-bold text-gray-900">{t('employees.title')}</h1>
          <p className="text-gray-600 mt-1">{t('employees.description')}</p>
        </div>
        <div className={`flex items-center space-x-3 ${isRTL ? 'space-x-reverse' : ''}`}>
          <button className={`flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition ${isRTL ? 'space-x-reverse' : ''}`}>
            <Upload className="w-4 h-4" />
            <span className="font-medium">{t('employees.importCSV')}</span>
          </button>
          <button 
            onClick={handleAddEmployee}
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
            <span className="font-medium">{t('employees.addEmployee')}</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className={`flex items-center space-x-4 ${isRTL ? 'space-x-reverse flex-row-reverse' : ''}`}>
            <div className="flex-1 relative">
              <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400`} />
              <input
                type="text"
                placeholder={t('employees.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full ${isRTL ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'} py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
            </div>
            <div className={`flex items-center space-x-2 ${isRTL ? 'space-x-reverse' : ''}`}>
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={`px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
              >
                <option value="all">{t('employees.allStatus')}</option>
                <option value="active">{t('employees.active')}</option>
                <option value="terminated">{t('employees.terminated')}</option>
                <option value="resigned">{t('employees.resigned')}</option>
                <option value="retired">{t('employees.retired')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '1200px' }}>
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
              <tr>
                <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider sticky ${isRTL ? 'right-0' : 'left-0'} z-30 bg-gray-50`}>
                  {t('employees.employee')}
                </th>
                <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  {t('employees.employeeNumber')}
                </th>
                <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  {t('employees.department')}
                </th>
                <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  {t('employees.totalShares')}
                </th>
                <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  {t('employees.vested')}
                </th>
                <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  {t('employees.unvested')}
                </th>
                <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  {t('employees.vestingProgress')}
                </th>
                <th className={`px-6 py-3 ${isRTL ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  {t('employees.status')}
                </th>
                <th className={`px-6 py-3 ${isRTL ? 'text-left' : 'text-right'} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  {t('employees.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">{t('employees.noEmployeesFound')}</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {searchTerm
                        ? t('employees.noEmployeesDesc')
                        : t('employees.noEmployeesDesc')}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50 transition group">
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 z-20 bg-white group-hover:bg-gray-50">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium text-sm">
                            {employee.first_name_en.charAt(0)}
                            {employee.last_name_en.charAt(0)}
                          </span>
                        </div>
                        <div className="ml-4">
                          <button
                            onClick={() => handleViewEmployee(employee)}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition text-left"
                          >
                            {employee.first_name_en} {employee.last_name_en}
                          </button>
                          <p className="text-xs text-gray-500">{employee.job_title || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{employee.employee_number}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {employee.department || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">
                        {employee.total_shares ? employee.total_shares.toLocaleString() : '0'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-green-600">
                        {employee.vested_shares ? employee.vested_shares.toLocaleString() : '0'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-blue-600">
                        {employee.unvested_shares ? employee.unvested_shares.toLocaleString() : '0'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-32">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 font-medium">
                            {employee.vesting_progress ? employee.vesting_progress.toFixed(0) : '0'}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{ backgroundColor: brandColor, width: `${employee.vesting_progress || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          statusColors[employee.employment_status]
                        }`}
                      >
                        {employee.employment_status}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap ${isRTL ? 'text-left' : 'text-right'}`}>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            const button = e.currentTarget;
                            const rect = button.getBoundingClientRect();
                            const menuHeight = 180; // Approximate height of the menu
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const spaceAbove = rect.top;
                            
                            // Check if there's enough space below, if not, position above
                            let top;
                            if (spaceBelow >= menuHeight + 10) {
                              // Enough space below
                              top = rect.bottom + 8;
                            } else if (spaceAbove >= menuHeight + 10) {
                              // Not enough space below, but enough above - position just above the button
                              top = rect.top - menuHeight + 5; // Reduced gap to make it closer
                            } else {
                              // Not enough space in either direction, default to below but adjust
                              top = window.innerHeight - menuHeight - 10;
                            }
                            
                            setMenuPosition({ top, left: rect.right - 192 });
                            setShowOptionsMenu(showOptionsMenu === employee.id ? null : employee.id);
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {showOptionsMenu === employee.id && menuPosition && (
                          <div
                            ref={menuRef}
                            className="fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-[9999]"
                            style={{
                              top: `${menuPosition.top}px`,
                              left: `${menuPosition.left}px`
                            }}
                          >
                            <button
                              onClick={() => handleViewEmployee(employee)}
                              className={`flex items-center space-x-2 w-full px-4 py-2 ${isRTL ? 'text-right space-x-reverse' : 'text-left'} text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg transition`}
                            >
                              <Eye className="w-4 h-4" />
                              <span>{t('employees.view')}</span>
                            </button>
                            <button
                              onClick={() => handleEditEmployee(employee)}
                              className={`flex items-center space-x-2 w-full px-4 py-2 ${isRTL ? 'text-right space-x-reverse' : 'text-left'} text-sm text-gray-700 hover:bg-gray-50 transition`}
                            >
                              <Edit className="w-4 h-4" />
                              <span>{t('employees.edit')}</span>
                            </button>
                            <button
                              onClick={() => handleSendCredentials(employee)}
                              className={`flex items-center space-x-2 w-full px-4 py-2 ${isRTL ? 'text-right space-x-reverse' : 'text-left'} text-sm text-blue-600 hover:bg-blue-50 transition`}
                            >
                              <Send className="w-4 h-4" />
                              <span>{t('employees.sendCredentials')}</span>
                            </button>
                            <button
                              onClick={() => handleDeleteEmployee(employee)}
                              className={`flex items-center space-x-2 w-full px-4 py-2 ${isRTL ? 'text-right space-x-reverse' : 'text-left'} text-sm text-red-600 hover:bg-red-50 rounded-b-lg transition`}
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>{t('employees.delete')}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredEmployees.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {filteredEmployees.length} of {employees.length} employees
              </p>
              <div className="flex items-center space-x-2">
                <button className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded transition">
                  Previous
                </button>
                <button className="px-3 py-1 text-sm text-white rounded" style={{ backgroundColor: brandColor }}>1</button>
                <button className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded transition">
                  2
                </button>
                <button className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded transition">
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showViewModal && selectedEmployee && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowViewModal(false);
              setEditingInViewModal(false);
              setSelectedEmployee(null);
            }
          }}
        >
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0">
              <div className="p-6 border-b border-gray-200 flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedEmployee.first_name_en} {selectedEmployee.last_name_en}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">Employee #{selectedEmployee.employee_number}</p>
                </div>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setEditingInViewModal(false);
                    setSelectedEmployee(null);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="border-b border-gray-200">
                <div className="flex space-x-8 px-6">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={`py-4 border-b-2 font-medium text-sm transition ${
                      activeTab === 'details'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Employee Details
                  </button>
                  <button
                    onClick={() => setActiveTab('financial')}
                    className={`py-4 border-b-2 font-medium text-sm transition ${
                      activeTab === 'financial'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Financial Overview
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* Basic Employee Information */}
                  {editingInViewModal ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Employee Number
                          </label>
                          <p className="text-gray-900 font-mono">{selectedEmployee.employee_number}</p>
                          <p className="text-xs text-gray-500 mt-1">Cannot be changed</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            National/Iqama ID <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={editForm.national_id || ''}
                            onChange={(e) => setEditForm({ ...editForm, national_id: e.target.value })}
                            placeholder="Enter National/Iqama ID"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            First Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={editForm.first_name_en}
                            onChange={(e) => setEditForm({ ...editForm, first_name_en: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Last Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={editForm.last_name_en}
                            onChange={(e) => setEditForm({ ...editForm, last_name_en: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Phone
                          </label>
                          <input
                            type="text"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Department
                          </label>
                          <input
                            type="text"
                            value={editForm.department}
                            onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Job Title
                          </label>
                          <input
                            type="text"
                            value={editForm.job_title}
                            onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Employment Status
                          </label>
                          <select
                            value={editForm.employment_status}
                            onChange={(e) => setEditForm({ ...editForm, employment_status: e.target.value as any })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="active">Active</option>
                            <option value="terminated">Terminated</option>
                            <option value="resigned">Resigned</option>
                            <option value="retired">Retired</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Hire Date
                          </label>
                          <input
                            type="date"
                            value={editForm.hire_date}
                            onChange={(e) => setEditForm({ ...editForm, hire_date: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="border-t border-gray-200 pt-4 mt-4">
                        <div className="flex items-center gap-2 mb-4">
                          <input
                            type="checkbox"
                            id="portal_access_enabled"
                            checked={editForm.portal_access_enabled}
                            onChange={(e) => setEditForm({ ...editForm, portal_access_enabled: e.target.checked })}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="portal_access_enabled" className="text-sm font-medium text-gray-700">
                            Enable Portal Access
                          </label>
                        </div>

                        {editForm.portal_access_enabled && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Portal Username
                              </label>
                              <input
                                type="text"
                                value={editForm.portal_username}
                                onChange={(e) => setEditForm({ ...editForm, portal_username: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Portal Password
                              </label>
                              <div className="relative">
                                <input
                                  type={showPassword ? "text" : "password"}
                                  value={editForm.portal_password}
                                  onChange={(e) => setEditForm({ ...editForm, portal_password: e.target.value })}
                                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                                  title={showPassword ? "Hide password" : "Show password"}
                                >
                                  <Eye className="w-5 h-5" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const generatedPassword = generatePassword(
                                    editForm.first_name_en,
                                    editForm.last_name_en
                                  );
                                  setEditForm({ ...editForm, portal_password: generatedPassword });
                                }}
                                className="mt-2 w-full px-3 py-2 text-white rounded-lg transition flex items-center justify-center gap-2"
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
                                title="Generate password based on employee name"
                              >
                                <RefreshCw className="w-4 h-4" />
                                Generate Password
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center gap-2 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => {
                            setEditingInViewModal(true);
                            setEditForm({
                              national_id: selectedEmployee.national_id || '',
                              first_name_en: selectedEmployee.first_name_en,
                              last_name_en: selectedEmployee.last_name_en,
                              email: selectedEmployee.email,
                              phone: selectedEmployee.phone || '',
                              department: selectedEmployee.department || '',
                              job_title: selectedEmployee.job_title || '',
                              employment_status: selectedEmployee.employment_status,
                              hire_date: selectedEmployee.hire_date || '',
                              portal_username: selectedEmployee.portal_username || '',
                              portal_password: selectedEmployee.portal_password || '',
                              portal_access_enabled: selectedEmployee.portal_access_enabled || false,
                            });
                          }}
                          className="px-4 py-2 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition flex items-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                        <div className="flex gap-2">
                          <button
                          onClick={() => {
                            setEditingInViewModal(false);
                            // Reset form to original values
                            setEditForm({
                              national_id: selectedEmployee.national_id || '',
                              first_name_en: selectedEmployee.first_name_en,
                              last_name_en: selectedEmployee.last_name_en,
                              email: selectedEmployee.email,
                              phone: selectedEmployee.phone || '',
                              department: selectedEmployee.department || '',
                              job_title: selectedEmployee.job_title || '',
                              employment_status: selectedEmployee.employment_status,
                              hire_date: selectedEmployee.hire_date || '',
                              portal_username: selectedEmployee.portal_username || '',
                              portal_password: selectedEmployee.portal_password || '',
                              portal_access_enabled: selectedEmployee.portal_access_enabled || false,
                            });
                          }}
                            className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={async () => {
                              await handleUpdateEmployee();
                              setEditingInViewModal(false);
                              await loadEmployees();
                              // Reload the selected employee to show updated data
                              const updatedEmployee = employees.find(e => e.id === selectedEmployee.id);
                              if (updatedEmployee) {
                                setSelectedEmployee(updatedEmployee);
                                await loadEmployeeFinancials(updatedEmployee.id);
                              }
                            }}
                            className="px-4 py-2 text-sm text-white rounded-lg transition"
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
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            Employee Number
                          </label>
                          <p className="text-gray-900">{selectedEmployee.employee_number}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            National/Iqama ID
                          </label>
                          <p className="text-gray-900 font-mono">
                            {selectedEmployee.national_id 
                              ? `ID: ${String(selectedEmployee.national_id).padStart(9, '0')}` 
                              : 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            Employment Status
                          </label>
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            statusColors[selectedEmployee.employment_status]
                          }`}>
                            {selectedEmployee.employment_status}
                          </span>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            Hire Date
                          </label>
                          <p className="text-gray-900">
                            {selectedEmployee.hire_date ? formatDate(selectedEmployee.hire_date) : 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            First Name
                          </label>
                          <p className="text-gray-900">{selectedEmployee.first_name_en}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            Last Name
                          </label>
                          <p className="text-gray-900">{selectedEmployee.last_name_en}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            Email
                          </label>
                          <p className="text-gray-900">{selectedEmployee.email}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            Phone
                          </label>
                          <p className="text-gray-900">{selectedEmployee.phone || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            Department
                          </label>
                          <p className="text-gray-900">{selectedEmployee.department || 'N/A'}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            Job Title
                          </label>
                          <p className="text-gray-900">{selectedEmployee.job_title || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="flex justify-start pt-4 border-t border-gray-200">
                        <button
                          onClick={() => {
                            setEditingInViewModal(true);
                            setEditForm({
                              national_id: selectedEmployee.national_id || '',
                              first_name_en: selectedEmployee.first_name_en,
                              last_name_en: selectedEmployee.last_name_en,
                              email: selectedEmployee.email,
                              phone: selectedEmployee.phone || '',
                              department: selectedEmployee.department || '',
                              job_title: selectedEmployee.job_title || '',
                              employment_status: selectedEmployee.employment_status,
                              hire_date: selectedEmployee.hire_date || '',
                              portal_username: selectedEmployee.portal_username || '',
                              portal_password: selectedEmployee.portal_password || '',
                              portal_access_enabled: selectedEmployee.portal_access_enabled || false,
                            });
                          }}
                          className="px-4 py-2 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition flex items-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Banking & Investment Account Information */}
                  <div className="border-t border-gray-200 pt-6">
                    <div className="border border-gray-200 rounded-lg p-6 bg-white">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">Banking & Investment Accounts</h3>
                        <div className="flex gap-2">
                          {employeeFinancialInfo?.account_status === 'verified' && (
                            <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                              ✓ Verified
                            </span>
                          )}
                          {employeeFinancialInfo?.account_status === 'pending' && (
                            <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                              ⏳ Pending
                            </span>
                          )}
                          {employeeFinancialInfo?.account_status === 'rejected' && (
                            <span className="px-3 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                              ✗ Rejected
                            </span>
                          )}
                          {!editingFinancialInfo ? (
                            <button
                              onClick={() => setEditingFinancialInfo(true)}
                              className="px-4 py-2 text-sm text-white rounded-lg transition"
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
                              {employeeFinancialInfo ? 'Edit' : 'Add Financial Info'}
                            </button>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveFinancialInfo}
                                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingFinancialInfo(false);
                                  if (employeeFinancialInfo) {
                                    setFinancialInfoForm({
                                      iban: employeeFinancialInfo.iban || '',
                                      bank_name: employeeFinancialInfo.bank_name || '',
                                      bank_branch_code: employeeFinancialInfo.bank_branch_code || '',
                                      account_holder_name_ar: employeeFinancialInfo.account_holder_name_ar || '',
                                      investment_account_number: employeeFinancialInfo.investment_account_number || '',
                                      broker_custodian_name: employeeFinancialInfo.broker_custodian_name || '',
                                      broker_account_number: employeeFinancialInfo.broker_account_number || '',
                                      tadawul_investor_number: employeeFinancialInfo.tadawul_investor_number || '',
                                    });
                                  }
                                }}
                                className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {editingFinancialInfo ? (
                        <div className="space-y-6">
                          {/* Banking Information Section */}
                          <div className="border-t border-gray-200 pt-6">
                            <h4 className="text-md font-semibold text-gray-900 mb-4">Banking Information (for Cash Transfers)</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  IBAN <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={financialInfoForm.iban}
                                  onChange={(e) => setFinancialInfoForm({ ...financialInfoForm, iban: e.target.value })}
                                  placeholder="SAXX XXXX XXXX XXXX XXXX XXXX"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Bank Name
                                </label>
                                <input
                                  type="text"
                                  value={financialInfoForm.bank_name}
                                  onChange={(e) => setFinancialInfoForm({ ...financialInfoForm, bank_name: e.target.value })}
                                  placeholder="e.g., Al Rajhi Bank"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Branch Code
                                </label>
                                <input
                                  type="text"
                                  value={financialInfoForm.bank_branch_code}
                                  onChange={(e) => setFinancialInfoForm({ ...financialInfoForm, bank_branch_code: e.target.value })}
                                  placeholder="Branch code"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Account Holder Name (Arabic)
                                </label>
                                <input
                                  type="text"
                                  value={financialInfoForm.account_holder_name_ar}
                                  onChange={(e) => setFinancialInfoForm({ ...financialInfoForm, account_holder_name_ar: e.target.value })}
                                  placeholder="الاسم بالعربية"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  dir="rtl"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Investment Account Section */}
                          <div className="border-t border-gray-200 pt-6">
                            <h4 className="text-md font-semibold text-gray-900 mb-4">Investment Account Information (for Share Transfers)</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Investment Account Number (Nostro)
                                </label>
                                <input
                                  type="text"
                                  value={financialInfoForm.investment_account_number}
                                  onChange={(e) => setFinancialInfoForm({ ...financialInfoForm, investment_account_number: e.target.value })}
                                  placeholder="Custody account number"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Broker/Custodian Name
                                </label>
                                <input
                                  type="text"
                                  value={financialInfoForm.broker_custodian_name}
                                  onChange={(e) => setFinancialInfoForm({ ...financialInfoForm, broker_custodian_name: e.target.value })}
                                  placeholder="e.g., NCB Capital, Al Rajhi Capital"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Broker Account Number
                                </label>
                                <input
                                  type="text"
                                  value={financialInfoForm.broker_account_number}
                                  onChange={(e) => setFinancialInfoForm({ ...financialInfoForm, broker_account_number: e.target.value })}
                                  placeholder="Broker account number"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Tadawul Investor Number
                                </label>
                                <input
                                  type="text"
                                  value={financialInfoForm.tadawul_investor_number}
                                  onChange={(e) => setFinancialInfoForm({ ...financialInfoForm, tadawul_investor_number: e.target.value })}
                                  placeholder="Tadawul investor number"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* Display Mode */}
                          {employeeFinancialInfo ? (
                            <>
                              <div className="border-t border-gray-200 pt-6">
                                <h4 className="text-md font-semibold text-gray-900 mb-4">Banking Information</h4>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-1">IBAN</label>
                                    <p className="text-gray-900">{employeeFinancialInfo.iban || 'Not provided'}</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-1">Bank Name</label>
                                    <p className="text-gray-900">{employeeFinancialInfo.bank_name || 'Not provided'}</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-1">Branch Code</label>
                                    <p className="text-gray-900">{employeeFinancialInfo.bank_branch_code || 'Not provided'}</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-1">Account Holder (Arabic)</label>
                                    <p className="text-gray-900" dir="rtl">{employeeFinancialInfo.account_holder_name_ar || 'Not provided'}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="border-t border-gray-200 pt-6">
                                <h4 className="text-md font-semibold text-gray-900 mb-4">Investment Account Information</h4>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-1">Investment Account Number</label>
                                    <p className="text-gray-900 font-mono text-sm">{employeeFinancialInfo.investment_account_number ? '••••••••' : 'Not provided'}</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-1">Broker/Custodian</label>
                                    <p className="text-gray-900">{employeeFinancialInfo.broker_custodian_name || 'Not provided'}</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-1">Broker Account Number</label>
                                    <p className="text-gray-900 font-mono text-sm">{employeeFinancialInfo.broker_account_number ? '••••••••' : 'Not provided'}</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-1">Tadawul Investor Number</label>
                                    <p className="text-gray-900">{employeeFinancialInfo.tadawul_investor_number || 'Not provided'}</p>
                                  </div>
                                </div>
                              </div>

                              {employeeFinancialInfo.account_verification_date && (
                                <div className="border-t border-gray-200 pt-4 mt-4">
                                  <p className="text-sm text-gray-600">
                                    Verified on {formatDate(employeeFinancialInfo.account_verification_date)}
                                  </p>
                                </div>
                              )}

                              {/* Verification Buttons (for finance admins only) */}
                              {employeeFinancialInfo.account_status === 'pending' && (
                                <div className="border-t border-gray-200 pt-4 mt-4 flex gap-2">
                                  <button
                                    onClick={() => handleVerifyFinancialInfo('verified')}
                                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                                  >
                                    ✓ Verify Account
                                  </button>
                                  <button
                                    onClick={() => handleVerifyFinancialInfo('rejected')}
                                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                                  >
                                    ✗ Reject
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-center py-8 text-gray-500">
                              <p>No financial information available. Click "Add Financial Info" to add banking and investment account details.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'financial' && (
                <div className="space-y-6">
                  {loadingFinancials ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-gray-500">Loading financial data...</div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Overview</h3>
                        <div className="flex items-start gap-6">
                          <div className="flex-1 grid grid-cols-2 gap-4">
                            <div className="bg-white rounded-lg p-4 shadow-sm">
                              <p className="text-sm text-gray-600 mb-1">Total Granted Shares</p>
                              <p className="text-2xl font-bold text-gray-900">
                                {employeeShares?.total_shares?.toLocaleString() || '0'}
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 shadow-sm">
                              <p className="text-sm text-gray-600 mb-1">Vested Shares</p>
                              <p className="text-2xl font-bold text-green-600">
                                {employeeShares?.vested_shares?.toLocaleString() || '0'}
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 shadow-sm">
                              <p className="text-sm text-gray-600 mb-1">Unvested Shares</p>
                              <p className="text-2xl font-bold text-blue-600">
                                {employeeShares?.unvested_shares?.toLocaleString() || '0'}
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 shadow-sm">
                              <p className="text-sm text-gray-600 mb-1">Total Value</p>
                              <p className="text-xl font-bold text-gray-900">
                                {employeeShares?.market_value
                                  ? `${employeeShares.market_value.toLocaleString()} SAR`
                                  : 'N/A'}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-center">
                            <div className="relative w-32 h-32">
                              <svg className="transform -rotate-90 w-32 h-32">
                                <circle
                                  cx="64"
                                  cy="64"
                                  r="56"
                                  stroke="#e5e7eb"
                                  strokeWidth="16"
                                  fill="none"
                                />
                                <circle
                                  cx="64"
                                  cy="64"
                                  r="56"
                                  stroke="#10b981"
                                  strokeWidth="16"
                                  fill="none"
                                  strokeDasharray={`${((employeeShares?.vested_shares || 0) / (employeeShares?.total_shares || 1)) * 351.86} 351.86`}
                                  strokeLinecap="round"
                                />
                                <circle
                                  cx="64"
                                  cy="64"
                                  r="56"
                                  stroke="#3b82f6"
                                  strokeWidth="16"
                                  fill="none"
                                  strokeDasharray={`${((employeeShares?.unvested_shares || 0) / (employeeShares?.total_shares || 1)) * 351.86} 351.86`}
                                  strokeDashoffset={`-${((employeeShares?.vested_shares || 0) / (employeeShares?.total_shares || 1)) * 351.86}`}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center flex-col">
                                <span className="text-xs text-gray-600">Vesting</span>
                                <span className="text-lg font-bold text-gray-900">
                                  {employeeShares?.total_shares > 0
                                    ? `${((employeeShares?.vested_shares || 0) / employeeShares.total_shares * 100).toFixed(0)}%`
                                    : '0%'}
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 space-y-1 text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <span className="text-gray-600">Vested</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                <span className="text-gray-600">Unvested</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Grant Timeline */}
                      {employeeGrants.length > 0 && (
                        <div className="border border-gray-200 rounded-lg p-6 bg-gradient-to-b from-gray-50 to-white">
                          <div className="mb-4 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-gray-900">Grant Timeline</h3>
                          </div>
                          
                          <div className="space-y-4">
                            {(() => {
                              // Calculate timeline range
                              const activeGrants = employeeGrants.filter(g => 
                                g.vesting_start_date && g.vesting_end_date && 
                                (g.status === 'active' || g.status === 'pending_signature')
                              );
                              
                              if (activeGrants.length === 0) return null;
                              
                              const dates = activeGrants.flatMap(g => [
                                new Date(g.vesting_start_date),
                                new Date(g.vesting_end_date)
                              ]);
                              
                              const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
                              const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
                              // Use exact grant period without padding
                              const startDate = minDate;
                              const endDate = maxDate;
                              const totalRange = endDate.getTime() - startDate.getTime();
                              
                              const getPosition = (date: string) => {
                                const dateTime = new Date(date).getTime();
                                return ((dateTime - startDate.getTime()) / totalRange) * 100;
                              };
                              
                              const generateYearLabels = () => {
                                const yearLabels = [];
                                const startYear = startDate.getFullYear();
                                const endYear = endDate.getFullYear();
                                
                                // Always include all years from startYear to endYear
                                for (let year = startYear; year <= endYear; year++) {
                                  let position = 0;
                                  
                                  // Try to calculate position based on Jan 1 of that year
                                  const yearDate = new Date(year, 0, 1);
                                  if (yearDate >= startDate && yearDate <= endDate) {
                                    // Jan 1 falls within range, use actual position
                                    position = getPosition(yearDate.toISOString().split('T')[0]);
                                  } else {
                                    // Jan 1 doesn't fall in range
                                    if (year === startYear) {
                                      // First year: position at -5% to place it before the timeline
                                      position = -5;
                                    } else if (year === endYear) {
                                      // Last year: position at end
                                      position = 100;
                                    } else {
                                      // Middle year: interpolate based on year position
                                      position = ((year - startYear) / (endYear - startYear)) * 100;
                                    }
                                  }
                                  
                                  yearLabels.push({ year, position });
                                }
                                
                                return yearLabels;
                              };
                              
                              return (
                                <>
                                  {activeGrants.map((grant) => {
                                    const grantStart = getPosition(grant.vesting_start_date);
                                    const grantEnd = getPosition(grant.vesting_end_date);
                                    const grantWidth = grantEnd - grantStart;
                                    const vestedShares = (grant as any).computed_vested_shares || Number(grant.vested_shares) || 0;
                                    const totalShares = Number(grant.total_shares) || 0;
                                    const vestedPercentage = totalShares > 0 ? (vestedShares / totalShares) * 100 : 0;
                                    const planName = grant.incentive_plans?.plan_name_en || 'Unknown Plan';
                                    
                                    return (
                                      <div key={grant.id} className="relative">
                                        <div className="flex items-center">
                                          <div className="w-40 text-sm font-medium text-gray-700 truncate" title={planName}>
                                            {planName}
                                          </div>
                                          <div className="text-xs text-gray-500 ml-2 mr-4">
                                            {totalShares.toLocaleString()}/{vestedShares.toLocaleString()} shares
                                          </div>
                                          <div 
                                            className="relative h-8 flex-1 cursor-pointer"
                                            onMouseEnter={(e) => {
                                              setHoveredGrant(grant.id);
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              setTooltipPosition({
                                                x: rect.left + rect.width / 2,
                                                y: rect.top - 10
                                              });
                                            }}
                                            onMouseMove={(e) => {
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              setTooltipPosition({
                                                x: e.clientX,
                                                y: rect.top - 10
                                              });
                                            }}
                                            onMouseLeave={() => {
                                              setHoveredGrant(null);
                                              setTooltipPosition(null);
                                            }}
                                          >
                                            {/* Grant Period Bar */}
                                            <div 
                                              className="absolute inset-y-0 left-0 flex rounded-lg overflow-hidden"
                                              style={{ width: `${grantWidth}%`, left: `${grantStart}%` }}
                                            >
                                              {/* Vested Segment */}
                                              {vestedPercentage > 0 && (
                                                <div 
                                                  className="bg-gradient-to-r from-blue-400 to-blue-300 h-full flex items-center justify-center"
                                                  style={{ width: `${vestedPercentage}%` }}
                                                >
                                                  <span className="text-xs font-semibold text-white px-2 truncate">
                                                    {vestedPercentage >= 15 ? `${Math.floor(vestedPercentage)}%` : ''}
                                                  </span>
                                                </div>
                                              )}
                                              
                                              {/* Future Unvested Segment */}
                                              <div 
                                                className="bg-gradient-to-r from-gray-200 to-gray-100 h-full flex items-center justify-center"
                                                style={{ width: `${100 - vestedPercentage}%` }}
                                              >
                                                <span className="text-xs font-medium text-gray-600">
                                                  Future
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  
                                  {/* Time Scale */}
                                  <div className="flex items-center mt-4">
                                    <div className="w-40"></div>
                                    <div className="ml-2 mr-4">
                                      <div className="w-20"></div>
                                    </div>
                                    <div className="relative h-6 flex-1 border-t-2 border-gray-300">
                                      <div className="absolute inset-x-0 -top-4">
                                        {generateYearLabels().map((label, idx) => (
                                          <div 
                                            key={idx} 
                                            className="absolute text-xs text-gray-600 font-medium"
                                            style={{ left: `${label.position}%`, transform: 'translateX(-50%)' }}
                                          >
                                            {label.year}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                          
                          {/* Legend */}
                          <div className="mt-6 flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded bg-blue-400"></div>
                              <span className="text-gray-700">Vested</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded bg-gray-200"></div>
                              <span className="text-gray-700">Unvested</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Tooltip */}
                      {hoveredGrant && tooltipPosition && (() => {
                        const grant = employeeGrants.find(g => g.id === hoveredGrant);
                        if (!grant) return null;
                        
                        const vestedShares = (grant as any).computed_vested_shares || Number(grant.vested_shares) || 0;
                        const totalShares = Number(grant.total_shares) || 0;
                        const unvestedShares = totalShares - vestedShares;
                        const vestedPercentage = totalShares > 0 ? (vestedShares / totalShares) * 100 : 0;
                        const planName = grant.incentive_plans?.plan_name_en || 'Unknown Plan';
                        const totalTransferred = (grant as any).total_transferred || 0;
                        const totalExercised = (grant as any).total_exercised || 0;
                        
                        return (
                          <div 
                            className="fixed z-50 bg-gray-900 text-white text-sm rounded-lg px-4 py-3 shadow-xl pointer-events-none whitespace-nowrap"
                            style={{
                              left: `${tooltipPosition.x}px`,
                              top: `${tooltipPosition.y}px`,
                              transform: 'translate(-50%, -100%)'
                            }}
                          >
                            <div className="font-semibold text-base mb-2">{planName}</div>
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-gray-300">Total Shares:</span>
                                <span className="font-medium">{totalShares.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-gray-300">Vested:</span>
                                <span className="font-medium text-green-400">
                                  {vestedShares.toLocaleString()} ({vestedPercentage.toFixed(1)}%)
                                </span>
                              </div>
                              {totalTransferred > 0 && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-gray-300">Transferred:</span>
                                  <span className="font-medium text-purple-400">
                                    {totalTransferred.toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {totalExercised > 0 && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-gray-300">Exercised:</span>
                                  <span className="font-medium text-orange-400">
                                    {totalExercised.toLocaleString()}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-gray-300">Unvested:</span>
                                <span className="font-medium text-blue-400">
                                  {unvestedShares.toLocaleString()} ({(100 - vestedPercentage).toFixed(1)}%)
                                </span>
                              </div>
                              <div className="border-t border-gray-700 pt-1 mt-1">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-gray-300">Period:</span>
                                  <span className="font-medium">
                                    {formatDate(grant.vesting_start_date)} - {formatDate(grant.vesting_end_date)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Grants</h3>
                        {employeeGrants.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            No grants found for this employee
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {employeeGrants.map((grant) => (
                              <div key={grant.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition">
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <h4 className="font-semibold text-gray-900">
                                      {grant.incentive_plans?.plan_name_en || 'Unknown Plan'}
                                    </h4>
                                    <p className="text-sm text-gray-500 mt-1">
                                      Grant Date: {formatDate(grant.grant_date)}
                                    </p>
                                  </div>
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                    grant.status === 'active' ? 'bg-green-100 text-green-800' :
                                    grant.status === 'vested' ? 'bg-blue-100 text-blue-800' :
                                    grant.status === 'expired' ? 'bg-red-100 text-red-800' :
                                    grant.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {grant.status}
                                  </span>
                                </div>

                                {(() => {
                                  const computedVested = (grant as any).computed_vested_shares || Number(grant.vested_shares) || 0;
                                  return (
                                    <div className="grid grid-cols-4 gap-4 text-sm">
                                      <div>
                                        <p className="text-gray-600 mb-1">Total Shares</p>
                                        <p className="font-semibold text-gray-900">{Number(grant.total_shares)?.toLocaleString()}</p>
                                      </div>
                                      <div>
                                        <p className="text-gray-600 mb-1">Vested Shares</p>
                                        <p className="font-semibold text-gray-900">{computedVested.toLocaleString()}</p>
                                      </div>
                                      <div>
                                        <p className="text-gray-600 mb-1">Exercise Price</p>
                                        <p className="font-semibold text-gray-900">
                                          {Number(grant.incentive_plans?.exercise_price)?.toLocaleString()} SAR
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-gray-600 mb-1">Total Value</p>
                                        <p className="font-semibold text-gray-900">
                                          {(computedVested * (Number(grant.incentive_plans?.exercise_price) || 0)).toLocaleString()} SAR
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {grant.vesting_end_date && grant.total_shares && (() => {
                                  const computedVested = (grant as any).computed_vested_shares || Number(grant.vested_shares) || 0;
                                  const progressPercentage = (computedVested / Number(grant.total_shares)) * 100;
                                  return (
                                    <div className="mt-3 pt-3 border-t border-gray-100">
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-600">Vesting Progress</span>
                                        <span className="text-gray-900 font-medium">
                                          {progressPercentage.toFixed(1)}%
                                        </span>
                                      </div>
                                      <div className="mt-2 bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div
                                          className="bg-blue-600 h-full transition-all"
                                          style={{ width: `${progressPercentage}%` }}
                                        />
                                      </div>
                                      <p className="text-xs text-gray-500 mt-2">
                                        Vesting ends: {formatDate(grant.vesting_end_date)}
                                      </p>
                                    </div>
                                  );
                                })()}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Fixed Footer */}
            <div className="flex-shrink-0 p-6 border-t border-gray-200 bg-white flex items-center justify-end">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setEditingInViewModal(false);
                  setSelectedEmployee(null);
                  setEmployeeGrants([]);
                  setEmployeeShares(null);
                }}
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
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Edit Employee</h2>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    National/Iqama ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.national_id || ''}
                    onChange={(e) => setEditForm({ ...editForm, national_id: e.target.value })}
                    placeholder="Enter National/Iqama ID"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Employee Number
                  </label>
                  <p className="px-4 py-2 text-gray-600 bg-gray-50 rounded-lg border border-gray-200">
                    {selectedEmployee.employee_number}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Cannot be changed</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={editForm.first_name_en}
                    onChange={(e) => setEditForm({ ...editForm, first_name_en: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={editForm.last_name_en}
                    onChange={(e) => setEditForm({ ...editForm, last_name_en: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Department
                  </label>
                  <input
                    type="text"
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={editForm.job_title}
                    onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Employment Status
                  </label>
                  <select
                    value={editForm.employment_status}
                    onChange={(e) => setEditForm({ ...editForm, employment_status: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="terminated">Terminated</option>
                    <option value="resigned">Resigned</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hire Date
                  </label>
                  <input
                    type="date"
                    value={editForm.hire_date}
                    onChange={(e) => setEditForm({ ...editForm, hire_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Portal Credentials Section */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Employee Portal Credentials</h3>
                
                <div className="flex items-center space-x-2 mb-4">
                  <input
                    type="checkbox"
                    id="portal_access_enabled"
                    checked={editForm.portal_access_enabled}
                    onChange={(e) => setEditForm({ ...editForm, portal_access_enabled: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="portal_access_enabled" className="text-sm font-medium text-gray-700">
                    Enable Employee Portal Access
                  </label>
                </div>

                {editForm.portal_access_enabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Portal Username
                      </label>
                      <input
                        type="text"
                        value={editForm.portal_username}
                        onChange={(e) => setEditForm({ ...editForm, portal_username: e.target.value })}
                        placeholder="Enter username for employee portal"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Portal Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={editForm.portal_password}
                          onChange={(e) => setEditForm({ ...editForm, portal_password: e.target.value })}
                          placeholder="Enter password for employee portal"
                          className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                          title={showPassword ? "Hide password" : "Show password"}
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const generatedPassword = generatePassword(
                            editForm.first_name_en,
                            editForm.last_name_en
                          );
                          setEditForm({ ...editForm, portal_password: generatedPassword });
                        }}
                        className="mt-2 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                        title="Generate password based on employee name"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Generate Password
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="flex-shrink-0 p-6 border-t border-gray-200 bg-white flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedEmployee(null);
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateEmployee}
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

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Add New Employee</h2>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={addForm.first_name_en}
                    onChange={(e) => setAddForm({ ...addForm, first_name_en: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={addForm.last_name_en}
                    onChange={(e) => setAddForm({ ...addForm, last_name_en: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={(e) => {
                      const emailValue = e.target.value;
                      // Don't allow superadmin@derayah.com
                      if (emailValue !== 'superadmin@derayah.com') {
                        setAddForm({ 
                          ...addForm, 
                          email: emailValue,
                          // If portal access is enabled, update portal username with email
                          portal_username: addForm.portal_access_enabled ? emailValue : addForm.portal_username
                        });
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="employee@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Department
                  </label>
                  <input
                    type="text"
                    value={addForm.department}
                    onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={addForm.job_title}
                    onChange={(e) => setAddForm({ ...addForm, job_title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Employment Status
                  </label>
                  <select
                    value={addForm.employment_status}
                    onChange={(e) => setAddForm({ ...addForm, employment_status: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="terminated">Terminated</option>
                    <option value="resigned">Resigned</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hire Date
                  </label>
                  <input
                    type="date"
                    value={addForm.hire_date}
                    onChange={(e) => setAddForm({ ...addForm, hire_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Portal Access Section */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Employee Portal Access</h3>
                
                <div className="flex items-center space-x-3 mb-4">
                  <input
                    type="checkbox"
                    id="portal_access_enabled"
                    checked={addForm.portal_access_enabled}
                    onChange={(e) => {
                      const shouldEnable = e.target.checked;
                      
                      // Check if email is empty
                      if (shouldEnable && !addForm.email) {
                        alert('Please add employee email first before enabling portal access.');
                        return;
                      }
                      
                      // Check if email is superadmin@derayah.com
                      if (shouldEnable && addForm.email === 'superadmin@derayah.com') {
                        alert('Cannot use superadmin@derayah.com as employee email.');
                        return;
                      }
                      
                      // Enable portal access and auto-populate portal username with email
                      setAddForm({ 
                        ...addForm, 
                        portal_access_enabled: shouldEnable,
                        // Set portal username to employee email when enabling
                        portal_username: shouldEnable && addForm.email ? addForm.email : addForm.portal_username
                      });
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="portal_access_enabled" className="text-sm font-medium text-gray-700">
                    Enable Employee Portal Access
                  </label>
                </div>

                {addForm.portal_access_enabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Portal Username
                      </label>
                      <input
                        type="text"
                        value={addForm.portal_username && addForm.portal_username !== 'superadmin@derayah.com'
                          ? addForm.portal_username 
                          : (addForm.email || '')}
                        onChange={(e) => {
                          const usernameValue = e.target.value;
                          // Don't allow superadmin@derayah.com
                          if (usernameValue !== 'superadmin@derayah.com') {
                            setAddForm({ ...addForm, portal_username: usernameValue });
                          }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={addForm.email || "employee@example.com"}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Portal Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={addForm.portal_password}
                          onChange={(e) => setAddForm({ ...addForm, portal_password: e.target.value })}
                          className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Enter password for portal access"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                          title={showPassword ? "Hide password" : "Show password"}
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const generatedPassword = generatePassword(
                            addForm.first_name_en,
                            addForm.last_name_en
                          );
                          setAddForm({ ...addForm, portal_password: generatedPassword });
                        }}
                        className="mt-2 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                        title="Generate password based on employee name"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Generate Password
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="flex-shrink-0 p-6 border-t border-gray-200 bg-white flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateEmployee}
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
                Create Employee
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
