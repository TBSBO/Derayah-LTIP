import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Users, MoreVertical, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCompanyColor } from '../hooks/useCompanyColor';

type AdminRole =
  | 'company_admin'
  | 'super_admin'
  | 'finance_admin'
  | 'legal_admin'
  | 'hr_admin'
  | 'operations_admin'
  | 'viewer';

const ADMIN_ROLES: AdminRole[] = [
  'company_admin',
  'super_admin',
  'finance_admin',
  'legal_admin',
  'hr_admin',
  'operations_admin',
  'viewer',
] as const;

// Filtered roles for company users (excludes super_admin)
const COMPANY_ADMIN_ROLES: AdminRole[] = ADMIN_ROLES.filter(
  (role) => role !== 'super_admin'
);

const MODULES = [
  { key: 'dashboard', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'employees', label: 'Employees' },
  { key: 'ltip_pools', label: 'LTIP Pools' },
  { key: 'plans', label: 'Incentive Plans' },
  { key: 'vesting_schedules', label: 'Vesting Schedules' },
  { key: 'vesting_events', label: 'Vesting Events' },
  { key: 'transfers', label: 'Transfers' },
  { key: 'performance_metrics', label: 'Performance Metrics' },
  { key: 'grants', label: 'Grants' },
  { key: 'documents', label: 'Documents' },
  { key: 'contract_approval', label: 'Contract Approvals' },
  { key: 'cap_table', label: 'Cap Table' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'settings', label: 'Settings' },
] as const;

type PermissionKey = typeof MODULES[number]['key'];
type PermissionsState = Record<PermissionKey, boolean>;

const createPermissionsState = (
  value?: Record<string, boolean> | null
): PermissionsState =>
  MODULES.reduce((acc, module) => {
    acc[module.key] = Boolean(value?.[module.key]);
    return acc;
  }, {} as PermissionsState);

interface ListedUser {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  nameEn: string | null;
  nameAr: string | null;
  rawRole: AdminRole | string;
  isActive: boolean;
  permissions: PermissionsState;
  createdAt: string | null;
}

interface AuthUserInfo {
  id: string;
  email: string;
}

export default function UsersPage() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { brandColor } = useCompanyColor();
  const [usersList, setUsersList] = useState<ListedUser[]>([]);
  const [authUsersMap, setAuthUsersMap] = useState<Record<string, AuthUserInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<ListedUser | null>(null);
  const [editRole, setEditRole] = useState<AdminRole>('finance_admin');
  const [editActive, setEditActive] = useState<boolean>(true);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [editNameEn, setEditNameEn] = useState('');
  const [editNameAr, setEditNameAr] = useState('');
  const [editPermissions, setEditPermissions] = useState<PermissionsState>(() =>
    createPermissionsState()
  );

  const [showAddModal, setShowAddModal] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<AdminRole>('finance_admin');
  const [addActive, setAddActive] = useState(true);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addNameEn, setAddNameEn] = useState('');
  const [addNameAr, setAddNameAr] = useState('');
  const [addPermissions, setAddPermissions] = useState<PermissionsState>(() =>
    createPermissionsState()
  );
  const {
    user,
    activeCompanyId,
    userRole,
    loading: authLoading,
    onboardingLoaded,
  } = useAuth();
  
  // Use activeCompanyId directly and memoize to prevent unnecessary recalculations
  const currentCompanyId = useMemo(() => {
    return activeCompanyId || (userRole?.company_id ?? null);
  }, [activeCompanyId, userRole?.company_id]);
  
  const isSuperAdminUser = useMemo(() => userRole?.user_type === 'super_admin', [userRole]);
  
  // Add refs to prevent concurrent loads and track last loaded company
  const isLoadingRef = useRef(false);
  const lastLoadedCompanyIdRef = useRef<string | null>(null);

  // Memoize loadUsers to prevent unnecessary re-creations and infinite loops
  const loadUsers = useCallback(async (targetCompanyId: string) => {
    // Prevent concurrent loads
    if (isLoadingRef.current) {
      console.log('⏸️ Users already loading, skipping...');
      return;
    }

    // Skip if we already loaded data for this company
    if (targetCompanyId === lastLoadedCompanyIdRef.current) {
      console.log('⏸️ Users already loaded for this company, skipping...');
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);
      setError(null);
      setCompanyId(targetCompanyId);
      lastLoadedCompanyIdRef.current = targetCompanyId;

      const { data: companyUsersData, error: usersError } = await supabase
        .from('company_users')
        .select(`
          id,
          role,
          is_active,
          permissions,
          created_at,
          user_id,
          display_name_en,
          display_name_ar
        `)
        .eq('company_id', targetCompanyId)
        .neq('role', 'super_admin')  // Exclude super admins - they shouldn't be tied to specific companies
        .order('created_at', { ascending: true });

      if (usersError) throw usersError;

      const companyUsers = companyUsersData || [];

      const adminUserIds = companyUsers.map((item) => item.user_id);

      const uniqueUserIds = Array.from(new Set(adminUserIds));

      const authMap: Record<string, AuthUserInfo> = {};

      if (uniqueUserIds.length > 0) {
        const { data: authUsers, error: authUsersError } = await supabase
          .from('company_admin_users_view')
          .select('id, email')
          .in('id', uniqueUserIds);

        if (authUsersError) throw authUsersError;

        (authUsers || []).forEach((authUser) => {
          authMap[(authUser as AuthUserInfo).id] = authUser as AuthUserInfo;
        });
      }

      setAuthUsersMap(authMap);

      const mappedCompanyUsers: ListedUser[] = companyUsers.map((item) => {
        const authInfo = authMap[item.user_id];

        return {
          id: item.id,
          userId: item.user_id,
          email: authInfo?.email ?? null,
          name: item.display_name_en || item.display_name_ar || authInfo?.email || null,
          nameEn: item.display_name_en ?? null,
          nameAr: item.display_name_ar ?? null,
          rawRole: item.role as AdminRole,
          isActive: Boolean(item.is_active),
          permissions: createPermissionsState(
            (item.permissions as Record<string, boolean> | null) ?? null
          ),
          createdAt: item.created_at,
        };
      });

      setUsersList(mappedCompanyUsers);
    } catch (err) {
      console.error('Error loading users:', err);
      setError('Failed to load users.');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, []); // Empty dependency array - function is stable and uses refs for state tracking

  useEffect(() => {
    // Wait for auth to finish loading before proceeding
    if (authLoading || !onboardingLoaded) {
      setLoading(true);
      setError(null);
      return;
    }

    if (!currentCompanyId) {
      setCompanyId(null);
      setUsersList([]);
      if (isSuperAdminUser) {
        setError('Select a company to manage administrators.');
      } else {
        setError('No company associated with the current user.');
      }
      setLoading(false);
      return;
    }

    loadUsers(currentCompanyId);
  }, [currentCompanyId, isSuperAdminUser, authLoading, onboardingLoaded, loadUsers]);

  // Reset refs when user changes to allow reloading for new user
  useEffect(() => {
    lastLoadedCompanyIdRef.current = null;
    isLoadingRef.current = false;
  }, [userRole?.user_id]);

  const renderPermissions = (permissions: PermissionsState) => {
    const enabledModules = MODULES.filter((module) => permissions[module.key]);

    if (enabledModules.length === MODULES.length) {
      return <span className="text-sm text-green-700">Full access to all modules</span>;
    }

    if (enabledModules.length === 0) {
    return <span className="text-sm text-gray-500">No modules enabled</span>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {enabledModules.map((module) => (
          <span
            key={module.key}
            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
          >
            {module.label}
          </span>
        ))}
      </div>
    );
  };

  const handleOpenEditModal = (user: ListedUser) => {
    setEditUser(user);
    setEditRole((user.rawRole as AdminRole) ?? 'finance_admin');
    setEditActive(user.isActive);
    setEditNameEn(user.nameEn || '');
    setEditNameAr(user.nameAr || '');
    setEditPermissions({ ...user.permissions });
    setEditError(null);
  };

  const handleCloseEditModal = () => {
    setEditUser(null);
    setEditError(null);
    setEditPermissions(createPermissionsState());
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;

    try {
      setEditSaving(true);
      setEditError(null);

      const { error: updateError, data } = await supabase
        .from('company_users')
        .update({
          role: editRole,
          is_active: editActive,
          display_name_en: editNameEn.trim() || null,
          display_name_ar: editNameAr.trim() || null,
          permissions: editPermissions,
        })
        .eq('id', editUser.id)
        .select();

      if (updateError) {
        console.error('Error updating user:', updateError);
        setEditError(`Failed to save changes: ${updateError.message || 'Permission denied. Please ensure you have admin privileges.'}`);
        return;
      }

      if (!data || data.length === 0) {
        setEditError('Update completed but no data returned. This may indicate a permissions issue.');
        return;
      }

      handleCloseEditModal();
      if (companyId) {
        await loadUsers(companyId);
      } else if (currentCompanyId) {
        await loadUsers(currentCompanyId);
      }
    } catch (err: any) {
      console.error('Error updating user:', err);
      setEditError(`Failed to save changes: ${err?.message || 'Unknown error occurred'}`);
    } finally {
      setEditSaving(false);
    }
  };

  const formatRoleLabel = (role: ListedUser['rawRole']) => {
    if (!role) return 'Unknown';
    return role.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const toggleEditPermission = (key: PermissionKey) => {
    setEditPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAddPermission = (key: PermissionKey) => {
    setAddPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllEditPermissions = (value: boolean) => {
    setEditPermissions((prev) => {
      const next = { ...prev } as PermissionsState;
      MODULES.forEach((module) => {
        next[module.key] = value;
      });
      return next;
    });
  };

  const setAllAddPermissions = (value: boolean) => {
    setAddPermissions((prev) => {
      const next = { ...prev } as PermissionsState;
      MODULES.forEach((module) => {
        next[module.key] = value;
      });
      return next;
    });
  };

  const handleOpenAddModal = () => {
    setAddEmail('');
    setAddRole('finance_admin');
    setAddActive(true);
    setAddNameEn('');
    setAddNameAr('');
    setAddPermissions(createPermissionsState());
    setAddError(null);
    setShowAddModal(true);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setAddError(null);
    setAddPermissions(createPermissionsState());
  };

  const handleSaveAddUser = async () => {
    if (!companyId) {
      setAddError('Missing company reference. Please refresh and try again.');
      return;
    }

    const trimmedEmail = addEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setAddError('Please enter an email address.');
      return;
    }

    try {
      setAddSaving(true);
      setAddError(null);

    const { data: authUser, error: authLookupError } = await supabase
      .from('company_admin_users_view')
      .select('id, email')
      .eq('email', trimmedEmail)
      .maybeSingle();

    if (authLookupError) throw authLookupError;

    if (!authUser) {
      setAddError('No Supabase user found with that email. Create the account first.');
      return;
    }

    const { data: existingLink, error: linkCheckError } = await supabase
      .from('company_users')
      .select('id')
      .eq('company_id', companyId)
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (linkCheckError) throw linkCheckError;

    if (existingLink) {
      setAddError('This user is already linked to the company.');
      return;
    }

    const { error: insertError } = await supabase
      .from('company_users')
      .insert({
        company_id: companyId,
        user_id: authUser.id,
        role: addRole,
        is_active: addActive,
        display_name_en: addNameEn.trim() || null,
        display_name_ar: addNameAr.trim() || null,
        permissions: addPermissions,
      });

    if (insertError) throw insertError;

      handleCloseAddModal();
      await loadUsers(companyId);
    } catch (err) {
      console.error('Error adding company user:', err);
    setAddError('Failed to add user.');
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div className={isRTL ? 'text-right' : ''}>
          <h1 className="text-3xl font-bold text-gray-900">Company Users</h1>
          <p className="text-gray-600 mt-1">
            Manage administrative users and review their permissions.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center px-4 py-2 text-white text-sm font-semibold rounded-lg shadow-sm focus:outline-none focus:ring-2 transition"
          style={{ backgroundColor: brandColor }}
          onMouseEnter={(e) => {
            const rgb = parseInt(brandColor.slice(1, 3), 16) * 0.9;
            const gg = parseInt(brandColor.slice(3, 5), 16) * 0.9;
            const bb = parseInt(brandColor.slice(5, 7), 16) * 0.9;
            e.currentTarget.style.backgroundColor = `rgb(${Math.round(rgb)}, ${Math.round(gg)}, ${Math.round(bb)})`;
            e.currentTarget.style.setProperty('--tw-ring-color', brandColor);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = brandColor;
          }}
          onFocus={(e) => {
            e.currentTarget.style.setProperty('--tw-ring-color', brandColor);
          }}
        >
          Add User
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading users...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Administrative Users</h2>
                <p className="text-sm text-gray-500">Super Admins, Finance Admins, Legal Admins, and HR Admins</p>
              </div>
            </div>
          </div>

          {usersList.length === 0 ? (
            <div className="p-10 text-center text-gray-500">
              No administrative users found for this company.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Permissions
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Added On
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {usersList.map((companyUser) => {
                    return (
                      <tr key={companyUser.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {companyUser.name || companyUser.email || companyUser.userId}
                          </div>
                          <div className="text-sm text-gray-500">
                            {companyUser.email || companyUser.userId}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 capitalize">
                            {formatRoleLabel(companyUser.rawRole)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                              companyUser.isActive
                                ? 'bg-green-50 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {companyUser.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {renderPermissions(companyUser.permissions)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {companyUser.createdAt
                            ? new Date(companyUser.createdAt).toLocaleDateString('en-GB')
                            : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button
                            onClick={() => handleOpenEditModal(companyUser)}
                            className="p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label={`Actions for ${companyUser.email || companyUser.userId}`}
                          >
                            <MoreVertical className="w-5 h-5 text-gray-500" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Edit User</h3>
                <p className="text-sm text-gray-500">
                  Update role and status for {editUser.email || editUser.userId}
                </p>
              </div>
              <button
                onClick={handleCloseEditModal}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close edit modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {editError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as AdminRole)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {COMPANY_ADMIN_ROLES.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {formatRoleLabel(roleOption)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-500">
                    {editActive ? 'Active' : 'Inactive'}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Name (English)</label>
                  <input
                    type="text"
                    value={editNameEn}
                    onChange={(e) => setEditNameEn(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Name (Arabic)</label>
                  <input
                    type="text"
                    value={editNameAr}
                    onChange={(e) => setEditNameAr(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                    placeholder="جون دو"
                    dir="rtl"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Module Permissions
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setAllEditPermissions(true)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Select all
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setAllEditPermissions(false)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MODULES.map((module) => (
                    <label
                      key={module.key}
                      className="flex items-center space-x-2 rounded-lg border border-gray-200 px-3 py-2 hover:border-blue-300"
                    >
                      <input
                        type="checkbox"
                        checked={editPermissions[module.key]}
                        onChange={() => toggleEditPermission(module.key)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{module.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleCloseEditModal}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
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
                type="button"
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Add Company User</h3>
                <p className="text-sm text-gray-500">
                  Link an existing Supabase user to this company with an admin role.
                </p>
              </div>
              <button
                onClick={handleCloseAddModal}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close add modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {addError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
                  {addError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">User Email</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="name@example.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The user must already exist in Supabase authentication.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as AdminRole)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {COMPANY_ADMIN_ROLES.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {formatRoleLabel(roleOption)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-500">
                    {addActive ? 'Active' : 'Inactive'}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={addActive}
                      onChange={(e) => setAddActive(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Name (English)</label>
                  <input
                    type="text"
                    value={addNameEn}
                    onChange={(e) => setAddNameEn(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Name (Arabic)</label>
                  <input
                    type="text"
                    value={addNameAr}
                    onChange={(e) => setAddNameAr(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                    placeholder="جون دو"
                    dir="rtl"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Module Permissions
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setAllAddPermissions(true)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Select all
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setAllAddPermissions(false)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MODULES.map((module) => (
                    <label
                      key={module.key}
                      className="flex items-center space-x-2 rounded-lg border border-gray-200 px-3 py-2 hover:border-blue-300"
                    >
                      <input
                        type="checkbox"
                        checked={addPermissions[module.key]}
                        onChange={() => toggleAddPermission(module.key)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{module.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleCloseAddModal}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAddUser}
                disabled={addSaving}
                className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
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
                type="button"
              >
                {addSaving ? 'Saving...' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

