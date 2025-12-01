import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  ArrowRight,
  Target,
  TrendingUp,
  Users,
  Award,
  CheckCircle2,
  BarChart3,
  Shield,
  FileText,
  Calendar,
  DollarSign,
  PieChart,
  Zap,
  Menu,
  X
} from 'lucide-react';
import LandingLoginButtons from '../components/LandingLoginButtons';
import { usePlatformLogo } from '../hooks/usePlatformLogo';

const ltipTypes = [
  'Stock Option Plans (SOPs)',
  'Incentive Stock Options (ISOs)',
  'Warrants',
  'Stock Appreciation Rights (SARs)',
  'Restricted Stock Units (RSUs)',
  'Restricted Stock Awards (RSAs)',
  'Performance Stock Units (PSUs)',
  'Deferred Stock',
  'Phantom Stocks',
  'Non-Qualified Stock Options'
];

const whyLTIPs = [
  {
    icon: Target,
    title: 'Focus on Performance',
    description: 'LTIPs are designed to help achieve predetermined performance goals. Having them in place can focus employees on targets and aim them at propelling the company forward to success.'
  },
  {
    icon: PieChart,
    title: 'Attract Top Talent',
    description: 'The opportunity to own and share in the wealth of a company is a big incentive when it comes to attracting top talent.'
  },
  {
    icon: Award,
    title: 'Boost Retention',
    description: "LTIPs boost employee retention with their 'golden handcuffs' effect. Given that conditions include continued employment, LTIP awards encourage employees to stay with a company."
  }
];

const trustedBy = [
  { name: 'Cargill', logo: 'C' },
  { name: 'Generali', logo: 'G' },
  { name: 'GSK', logo: 'GSK' }
];

const features = [
  {
    icon: BarChart3,
    title: 'Performance Tracking',
    description: 'Monitor and track performance metrics that drive LTIP vesting with real-time dashboards and automated reporting.'
  },
  {
    icon: Shield,
    title: 'Compliance & Governance',
    description: 'Ensure full compliance with regulatory requirements and maintain audit-ready documentation for all LTIP programs.'
  },
  {
    icon: FileText,
    title: 'Automated Administration',
    description: 'Streamline grant issuance, vesting calculations, and award distributions with automated workflows and approvals.'
  },
  {
    icon: Users,
    title: 'Employee Portal',
    description: 'Empower employees with transparent access to their LTIP awards, vesting schedules, and performance tracking.'
  }
];

export default function LandingOptionFive() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logoUrl, logoScale, platformNameEn, loading: logoLoading } = usePlatformLogo();

  return (
    <div className="bg-white min-h-screen text-[#212529] font-['Inter',sans-serif]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/concept5" className="inline-flex flex-col items-start text-black hover:text-black transition">
              <div className="flex items-center gap-2">
                {logoUrl && !logoLoading ? (
                  <div className="h-6 flex items-center overflow-hidden">
                    <img 
                      src={logoUrl} 
                      alt={platformNameEn || "Platform Logo"} 
                      className="h-full w-auto object-contain"
                      style={{
                        transform: `scale(${logoScale})`,
                        transformOrigin: 'left center',
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <img 
                    src="https://web.derayah.com/wp-content/themes/derayah/assets/images/logo.svg" 
                    alt="Derayah Logo" 
                    className="h-6 w-auto"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                )}
                <span className="text-lg font-semibold tracking-tight">
                  {platformNameEn || 'Hawafiz'}
                </span>
              </div>
              <span className="text-xs text-[#9e6eff] font-normal ml-8 mt-0.5">Powered by Derayah</span>
            </Link>
            
            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-black">
              <a href="#what-is-ltip" className="hover:text-black transition">What is LTIP?</a>
              <a href="#features" className="hover:text-black transition">Features</a>
              <a href="#why-ltip" className="hover:text-black transition">Why LTIPs?</a>
              <a href="#plans" className="hover:text-black transition">Plan Types</a>
            </nav>

            {/* Desktop Login Button */}
            <div className="hidden lg:block">
              <LandingLoginButtons variant="light" />
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-black hover:text-gray-600 transition"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden mt-4 pb-4 border-t border-gray-200">
              <nav className="flex flex-col gap-4 pt-4">
                <a 
                  href="#what-is-ltip" 
                  className="text-sm font-medium text-black hover:text-[#9e6eff] transition py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  What is LTIP?
                </a>
                <a 
                  href="#features" 
                  className="text-sm font-medium text-black hover:text-[#9e6eff] transition py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Features
                </a>
                <a 
                  href="#why-ltip" 
                  className="text-sm font-medium text-black hover:text-[#9e6eff] transition py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Why LTIPs?
                </a>
                <a 
                  href="#plans" 
                  className="text-sm font-medium text-black hover:text-[#9e6eff] transition py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Plan Types
                </a>
                <div className="pt-2">
                  <LandingLoginButtons variant="light" />
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6">
        {/* Hero Section */}
        <section className="py-20 md:py-28">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-6">
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-black">
                  Long Term{' '}
                  <span className="text-black">Incentive Plans</span>
                </h1>
                <p className="text-2xl md:text-3xl text-gray-700 font-light">
                  Attract, engage, retain, reward.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Improve employees' long-term performance in a way that aligns with your business' goals.
                </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-6">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-lg bg-black text-white font-semibold shadow-sm hover:bg-gray-800 transition text-lg"
              >
                Request a Demo
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                to="/employee/login"
                className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-lg border-2 border-black text-black hover:bg-black hover:text-white transition text-lg"
              >
                Learn More
              </Link>
            </div>
              </div>
              
              {/* LTIP Dashboard Screenshot */}
              <div className="relative">
                <div className="absolute -inset-1 bg-[#9e6eff]/10 rounded-2xl blur-xl" />
                <div className="relative bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
                  {/* Browser Chrome */}
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/50" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                      <div className="w-3 h-3 rounded-full bg-green-500/50" />
                    </div>
                    <div className="flex-1 mx-4 bg-white rounded-lg px-4 py-1.5 text-xs text-gray-600 border border-gray-200">
                    </div>
                    <span className="text-xs text-[#9e6eff] font-medium">Live</span>
                  </div>
                  
                  {/* Dashboard Content */}
                  <div className="p-6 space-y-6 bg-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-black">LTIP Management</h3>
                        <p className="text-xs text-gray-600 mt-1">Long Term Incentive Plans Overview</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <Target className="w-4 h-4 text-black" />
                        </div>
                        <span className="text-xs text-gray-600">Active Plans</span>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">Active Plans</p>
                        <p className="text-2xl font-bold text-black">18</p>
                        <p className="text-xs text-gray-500 mt-1">LTIP programs</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">Participants</p>
                        <p className="text-2xl font-bold text-black">1,240</p>
                        <p className="text-xs text-gray-500 mt-1">Employees</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">Vesting Progress</p>
                        <p className="text-2xl font-bold text-black">68%</p>
                        <p className="text-xs text-gray-500 mt-1">Average</p>
                      </div>
                    </div>

                    {/* Plan Types Chart - Pie Chart */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-semibold text-[#212529]">Plan Distribution</p>
                        <span className="text-xs text-gray-600">By Type</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="relative w-28 h-28">
                          <svg viewBox="0 0 100 100" className="transform -rotate-90">
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="16" />
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#9e6eff" strokeWidth="16" strokeDasharray={`${2 * Math.PI * 40 * 0.35} ${2 * Math.PI * 40}`} />
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#3b82f6" strokeWidth="16" strokeDasharray={`${2 * Math.PI * 40 * 0.25} ${2 * Math.PI * 40}`} strokeDashoffset={`-${2 * Math.PI * 40 * 0.35}`} />
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" strokeWidth="16" strokeDasharray={`${2 * Math.PI * 40 * 0.22} ${2 * Math.PI * 40}`} strokeDashoffset={`-${2 * Math.PI * 40 * 0.6}`} />
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#f59e0b" strokeWidth="16" strokeDasharray={`${2 * Math.PI * 40 * 0.1} ${2 * Math.PI * 40}`} strokeDashoffset={`-${2 * Math.PI * 40 * 0.82}`} />
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#ef4444" strokeWidth="16" strokeDasharray={`${2 * Math.PI * 40 * 0.08} ${2 * Math.PI * 40}`} strokeDashoffset={`-${2 * Math.PI * 40 * 0.92}`} />
                          </svg>
                        </div>
                        <div className="flex-1 space-y-2">
                          {[
                            { label: 'RSU', value: '35%', color: 'bg-[#9e6eff]' },
                            { label: 'SAR', value: '25%', color: 'bg-[#3b82f6]' },
                            { label: 'SOP', value: '22%', color: 'bg-[#10b981]' },
                            { label: 'PSU', value: '10%', color: 'bg-[#f59e0b]' },
                            { label: 'RSA', value: '8%', color: 'bg-[#ef4444]' }
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <div className={`w-3 h-3 rounded-full ${item.color}`} />
                              <span className="text-gray-700">{item.label}</span>
                              <span className="text-gray-500 ml-auto">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-sm font-semibold text-[#212529] mb-3">Recent LTIP Activity</p>
                      <div className="space-y-2">
                        {[
                          { action: 'Performance RSU Plan created', time: '2h ago', status: 'active' },
                          { action: 'SAR grant approved', time: '5h ago', status: 'approved' },
                          { action: 'Vesting milestone reached', time: '1d ago', status: 'completed' }
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-center gap-3 text-xs">
                            <div className={`w-2 h-2 rounded-full ${
                              item.status === 'active' ? 'bg-black' : 
                              item.status === 'approved' ? 'bg-gray-600' : 'bg-gray-400'
                            }`} />
                            <span className="text-gray-700 flex-1">{item.action}</span>
                            <span className="text-gray-500">{item.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Employee Portal Section - First */}
        <section className="py-20 md:py-28 bg-gray-50">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-[#212529]">Employee Portal Experience</h2>
              <p className="text-lg text-gray-700">
                Empower employees with transparent access to their LTIP awards, portfolio value, and vesting timeline.
              </p>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Employee Portfolio Screenshot */}
              <div className="relative">
                <div className="absolute -inset-1 bg-[#9e6eff]/10 rounded-2xl blur-xl" />
                <div className="relative bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
                  {/* Browser Chrome */}
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/50" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                      <div className="w-3 h-3 rounded-full bg-green-500/50" />
                    </div>
                    <div className="flex-1 mx-4 bg-white rounded-lg px-4 py-1.5 text-xs text-gray-600 border border-gray-200">
                    </div>
                    <span className="text-xs text-[#9e6eff] font-medium">My Portfolio</span>
                  </div>
                  
                  {/* Employee Dashboard */}
                  <div className="p-6 space-y-6 bg-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-[#212529]">My Equity Portfolio</h3>
                        <p className="text-xs text-gray-600 mt-1">Personal LTIP overview</p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <Users className="w-5 h-5 text-black" />
                      </div>
                    </div>

                    {/* Portfolio Value */}
                    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                      <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">Total Portfolio Value</p>
                      <p className="text-3xl font-bold text-[#212529]">SAR 186,420</p>
                      <p className="text-xs text-green-600 mt-1">+12.5% from last quarter</p>
                    </div>

                    {/* Equity Breakdown Pie Chart */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-sm font-semibold text-[#212529] mb-3">Equity Breakdown</p>
                      <div className="flex items-center gap-4">
                        <div className="relative w-32 h-32">
                          <svg viewBox="0 0 100 100" className="transform -rotate-90">
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="16" />
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#000000" strokeWidth="16" strokeDasharray={`${2 * Math.PI * 40 * 0.45} ${2 * Math.PI * 40}`} />
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#6c757d" strokeWidth="16" strokeDasharray={`${2 * Math.PI * 40 * 0.30} ${2 * Math.PI * 40}`} strokeDashoffset={`-${2 * Math.PI * 40 * 0.45}`} />
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#28a745" strokeWidth="16" strokeDasharray={`${2 * Math.PI * 40 * 0.25} ${2 * Math.PI * 40}`} strokeDashoffset={`-${2 * Math.PI * 40 * 0.75}`} />
                          </svg>
                        </div>
                        <div className="flex-1 space-y-2">
                          {[
                            { label: 'RSU 2025', value: '45%', shares: '1,890', color: 'bg-black' },
                            { label: 'SAR Plan', value: '30%', shares: '1,260', color: 'bg-gray-600' },
                            { label: 'PSU Grant', value: '25%', shares: '1,050', color: 'bg-green-600' }
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${item.color}`} />
                                <span className="text-gray-700 font-medium">{item.label}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[#212529] font-semibold">{item.shares}</span>
                                <span className="text-gray-500 ml-1">({item.value})</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <p className="text-[10px] text-gray-600 mb-1">Total Shares</p>
                        <p className="text-lg font-bold text-[#212529]">4,200</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <p className="text-[10px] text-gray-600 mb-1">Vested</p>
                        <p className="text-lg font-bold text-green-600">68%</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <p className="text-[10px] text-gray-600 mb-1">Pending</p>
                        <p className="text-lg font-bold text-black">32%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vesting Timeline Screenshot */}
              <div className="relative">
                <div className="absolute -inset-1 bg-[#9e6eff]/10 rounded-2xl blur-xl" />
                <div className="relative bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
                  {/* Browser Chrome */}
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/50" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                      <div className="w-3 h-3 rounded-full bg-green-500/50" />
                    </div>
                    <div className="flex-1 mx-4 bg-white rounded-lg px-4 py-1.5 text-xs text-gray-600 border border-gray-200">
                    </div>
                    <span className="text-xs text-[#9e6eff] font-medium">Vesting Timeline</span>
                  </div>
                  
                  {/* Vesting Timeline Content */}
                  <div className="p-6 space-y-6 bg-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-[#212529]">Vesting Schedule</h3>
                        <p className="text-xs text-gray-600 mt-1">Track your equity milestones</p>
                      </div>
                      <Calendar className="w-5 h-5 text-[#9e6eff]" />
                    </div>

                    {/* Vesting Timeline Chart */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-sm font-semibold text-[#212529] mb-4">Vesting Progress</p>
                      <div className="space-y-4">
                        {[
                          { plan: 'RSU 2025', vested: 68, total: 100, nextDate: 'Feb 15, 2026', shares: '1,890' },
                          { plan: 'SAR Plan', vested: 45, total: 100, nextDate: 'Mar 1, 2026', shares: '1,260' },
                          { plan: 'PSU Grant', vested: 25, total: 100, nextDate: 'Apr 10, 2026', shares: '1,050' }
                        ].map((item, idx) => (
                          <div key={idx} className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-700 font-medium">{item.plan}</span>
                              <span className="text-gray-500">{item.shares} shares</span>
                            </div>
                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-[#9e6eff]"
                                style={{ width: `${item.vested}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-gray-500">{item.vested}% vested</span>
                              <span className="text-[#9e6eff] font-medium">Next: {item.nextDate}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Timeline Visualization - Bar Chart */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-sm font-semibold text-[#212529] mb-3">Vesting Timeline</p>
                      <div className="h-32 flex items-end gap-1.5 mb-2">
                        {[
                          { month: 'Jan', height: 25, vested: true, value: '25%' },
                          { month: 'Feb', height: 45, vested: true, value: '45%' },
                          { month: 'Mar', height: 68, vested: true, value: '68%' },
                          { month: 'Apr', height: 75, vested: false, value: '75%' },
                          { month: 'May', height: 82, vested: false, value: '82%' },
                          { month: 'Jun', height: 90, vested: false, value: '90%' },
                          { month: 'Jul', height: 95, vested: false, value: '95%' },
                          { month: 'Aug', height: 100, vested: false, value: '100%' }
                        ].map((item, idx) => (
                          <div key={idx} className="flex-1 flex flex-col items-center justify-end">
                            <div className="relative w-full flex flex-col items-center">
                              <div
                                className={`w-full rounded-t transition-all ${
                                  item.vested 
                                    ? 'bg-gradient-to-t from-green-600 to-green-500' 
                                    : 'bg-gradient-to-t from-[#9e6eff] to-[#8d5de8]'
                                }`}
                                style={{ height: `${item.height}%`, minHeight: '4px' }}
                              />
                              <span className="text-[9px] text-gray-600 font-medium mt-1">{item.value}</span>
                            </div>
                            <span className="text-[10px] text-gray-500 mt-1">{item.month}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs pt-2 border-t border-gray-200">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-600" />
                          <span className="text-gray-600">Vested</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-[#9e6eff]" />
                          <span className="text-gray-600">Pending</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trusted By Section */}
        <section className="py-12 border-y border-gray-200 bg-gray-50">
          <div className="text-center mb-8">
            <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Trusted By Businesses Worldwide</p>
          </div>
          <div className="flex items-center justify-center gap-12 flex-wrap">
            {trustedBy.map(company => (
              <div key={company.name} className="flex items-center justify-center">
                <div className="w-24 h-24 rounded-lg bg-white flex items-center justify-center text-2xl font-bold text-gray-400 border border-gray-200 shadow-sm">
                  {company.logo}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What is LTIP Section */}
        <section id="what-is-ltip" className="py-20 md:py-28">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold text-[#212529]">What is an LTIP?</h2>
              <p className="text-lg text-gray-700 leading-relaxed">
                Long Term Incentive Plans (LTIPs) are programs that provide a potential award to key employees above and beyond their basic salary. 
                An LTIP offers incentives and bonuses over fixed long-term periods, usually from three to five years.
              </p>
              <div className="pt-4">
                <h3 className="text-2xl font-semibold mb-4 text-[#212529]">Sharing in growth</h3>
                <p className="text-gray-700 leading-relaxed">
                  An executive's investment of time, energy and experience in a company is instrumental to its success. 
                  An LTIP values an employee's contribution to the growth of an organization and allows them to reap the rewards of this success, 
                  as if they were owners.
                </p>
              </div>
            </div>
            {/* Performance Tracking Dashboard Screenshot */}
            <div className="relative">
              <div className="absolute -inset-1 bg-black/5 rounded-2xl blur-xl" />
              <div className="relative bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
                {/* Browser Chrome */}
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
                  <div className="flex gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                  </div>
                  <div className="flex-1 mx-3 bg-white rounded-lg px-3 py-1 text-xs text-gray-600 border border-gray-200">
                  </div>
                </div>
                
                {/* Dashboard Content */}
                <div className="p-6 space-y-6 bg-white">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl bg-[#9e6eff]/10 flex items-center justify-center">
                      <TrendingUp className="w-8 h-8 text-[#9e6eff]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-[#212529]">Performance Alignment</h3>
                      <p className="text-sm text-gray-600">Long-term value creation</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg bg-gray-50 p-4 border border-gray-200">
                      <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">Typical Duration</p>
                      <p className="text-2xl font-bold text-[#212529]">3-5 Years</p>
                      <p className="text-xs text-gray-500 mt-1">Performance period</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4 border border-gray-200">
                      <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">Vesting Period</p>
                      <p className="text-2xl font-bold text-[#212529]">Flexible</p>
                      <p className="text-xs text-gray-500 mt-1">Customizable schedule</p>
                    </div>
                  </div>

                  {/* Performance Metrics with Chart */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-sm font-semibold text-[#212529] mb-3">Performance Metrics</p>
                    <div className="space-y-3 mb-4">
                      {[
                        { metric: 'Revenue Growth', value: '118%', target: '110%', status: 'exceeded' },
                        { metric: 'EBITDA Margin', value: '26%', target: '24%', status: 'met' },
                        { metric: 'Customer NPS', value: '72', target: '70', status: 'met' }
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-xs text-gray-700">{item.metric}</p>
                            <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${
                                  item.status === 'exceeded' ? 'bg-gray-600' : 'bg-[#9e6eff]'
                                }`}
                                style={{ width: '85%' }}
                              />
                            </div>
                          </div>
                          <div className="ml-4 text-right">
                            <p className="text-sm font-bold text-[#212529]">{item.value}</p>
                            <p className="text-xs text-gray-500">Target: {item.target}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Mini Bar Chart */}
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600 mb-2">KPI Achievement Rate</p>
                      <div className="h-16 flex items-end gap-1.5">
                        {[85, 92, 78, 95, 88, 90].map((height, idx) => (
                          <div key={idx} className="flex-1 flex flex-col items-center">
                            <div
                              className="w-full bg-gradient-to-t from-[#9e6eff] to-[#8d5de8] rounded-t"
                              style={{ height: `${height}%` }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Plan Types Section */}
        <section id="plans" className="py-20 md:py-28 bg-gray-50">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-[#212529]">We've got your LTIPs covered</h2>
            <p className="text-lg text-gray-700">
              Support for all major long-term incentive plan types, tailored to your company's needs.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ltipTypes.map((type, idx) => (
              <div
                key={type}
                className="rounded-lg border border-gray-200 bg-white p-6 hover:border-[#9e6eff] hover:shadow-md transition"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-black shrink-0 mt-0.5" />
                  <span className="text-gray-700 font-medium">{type}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tailored for You Section */}
        <section className="py-20 md:py-28">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-[#9e6eff]/5 blur-3xl opacity-50" />
              <div className="relative rounded-2xl border border-gray-200 bg-white shadow-lg p-8">
                <Zap className="w-12 h-12 text-[#9e6eff] mb-4" />
                <h3 className="text-2xl font-semibold mb-4 text-[#212529]">Tailored for You</h3>
                <p className="text-gray-700 leading-relaxed mb-6">
                  LTIPs are flexible in their design and so can be created specifically for your company's needs, goals and existing capabilities. 
                  Establishing an LTIP that fits with your business's philosophy from the get-go is key.
                </p>
                <p className="text-gray-700 leading-relaxed">
                  Set out performance periods and a rewards system that aligns with strategic plans and goals. 
                  Talk to us about building an LTIP that works for you, or let our team manage your existing LTIP, seamlessly.
                </p>
              </div>
            </div>
            <div className="space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold text-[#212529]">Custom LTIP Design</h2>
              <p className="text-lg text-gray-700 leading-relaxed">
                Work with our experts to design an LTIP program that aligns with your company's strategic objectives, 
                performance metrics, and compensation philosophy.
              </p>
              <ul className="space-y-4">
                {[
                  'Performance period configuration (3-5 years typical)',
                  'Vesting schedule customization',
                  'Performance metric alignment',
                  'Multi-trigger vesting options',
                  'Integration with existing HR systems'
                ].map(item => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-black shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Why LTIPs Section */}
        <section id="why-ltip" className="py-20 md:py-28 bg-gray-50">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-[#212529]">Why LTIPs?</h2>
            <p className="text-lg text-gray-700">
              Long-term incentive plans deliver measurable value for both companies and employees.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {whyLTIPs.map(benefit => (
              <div key={benefit.title} className="rounded-2xl border border-gray-200 bg-white p-8 space-y-6 shadow-sm hover:shadow-md transition">
                <div className="w-16 h-16 rounded-xl bg-[#9e6eff]/10 flex items-center justify-center">
                  <benefit.icon className="w-8 h-8 text-[#9e6eff]" />
                </div>
                <h3 className="text-2xl font-semibold text-[#212529]">{benefit.title}</h3>
                <p className="text-gray-700 leading-relaxed">{benefit.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 md:py-28">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-[#212529]">Comprehensive LTIP Management</h2>
            <p className="text-lg text-gray-700">
              Everything you need to design, administer, and manage long-term incentive plans.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {features.map(feature => (
              <div key={feature.title} className="rounded-2xl border border-gray-200 bg-white p-8 space-y-4 shadow-sm hover:shadow-md transition">
                <div className="w-12 h-12 rounded-lg bg-[#9e6eff]/10 flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-[#9e6eff]" />
                </div>
                <h3 className="text-xl font-semibold text-[#212529]">{feature.title}</h3>
                <p className="text-gray-700 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
          
          {/* LTIP Administration Screenshot */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute -inset-1 bg-[#007bff]/10 rounded-2xl blur-xl" />
            <div className="relative bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
              {/* Browser Chrome */}
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                <div className="flex-1 mx-4 bg-white rounded-lg px-4 py-1.5 text-xs text-gray-600 border border-gray-200">
                </div>
                <span className="text-xs text-[#9e6eff] font-medium">Admin Console</span>
              </div>
              
              {/* Admin Dashboard */}
              <div className="p-6 space-y-6 bg-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[#212529]">LTIP Administration</h3>
                  <button className="px-4 py-2 bg-[#9e6eff] text-white text-sm rounded-lg hover:bg-[#8d5de8] transition">
                    Create New Plan
                  </button>
                </div>

                {/* Plan List Table */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div className="grid grid-cols-5 gap-4 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      <div>Plan Name</div>
                      <div>Type</div>
                      <div>Participants</div>
                      <div>Status</div>
                      <div>Actions</div>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {[
                      { name: 'Executive RSU 2025', type: 'RSU', participants: '45', status: 'Active' },
                      { name: 'Performance SAR', type: 'SAR', participants: '120', status: 'Active' },
                      { name: 'Leadership PSU', type: 'PSU', participants: '28', status: 'Draft' }
                    ].map((plan, idx) => (
                      <div key={idx} className="grid grid-cols-5 gap-4 px-4 py-3 hover:bg-gray-50 transition">
                        <div className="text-sm font-medium text-[#212529]">{plan.name}</div>
                        <div className="text-sm text-gray-600">{plan.type}</div>
                        <div className="text-sm text-gray-600">{plan.participants}</div>
                        <div>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            plan.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {plan.status}
                          </span>
                        </div>
                        <div className="text-[#9e6eff] text-sm hover:underline cursor-pointer">View</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Total Plans', value: '18' },
                    { label: 'Active', value: '15' },
                    { label: 'Draft', value: '3' },
                    { label: 'Participants', value: '1,240' }
                  ].map((stat, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-600 mb-1">{stat.label}</p>
                      <p className="text-xl font-bold text-[#212529]">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 md:py-28 bg-[#9e6eff] rounded-2xl text-white">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-4xl md:text-5xl font-bold">Ready to learn more?</h2>
            <p className="text-xl text-white/90">
              Get in touch today for a no-obligation demo with one of our experts.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-lg bg-white text-[#9e6eff] font-semibold hover:bg-gray-100 transition text-lg shadow-sm"
              >
                Request a Demo
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                to="/employee/login"
                className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-lg border-2 border-white/30 text-white hover:bg-white/10 transition text-lg"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-[#212529] mb-4">Get Started</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link to="/concept6" className="hover:text-[#9e6eff]">Private Companies</Link></li>
                <li><Link to="/concept5" className="hover:text-[#9e6eff]">Public Companies</Link></li>
                <li><Link to="/login" className="hover:text-[#9e6eff]">Request Demo</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-[#212529] mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#" className="hover:text-[#9e6eff]">About Us</a></li>
                <li><a href="#" className="hover:text-[#9e6eff]">Contact</a></li>
                <li><a href="#" className="hover:text-[#9e6eff]">Support</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-[#212529] mb-4">Resources</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#" className="hover:text-[#9e6eff]">What is LTIP?</a></li>
                <li><a href="#" className="hover:text-[#9e6eff]">LTIP Guide</a></li>
                <li><a href="#" className="hover:text-[#9e6eff]">Case Studies</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-[#212529] mb-4">Contact</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>support@derayah.com</li>
                <li>+966 11 200 2054</li>
                <li>Riyadh, Saudi Arabia</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-8 text-sm text-gray-600 text-center">
            <p>© {new Date().getFullYear()} Hawafiz. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
