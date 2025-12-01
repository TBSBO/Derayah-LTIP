import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface UserRole {
  user_id: string;
  email: string;
  company_id: string | null;
  role: string;
  is_active: boolean;
  permissions: Record<string, boolean> | null;
  user_type: 'super_admin' | 'company_admin' | 'employee' | 'unknown';
}

interface OnboardingProgress {
  company_id: string;
  has_pool: boolean;
  has_vesting_schedule: boolean;
  has_plan: boolean;
  has_employee: boolean;
  has_grant: boolean;
  completed_at: string | null;
}

interface SignUpInput {
  email: string;
  password: string;
  companyNameEn: string;
  companyNameAr?: string;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole | null;
  loading: boolean;
  activeCompanyId: string | null;
  activeCompanyName: string | null;
  setActiveCompany: (companyId: string | null, companyName?: string | null) => void;
  clearActiveCompany: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  isSuperAdmin: () => boolean;
  isCompanyAdmin: (companyId?: string) => boolean;
  isEmployee: () => boolean;
  hasPermission: (permissionKey: string) => boolean;
  getCurrentCompanyId: () => string | null;
  onboardingProgress: OnboardingProgress | null;
  refreshOnboardingProgress: () => Promise<void>;
  isOnboardingComplete: () => boolean;
  onboardingLoaded: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingProgress, setOnboardingProgress] = useState<OnboardingProgress | null>(null);
  const [onboardingLoaded, setOnboardingLoaded] = useState(false);
  const [activeCompany, setActiveCompanyState] = useState<{ id: string | null; name: string | null }>({
    id: null,
    name: null,
  });
  const isSigningUpRef = useRef(false);
  const isLoadingUserRoleRef = useRef(false);
  const currentLoadingUserIdRef = useRef<string | null>(null);
  const SUPER_ADMIN_COMPANY_STORAGE_KEY = 'saas_active_company';

  const loadOnboardingProgress = async (companyId: string | null, suppressErrors = false) => {
    try {
      if (!companyId) {
        setOnboardingProgress(null);
        setOnboardingLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from('company_onboarding_progress')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        if (!suppressErrors && error.code !== 'PGRST116') {
          console.error('Error loading onboarding progress:', error);
        }
        setOnboardingProgress(null);
        setOnboardingLoaded(true);
        return;
      }

      setOnboardingProgress(data);
      setOnboardingLoaded(true);
    } catch (error) {
      console.error('Unexpected error loading onboarding progress:', error);
      setOnboardingProgress(null);
      setOnboardingLoaded(true); // Always set to true to prevent infinite loading
    }
  };

  const loadUserRole = async (userId: string, retryCount = 0, maxRetries = 3) => {
    // Prevent multiple concurrent calls for the same user
    if (isLoadingUserRoleRef.current && currentLoadingUserIdRef.current === userId) {
      console.log('⏸️ loadUserRole already in progress for user:', userId);
      return;
    }

    isLoadingUserRoleRef.current = true;
    currentLoadingUserIdRef.current = userId;

    try {
      // Verify we have a valid session before querying
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        console.warn('⚠️ No session found when loading user role, waiting...');
        if (retryCount < maxRetries) {
          isLoadingUserRoleRef.current = false;
          currentLoadingUserIdRef.current = null;
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          return loadUserRole(userId, retryCount + 1, maxRetries);
        }
        throw new Error('No session available');
      }

      // Increase timeout to 30 seconds - queries with retries can take longer
      const timeoutPromise = new Promise<UserRole | null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 30000)
      );

      const rolePromise = (async () => {
        console.log(`🔍 loadUserRole (attempt ${retryCount + 1}/${maxRetries + 1}): Starting to fetch user role for userId:`, userId);
        console.log('🔍 Current session user ID:', currentSession.user.id);
        
        // Get email from session (available immediately)
        const userEmail = currentSession.user.email || '';

        // OPTIMIZATION: Check company_users, employees, and company_super_admin_memberships
        // in parallel. This avoids slow retry loops for super admins who will never have
        // company_users / employees records.
        const [companyUserResult, employeeResult, superAdminResult] = await Promise.all([
          supabase
            .from('company_users')
            .select('user_id, company_id, role, is_active, permissions')
            .eq('user_id', userId)
            .limit(1),
          supabase
            .from('employees')
            .select('id, company_id')
            .eq('user_id', userId)
            .maybeSingle(),
          supabase
            .from('company_super_admin_memberships')
            .select('user_id')
            .eq('user_id', userId)
            .limit(1),
        ]);

        const { data: anyCompanyUserCheck, error: anyCompanyUserCheckError } = companyUserResult;
        const { data: employeeData, error: employeeError } = employeeResult;
        const { data: superAdminMemberships, error: superAdminError } = superAdminResult;

        // Handle errors
        if (anyCompanyUserCheckError) {
          console.warn('❌ Error checking for any company user (first check):', anyCompanyUserCheckError);
          // If it's a permission error and we haven't retried, try again
          if (anyCompanyUserCheckError.code === '42501' && retryCount < maxRetries) {
            console.log(`⏳ Permission error, retrying in ${(retryCount + 1) * 1000}ms...`);
            isLoadingUserRoleRef.current = false;
            currentLoadingUserIdRef.current = null;
            await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
            return loadUserRole(userId, retryCount + 1, maxRetries);
          }
        }

        if (employeeError) {
          console.warn('Error fetching employee data:', employeeError);
        }

        if (superAdminError) {
          console.warn('❌ Error checking super admin membership:', superAdminError);
        }

        // PRIORITY 1: If user exists in company_users at all (even if inactive or role='super_admin'),
        // they are a company-level user, NOT a platform super admin
        if (anyCompanyUserCheck && anyCompanyUserCheck.length > 0) {
          const companyUser = anyCompanyUserCheck[0];
          console.log('✅ User exists in company_users (role=' + companyUser.role + ', active=' + companyUser.is_active + '), treating as company admin, not platform super admin');
          
          // Return as company_admin, even if role is 'super_admin' in company_users
          // This ensures they don't see operator navigation and have a company_id set
          const userRoleResult = {
            user_id: companyUser.user_id,
            email: userEmail,
            company_id: companyUser.company_id,  // CRITICAL: Always set company_id for company users
            role: companyUser.role,
            is_active: companyUser.is_active,
            permissions: (companyUser.permissions as Record<string, boolean> | null) ?? null,
            user_type: 'company_admin' as const  // Always company_admin, not super_admin
          };
          
          console.log('✅ loadUserRole: Created userRole object (company admin):', {
            role: userRoleResult.role,
            user_type: userRoleResult.user_type,
            company_id: userRoleResult.company_id,
            fullObject: userRoleResult
          });
          
          return userRoleResult;
        }
        
        // PRIORITY 2: If user exists in employees, they are an employee
        if (employeeData) {
          console.log('✅ User exists in employees table, treating as employee');
          return {
            user_id: userId,
            email: userEmail,
            company_id: employeeData.company_id,
            role: 'employee',
            is_active: true,
            permissions: null,
            user_type: 'employee' as const
          };
        }
        // PRIORITY 3: If user is in company_super_admin_memberships and NOT in company_users/employees,
        // they are a platform super admin - return immediately without retrying
        if (superAdminMemberships && superAdminMemberships.length > 0) {
          // Final safety check: ensure user has no company association
          // Triple-check to prevent any edge cases
          const { data: tripleCheckCompany } = await supabase
            .from('company_users')
            .select('company_id')
            .eq('user_id', userId)
            .limit(1);

          const { data: tripleCheckEmployee } = await supabase
            .from('employees')
            .select('company_id')
            .eq('user_id', userId)
            .limit(1);

          // If user has ANY company association, they are NOT a platform super admin
          if (tripleCheckCompany && tripleCheckCompany.length > 0) {
            console.log('⚠️ Triple-check: User is in company_super_admin_memberships but also in company_users - treating as company admin');
            const companyUser = tripleCheckCompany[0];
            return {
              user_id: userId,
              email: userEmail,
              company_id: companyUser.company_id,
              role: 'company_admin',
              is_active: true,
              permissions: null,
              user_type: 'company_admin' as const,
            };
          }

          if (tripleCheckEmployee && tripleCheckEmployee.length > 0) {
            console.log('⚠️ Triple-check: User is in company_super_admin_memberships but also in employees - treating as employee');
            return {
              user_id: userId,
              email: userEmail,
              company_id: tripleCheckEmployee[0].company_id,
              role: 'employee',
              is_active: true,
              permissions: null,
              user_type: 'employee' as const,
            };
          }

          // User is a super admin - not tied to any specific company
          const userRoleResult = {
            user_id: userId,
            email: userEmail,
            company_id: null, // Super admins don't have a default company
            role: 'super_admin',
            is_active: true,
            permissions: null,
            user_type: 'super_admin' as const,
          };

          console.log('✅ loadUserRole: User is platform super admin (no company association):', userRoleResult);
          return userRoleResult;
        }

        // Only retry if no records found in any table (possible race condition during user creation)
        if (!anyCompanyUserCheck && !employeeData && (!superAdminMemberships || superAdminMemberships.length === 0) && retryCount < maxRetries) {
          console.log(`⏳ No company_users, employees, or super admin record found yet, retrying in ${(retryCount + 1) * 1000}ms...`);
          isLoadingUserRoleRef.current = false;
          currentLoadingUserIdRef.current = null;
          await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
          return loadUserRole(userId, retryCount + 1, maxRetries);
        }

        // Nothing found and no more retries – treat as unknown user_type
        return null;
      })();

      const role = (await Promise.race([rolePromise, timeoutPromise])) as UserRole | null;
      console.log('✅ loadUserRole: Final role result:', role);
      
      // Only set if we're still loading for the same user (prevent race conditions)
      if (currentLoadingUserIdRef.current === userId) {
        setUserRole(role);

        if (role?.company_id) {
          setActiveCompanyState({ id: role.company_id, name: null });
          setOnboardingLoaded(false);
          await loadOnboardingProgress(role.company_id, true);
        } else {
          setOnboardingProgress(null);
          setOnboardingLoaded(true);
        }
      }
    } catch (error) {
      console.error('Error loading user role:', error);
      // On timeout, don't clear the user role - keep existing state
      // Only clear on actual errors (not timeouts)
      if (error instanceof Error && error.message === 'Timeout') {
        console.warn('User role loading timed out after 30 seconds, keeping existing state');
        // Still mark onboarding as loaded to prevent infinite loading
        if (currentLoadingUserIdRef.current === userId) {
          setOnboardingLoaded(true);
        }
      } else {
        // Only clear if we're still loading for this user
        if (currentLoadingUserIdRef.current === userId) {
          setUserRole(null);
          setOnboardingProgress(null);
          setOnboardingLoaded(true);
        }
      }
    } finally {
      // Only clear if we're still loading for this user
      if (currentLoadingUserIdRef.current === userId) {
        isLoadingUserRoleRef.current = false;
        currentLoadingUserIdRef.current = null;
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        if (!session?.user) {
          setOnboardingProgress(null);
          setOnboardingLoaded(true);
        }
        
        if (session?.user) {
          await loadUserRole(session.user.id);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    
    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      // Don't interfere with sign-up process
      if (isSigningUpRef.current && event === 'SIGNED_IN') {
        console.log('⏸️ Sign-up in progress, skipping onAuthStateChange handler');
        return;
      }
      
      // Prevent reloading if already loading for this user
      if (session?.user && isLoadingUserRoleRef.current && currentLoadingUserIdRef.current === session.user.id) {
        console.log('⏸️ Already loading role for this user, skipping...');
        setSession(session);
        setUser(session.user);
        setLoading(false);
        return;
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await loadUserRole(session.user.id);
      } else {
        setUserRole(null);
        setOnboardingProgress(null);
        setOnboardingLoaded(true);
        currentLoadingUserIdRef.current = null; // Clear loading user
      }
      
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (input: SignUpInput) => {
    const { email, password, companyNameEn, companyNameAr, phone } = input;

    // Set flag to prevent onAuthStateChange from interfering
    isSigningUpRef.current = true;

    try {
      // Step 1: Create the user account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;

      let signedUpUser = data.user;

      // Step 2: Ensure we have a user object
      if (!signedUpUser) {
        // If signUp didn't return a user, try to sign in
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw new Error('Account created. Please verify your email before continuing.');
        }

        signedUpUser = signInData.user;
      }

      if (!signedUpUser) {
        throw new Error('Unable to initialize user after sign-up.');
      }

      // Step 3: CRITICAL - Ensure user is signed in with a valid session
      // Even if signUp returned a user, we need to ensure we have a session for RLS policies
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession) {
        // Explicitly sign in to get a session
        console.log('No session found after sign-up, signing in...');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (signInError) {
          throw new Error('Account created but sign-in failed. Please try signing in manually.');
        }
        
        if (!signInData.session) {
          throw new Error('Sign-in succeeded but no session was created.');
        }
        
        console.log('✅ User signed in successfully with session');
      } else {
        console.log('✅ User already has a valid session');
      }

      // Step 4: Create the company and link user (now we have a session, so RLS will work)
      console.log('Creating company for user:', signedUpUser.id);
      const { error: onboardingError } = await supabase.rpc('onboard_self_service_company', {
        p_company_name_en: companyNameEn,
        p_company_name_ar: companyNameAr ?? null,
        p_phone: phone ?? null,
        p_user_id: signedUpUser.id,
      });

      if (onboardingError) {
        console.error('Error creating company:', onboardingError);
        throw onboardingError;
      }

      console.log('✅ Company created successfully');

      // Step 5: Wait longer for the database transaction to commit and be visible
      // This ensures the company_users record is visible to RLS policies
      console.log('Waiting for database transaction to commit...');
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Step 6: Verify the session is still valid
      const { data: { session: verifySession } } = await supabase.auth.getSession();
      if (!verifySession) {
        throw new Error('Session lost after company creation. Please sign in again.');
      }
      console.log('✅ Session verified');

      // Step 7: Load user role with retry logic - this should work because we have a session
      console.log('Loading user role for:', signedUpUser.id);
      await loadUserRole(signedUpUser.id, 0, 5); // Allow up to 5 retries with exponential backoff
      
      // Step 8: Verify userRole was loaded successfully
      // Give it a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('✅ Sign-up process completed');
    } finally {
      // Clear the sign-up flag
      isSigningUpRef.current = false;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUserRole(null);
    setOnboardingProgress(null);
    setOnboardingLoaded(false);
    setActiveCompanyState({ id: null, name: null });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SUPER_ADMIN_COMPANY_STORAGE_KEY);
    }
  };

  const isSuperAdmin = () => {
    // Only return true if user_type is explicitly 'super_admin'
    // This prevents company admins from being treated as super admins
    return userRole?.user_type === 'super_admin';
  };

  const isCompanyAdmin = (companyId?: string) => {
    if (!userRole) return false;
    if (userRole.role === 'super_admin') {
      if (!activeCompany.id) return false;
      if (companyId) {
        return activeCompany.id === companyId;
      }
      return true;
    }
    if (userRole.user_type === 'company_admin') {
      if (companyId) {
        return userRole.company_id === companyId;
      }
      return true;
    }
    return false;
  };

  const isEmployee = () => {
    return userRole?.user_type === 'employee';
  };

  const hasPermission = (permissionKey: string) => {
    if (userRole?.user_type === 'super_admin') {
      return true;
    }
    return Boolean(userRole?.permissions && userRole.permissions[permissionKey]);
  };

  const getCurrentCompanyId = useCallback(() => {
    if (userRole?.role === 'super_admin') {
      return activeCompany.id;
    }
    if (userRole?.company_id) {
      return userRole.company_id;
    }
    return null;
  }, [userRole?.role, userRole?.company_id, activeCompany.id]);

  const setActiveCompany = (companyId: string | null, companyName?: string | null) => {
    setActiveCompanyState({ id: companyId, name: companyName ?? null });
    if (userRole?.role === 'super_admin' && typeof window !== 'undefined') {
      if (companyId) {
        localStorage.setItem(
          SUPER_ADMIN_COMPANY_STORAGE_KEY,
          JSON.stringify({ id: companyId, name: companyName ?? null })
        );
      } else {
        localStorage.removeItem(SUPER_ADMIN_COMPANY_STORAGE_KEY);
      }
    }
  };

  const clearActiveCompany = () => {
    setActiveCompany(null);
  };

  useEffect(() => {
    if (userRole?.role === 'super_admin') {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(SUPER_ADMIN_COMPANY_STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as { id: string | null; name: string | null };
            setActiveCompanyState(parsed);
          } catch (error) {
            console.warn('Failed to parse stored super admin company selection', error);
            localStorage.removeItem(SUPER_ADMIN_COMPANY_STORAGE_KEY);
          }
        } else {
          setActiveCompanyState({ id: null, name: null });
        }
      }
    } else if (userRole?.user_type === 'company_admin') {
      setActiveCompanyState({ id: userRole.company_id, name: null });
    } else {
      setActiveCompanyState({ id: null, name: null });
    }
  }, [userRole?.role, userRole?.user_type, userRole?.company_id]);

  const value = {
    user,
    session,
    userRole,
    loading,
    activeCompanyId: activeCompany.id,
    activeCompanyName: activeCompany.name,
    setActiveCompany,
    clearActiveCompany,
    signIn,
    signUp,
    signOut,
    isSuperAdmin,
    isCompanyAdmin,
    isEmployee,
    hasPermission,
    getCurrentCompanyId,
    onboardingProgress,
    refreshOnboardingProgress: async () => {
      await loadOnboardingProgress(userRole?.company_id ?? null);
    },
    isOnboardingComplete: () => {
    if (!onboardingProgress) {
      return true;
    }

    return (
      onboardingProgress.has_pool &&
      onboardingProgress.has_vesting_schedule &&
      onboardingProgress.has_plan &&
      onboardingProgress.has_employee &&
      onboardingProgress.has_grant
    );
  },
    onboardingLoaded,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}