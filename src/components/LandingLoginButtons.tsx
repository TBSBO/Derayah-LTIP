import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { LogIn, Building2, Users, ShieldCheck, ChevronDown } from 'lucide-react';

interface LandingLoginButtonsProps {
  variant?: 'light' | 'dark';
  align?: 'left' | 'center';
}

export default function LandingLoginButtons({ variant = 'light', align = 'left' }: LandingLoginButtonsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [preloading, setPreloading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Preload route components on hover for faster navigation
  const handleMouseEnter = (path: string) => {
    setPreloading(path);
    // Preload the route component to reduce lag when clicking
    if (path === '/employee/login') {
      import('../pages/EmployeeLogin').finally(() => setPreloading(null));
    } else if (path === '/login') {
      import('../pages/Login').finally(() => setPreloading(null));
    } else {
      setPreloading(null);
    }
  };

  const buttonStyles =
    variant === 'dark'
      ? 'px-4 py-2 rounded-lg text-sm font-semibold transition inline-flex items-center gap-2 bg-white text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-slate-900'
      : 'px-4 py-2 rounded-lg text-sm font-semibold transition inline-flex items-center gap-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#9e6eff] focus:ring-offset-2';

  const menuItemStyles =
    variant === 'dark'
      ? 'px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 transition flex items-center gap-3'
      : 'px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition flex items-center gap-3';

  const loginOptions = [
    { to: '/login', icon: ShieldCheck, label: 'SaaS Admin Login' },
    { to: '/login', icon: Building2, label: 'Company Admin Login' },
    { to: '/employee/login', icon: Users, label: 'Employee Login' },
    { to: '/login', icon: LogIn, label: 'Partner Portal' }
  ];

  const alignment = align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <div className={`relative ${alignment}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonStyles}
      >
        <LogIn className="w-4 h-4" />
        Login
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
          {loginOptions.map((option, index) => {
            const Icon = option.icon;
            const isPreloading = preloading === option.to;
            return (
              <Link
                key={index}
                to={option.to}
                className={`${menuItemStyles} ${isPreloading ? 'opacity-75' : ''} relative`}
                onClick={() => setIsOpen(false)}
                onMouseEnter={() => handleMouseEnter(option.to)}
              >
                <Icon className="w-4 h-4 text-gray-600" />
                <span>{option.label}</span>
                {isPreloading && (
                  <div className="ml-auto animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}





