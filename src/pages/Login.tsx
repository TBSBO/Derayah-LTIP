import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Building2, Lock, Mail } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyNameEn, setCompanyNameEn] = useState('');
  const [companyNameAr, setCompanyNameAr] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const { signIn, signUp, user, userRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect already authenticated users - wait for userRole to be loaded
  useEffect(() => {
    if (!authLoading && user) {
      // Wait for userRole to be determined before redirecting
      if (userRole) {
        if (userRole.user_type === 'employee') {
          navigate('/employee/dashboard', { replace: true });
        } else if (userRole.user_type === 'super_admin') {
          navigate('/operator/companies', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      }
      // If userRole is null but we have a user, wait a bit more for it to load
      // Don't redirect if still loading
    }
  }, [user, userRole, authLoading, navigate]);

  const handleQuickLogin = async (quickEmail: string, quickPassword: string) => {
    setIsSignUp(false);
    setError('');
    setLoading(true);

    try {
      await signIn(quickEmail, quickPassword);
      setEmail(quickEmail);
      setPassword(quickPassword);
      // Removed navigate - let the useEffect handle redirect after userRole loads
    } catch (err) {
      console.error('Quick login failed:', err);
      setError(`Quick login failed for ${quickEmail}`);
      setLoading(false);
    }
    // Don't set loading to false here - will be set when redirect happens or on error
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (!companyNameEn.trim()) {
          setError('Company name is required');
          setLoading(false);
          return;
        }

        await signUp({
          email,
          password,
          companyNameEn: companyNameEn.trim(),
          companyNameAr: companyNameAr.trim() || undefined,
          phone: phone.trim() || undefined,
        });
        navigate('/onboarding');
      } else {
        await signIn(email, password);
        // Removed navigate - let the useEffect handle redirect after userRole loads
      }
    } catch (err) {
      setError(isSignUp ? 'Failed to create account' : 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-8">
            <div className="bg-blue-600 p-3 rounded-xl">
              <Building2 className="w-8 h-8 text-white" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">SAUDI-LTIP-CONNECT</h1>
            <p className="text-gray-600">Company Admin Portal</p>
            <p className="text-sm text-gray-500 mt-2">{isSignUp ? 'Create your account' : 'Sign in to continue'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="admin@company.com"
                />
              </div>
            </div>

            {isSignUp && (
              <>
                <div>
                  <label htmlFor="companyNameEn" className="block text-sm font-medium text-gray-700 mb-2">
                    Company Name (English)
                  </label>
                  <input
                    id="companyNameEn"
                    type="text"
                    value={companyNameEn}
                    onChange={(e) => setCompanyNameEn(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="Acme Holdings"
                  />
                </div>

                <div>
                  <label htmlFor="companyNameAr" className="block text-sm font-medium text-gray-700 mb-2">
                    Company Name (Arabic) <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="companyNameAr"
                    type="text"
                    value={companyNameAr}
                    onChange={(e) => setCompanyNameAr(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="شركة أكمي القابضة"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Phone <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="+966501234567"
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-600">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => {
                  setError('');
                  setIsSignUp(!isSignUp);
                }}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Designed for Tadawul-listed companies</p>
          <p className="mt-1">CMA & Sharia compliant</p>
        </div>

        <div className="mt-8">
          <p className="text-sm font-medium text-gray-700 text-center mb-3">Quick Login Shortcuts</p>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() =>
                navigate('/employee/login', {
                  state: {
                    presetEmail: 'test9@test.com',
                    presetPassword: 'Na101918!@',
                  },
                })
              }
              disabled={loading}
              className="w-full border border-blue-200 hover:border-blue-300 text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign In as Employee (test9@test.com)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@derayah.com', 'Admin123!')}
              disabled={loading}
              className="w-full border border-green-200 hover:border-green-300 text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign In as Company Admin (admin@derayah.com)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('hr@derayah.com', 'Na101918!@')}
              disabled={loading}
              className="w-full border border-amber-200 hover:border-amber-300 text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign In as HR Admin (hr@derayah.com)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('superadmin@derayah.com', 'Superadmin123!')}
              disabled={loading}
              className="w-full border border-purple-200 hover:border-purple-300 text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign In as Super Admin (superadmin@derayah.com)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
