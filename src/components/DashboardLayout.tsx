import { ReactNode, useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import LanguageSwitcher from './LanguageSwitcher';
import { useCompanyColor } from '../hooks/useCompanyColor';
import { usePlatformLogo } from '../hooks/usePlatformLogo';
import {
  Building2,
  LayoutDashboard,
  Users,
  FileText,
  Award,
  TrendingUp,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  PieChart,
  Calendar,
  Clock,
  Target,
  UserCircle,
  Users as UsersIcon,
  ArrowRightLeft,
  ShieldCheck,
  Languages,
  CreditCard,
  Briefcase,
  Map,
  ShoppingCart,
  DollarSign,
  Globe,
} from 'lucide-react';

type PermissionKey =
  | 'dashboard'
  | 'users'
  | 'employees'
  | 'ltip_pools'
  | 'plans'
  | 'vesting_schedules'
  | 'vesting_events'
  | 'transfers'
  | 'performance_metrics'
  | 'grants'
  | 'documents'
  | 'cap_table'
  | 'portfolio'
  | 'settings'
  | 'approve_cash_transfers';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: PermissionKey | null;
}

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { t, i18n } = useTranslation();
  const {
    user,
    signOut,
    userRole,
    activeCompanyId,
    activeCompanyName,
    setActiveCompany,
    clearActiveCompany,
    isSuperAdmin,
    getCurrentCompanyId,
    onboardingProgress,
    isOnboardingComplete,
    onboardingLoaded,
    hasPermission,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isRTL = i18n.language === 'ar';
  // Initialize sidebar as closed on mobile, open on desktop
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      // Use matchMedia for more reliable detection (matches Tailwind's lg breakpoint)
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
      return isDesktop;
    }
    return false;
  });
  const [dueEventsCount, setDueEventsCount] = useState<number>(0);
  const [draftContractsCount, setDraftContractsCount] = useState<number>(0);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean> | null>(null);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [companyOptions, setCompanyOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const { brandColor, getBgColor, getColorWithOpacity } = useCompanyColor();
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyLogoScale, setCompanyLogoScale] = useState<number>(1);
  const [companyDisplayName, setCompanyDisplayName] = useState<string | null>(null);
  const { logoUrl: platformLogoUrl, logoScale: platformLogoScale, platformNameEn, platformNameAr } = usePlatformLogo();

  const isSuperAdminUser = useMemo(() => {
    // Explicitly check: only show operator navigation if user_type is 'super_admin'
    // AND they don't have a company_id (super admins are platform-level, not company-specific)
    // CRITICAL: If user has ANY company_id, they are NOT a platform super admin
    if (!userRole) return false;
    
    // Safety check: if user has a company_id, they are a company-level user, not platform super admin
    if (userRole.company_id !== null && userRole.company_id !== undefined) {
      console.log('⚠️ User has company_id, treating as company-level user, not platform super admin');
      return false;
    }
    
    // Only show operator console for true platform super admins (no company association)
    return userRole.user_type === 'super_admin' && userRole.company_id === null;
  }, [userRole?.user_type, userRole?.company_id, activeCompanyId]);
  const onboardingStatus = useMemo(() => {
    if (!onboardingProgress) {
      return { completed: 0, total: 5 };
    }

    const steps = [
      onboardingProgress.has_pool,
      onboardingProgress.has_vesting_schedule,
      onboardingProgress.has_plan,
      onboardingProgress.has_employee,
      onboardingProgress.has_grant,
    ];

    const completed = steps.filter(Boolean).length;
    return { completed, total: steps.length };
  }, [onboardingProgress]);

  const onboardingIncomplete = onboardingLoaded && !isOnboardingComplete();

  // Helper function to check if we're on mobile
  const isMobile = () => {
    return typeof window !== 'undefined' && window.innerWidth < 1024;
  };

  // Handle window resize to update sidebar state
  useEffect(() => {
    // Immediately check and set state on mount to prevent flash
    const checkAndSetSidebar = () => {
      const mediaQuery = window.matchMedia('(min-width: 1024px)');
      const isDesktop = mediaQuery.matches;
      
      // On mobile, always start with sidebar closed
      if (!isDesktop) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
      
      return mediaQuery;
    };
    
    const mediaQuery = checkAndSetSidebar();
    
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setSidebarOpen(e.matches);
    };
    
    // Listen for changes (modern browsers)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (isMobile()) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        if (!user) {
          setPermissions(null);
          setLoadingPermissions(false);
          return;
        }

        const { data, error } = await supabase
          .from('company_users')
          .select('permissions, company_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        const rawPermissions = (data?.permissions ?? {}) as Record<string, boolean>;
        if (!data) {
          setPermissions(null);
          return;
        }

        if (!isSuperAdminUser && data.company_id && !activeCompanyId) {
          setActiveCompany(data.company_id, null);
        }

        const normalizedPermissions = (Object.keys(rawPermissions).reduce(
          (acc, key) => {
            if ((key as PermissionKey) in acc) {
              acc[key as PermissionKey] = Boolean(rawPermissions[key]);
            }
            return acc;
          },
          {
            dashboard: true,
            users: false,
            employees: false,
            ltip_pools: false,
            plans: false,
            vesting_schedules: false,
            vesting_events: false,
            transfers: false,
            performance_metrics: false,
            grants: false,
            documents: false,
            cap_table: false,
            portfolio: false,
            settings: false,
          } as Record<PermissionKey, boolean>
        ));

        normalizedPermissions.dashboard = true;

        setPermissions(normalizedPermissions);
      } catch (error) {
        console.error('Error loading permissions:', error);
        setPermissions(null);
      } finally {
        setLoadingPermissions(false);
      }
    };

    loadPermissions();
  }, [user, userRole?.user_type, activeCompanyId, isSuperAdminUser, setActiveCompany]);

  useEffect(() => {
    const loadCompanyBranding = async () => {
      try {
        const companyId = getCurrentCompanyId();
        if (!companyId) {
          setCompanyLogoUrl(null);
          setCompanyDisplayName(null);
          return;
        }

        const { data, error } = await supabase
          .from('companies')
          .select('company_name_en, company_name_ar, logo_url, logo_scale')
          .eq('id', companyId)
          .maybeSingle();

        if (error) {
          console.error('Error loading company branding:', error);
          setCompanyLogoUrl(null);
          setCompanyDisplayName(null);
          return;
        }

        setCompanyLogoUrl(data?.logo_url ?? null);
        setCompanyLogoScale(
          typeof data?.logo_scale === 'number' && !Number.isNaN(data.logo_scale)
            ? (data.logo_scale as number)
            : 1
        );
        setCompanyDisplayName(
          (data?.company_name_en as string) ||
            (data?.company_name_ar as string) ||
            null
        );
      } catch (error) {
        console.error('Error loading company branding:', error);
        setCompanyLogoUrl(null);
        setCompanyDisplayName(null);
      }
    };

    loadCompanyBranding();
  }, [getCurrentCompanyId, activeCompanyId]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const loadDueEventsCount = async () => {
    try {
      if (!user) return;

      const companyId = getCurrentCompanyId();
      if (!companyId) {
        setDueEventsCount(0);
        return;
      }

      // Count due vesting events (with client-side filtering for future dates)
      const { data: events, error } = await supabase
        .from('vesting_events')
        .select('id, vesting_date, status')
        .eq('company_id', companyId)
        .eq('status', 'due');

      if (error) throw error;

      // Filter out events that shouldn't be due (client-side fix)
      const today = new Date();
      const actuallyDueEvents = (events || []).filter(event => {
        const vestingDate = new Date(event.vesting_date);
        return vestingDate <= today;
      });

      setDueEventsCount(actuallyDueEvents.length);
    } catch (error) {
      console.error('Error loading due events count:', error);
      setDueEventsCount(0);
    }
  };

  const loadDraftContractsCount = async () => {
    try {
      if (!user || !userRole) {
        setDraftContractsCount(0);
        return;
      }

      const companyId = getCurrentCompanyId();
      if (!companyId) {
        setDraftContractsCount(0);
        return;
      }

      // Check if user can approve contracts
      const canApprove = 
        userRole.user_type === 'super_admin' ||
        userRole.role === 'super_admin' ||
        userRole.role === 'finance_admin' ||
        ((userRole.role === 'hr_admin' || userRole.role === 'operations_admin' || userRole.role === 'legal_admin' || userRole.role === 'company_admin') && hasPermission('contract_approval'));

      if (!canApprove) {
        setDraftContractsCount(0);
        return;
      }

      // Count draft contracts for this company
      const { data: documents, error } = await supabase
        .from('generated_documents')
        .select('id, status')
        .eq('company_id', companyId)
        .eq('status', 'draft');

      if (error) throw error;

      setDraftContractsCount((documents || []).length);
    } catch (error) {
      console.error('Error loading draft contracts count:', error);
      setDraftContractsCount(0);
    }
  };

  useEffect(() => {
    loadDueEventsCount();
    loadDraftContractsCount();
    
    // Refresh count every 5 minutes
    const interval = setInterval(() => {
      loadDueEventsCount();
      loadDraftContractsCount();
    }, 5 * 60 * 1000);
    
    // Listen for custom events to refresh count
    const handleRefreshCount = () => {
      loadDueEventsCount();
      loadDraftContractsCount();
    };
    window.addEventListener('refreshVestingEventsCount', handleRefreshCount);
    window.addEventListener('refreshDraftContractsCount', handleRefreshCount);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('refreshVestingEventsCount', handleRefreshCount);
      window.removeEventListener('refreshDraftContractsCount', handleRefreshCount);
    };
  }, [user, userRole, getCurrentCompanyId, hasPermission]);

  // Refresh count when navigating to different pages
  useEffect(() => {
    loadDueEventsCount();
    loadDraftContractsCount();
  }, [location.pathname, activeCompanyId]);

  useEffect(() => {
    if (!isSuperAdminUser) {
      setCompanyOptions([]);
      return;
    }

    const loadCompanies = async () => {
      try {
        setLoadingCompanies(true);
        const { data, error } = await supabase
          .from('companies')
          .select('id, company_name_en, company_name_ar')
          .order('company_name_en', { ascending: true });

        if (error) throw error;

        const options = (data || []).map((company) => ({
          id: company.id as string,
          name: (company.company_name_en || company.company_name_ar || 'Untitled Company') as string,
        }));

        setCompanyOptions(options);
      } catch (error) {
        console.error('Failed to load company list for super admin:', error);
        setCompanyOptions([]);
      } finally {
        setLoadingCompanies(false);
      }
    };

    loadCompanies();
  }, [isSuperAdminUser]);

  const baseNavigation: NavigationItem[] = useMemo(
    () => [
      { name: t('common.overview'), href: '/dashboard', icon: LayoutDashboard, permission: 'dashboard' },
      { name: t('common.users'), href: '/dashboard/users', icon: UsersIcon, permission: 'users' },
      { name: t('common.employees'), href: '/dashboard/employees', icon: Users, permission: 'employees' },
      { name: t('common.ltipPools'), href: '/dashboard/ltip-pools', icon: ArrowRightLeft, permission: 'ltip_pools' },
      { name: t('common.incentivePlans'), href: '/dashboard/plans', icon: FileText, permission: 'plans' },
      { name: t('common.vestingSchedules'), href: '/dashboard/vesting-schedules', icon: Calendar, permission: 'vesting_schedules' },
      { name: t('common.vestingEvents'), href: '/dashboard/vesting-events', icon: Clock, permission: 'vesting_events' },
      { name: t('common.exerciseOrders'), href: '/dashboard/exercise-orders', icon: ShoppingCart, permission: 'vesting_events' },
      { name: t('common.companyCashPortfolio'), href: '/dashboard/company-cash-portfolio', icon: DollarSign, permission: 'portfolio' },
      { name: t('common.cashTransfers'), href: '/dashboard/cash-transfers', icon: ArrowRightLeft, permission: 'portfolio' },
      { name: t('common.transfers'), href: '/dashboard/transfers', icon: ArrowRightLeft, permission: 'transfers' },
      { name: t('common.performanceMetrics'), href: '/dashboard/performance-metrics', icon: Target, permission: 'performance_metrics' },
      { name: t('common.grants'), href: '/dashboard/grants', icon: Award, permission: 'grants' },
      { name: t('common.documents'), href: '/dashboard/documents', icon: FileText, permission: 'documents' },
      { name: t('common.capTable'), href: '/dashboard/cap-table', icon: PieChart, permission: 'cap_table' },
      { name: t('common.portfolio'), href: '/dashboard/portfolio', icon: TrendingUp, permission: 'portfolio' },
      { name: t('common.customerJourney'), href: '/dashboard/customer-journey', icon: Map, permission: null },
      { name: t('common.settings'), href: '/dashboard/settings', icon: Settings, permission: 'settings' },
    ],
    [t]
  );

  const operatorNavigation: NavigationItem[] = useMemo(
    () =>
      isSuperAdminUser
        ? [
            {
              name: t('common.operatorConsole'),
              href: '/operator/companies',
              icon: ShieldCheck,
              permission: null,
            },
            {
              name: t('common.subscriptions'),
              href: '/operator/subscriptions',
              icon: CreditCard,
              permission: null,
            },
            {
              name: t('common.buybackRequests'),
              href: '/operator/buyback-requests',
              icon: ArrowRightLeft,
              permission: null,
            },
            {
              name: t('common.allPortfolios'),
              href: '/operator/portfolios',
              icon: Briefcase,
              permission: null,
            },
            {
              name: t('common.translations'),
              href: '/dashboard/translations',
              icon: Languages,
              permission: null,
            },
            {
              name: 'Platform Settings',
              href: '/operator/platform-settings',
              icon: Globe,
              permission: null,
            },
          ]
        : [],
    [isSuperAdminUser, t]
  );

  const navigationItems = useMemo(
    () => [...operatorNavigation, ...baseNavigation],
    [operatorNavigation, baseNavigation]
  );

  const filteredNavigation = useMemo(() => {
    if (!permissions) {
      return navigationItems;
    }

    return navigationItems.filter((item) => {
      if (!item.permission) return true;
      return permissions[item.permission];
    });
  }, [navigationItems, permissions]);

  useEffect(() => {
    if (!permissions) return;

    const permissionByPath: Record<string, PermissionKey> = {
      '/dashboard/users': 'users',
      '/dashboard/employees': 'employees',
      '/dashboard/ltip-pools': 'ltip_pools',
      '/dashboard/plans': 'plans',
      '/dashboard/vesting-schedules': 'vesting_schedules',
      '/dashboard/vesting-events': 'vesting_events',
      '/dashboard/exercise-orders': 'vesting_events',
      '/dashboard/company-cash-portfolio': 'portfolio',
      '/dashboard/cash-transfers': 'portfolio',
      '/dashboard/transfers': 'transfers',
      '/dashboard/performance-metrics': 'performance_metrics',
      '/dashboard/grants': 'grants',
      '/dashboard/documents': 'documents',
      '/dashboard/cap-table': 'cap_table',
      '/dashboard/portfolio': 'portfolio',
      '/dashboard/settings': 'settings',
    };

    const matchedEntry = Object.entries(permissionByPath).find(([route]) =>
      location.pathname.startsWith(route)
    );

    if (!matchedEntry) return;

    const [, requiredPermission] = matchedEntry;

    if (!permissions[requiredPermission]) {
      const fallback = filteredNavigation[0]?.href ?? '/dashboard';
      navigate(fallback, { replace: true });
    }
  }, [permissions, location.pathname, navigate, filteredNavigation]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`fixed inset-y-0 ${isRTL ? 'right-0 border-l' : 'left-0 border-r'} z-50 w-64 bg-white border-gray-200 transform transition-transform duration-200 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : isRTL ? 'translate-x-full' : '-translate-x-full'
      } lg:translate-x-0`}>
          <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              {isSuperAdminUser ? (
                // Super admin: show platform logo
                platformLogoUrl ? (
                  <>
                    <div className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-white flex items-center justify-center">
                      <img
                        src={platformLogoUrl}
                        alt={platformNameEn || platformNameAr || 'Platform logo'}
                        className="max-w-full max-h-full object-contain"
                        style={{
                          transform: `scale(${platformLogoScale || 1})`,
                          transformOrigin: 'center center',
                        }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-900 truncate max-w-[170px]">
                        {platformNameEn || platformNameAr || 'Platform'}
                      </h2>
                      <p className="text-xs text-gray-500">Super Admin Portal</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-2 rounded-lg" style={{ backgroundColor: brandColor }}>
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-900">LTIP-CONNECT</h2>
                      <p className="text-xs text-gray-500">Super Admin Portal</p>
                    </div>
                  </>
                )
              ) : companyLogoUrl ? (
                // Company admin: show company logo
                <>
                  <div className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-white flex items-center justify-center">
                    <img
                      src={companyLogoUrl}
                      alt={companyDisplayName || 'Company logo'}
                      className="max-w-full max-h-full object-contain"
                      style={{
                        transform: `scale(${companyLogoScale || 1})`,
                        transformOrigin: 'center center',
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 truncate max-w-[170px]">
                      {companyDisplayName || 'Company Portal'}
                    </h2>
                    <p className="text-xs text-gray-500">Admin Portal</p>
                  </div>
                </>
              ) : (
                // Fallback: show icon logo when no logo is available
                <>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: brandColor }}>
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">LTIP-CONNECT</h2>
                    <p className="text-xs text-gray-500">Admin Portal</p>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {loadingPermissions ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : filteredNavigation.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg">
                No modules available for your role. Reach out to an administrator for access.
              </div>
            ) : (
              filteredNavigation.map((item) => {
                const isActive = location.pathname === item.href;
                const isVestingEvents = item.href === '/dashboard/vesting-events';
                const isDocuments = item.href === '/dashboard/documents';
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => {
                      // Close sidebar on mobile when navigation item is clicked
                      if (isMobile()) {
                        setSidebarOpen(false);
                      }
                    }}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg transition ${
                      isActive
                        ? 'font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    style={isActive ? { 
                      backgroundColor: getBgColor('50'),
                      color: brandColor 
                    } : {}}
                  >
                    <div className={`flex items-center space-x-3 ${isRTL ? 'space-x-reverse' : ''}`}>
                      <item.icon 
                        className={`w-5 h-5 ${isActive ? '' : 'text-gray-400'}`}
                        style={isActive ? { color: brandColor } : {}}
                      />
                      <span>{item.name}</span>
                    </div>
                    {isVestingEvents && dueEventsCount > 0 && (
                      <span className="px-2 py-1 text-xs font-medium bg-red-500 text-white rounded-full min-w-[20px] text-center">
                        {dueEventsCount}
                      </span>
                    )}
                    {isDocuments && draftContractsCount > 0 && (
                      <span className="px-2 py-1 text-xs font-medium bg-red-500 text-white rounded-full min-w-[20px] text-center">
                        {draftContractsCount}
                      </span>
                    )}
                  </Link>
                );
              })
            )}
          </nav>

          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg mb-3">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: brandColor }}
                >
                  <span className="text-white text-sm font-medium">
                    {user?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-gray-500 truncate">Admin</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className={`w-full flex items-center justify-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition ${
                isRTL ? 'space-x-reverse' : ''
              }`}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">{t('common.logout')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className={`${isRTL ? 'lg:pr-64' : 'lg:pl-64'} flex flex-col flex-1 transition-all duration-200`}>
        <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-6 py-4">
          {onboardingIncomplete && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-800">Complete your onboarding steps</p>
                <p className="text-xs text-amber-700">
                  {onboardingStatus.completed}/{onboardingStatus.total} completed •{' '}
                  {onboardingStatus.total - onboardingStatus.completed} remaining
                </p>
              </div>
              <button
                onClick={() => navigate('/onboarding')}
                className="inline-flex items-center justify-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                Continue
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex-1 lg:flex-none">
              {isSuperAdminUser && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-wide text-gray-500">Impersonating Company</span>
                      <div className="flex items-center gap-2">
                        <select
                          value={activeCompanyId ?? ''}
                          onChange={(event) => {
                            const selectedId = event.target.value || null;
                            if (!selectedId) {
                              clearActiveCompany();
                              return;
                            }
                            const selectedCompany = companyOptions.find((company) => company.id === selectedId);
                            setActiveCompany(selectedId, selectedCompany?.name ?? null);
                          }}
                          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 min-w-[220px]"
                          style={{ 
                            '--tw-ring-color': brandColor,
                          } as React.CSSProperties}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = brandColor;
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '';
                          }}
                          disabled={loadingCompanies}
                        >
                          <option value="">
                            {loadingCompanies ? 'Loading companies…' : 'Select a company'}
                          </option>
                          {companyOptions.map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name}
                            </option>
                          ))}
                        </select>
                        {activeCompanyId && (
                          <button
                            onClick={() => clearActiveCompany()}
                            className="text-sm text-gray-500 hover:text-gray-700 underline"
                            type="button"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {activeCompanyName && (
                        <span className="text-xs text-gray-500 mt-1">{activeCompanyName}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className={`flex items-center space-x-4 ${isRTL ? 'space-x-reverse' : ''}`}>
              <LanguageSwitcher />
              <Link
                to="/employee/login"
                className={`flex items-center space-x-2 px-4 py-2 hover:opacity-90 rounded-lg transition group ${
                  isRTL ? 'space-x-reverse' : ''
                }`}
                style={{ 
                  backgroundColor: getBgColor('50'),
                  color: brandColor 
                }}
                title="Switch to Employee Portal"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span className="text-sm font-medium hidden sm:inline">Employee View</span>
              </Link>
              <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 w-full max-w-full overflow-x-hidden">
          <div className="w-full max-w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
