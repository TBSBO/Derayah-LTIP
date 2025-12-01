import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface PlatformLogoData {
  logoUrl: string | null;
  logoScale: number;
  platformNameEn: string | null;
  platformNameAr: string | null;
}

export function usePlatformLogo() {
  const [logoData, setLogoData] = useState<PlatformLogoData>({
    logoUrl: null,
    logoScale: 1.0,
    platformNameEn: null,
    platformNameAr: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlatformLogo = async () => {
      try {
        const { data, error } = await supabase
          .from('platform_settings')
          .select('logo_url, logo_scale, platform_name_en, platform_name_ar')
          .maybeSingle();

        if (error) {
          console.error('Error loading platform logo:', error);
          return;
        }

        if (data) {
          setLogoData({
            logoUrl: data.logo_url || null,
            logoScale:
              typeof data.logo_scale === 'number' && !Number.isNaN(data.logo_scale)
                ? data.logo_scale
                : 1.0,
            platformNameEn: data.platform_name_en || null,
            platformNameAr: data.platform_name_ar || null,
          });
        }
      } catch (error) {
        console.error('Error loading platform logo:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPlatformLogo();
  }, []);

  return { ...logoData, loading };
}

