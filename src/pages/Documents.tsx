import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/dateUtils';
import { FileText, Plus, Download, Eye, Trash2, Edit, File, CheckCircle, Clock, Send, MoreHorizontal, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface DocumentTemplate {
  id: string;
  template_name: string;
  document_type: 'grant_agreement' | 'exercise_notice' | 'amendment' | 'termination' | 'custom';
  template_content: string;
  merge_fields: any;
  is_active: boolean;
}

interface GeneratedDocument {
  id: string;
  document_type: string;
  document_name: string;
  document_content: string;
  status: 'draft' | 'pending_signature' | 'signed' | 'archived';
  employee_id: string | null;
  grant_id: string | null;
  generated_at: string;
  employees?: {
    first_name_en: string;
    last_name_en: string;
    email: string;
  };
}

interface ESignature {
  id: string;
  document_id: string;
  signer_email: string;
  signer_name: string;
  status: 'pending' | 'signed' | 'declined';
  signed_at: string | null;
}

export default function Documents() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [activeTab, setActiveTab] = useState<'templates' | 'documents' | 'signatures'>('documents');
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [signatures, setSignatures] = useState<ESignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<GeneratedDocument | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [grants, setGrants] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [approvingDocumentId, setApprovingDocumentId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const { userRole, hasPermission } = useAuth();

  const canApproveDocuments = useMemo(() => {
    if (!userRole) {
      console.log('❌ canApproveDocuments: userRole is null');
      return false;
    }
    
    console.log('🔍 Debug canApproveDocuments:', {
      userRole,
      user_type: userRole.user_type,
      role: userRole.role,
      hasPermission: hasPermission('contract_approval'),
      fullUserRole: JSON.stringify(userRole, null, 2)
    });
    
    if (userRole.user_type === 'super_admin') {
      console.log('✅ canApproveDocuments: user_type is super_admin');
      return true;
    }
    if (userRole.role === 'super_admin') {
      console.log('✅ canApproveDocuments: role is super_admin');
      return true;
    }
    if (userRole.role === 'finance_admin') {
      console.log('✅ canApproveDocuments: role is finance_admin');
      return true;
    }
    if (userRole.role === 'hr_admin' || userRole.role === 'operations_admin' || userRole.role === 'legal_admin' || userRole.role === 'company_admin') {
      const hasPerm = hasPermission('contract_approval');
      console.log('🔍 canApproveDocuments: hr/operations/legal/company admin, hasPermission:', hasPerm);
      return hasPerm;
    }
    
    console.log('❌ canApproveDocuments: No matching conditions');
    return false;
  }, [userRole, hasPermission]);

  const [newTemplate, setNewTemplate] = useState({
    template_name: '',
    document_type: 'grant_agreement' as const,
    template_content: '',
    merge_fields: { fields: [] as string[] },
    is_active: true,
    language: 'en'
  });

  const [generateForm, setGenerateForm] = useState({
    template_id: '',
    employee_id: '',
    grant_id: '',
    document_name: ''
  });

  useEffect(() => {
    loadData();
    loadEmployeesAndGrants();
  }, [activeTab]);

  const loadEmployeesAndGrants = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser) return;

      const [employeesRes, grantsRes] = await Promise.all([
        supabase
          .from('employees')
          .select('id, first_name_en, last_name_en, email, employee_number')
          .eq('company_id', companyUser.company_id),
        supabase
          .from('grants')
          .select('id, grant_number, employee_id')
          .eq('company_id', companyUser.company_id)
          .eq('status', 'active')
      ]);

      if (employeesRes.data) setEmployees(employeesRes.data);
      if (grantsRes.data) setGrants(grantsRes.data);
    } catch (error) {
      console.error('Error loading employees and grants:', error);
    }
  };

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!companyUser) return;

      if (activeTab === 'templates') {
        const { data } = await supabase
          .from('document_templates')
          .select('*')
          .eq('company_id', companyUser.company_id)
          .order('created_at', { ascending: false });
        if (data) setTemplates(data);
      } else if (activeTab === 'documents') {
        const { data } = await supabase
          .from('generated_documents')
          .select('*, employees(first_name_en, last_name_en, email), grants(status, employee_acceptance_at)')
          .eq('company_id', companyUser.company_id)
          .order('generated_at', { ascending: false });
        
        if (data) {
          // Update document status based on grant status
          const updatedDocuments = data.map(doc => {
            const grant = doc.grants;
            let documentStatus = doc.status;

            if (grant?.employee_acceptance_at) {
              documentStatus = 'signed';
            }

            return {
              ...doc,
              status: documentStatus
            };
          });
          
          setDocuments(updatedDocuments);
        }
      } else if (activeTab === 'signatures') {
        const { data } = await supabase
          .from('e_signatures')
          .select('*')
          .order('created_at', { ascending: false });
        if (data) setSignatures(data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (!companyUser) return;

      const { error } = await supabase
        .from('document_templates')
        .insert({
          company_id: companyUser.company_id,
          ...newTemplate,
          created_by: user.id
        });

      if (error) throw error;

      setShowTemplateModal(false);
      resetTemplateForm();
      loadData();
    } catch (error) {
      console.error('Error creating template:', error);
      alert('Failed to create template');
    }
  };

  const handleGenerateDocument = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!companyUser) return;

      const template = templates.find(t => t.id === generateForm.template_id);
      if (!template) return;

      const employee = employees.find(e => e.id === generateForm.employee_id);
      const grant = grants.find(g => g.id === generateForm.grant_id);

      let content = template.template_content;
      if (employee) {
        content = content.replace(/{{employee_first_name}}/g, employee.first_name_en || '');
        content = content.replace(/{{employee_last_name}}/g, employee.last_name_en || '');
        content = content.replace(/{{employee_email}}/g, employee.email || '');
        content = content.replace(/{{employee_number}}/g, employee.employee_number || '');
      }
      if (grant) {
        content = content.replace(/{{grant_number}}/g, grant.grant_number || '');
      }

      const { error } = await supabase
        .from('generated_documents')
        .insert({
          company_id: companyUser.company_id,
          template_id: generateForm.template_id,
          employee_id: generateForm.employee_id || null,
          grant_id: generateForm.grant_id || null,
          document_name: generateForm.document_name,
          document_content: content,
          document_type: 'grant_agreement',
          status: 'draft'
        });

      if (error) throw error;

      setShowGenerateModal(false);
      resetGenerateForm();
      setActiveTab('documents');
      loadData();
      alert('Document generated successfully!');
    } catch (error) {
      console.error('Error generating document:', error);
      alert('Failed to generate document');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;

    try {
      const { error } = await supabase
        .from('document_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  };

  const handleRequestSignature = async (documentId: string) => {
    try {
      const doc = documents.find(d => d.id === documentId);
      if (!doc || !doc.employee_id) {
        alert('No employee associated with this document');
        return;
      }

      const employee = employees.find(e => e.id === doc.employee_id);
      if (!employee) {
        alert('Employee not found');
        return;
      }

      const { error: docError } = await supabase
        .from('generated_documents')
        .update({ status: 'pending_signature' })
        .eq('id', documentId);

      if (docError) throw docError;

      const { error: sigError } = await supabase
        .from('e_signatures')
        .insert({
          document_id: documentId,
          signer_email: employee.email,
          signer_name: `${employee.first_name_en} ${employee.last_name_en}`,
          status: 'pending'
        });

      if (sigError) throw sigError;

      alert(`Signature request sent to ${employee.email}`);
      loadData();
    } catch (error) {
      console.error('Error requesting signature:', error);
      alert('Failed to send signature request');
    }
  };

  const handleApproveDocument = async (documentId: string) => {
    if (approvingDocumentId) return;

    try {
      setApprovingDocumentId(documentId);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Unable to approve the document because no active session was found.');
        return;
      }

      const timestamp = new Date().toISOString();

      const { error } = await supabase
        .from('generated_documents')
        .update({
          status: 'pending_signature',
          approved_by: user.id,
          approved_at: timestamp
        })
        .eq('id', documentId);

      if (error) throw error;

      setDocuments(prev =>
        prev.map(doc =>
          doc.id === documentId ? { ...doc, status: 'pending_signature' } : doc
        )
      );

      if (selectedDocument?.id === documentId) {
        setSelectedDocument({ ...selectedDocument, status: 'pending_signature' });
      }

      loadData();
      alert('Document approved successfully. You can now send it for signature.');
    } catch (error) {
      console.error('Error approving document:', error);
      alert('Failed to approve the document. Please try again.');
    } finally {
      setApprovingDocumentId(null);
    }
  };

  const handleViewDocument = (doc: GeneratedDocument) => {
    setSelectedDocument(doc);
    setShowDocumentModal(true);
  };

  const resetTemplateForm = () => {
    setNewTemplate({
      template_name: '',
      document_type: 'grant_agreement',
      template_content: '',
      merge_fields: { fields: [] },
      is_active: true,
      language: 'en'
    });
  };

  const resetGenerateForm = () => {
    setGenerateForm({
      template_id: '',
      employee_id: '',
      grant_id: '',
      document_name: ''
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      pending_signature: 'bg-yellow-100 text-yellow-800',
      signed: 'bg-green-100 text-green-800',
      archived: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
      declined: 'bg-red-100 text-red-800'
    };
    const labels: Record<string, string> = {
      pending_signature: 'Pending Signature',
      draft: 'Draft',
      signed: 'Signed',
      archived: 'Archived',
      pending: 'Pending',
      declined: 'Declined'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.draft}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading...</div></div>;
  }

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div className={isRTL ? 'text-right' : ''}>
          <h1 className={`text-2xl font-bold text-gray-900 flex items-center gap-3 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
            {t('documents.title')}
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white text-lg font-semibold">
              {documents.length}
            </span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage templates, generate documents, and track e-signatures
          </p>
        </div>
        <div className={`flex items-center space-x-3 ${isRTL ? 'space-x-reverse flex-row-reverse' : ''}`}>
          {activeTab === 'templates' && (
            <button
              onClick={() => setShowTemplateModal(true)}
              className={`flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition ${isRTL ? 'space-x-reverse' : ''}`}
            >
              <Plus className="w-4 h-4" />
              <span>{t('documents.newTemplate')}</span>
            </button>
          )}
          {activeTab === 'documents' && (
            <button
              onClick={() => setShowGenerateModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <FileText className="w-4 h-4" />
              <span>{t('documents.generateDocument')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['documents', 'templates', 'signatures'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div key={template.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-300 transition">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <File className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{template.template_name}</h3>
                    <span className="text-xs text-gray-500 capitalize">{template.document_type.replace('_', ' ')}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteTemplate(template.id)}
                  className="text-gray-400 hover:text-red-600 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{template.merge_fields?.fields?.length || 0} merge fields</span>
                {template.is_active && (
                  <span className="flex items-center space-x-1 text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>{t('documents.active')}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="col-span-3 bg-gray-50 rounded-lg border border-gray-200 p-12 text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('documents.noTemplatesYet')}</h3>
              <p className="text-gray-600 mb-6">{t('documents.createFirstTemplate')}</p>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                <Plus className="w-4 h-4" />
                <span>{t('documents.createTemplate')}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('documents.document')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('documents.employee')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('documents.type')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('documents.status')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('documents.generatedAt')}</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('documents.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {documents.map((doc) => {
                const normalizedStatus = doc.status?.toLowerCase?.() || doc.status;
                return (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <button
                        onClick={() => handleViewDocument(doc)}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline transition text-left"
                      >
                        {doc.document_name}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {doc.employees ? `${doc.employees.first_name_en} ${doc.employees.last_name_en}` : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 capitalize">{doc.document_type.replace('_', ' ')}</td>
                  <td className="px-6 py-4">{getStatusBadge(doc.status)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDate(doc.generated_at)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      {(() => {
                        const shouldShow = canApproveDocuments && normalizedStatus === 'draft';
                        if (normalizedStatus === 'draft') {
                          console.log('🔍 Button render check for draft document:', {
                            documentId: doc.id,
                            documentName: doc.document_name,
                            canApproveDocuments,
                            normalizedStatus,
                            docStatus: doc.status,
                            shouldShow
                          });
                        }
                        return null;
                      })()}
                      {canApproveDocuments && normalizedStatus === 'draft' && (
                        <button
                          onClick={() => handleApproveDocument(doc.id)}
                          className="p-1 text-gray-400 hover:text-green-600 transition disabled:opacity-50"
                          title="Approve for Signature"
                          disabled={approvingDocumentId === doc.id}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <div className="relative inline-block text-left">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition"
                        title="More actions"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openMenuId === doc.id && (
                        <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                          <div className="py-1">
                            <button
                              onClick={() => {
                                handleViewDocument(doc);
                                setOpenMenuId(null);
                              }}
                              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </button>
                            <button
                              onClick={() => {
                                handleRequestSignature(doc.id);
                                setOpenMenuId(null);
                              }}
                              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                              disabled={normalizedStatus !== 'draft'}
                            >
                              <Send className="w-4 h-4 mr-2" />
                              Send for Signature
                            </button>
                            <button
                              onClick={() => {
                                alert('Email sharing functionality is coming soon!');
                                setOpenMenuId(null);
                              }}
                              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <Mail className="w-4 h-4 mr-2" />
                              Share by Email
                            </button>
                            {(() => {
                              const shouldShowInMenu = canApproveDocuments && normalizedStatus === 'draft';
                              if (normalizedStatus === 'draft' && openMenuId === doc.id) {
                                console.log('🔍 Actions menu - Approve button check:', {
                                  documentId: doc.id,
                                  canApproveDocuments,
                                  normalizedStatus,
                                  shouldShowInMenu
                                });
                              }
                              return null;
                            })()}
                            {canApproveDocuments && normalizedStatus === 'draft' && (
                              <button
                                onClick={() => {
                                  handleApproveDocument(doc.id);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                disabled={approvingDocumentId === doc.id}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Approve
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
          {documents.length === 0 && (
            <div className="p-12 text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">{t('documents.noDocumentsGeneratedYet')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'signatures' && (
        <div className="space-y-4">
          {signatures.map((sig) => (
            <div key={sig.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{sig.signer_name}</h3>
                  <p className="text-sm text-gray-600">{sig.signer_email}</p>
                </div>
                <div className="text-right">
                  {getStatusBadge(sig.status)}
                  {sig.signed_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      Signed: {formatDate(sig.signed_at)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {signatures.length === 0 && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-12 text-center">
              <Send className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">{t('documents.noSignatureRequestsYet')}</p>
            </div>
          )}
        </div>
      )}

      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">{t('documents.createDocumentTemplate')}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('documents.templateName')}</label>
                <input
                  type="text"
                  value={newTemplate.template_name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, template_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Standard Grant Agreement"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('documents.templateType')}</label>
                <select
                  value={newTemplate.document_type}
                  onChange={(e) => setNewTemplate({ ...newTemplate, document_type: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="grant_agreement">Grant Agreement</option>
                  <option value="exercise_notice">Exercise Notice</option>
                  <option value="amendment">Amendment</option>
                  <option value="termination">Termination</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Content Template</label>
                <textarea
                  value={newTemplate.template_content}
                  onChange={(e) => setNewTemplate({ ...newTemplate, template_content: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={8}
                  placeholder="Use {{field_name}} for merge fields"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={() => { setShowTemplateModal(false); resetTemplateForm(); }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={!newTemplate.template_name || !newTemplate.template_content}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                Create Template
              </button>
            </div>
          </div>
        </div>
      )}

      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Generate Document</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Template</label>
                <select
                  value={generateForm.template_id}
                  onChange={(e) => setGenerateForm({ ...generateForm, template_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Choose a template...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.template_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Employee</label>
                <select
                  value={generateForm.employee_id}
                  onChange={(e) => setGenerateForm({ ...generateForm, employee_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Choose an employee...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name_en} {emp.last_name_en} ({emp.employee_number})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Grant</label>
                <select
                  value={generateForm.grant_id}
                  onChange={(e) => setGenerateForm({ ...generateForm, grant_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={!generateForm.employee_id}
                >
                  <option value="">Choose a grant...</option>
                  {grants.filter(g => g.employee_id === generateForm.employee_id).map(grant => (
                    <option key={grant.id} value={grant.id}>
                      {grant.grant_number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Document Name</label>
                <input
                  type="text"
                  value={generateForm.document_name}
                  onChange={(e) => setGenerateForm({ ...generateForm, document_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., Grant Agreement - John Doe"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={() => { setShowGenerateModal(false); resetGenerateForm(); }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateDocument}
                disabled={!generateForm.template_id || !generateForm.document_name}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {showDocumentModal && selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedDocument.document_name}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedDocument.employees && (
                    <span>For: {selectedDocument.employees.first_name_en} {selectedDocument.employees.last_name_en}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusBadge(selectedDocument.status)}
                <button
                  onClick={() => setShowDocumentModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800">
                  {selectedDocument.document_content}
                </pre>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex items-center justify-end space-x-3 bg-gray-50">
              <button
                onClick={() => setShowDocumentModal(false)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Close
              </button>
              {selectedDocument.status === 'draft' && canApproveDocuments && (
                <button
                  onClick={() => {
                    handleApproveDocument(selectedDocument.id);
                    setShowDocumentModal(false);
                  }}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                  disabled={approvingDocumentId === selectedDocument.id}
                >
                  Approve for Signature
                </button>
              )}
              {selectedDocument.status === 'draft' && (
                <button
                  onClick={() => {
                    handleRequestSignature(selectedDocument.id);
                    setShowDocumentModal(false);
                  }}
                  className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
                >
                  Send for Signature
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
