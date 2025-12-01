import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Building2, Users, Shield, Globe, Save, AlertCircle, TrendingUp, RefreshCw, ChevronDown, Search, X } from 'lucide-react';
import { TADAWUL_COMPANIES, searchCompanies, getCompanyBySymbol, type TadawulCompany } from '../data/tadawulCompanies';
import { updateCompanyPriceFromTadawul } from '../lib/tadawulPriceFetcher';
import { useCompanyColor } from '../hooks/useCompanyColor';

interface CompanySettings {
  id: string;
  company_name_en: string;
  company_name_ar: string;
  registration_number: string;
  total_reserved_shares: number;
  available_shares: number;
  shares_granted: number;
  shares_vested: number;
  fiscal_year_end: string;
  tadawul_symbol: string;
  tadawul_market?: 'main' | 'nomu';
  current_fmv: number | null;
  share_price: number | null;
  fmv_source: 'manual' | 'tadawul' | null;
  last_price_fetch?: string | null;
  brand_color?: string;
  logo_url?: string | null;
  logo_scale?: number | null;
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { brandColor } = useCompanyColor();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  // Tadawul company selector state
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [selectedMarket, setSelectedMarket] = useState<'main' | 'nomu'>('main');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id, companies(*)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (companyUser?.companies) {
        const company = companyUser.companies as Partial<CompanySettings> & Record<string, any>;
        
        // Determine market from company data or default to main
        const companyData = getCompanyBySymbol(company.tadawul_symbol || '');
        const market = company.tadawul_market || companyData?.market || 'main';

        setSettings({
          ...(company as CompanySettings),
          tadawul_symbol: (company.tadawul_symbol || '').toUpperCase(),
          tadawul_market: market,
          current_fmv:
            typeof company.current_fmv === 'number' && !Number.isNaN(company.current_fmv)
              ? company.current_fmv
              : null,
          share_price: typeof company.current_fmv === 'number' && !Number.isNaN(company.current_fmv)
            ? company.current_fmv
            : null,
          fmv_source: (company.fmv_source as CompanySettings['fmv_source']) ?? 'tadawul',
          last_price_fetch: company.last_price_fetch || null,
          brand_color: company.brand_color || '#2563EB',
          logo_url: company.logo_url || null,
          logo_scale:
            typeof company.logo_scale === 'number' && !Number.isNaN(company.logo_scale)
              ? company.logo_scale
              : 1,
        });
        
        setSelectedMarket(market);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchPrice = async () => {
    if (!settings || !settings.tadawul_symbol) {
      setMessage({ type: 'error', text: t('settings.pleaseSelectTadawulSymbol') });
      return;
    }

    setFetchingPrice(true);
    setMessage(null);

    try {
      const result = await updateCompanyPriceFromTadawul(
        settings.id,
        settings.tadawul_symbol,
        selectedMarket
      );

      if (result.success && result.price !== undefined) {
        // Also update market_data table with the fetched price
        await handleUpdateMarketData(result.price);
        
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                share_price: result.price!,
                current_fmv: result.price!,
                fmv_source: 'tadawul',
                last_price_fetch: new Date().toISOString(),
              }
            : prev
        );
        setMessage({
          type: 'success',
          text: `Price fetched successfully: SAR ${result.price.toFixed(2)} (Note: Data may be delayed up to 15 minutes)`,
        });
      } else {
        // Show error but allow manual entry
        const errorMessage = result.error || 'Failed to fetch price from Tadawul.';
        
        // Check if it's because Edge Function is not deployed
        if (errorMessage.includes('not deployed') || errorMessage.includes('Function not found')) {
          setMessage({
            type: 'error',
            text: 'Edge Function not deployed. Please deploy it using: supabase functions deploy fetch-tadawul-price. For now, you can enter the price manually in the "Current Share Price" field above.',
          });
        } else {
          setMessage({
            type: 'error',
            text: `${errorMessage} You can enter the price manually in the "Current Share Price" field above.`,
          });
        }
      }
    } catch (error: any) {
      console.error('Error fetching price:', error);
      setMessage({ type: 'error', text: error?.message || t('settings.failedToFetchPrice') });
    } finally {
      setFetchingPrice(false);
    }
  };

  const handleUpdateMarketData = async (price: number) => {
    if (!settings || !settings.tadawul_symbol) return;

    try {
      // Update market_data table using the function
      // Note: p_symbol and p_closing_price are required, others are optional
      const { error } = await supabase.rpc('update_market_price', {
        p_symbol: settings.tadawul_symbol,
        p_closing_price: price,
        p_trading_date: new Date().toISOString().split('T')[0],
        p_source: 'Manual Update from Settings',
      });

      if (error) {
        console.error('Error updating market_data:', error);
        // If RPC fails, try direct insert/update
        const { error: directError } = await supabase
          .from('market_data')
          .upsert({
            tadawul_symbol: settings.tadawul_symbol,
            trading_date: new Date().toISOString().split('T')[0],
            closing_price: price,
            opening_price: price,
            high_price: price,
            low_price: price,
            source: 'Manual Update from Settings',
            last_updated: new Date().toISOString(),
          }, {
            onConflict: 'tadawul_symbol,trading_date',
          });

        if (directError) {
          console.error('Error with direct update:', directError);
        }
      }
    } catch (error) {
      console.error('Error updating market data:', error);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!settings) return;
    const file = event.target.files?.[0];
    if (!file) return;

    // Basic client-side validation
    const maxSizeMb = 2;
    if (file.size > maxSizeMb * 1024 * 1024) {
      setMessage({
        type: 'error',
        text: `Logo is too large. Please upload an image smaller than ${maxSizeMb}MB.`,
      });
      event.target.value = '';
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setMessage({
        type: 'error',
        text: 'Invalid file type. Please upload a PNG, JPG, SVG, or WEBP image.',
      });
      event.target.value = '';
      return;
    }

    try {
      setUploadingLogo(true);
      setMessage(null);

      const path = `logos/${settings.id}/${Date.now()}-${file.name}`;

      // Note: make sure you have a public bucket called "company-assets" in Supabase
      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        console.error('Error uploading logo:', uploadError);
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('company-assets').getPublicUrl(path);

      setSettings((prev) =>
        prev
          ? {
              ...prev,
              logo_url: publicUrl,
              // Reset to default scale when a new logo is uploaded
              logo_scale: prev.logo_scale && !Number.isNaN(prev.logo_scale) ? prev.logo_scale : 1,
            }
          : prev
      );

      // Persist immediately so it is available across sessions
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          logo_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      if (updateError) {
        console.error('Error saving logo URL:', updateError);
        throw updateError;
      }

      setMessage({
        type: 'success',
        text: 'Company logo updated successfully.',
      });
    } catch (error: any) {
      console.error('Error handling logo upload:', error);
      setMessage({
        type: 'error',
        text: error?.message || 'Failed to upload logo. Please try again.',
      });
    } finally {
      setUploadingLogo(false);
      // Reset file input so the same file can be re-selected if needed
      event.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setMessage(null);

    try {
      const symbol = (settings.tadawul_symbol || '').trim().toUpperCase();

      if (!symbol) {
        setMessage({ type: 'error', text: 'Tadawul symbol is required to save settings.' });
        setSaving(false);
        return;
      }

      // Use share_price if set, otherwise use current_fmv
      const sharePrice = settings.share_price !== null && settings.share_price !== undefined
        ? settings.share_price
        : settings.current_fmv;

      // Determine source: if manual FMV is set and different from share price, use manual
      const useManual = settings.current_fmv !== null && 
                       settings.current_fmv !== sharePrice &&
                       settings.current_fmv > 0;

      // Validate brand_color
      const brandColor = settings.brand_color || '#2563EB';
      const validColor = /^#[0-9A-F]{6}$/i.test(brandColor) ? brandColor : '#2563EB';

      const { error } = await supabase
        .from('companies')
        .update({
          company_name_en: settings.company_name_en,
          company_name_ar: settings.company_name_ar,
          fiscal_year_end: settings.fiscal_year_end,
          tadawul_symbol: symbol,
          current_fmv: sharePrice,
          fmv_source: useManual ? 'manual' : (sharePrice ? 'tadawul' : null),
          brand_color: validColor,
          logo_url: settings.logo_url || null,
          logo_scale:
            settings.logo_scale !== null && settings.logo_scale !== undefined
              ? settings.logo_scale
              : 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      if (error) throw error;

      setSettings((prev) =>
        prev
          ? {
              ...prev,
              tadawul_symbol: symbol,
              current_fmv: sharePrice,
              fmv_source: useManual ? 'manual' : (sharePrice ? 'tadawul' : null),
            }
          : prev
      );

      setMessage({ type: 'success', text: t('settings.settingsSavedSuccessfully') });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      
      // Extract detailed error message
      let errorMessage = t('settings.failedToSaveSettings');
      
      // Handle Supabase PostgREST errors
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error?.message) {
        errorMessage = error.error.message;
      } else if (error?.error && typeof error.error === 'string') {
        errorMessage = error.error;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Check for RLS policy errors specifically
      if (errorMessage.includes('permission denied') || errorMessage.includes('new row violates row-level security')) {
        errorMessage = 'Permission denied: You do not have permission to update company settings. Please contact your administrator.';
      }
      
      setMessage({ 
        type: 'error', 
        text: `Failed to save settings: ${errorMessage}` 
      });
    } finally {
      setSaving(false);
    }
  };

  // Filter companies based on search and market
  const filteredCompanies = useMemo(() => {
    let companies = TADAWUL_COMPANIES.filter(c => c.market === selectedMarket);
    
    if (companySearchQuery.trim()) {
      companies = searchCompanies(companySearchQuery).filter(c => c.market === selectedMarket);
    }
    
    return companies.slice(0, 50); // Limit to 50 results
  }, [companySearchQuery, selectedMarket]);

  const handleSelectCompany = (company: TadawulCompany) => {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            tadawul_symbol: company.symbol,
            tadawul_market: company.market,
          }
        : prev
    );
    setSelectedMarket(company.market);
    setShowCompanyDropdown(false);
    setCompanySearchQuery('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div 
          className="animate-spin rounded-full h-12 w-12 border-b-2"
          style={{ borderBottomColor: brandColor }}
        ></div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-white rounded-xl p-12 border border-gray-200 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">{t('settings.noCompanyFound')}</h3>
        <p className="text-gray-600">{t('settings.unableToLoadSettings')}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('settings.title')}</h1>
        <p className="text-gray-600 mt-1">{t('settings.description')}</p>
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
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${brandColor}15` }}
            >
              <Building2 className="w-5 h-5" style={{ color: brandColor }} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{t('settings.companyInformation')}</h2>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name (English)
              </label>
              <input
                type="text"
                value={settings.company_name_en}
                onChange={(e) =>
                  setSettings({ ...settings, company_name_en: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Company Logo */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Logo
              </label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-lg border border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
                    {settings.logo_url ? (
                      <img
                        src={settings.logo_url}
                        alt="Company logo"
                        className="max-w-full max-h-full object-contain"
                        style={{
                          transform: `scale(${settings.logo_scale || 1})`,
                          transformOrigin: 'center center',
                        }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-xs text-gray-400 text-center px-2">
                        No logo
                      </span>
                    )}
                  </div>
                  <div>
                    <input
                      id="company-logo"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                      className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      PNG, JPG, SVG, or WEBP. Recommended minimum height 48px. Max {2}MB.
                    </p>
                    {settings.logo_url && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Logo Size (crop)
                        </label>
                        <input
                          type="range"
                          min={0.6}
                          max={1.6}
                          step={0.05}
                          value={settings.logo_scale ?? 1}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              logo_scale: Number(e.target.value),
                            })
                          }
                          className="w-full"
                        />
                        <p className="mt-1 text-[11px] text-gray-500">
                          Use the slider to zoom the logo inside the frame so it is clipped exactly how you
                          want it to appear in the portals.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name (Arabic)
              </label>
              <input
                type="text"
                value={settings.company_name_ar}
                onChange={(e) =>
                  setSettings({ ...settings, company_name_ar: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                dir="rtl"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Registration Number
              </label>
              <input
                type="text"
                value={settings.registration_number}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">{t('settings.cannotBeChanged')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fiscal Year End
              </label>
              <input
                type="date"
                value={settings.fiscal_year_end}
                onChange={(e) =>
                  setSettings({ ...settings, fiscal_year_end: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Tadawul Symbol Selection */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tadawul Symbol
              </label>
              
              {/* Market Selector */}
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMarket('main');
                    setShowCompanyDropdown(false);
                    setCompanySearchQuery('');
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    selectedMarket === 'main'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={selectedMarket === 'main' ? { backgroundColor: brandColor } : {}}
                >
                  Main Market
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMarket('nomu');
                    setShowCompanyDropdown(false);
                    setCompanySearchQuery('');
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    selectedMarket === 'nomu'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={selectedMarket === 'nomu' ? { backgroundColor: brandColor } : {}}
                >
                  NOMU Market
                </button>
              </div>

              {/* Company Selector Dropdown */}
              <div className="relative">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={companySearchQuery || settings.tadawul_symbol}
                      onChange={(e) => {
                        setCompanySearchQuery(e.target.value);
                        setShowCompanyDropdown(true);
                        if (!e.target.value) {
                          setSettings((prev) =>
                            prev ? { ...prev, tadawul_symbol: '' } : prev
                          );
                        }
                      }}
                      onFocus={() => setShowCompanyDropdown(true)}
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
                      placeholder="Search or select company..."
                    />
                    {companySearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setCompanySearchQuery('');
                          setShowCompanyDropdown(false);
                        }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform ${showCompanyDropdown ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Dropdown List */}
                {showCompanyDropdown && (
                  <>
                    <div
                      className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                    >
                      {filteredCompanies.length > 0 ? (
                        filteredCompanies.map((company) => (
                          <button
                            key={company.symbol}
                            type="button"
                            onClick={() => handleSelectCompany(company)}
                            className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">
                                  {company.symbol} - {company.name_en}
                                </div>
                                <div className="text-sm text-gray-500">{company.name_ar}</div>
                              </div>
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded ml-2">
                                {company.market.toUpperCase()}
                              </span>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">
                          No companies found. Try a different search term.
                        </div>
                      )}
                    </div>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowCompanyDropdown(false)}
                    />
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Search and select from listed companies or type a custom symbol.
              </p>
            </div>

            {/* Current Share Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Share Price (SAR)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.share_price ?? settings.current_fmv ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    const numValue = value === '' ? null : Number(value);
                    setSettings({
                      ...settings,
                      share_price: numValue,
                      current_fmv: numValue,
                    });
                    
                    // Update market_data table when price is manually entered
                    if (numValue !== null && numValue > 0 && settings.tadawul_symbol) {
                      handleUpdateMarketData(numValue);
                    }
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                />
                <button
                  type="button"
                  onClick={handleFetchPrice}
                  disabled={fetchingPrice || !settings.tadawul_symbol}
                  className="px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                  style={{ 
                    backgroundColor: brandColor,
                    opacity: fetchingPrice || !settings.tadawul_symbol ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!fetchingPrice && settings.tadawul_symbol) {
                      const rgb = parseInt(brandColor.slice(1, 3), 16) * 0.9;
                      const gg = parseInt(brandColor.slice(3, 5), 16) * 0.9;
                      const bb = parseInt(brandColor.slice(5, 7), 16) * 0.9;
                      e.currentTarget.style.backgroundColor = `rgb(${Math.round(rgb)}, ${Math.round(gg)}, ${Math.round(bb)})`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!fetchingPrice && settings.tadawul_symbol) {
                      e.currentTarget.style.backgroundColor = brandColor;
                    }
                  }}
                  title="Fetch latest price from Tadawul (may be delayed up to 15 minutes)"
                >
                  {fetchingPrice ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="hidden sm:inline">Fetching...</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4" />
                      <span className="hidden sm:inline">{t('settings.fetchPrice')}</span>
                    </>
                  )}
                </button>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  {settings.fmv_source === 'tadawul' ? (
                    <span className="text-green-600">Source: Tadawul</span>
                  ) : settings.fmv_source === 'manual' ? (
                    <span className="text-blue-600">Source: Manual</span>
                  ) : (
                    <span className="text-gray-500">{t('settings.notSet')}</span>
                  )}
                </p>
                {settings.last_price_fetch && (
                  <p className="text-xs text-gray-500">
                    Last fetched: {new Date(settings.last_price_fetch).toLocaleString()}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Price may be delayed up to 15 minutes from Tadawul.
              </p>
            </div>

            {/* Manual FMV Override */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Manual FMV Override (SAR)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={settings.current_fmv && settings.current_fmv !== settings.share_price ? settings.current_fmv : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setSettings({
                    ...settings,
                    current_fmv: value === '' ? settings.share_price : Number(value),
                    fmv_source: value === '' ? 'tadawul' : 'manual',
                  });
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('settings.optionalOverride')}
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional: Override share price with manual FMV. Leave blank to use share price above.
              </p>
            </div>

            {/* Brand Color */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Brand Color
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={settings.brand_color || '#2563EB'}
                  onChange={(e) =>
                    setSettings({ ...settings, brand_color: e.target.value })
                  }
                  className="w-20 h-10 border border-gray-300 rounded-lg cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.brand_color || '#2563EB'}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^#[0-9A-F]{0,6}$/i.test(value) || value === '') {
                      setSettings({ 
                        ...settings, 
                        brand_color: value === '' ? '#2563EB' : (value.startsWith('#') ? value : `#${value}`).substring(0, 7)
                      });
                    }
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  placeholder="#2563EB"
                  maxLength={7}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Choose your company's primary brand color. This will be used throughout the portal for buttons, highlights, and UI elements.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{t('settings.sharePoolConfiguration')}</h2>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">{t('settings.totalReserved')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {Number(settings.total_reserved_shares).toLocaleString()}
              </p>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">{t('settings.available')}</p>
              <p className="text-2xl font-bold text-green-700">
                {Number(settings.available_shares).toLocaleString()}
              </p>
            </div>

            <div className="p-4 bg-orange-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">{t('settings.granted')}</p>
              <p className="text-2xl font-bold text-orange-700">
                {Number(settings.shares_granted).toLocaleString()}
              </p>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">{t('settings.vested')}</p>
              <p className="text-2xl font-bold text-purple-700">
                {Number(settings.shares_vested).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-900">Share pool is read-only</p>
                <p className="text-sm text-yellow-800 mt-1">
                  Share allocations are automatically calculated based on your incentive plans
                  and grants. Contact support to adjust the total reserved shares.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2 px-6 py-3 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
          style={{ 
            backgroundColor: brandColor,
            opacity: saving ? 0.5 : 1
          }}
          onMouseEnter={(e) => {
            if (!saving) {
              const rgb = parseInt(brandColor.slice(1, 3), 16) * 0.9;
              const gg = parseInt(brandColor.slice(3, 5), 16) * 0.9;
              const bb = parseInt(brandColor.slice(5, 7), 16) * 0.9;
              e.currentTarget.style.backgroundColor = `rgb(${Math.round(rgb)}, ${Math.round(gg)}, ${Math.round(bb)})`;
            }
          }}
          onMouseLeave={(e) => {
            if (!saving) {
              e.currentTarget.style.backgroundColor = brandColor;
            }
          }}
        >
          <Save className="w-5 h-5" />
          <span className="font-medium">{saving ? t('settings.saving') : t('settings.saveChanges')}</span>
        </button>
      </div>
    </div>
  );
}
