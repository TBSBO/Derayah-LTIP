import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './lib/i18n';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DashboardLayout from './components/DashboardLayout';
import EmployeeDashboardLayout from './components/EmployeeDashboardLayout';

// Lazy load all pages for code splitting
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Employees = lazy(() => import('./pages/Employees'));
const Plans = lazy(() => import('./pages/Plans'));
const Grants = lazy(() => import('./pages/Grants'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Settings = lazy(() => import('./pages/Settings'));
const CapTable = lazy(() => import('./pages/CapTable'));
const LTIPPools = lazy(() => import('./pages/LTIPPools'));
const VestingSchedules = lazy(() => import('./pages/VestingSchedules'));
const VestingEvents = lazy(() => import('./pages/VestingEvents'));
const ExerciseOrders = lazy(() => import('./pages/ExerciseOrders'));
const CompanyCashPortfolio = lazy(() => import('./pages/CompanyCashPortfolio'));
const CashTransfers = lazy(() => import('./pages/CashTransfers'));
const Transfers = lazy(() => import('./pages/Transfers'));
const PerformanceMetrics = lazy(() => import('./pages/PerformanceMetrics'));
const Documents = lazy(() => import('./pages/Documents'));
const UsersPage = lazy(() => import('./pages/Users'));
const EmployeeLogin = lazy(() => import('./pages/EmployeeLogin'));
const EmployeeOverview = lazy(() => import('./pages/EmployeeOverview'));
const EmployeeDashboard = lazy(() => import('./pages/EmployeeDashboard'));
const EmployeeVesting = lazy(() => import('./pages/EmployeeVesting'));
const EmployeeVestingEvents = lazy(() => import('./pages/EmployeeVestingEvents'));
const EmployeePerformance = lazy(() => import('./pages/EmployeePerformance'));
const EmployeePortfolio = lazy(() => import('./pages/EmployeePortfolio'));
const EmployeeTaxCalculator = lazy(() => import('./pages/EmployeeTaxCalculator'));
const EmployeeZakatCalculator = lazy(() => import('./pages/EmployeeZakatCalculator'));
const EmployeeDocuments = lazy(() => import('./pages/EmployeeDocuments'));
const EmployeeNotifications = lazy(() => import('./pages/EmployeeNotifications'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const OperatorCompanies = lazy(() => import('./pages/OperatorCompanies'));
const OperatorSubscriptions = lazy(() => import('./pages/OperatorSubscriptions'));
const OperatorBuybackRequests = lazy(() => import('./pages/OperatorBuybackRequests'));
const OperatorPortfolios = lazy(() => import('./pages/OperatorPortfolios'));
const Translations = lazy(() => import('./pages/Translations'));
const CustomerJourney = lazy(() => import('./pages/CustomerJourney'));
const LandingOptionOne = lazy(() => import('./pages/LandingOptionOne'));
const LandingOptionTwo = lazy(() => import('./pages/LandingOptionTwo'));
const LandingOptionThree = lazy(() => import('./pages/LandingOptionThree'));
const LandingOptionFour = lazy(() => import('./pages/LandingOptionFour'));
const LandingOptionFive = lazy(() => import('./pages/LandingOptionFive'));
const LandingOptionFiveAR = lazy(() => import('./pages/LandingOptionFiveAR'));
const LandingOptionSix = lazy(() => import('./pages/LandingOptionSix'));

// Loading component
const PageLoader = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, userRole, loading, isOnboardingComplete, onboardingLoaded } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!onboardingLoaded && userRole && userRole.user_type !== 'employee') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (userRole && userRole.user_type === 'employee') {
    return <Navigate to="/employee/dashboard" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

function SuperAdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if user is a super admin (either by role or user_type)
  const isSuperAdmin = userRole?.user_type === 'super_admin' || userRole?.role === 'super_admin';
  
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

function EmployeeProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Check if user is authenticated and is an employee
  if (!user || !userRole || userRole.user_type !== 'employee') {
    return <Navigate to="/employee/login" replace />;
  }

  return <EmployeeDashboardLayout>{children}</EmployeeDashboardLayout>;
}

function AuthenticatedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { i18n } = useTranslation();

  useEffect(() => {
    // Handle GitHub Pages 404 redirect
    // When GitHub Pages serves 404.html, it includes the path as a query parameter
    // This code extracts it and updates the URL so React Router can handle it
    const path = window.location.search.slice(1);
    if (path && window.history.replaceState) {
      // Decode the path (GitHub Pages replaces & with ~and~)
      const decoded = path.split('&').map(function(s) { 
        return s.replace(/~and~/g, '&')
      }).join('?');
      window.history.replaceState(null, '', decoded);
    }
  }, []);

  useEffect(() => {
    // Set document direction and language on mount and language change
    if (typeof document !== 'undefined') {
      document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = i18n.language;
    }
  }, [i18n.language]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/onboarding"
            element={
              <AuthenticatedRoute>
                <Onboarding />
              </AuthenticatedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/employees"
            element={
              <ProtectedRoute>
                <Employees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/plans"
            element={
              <ProtectedRoute>
                <Plans />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/grants"
            element={
              <ProtectedRoute>
                <Grants />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/portfolio"
            element={
              <ProtectedRoute>
                <Portfolio />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/users"
            element={
              <ProtectedRoute>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/cap-table"
            element={
              <ProtectedRoute>
                <CapTable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/ltip-pools"
            element={
              <ProtectedRoute>
                <LTIPPools />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/vesting-schedules"
            element={
              <ProtectedRoute>
                <VestingSchedules />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/vesting-events"
            element={
              <ProtectedRoute>
                <VestingEvents />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/exercise-orders"
            element={
              <ProtectedRoute>
                <ExerciseOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/company-cash-portfolio"
            element={
              <ProtectedRoute>
                <CompanyCashPortfolio />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/cash-transfers"
            element={
              <ProtectedRoute>
                <CashTransfers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/transfers"
            element={
              <ProtectedRoute>
                <Transfers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/performance-metrics"
            element={
              <ProtectedRoute>
                <PerformanceMetrics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/documents"
            element={
              <ProtectedRoute>
                <Documents />
              </ProtectedRoute>
            }
          />
          <Route
            path="/operator/companies"
            element={
              <SuperAdminProtectedRoute>
                <OperatorCompanies />
              </SuperAdminProtectedRoute>
            }
          />
          <Route
            path="/operator/subscriptions"
            element={
              <SuperAdminProtectedRoute>
                <OperatorSubscriptions />
              </SuperAdminProtectedRoute>
            }
          />
          <Route
            path="/operator/buyback-requests"
            element={
              <SuperAdminProtectedRoute>
                <OperatorBuybackRequests />
              </SuperAdminProtectedRoute>
            }
          />
          <Route
            path="/operator/portfolios"
            element={
              <SuperAdminProtectedRoute>
                <OperatorPortfolios />
              </SuperAdminProtectedRoute>
            }
          />
          <Route
            path="/dashboard/translations"
            element={
              <SuperAdminProtectedRoute>
                <Translations />
              </SuperAdminProtectedRoute>
            }
          />
          <Route
            path="/dashboard/customer-journey"
            element={
              <ProtectedRoute>
                <CustomerJourney />
              </ProtectedRoute>
            }
          />
          <Route path="/employee/login" element={<EmployeeLogin />} />
          <Route
            path="/employee/overview"
            element={
              <EmployeeProtectedRoute>
                <EmployeeOverview />
              </EmployeeProtectedRoute>
            }
          />
          <Route
            path="/employee/dashboard"
            element={
              <EmployeeProtectedRoute>
                <EmployeeDashboard />
              </EmployeeProtectedRoute>
            }
          />
          <Route
            path="/employee/vesting"
            element={
              <EmployeeProtectedRoute>
                <EmployeeVesting />
              </EmployeeProtectedRoute>
            }
          />
          <Route
            path="/employee/vesting-events"
            element={
              <EmployeeProtectedRoute>
                <EmployeeVestingEvents />
              </EmployeeProtectedRoute>
            }
          />
          <Route
            path="/employee/performance"
            element={
              <EmployeeProtectedRoute>
                <EmployeePerformance />
              </EmployeeProtectedRoute>
            }
          />
          <Route
            path="/employee/portfolio"
            element={
              <EmployeeProtectedRoute>
                <EmployeePortfolio />
              </EmployeeProtectedRoute>
            }
          />
          <Route
            path="/employee/tax-calculator"
            element={
              <EmployeeProtectedRoute>
                <EmployeeTaxCalculator />
              </EmployeeProtectedRoute>
            }
          />
          <Route
            path="/employee/zakat-calculator"
            element={
              <EmployeeProtectedRoute>
                <EmployeeZakatCalculator />
              </EmployeeProtectedRoute>
            }
          />
          <Route
            path="/employee/documents"
            element={
              <EmployeeProtectedRoute>
                <EmployeeDocuments />
              </EmployeeProtectedRoute>
            }
          />
          <Route
            path="/employee/notifications"
            element={
              <EmployeeProtectedRoute>
                <EmployeeNotifications />
              </EmployeeProtectedRoute>
            }
          />
          <Route path="/concept1" element={<LandingOptionOne />} />
          <Route path="/concept2" element={<LandingOptionTwo />} />
          <Route path="/concept3" element={<LandingOptionThree />} />
          <Route path="/concept4" element={<LandingOptionFour />} />
          <Route path="/concept5" element={<LandingOptionFive />} />
          <Route path="/concept5-ar" element={<LandingOptionFiveAR />} />
          <Route path="/concept6" element={<LandingOptionSix />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  // Use base path only in production (for GitHub Pages), not in development
  const basename = import.meta.env.PROD ? '/Derayah-LTIP' : '';
  
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
