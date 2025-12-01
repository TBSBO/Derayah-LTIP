import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Globe, Save, AlertCircle, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface PlatformSettings {
  id: string;
  platform_name_en: string | null;
  platform_name_ar: string | null;
  logo_url: string | null;
  logo_scale: number | null;
}

export default function PlatformSettings() {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { isSuperAdmin } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoScale, setLogoScale] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState<'square' | 'rectangular' | 'custom'>('custom');
  const [cropVertical, setCropVertical] = useState(0); // -50 to 50, adjusts vertical position
  const [cropHorizontal, setCropHorizontal] = useState(0); // -50 to 50, adjusts horizontal position

  useEffect(() => {
    if (!isSuperAdmin()) {
      return;
    }
    loadSettings();
  }, [isSuperAdmin]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const settingsData = data as PlatformSettings;
        setSettings(settingsData);
        setLogoPreview(settingsData.logo_url);
        setLogoScale(
          typeof settingsData.logo_scale === 'number' && !Number.isNaN(settingsData.logo_scale)
            ? settingsData.logo_scale
            : 1.0
        );
        // Reset crop values when loading
        setCropVertical(0);
        setCropHorizontal(0);
        setAspectRatio('custom');
      }
    } catch (error) {
      console.error('Error loading platform settings:', error);
      setMessage({ type: 'error', text: 'Failed to load platform settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please upload an image file (PNG, JPG, SVG, etc.)' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'File size must be less than 5MB' });
      return;
    }

    setUploadingLogo(true);
    setMessage(null);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
        // Reset crop values when new logo is uploaded
        setCropVertical(0);
        setCropHorizontal(0);
        setAspectRatio('custom');
        setLogoScale(1.0);
      };
      reader.readAsDataURL(file);

      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `platform-logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('company-assets')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL');
      }

      // Update settings state
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              logo_url: urlData.publicUrl,
            }
          : prev
      );
      setLogoPreview(urlData.publicUrl);

      setMessage({ type: 'success', text: 'Logo uploaded successfully' });
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      setMessage({
        type: 'error',
        text: error?.message || 'Failed to upload logo. Please try again.',
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            logo_url: null,
          }
        : prev
    );
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setMessage(null);

    try {
      console.log('Attempting to save platform settings:', {
        id: settings.id,
        platform_name_en: settings.platform_name_en,
        platform_name_ar: settings.platform_name_ar,
        logo_url: logoPreview,
        logo_scale: logoScale,
      });

      // First, verify we can read the row
      const { data: readData, error: readError } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('id', settings.id)
        .single();

      if (readError) {
        console.error('Cannot read platform_settings row:', readError);
        throw new Error(`Cannot read settings: ${readError.message}`);
      }

      console.log('Current row before update:', readData);

      // Prepare the update payload
      const updatePayload = {
        platform_name_en: settings.platform_name_en,
        platform_name_ar: settings.platform_name_ar,
        logo_url: logoPreview,
        logo_scale: logoScale,
        updated_at: new Date().toISOString(),
      };

      console.log('Update payload being sent:', JSON.stringify(updatePayload, null, 2));
      console.log('Updating row with ID:', settings.id);

      // Try using RPC function first (if it exists), otherwise fall back to direct update
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('update_platform_settings', {
          p_platform_name_en: settings.platform_name_en || null,
          p_platform_name_ar: settings.platform_name_ar || null,
          p_logo_url: logoPreview || null,
          p_logo_scale: logoScale,
        } as any);

        if (!rpcError && rpcData) {
          console.log('Update via RPC function succeeded:', rpcData);
          const updated = rpcData as PlatformSettings;
          setSettings(updated);
          setLogoPreview(updated.logo_url);
          setLogoScale(updated.logo_scale || 1.0);
          await loadSettings();
          setMessage({ type: 'success', text: 'Platform settings saved successfully' });
          return;
        } else if (rpcError && !rpcError.message.includes('function update_platform_settings')) {
          // RPC function exists but failed
          console.error('RPC function error:', rpcError);
          throw rpcError;
        }
        // If function doesn't exist, fall through to direct update
        console.log('RPC function not found, using direct update');
      } catch (rpcErr: any) {
        if (rpcErr?.message?.includes('function update_platform_settings')) {
          // Function doesn't exist, continue with direct update
          console.log('RPC function not available, using direct update');
        } else {
          throw rpcErr;
        }
      }

      // Fallback: Perform the update directly (without .select() to avoid RLS issues on the return)
      // @ts-ignore - Supabase type inference issue with platform_settings table
      const { error: updateError } = await supabase
        .from('platform_settings')
        // @ts-ignore - Supabase type inference issue
        .update(updatePayload)
        .eq('id', settings.id);

      console.log('Update response - error:', updateError);

      if (updateError) {
        console.error('Supabase error details:', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
        });
        throw updateError;
      }

      console.log('Update command executed successfully, verifying...');

      // Re-read the row to verify and get updated data
      const { data: verifyData, error: verifyError } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('id', settings.id)
        .single();

      if (verifyError) {
        console.error('Cannot verify update:', verifyError);
        throw new Error(`Update may have succeeded but cannot verify: ${verifyError.message}`);
      }

      if (verifyData) {
        console.log('Verified row after update:', verifyData);
        // Update local state with verified data
        const verified = verifyData as PlatformSettings;
        setSettings(verified);
        setLogoPreview(verified.logo_url);
        setLogoScale(verified.logo_scale || 1.0);
      } else {
        throw new Error('Update succeeded but could not retrieve updated row');
      }

      // Reload settings to ensure UI is in sync
      await loadSettings();

      setMessage({ type: 'success', text: 'Platform settings saved successfully' });
    } catch (error: any) {
      console.error('Error saving platform settings:', error);
      const errorMessage = error?.message || 'Failed to save platform settings';
      const errorDetails = error?.details ? ` Details: ${error.details}` : '';
      const errorHint = error?.hint ? ` Hint: ${error.hint}` : '';
      
      setMessage({
        type: 'error',
        text: `${errorMessage}${errorDetails}${errorHint}`,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isSuperAdmin()) {
    return (
      <div className="bg-white rounded-xl p-12 border border-gray-200 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-600">Only super administrators can access platform settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-white rounded-xl p-12 border border-gray-200 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Settings Not Found</h3>
        <p className="text-gray-600">Unable to load platform settings.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Platform Settings</h1>
        <p className="text-gray-600 mt-1">Manage platform-wide branding and logo</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{message.text}</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Platform Branding</h2>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platform Name (English)
              </label>
              <input
                type="text"
                value={settings.platform_name_en || ''}
                onChange={(e) =>
                  setSettings({ ...settings, platform_name_en: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Derayah Equity Studio"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platform Name (Arabic)
              </label>
              <input
                type="text"
                value={settings.platform_name_ar || ''}
                onChange={(e) =>
                  setSettings({ ...settings, platform_name_ar: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                dir="rtl"
                placeholder="ديراياه إستوديو الأسهم"
              />
            </div>
          </div>

          {/* Logo Upload Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Platform Logo
            </label>
            <p className="text-xs text-gray-500 mb-4">
              Upload a logo that will appear on landing pages, login pages, and throughout the platform.
              Supported formats: PNG, JPG, SVG (max 5MB)
            </p>

            <div className="space-y-4">
              {/* Logo Preview - Simple preview before cropping controls */}
              {logoPreview && (
                <div className="relative inline-block">
                  <div className="w-32 h-32 border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
                    <img
                      src={logoPreview}
                      alt="Platform logo preview"
                      className="w-full h-full object-contain"
                      style={{
                        transform: `scale(${logoScale}) translate(${cropHorizontal}%, ${cropVertical}%)`,
                        transformOrigin: 'center',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleRemoveLogo}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition"
                    title="Remove logo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Upload Button */}
              <div>
                <label className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition">
                  <Upload className="w-4 h-4 mr-2" />
                  <span>{logoPreview ? 'Replace Logo' : 'Upload Logo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    disabled={uploadingLogo}
                  />
                </label>
                {uploadingLogo && (
                  <span className="ml-3 text-sm text-gray-600">Uploading...</span>
                )}
              </div>

              {/* Logo Cropping Controls */}
              {logoPreview && (
                <div className="space-y-4 max-w-2xl">
                  {/* Aspect Ratio Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Aspect Ratio
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAspectRatio('square')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          aspectRatio === 'square'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Square (1:1)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAspectRatio('rectangular')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          aspectRatio === 'rectangular'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Rectangular (4:3)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAspectRatio('custom')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          aspectRatio === 'custom'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>

                  {/* Logo Preview with Crop Frame */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Preview
                    </label>
                    <div className="relative inline-block">
                      <div
                        className={`border-2 border-blue-500 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center ${
                          aspectRatio === 'square'
                            ? 'w-48 h-48'
                            : aspectRatio === 'rectangular'
                            ? 'w-64 h-48'
                            : 'w-64 h-48'
                        }`}
                      >
                        <img
                          src={logoPreview}
                          alt="Platform logo preview"
                          className="w-full h-full object-contain"
                          style={{
                            transform: `scale(${logoScale}) translate(${cropHorizontal}%, ${cropVertical}%)`,
                            transformOrigin: 'center',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Zoom/Scale Control */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Zoom: {Math.round(logoScale * 100)}%
                    </label>
                    <div className="flex items-center space-x-3">
                      <ZoomOut className="w-4 h-4 text-gray-400" />
                      <input
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.05"
                        value={logoScale}
                        onChange={(e) => setLogoScale(Number(e.target.value))}
                        className="flex-1"
                      />
                      <ZoomIn className="w-4 h-4 text-gray-400" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Increase to crop vertical height or horizontal width
                    </p>
                  </div>

                  {/* Vertical Crop Control */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Vertical Position: {cropVertical > 0 ? '↓' : cropVertical < 0 ? '↑' : '—'} {Math.abs(cropVertical)}%
                    </label>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs text-gray-500 w-12">Up</span>
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        step="1"
                        value={cropVertical}
                        onChange={(e) => setCropVertical(Number(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-500 w-12">Down</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Adjust to reduce vertical height or center the logo vertically
                    </p>
                  </div>

                  {/* Horizontal Crop Control */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Horizontal Position: {cropHorizontal > 0 ? '→' : cropHorizontal < 0 ? '←' : '—'} {Math.abs(cropHorizontal)}%
                    </label>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs text-gray-500 w-12">Left</span>
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        step="1"
                        value={cropHorizontal}
                        onChange={(e) => setCropHorizontal(Number(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-500 w-12">Right</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Adjust to reduce horizontal width or center the logo horizontally
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition hover:bg-blue-700"
        >
          <Save className="w-5 h-5" />
          <span className="font-medium">{saving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  );
}

