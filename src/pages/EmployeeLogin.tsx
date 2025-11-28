import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Building2, Mail, Lock, AlertCircle, Award } from 'lucide-react';

export default function EmployeeLogin() {
  const location = useLocation();
  const locationState = useMemo(
    () =>
      (location.state as { presetEmail?: string; presetPassword?: string } | null) ?? null,
    [location.state]
  );
  const [email, setEmail] = useState(locationState?.presetEmail ?? 'employee@example.com');
  const [password, setPassword] = useState(locationState?.presetPassword ?? 'Employee123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (locationState?.presetEmail) {
      setEmail(locationState.presetEmail);
    }
    if (locationState?.presetPassword) {
      setPassword(locationState.presetPassword);
    }
  }, [locationState]);

  const performEmployeeLogin = async (loginEmail: string, loginPassword: string) => {
    setError('');
    setLoading(true);

    try {
      console.log('Attempting Supabase auth login with email:', loginEmail);
      
      // Use Supabase auth for employee login
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (authError) {
        console.error('Auth error:', authError);
        setError(`Login Failed: ${authError.message}`);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Login Failed: No user data returned');
        setLoading(false);
        return;
      }

      console.log('Auth successful, checking employee record...');
      
      // Get employee record linked to this auth user
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select('id, company_id, first_name_en, last_name_en, email, user_id')
        .eq('user_id', authData.user.id)
        .maybeSingle();
      
      if (employeeError) {
        console.error('Error finding employee:', employeeError);
        setError('Login Failed: Database error querying employee');
        setLoading(false);
        return;
      }
      
      if (!employee) {
        setError('Login Failed: No employee record found for this user. Please contact your administrator.');
        setLoading(false);
        return;
      }
      
      console.log('Employee found:', employee);
      
      // Store employee data in session storage for dashboard access
      sessionStorage.setItem('employee', JSON.stringify(employee));
      
      console.log('Login successful, redirecting to dashboard...');
      navigate('/employee/dashboard');
      
    } catch (error) {
      console.error('Login error:', error);
      setError('Login Failed: An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await performEmployeeLogin(email, password);
  };

  const handleQuickEmployeeLogin = () => performEmployeeLogin('test9@test.com', 'Na101918!@');

  const handleQuickAdminLogin = async (quickEmail: string, quickPassword: string) => {
    setError('');
    setLoading(true);
    try {
      await supabase.auth.signInWithPassword({
        email: quickEmail,
        password: quickPassword,
      });
      sessionStorage.removeItem('employee');
      navigate('/dashboard');
    } catch (authError) {
      console.error('Quick admin login failed:', authError);
      setError(`Quick login failed for ${quickEmail}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center">
              <Building2 className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Employee Portal</h1>
          <p className="text-gray-600">Access your equity dashboard and documents</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Signing in...</span>
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6">
            <p className="text-sm font-medium text-gray-700 text-center mb-3">Quick Login Shortcuts</p>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={handleQuickEmployeeLogin}
                disabled={loading}
                className="w-full border border-blue-200 hover:border-blue-300 text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sign In as Employee (test9@test.com)
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdminLogin('admin@derayah.com', 'Admin123!')}
                disabled={loading}
                className="w-full border border-green-200 hover:border-green-300 text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sign In as Company Admin (admin@derayah.com)
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdminLogin('hr@derayah.com', 'Na101918!@')}
                disabled={loading}
                className="w-full border border-amber-200 hover:border-amber-300 text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sign In as HR Admin (hr@derayah.com)
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdminLogin('superadmin@derayah.com', 'Superadmin123!')}
                disabled={loading}
                className="w-full border border-purple-200 hover:border-purple-300 text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sign In as Super Admin (superadmin@derayah.com)
              </button>
            </div>
          </div>

          {/* Login Instructions */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Award className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Login Instructions:</p>
                <ul className="space-y-1 text-blue-700">
                  <li>• Use your company email address</li>
                  <li>• Default password: Employee123!</li>
                  <li>• Contact HR if you need assistance</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            Need help? Contact your HR department
          </p>
        </div>
      </div>
    </div>
  );
}