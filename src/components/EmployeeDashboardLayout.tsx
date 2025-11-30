import { ReactNode, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import LanguageSwitcher from './LanguageSwitcher';
import {
  Award,
  TrendingUp,
  Calculator,
  DollarSign,
  FileText,
  Bell,
  LogOut,
  Menu,
  X,
  ArrowRightLeft,
  Briefcase,
  Calendar,
} from 'lucide-react';

interface EmployeeDashboardLayoutProps {
  children: ReactNode;
}

export default function EmployeeDashboardLayout({ children }: EmployeeDashboardLayoutProps) {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
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

  const handleSignOut = async () => {
    await signOut();
    navigate('/employee/login');
  };

  const navigation = [
    { name: t('employee.overview'), key: 'overview', href: '/employee/overview', icon: TrendingUp },
    { name: t('employee.dashboard'), key: 'dashboard', href: '/employee/dashboard', icon: TrendingUp },
    { name: t('employee.vestingTimeline'), key: 'vestingTimeline', href: '/employee/vesting', icon: Award },
    { name: t('employee.vestingEvents'), key: 'vestingEvents', href: '/employee/vesting-events', icon: Calendar },
    { name: t('employee.portfolio'), key: 'portfolio', href: '/employee/portfolio', icon: Briefcase },
    { name: t('employee.performance'), key: 'performance', href: '/employee/performance', icon: TrendingUp },
    { name: t('employee.taxCalculator'), key: 'taxCalculator', href: '/employee/tax-calculator', icon: Calculator },
    { name: t('employee.zakatCalculator'), key: 'zakatCalculator', href: '/employee/zakat-calculator', icon: DollarSign },
    { name: t('employee.documents'), key: 'documents', href: '/employee/documents', icon: FileText },
    { name: t('employee.notifications'), key: 'notifications', href: '/employee/notifications', icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`fixed inset-y-0 ${isRTL ? 'right-0 border-l' : 'left-0 border-r'} z-50 w-64 bg-white border-gray-200 transform transition-transform duration-200 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : isRTL ? 'translate-x-full' : '-translate-x-full'
      } lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          <div className={`flex items-center justify-between p-6 border-b border-gray-200 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className={`flex items-center ${isRTL ? 'space-x-reverse space-x-3' : 'space-x-3'}`}>
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-2 rounded-lg">
                <Award className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">LTIP-CONNECT</h2>
                <p className="text-xs text-gray-500">{t('employee.employeePortal')}</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.key}
                  to={item.href}
                  onClick={() => {
                    // Close sidebar on mobile when navigation item is clicked
                    if (isMobile()) {
                      setSidebarOpen(false);
                    }
                  }}
                  className={`flex items-center ${isRTL ? 'space-x-reverse space-x-3' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200">
            <div className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className={`flex items-center ${isRTL ? 'space-x-reverse space-x-3' : 'space-x-3'}`}>
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {user?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{t('employee.employee')}</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className={`flex items-center justify-center ${isRTL ? 'space-x-reverse space-x-2' : 'space-x-2'} w-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition`}
            >
              <LogOut className="w-4 h-4" />
              <span>{t('employee.signOut')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className={isRTL ? 'lg:pr-64' : 'lg:pl-64'}>
        <div className={`sticky top-0 z-40 flex h-16 shrink-0 items-center ${isRTL ? 'gap-x-reverse gap-x-2 sm:gap-x-4' : 'gap-x-2 sm:gap-x-4'} border-b border-gray-200 bg-white px-2 sm:px-4 shadow-sm sm:px-6 lg:px-8`}>
          <button
            type="button"
            className={`-m-2.5 p-2.5 text-gray-700 lg:hidden flex-shrink-0 ${isRTL ? 'ml-auto' : ''}`}
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" />
          </button>

          <div className={`flex flex-1 ${isRTL ? 'gap-x-reverse gap-x-2 sm:gap-x-4 lg:gap-x-6' : 'gap-x-2 sm:gap-x-4 lg:gap-x-6'} self-stretch items-center ${isRTL ? 'justify-start' : 'justify-end'} min-w-0`}>
            <div className={`flex items-center ${isRTL ? 'gap-x-reverse gap-x-2 sm:gap-x-4 lg:gap-x-6' : 'gap-x-2 sm:gap-x-4 lg:gap-x-6'}`}>
              <LanguageSwitcher />
              <Link
                to="/login"
                className={`flex items-center ${isRTL ? 'space-x-reverse space-x-1 sm:space-x-2' : 'space-x-1 sm:space-x-2'} px-2 sm:px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-200 rounded-lg transition flex-shrink-0`}
                title="Switch to Admin Portal"
              >
                <ArrowRightLeft className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-medium hidden sm:inline">{t('employee.adminView')}</span>
              </Link>
              <Link
                to="/employee/notifications"
                className="relative -m-2.5 p-2.5 text-gray-400 hover:text-gray-500 flex-shrink-0"
              >
                <span className="sr-only">View notifications</span>
                <Bell className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className={`absolute top-1 ${isRTL ? 'left-1' : 'right-1'} block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white`} />
              </Link>
            </div>
          </div>
        </div>

        <main className="py-8">
          <div className="px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
