import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { supabase } from './supabase';

// Default translations (fallback)
const defaultTranslations = {
  en: {
    translation: {
      'common.dashboard': 'Dashboard',
      'common.employees': 'Employees',
      'common.plans': 'Plans',
      'common.grants': 'Grants',
      'common.portfolio': 'Portfolio',
      'common.settings': 'Settings',
      'common.users': 'Users',
      'common.capTable': 'Cap Table',
      'common.ltipPools': 'LTIP Pools',
      'common.vestingSchedules': 'Vesting Schedules',
      'common.vestingEvents': 'Vesting Events',
      'common.exerciseOrders': 'Exercise Orders',
      'common.companyCashPortfolio': 'Company Cash Portfolio',
      'common.cashTransfers': 'Cash Transfers',
      'common.transfers': 'Transfers',
      'common.performanceMetrics': 'Performance Metrics',
      'common.documents': 'Documents',
      'common.logout': 'Logout',
      'common.login': 'Login',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.create': 'Create',
      'common.search': 'Search',
      'common.loading': 'Loading...',
      'common.noData': 'No data available',
      'common.translations': 'Translations',
      'common.operatorConsole': 'Operator Console',
      'common.overview': 'Overview',
      'common.incentivePlans': 'Incentive Plans',
      // Employee Portal Navigation
      'employee.overview': 'Overview',
      'employee.dashboard': 'Dashboard',
      'employee.vestingTimeline': 'Vesting Timeline',
      'employee.vestingEvents': 'Vesting Events',
      'employee.cashPortfolio': 'Cash Portfolio',
      'employee.portfolio': 'Portfolio',
      'employee.performance': 'Performance',
      'employee.taxCalculator': 'Tax Calculator',
      'employee.zakatCalculator': 'Zakat Calculator',
      'employee.documents': 'Documents',
      'employee.notifications': 'Notifications',
      'employee.employeePortal': 'Employee Portal',
      'employee.employee': 'Employee',
      'employee.signOut': 'Sign Out',
      'employee.adminView': 'Admin View',
      // Employee Dashboard
      'employeeDashboard.title': 'My Dashboard',
      'employeeDashboard.description': 'Overview of your equity grants and vesting status',
      'employeeDashboard.status': 'Status',
      'employeeDashboard.number': 'Number',
      'employeeDashboard.valuation': 'Valuation',
      'employeeDashboard.vested': 'Vested',
      'employeeDashboard.unvested': 'Unvested',
      'employeeDashboard.lapsed': 'Lapsed',
      'employeeDashboard.active': 'Active',
      'employeeDashboard.exercised': 'Exercised',
      'employeeDashboard.buyBack': 'Buy-Back',
      'employeeDashboard.whenIsNextVesting': 'When is my next vesting due?',
      'employeeDashboard.options': 'options',
      'employeeDashboard.cumulativeVestedOptions': 'Cumulative vested options',
      'employeeDashboard.exercisePricePayable': 'Exercise Price Payable',
      'employeeDashboard.sharesRoadmap': 'Shares Roadmap',
      'employeeDashboard.noDataAvailable': 'No data available',
      'employeeDashboard.actionRequired': 'Action Required',
      'employeeDashboard.actionRequiredMessage': 'You have grants that require your signature. Please review and accept the contracts to activate your equity grants.',
      'employeeDashboard.yourGrants': 'Your Grants',
      'employeeDashboard.noActiveGrants': 'No Active Grants',
      'employeeDashboard.quickStats': 'Quick Stats',
      'employeeDashboard.vestedSharesLabel': 'Vested Shares',
      'employeeDashboard.unvestedSharesLabel': 'Unvested Shares',
      'employeeDashboard.reviewGrantAgreement': 'Review Grant Agreement',
      'employeeDashboard.vestingEventDetails': 'Vesting Event Details',
      'employeeDashboard.sharesToVest': 'Shares to Vest',
      'employeeDashboard.eventType': 'Event Type',
      'employeeDashboard.daysRemaining': 'Days Remaining',
      'employeeDashboard.performanceNotes': 'Performance Notes',
      'employeeDashboard.pendingSignature': 'Pending Signature',
      'employeeDashboard.draft': 'Draft',
      'employeeDashboard.noUpcomingVestingDates': 'No upcoming vesting dates',
      'employeeDashboard.failedToAcceptContract': 'Failed to accept contract',
      'employeeDashboard.loadingDashboard': 'Loading your dashboard...',
      'employeeDashboard.totalSharesGranted': 'Total Shares Granted',
      'employeeDashboard.vestedShares': 'Vested Shares',
      'employeeDashboard.unvestedShares': 'Unvested Shares',
      'employeeDashboard.grant': 'Grant',
      'employeeDashboard.grants': 'Grants',
      'employeeDashboard.ofTotal': 'of total',
      'employeeDashboard.remaining': 'remaining',
      'employeeDashboard.reviewContract': 'Review Contract',
      'employeeDashboard.yourVestingCalendar': 'Your Vesting Calendar',
      'employeeDashboard.trackUpcomingVesting': 'Track upcoming vesting milestones and review past events.',
      'employeeDashboard.noVestingEventsScheduled': 'No vesting events scheduled yet. Your future vesting milestones will appear here.',
      'employeeDashboard.noActiveGrantsMessage': "You don't have any active equity grants at this time.",
      'employeeDashboard.byAcceptingAgreement': 'By accepting this agreement, you acknowledge:',
      'employeeDashboard.understandingGrantTerms': 'Understanding of the grant terms and vesting schedule',
      'employeeDashboard.acceptanceOfConditions': 'Acceptance of company equity plan conditions',
      'employeeDashboard.agreementToTaxImplications': 'Agreement to tax implications and restrictions',
      'employeeDashboard.acceptAgreement': 'Accept Agreement',
      'employeeDashboard.close': 'Close',
      'employeeDashboard.plan': 'Plan',
      'employeeDashboard.shares': 'shares',
      'employeeDashboard.vestedSharesSAR': 'Vested Shares (SAR)',
      'employeeDashboard.unvestedSharesSAR': 'Unvested Shares (SAR)',
      'employeeDashboard.vestedIncludes': 'Vested includes: vested, transferred, exercised, due, and past-dated events',
      'employeeDashboard.unvestedIncludes': 'Unvested includes: pending and future-dated events',
      'employeeDashboard.noRoadmapDataAvailable': 'No roadmap data available',
      'employeeDashboard.total': 'Total',
      // Employee Vesting
      'employeeVesting.title': 'Vesting Timeline',
      'employeeVesting.description': 'Track your share vesting progression across all grants',
      'employeeVesting.loading': 'Loading...',
      'employeeVesting.noVestingData': 'No vesting data available',
      'employeeVesting.vestingSchedule': 'Vesting Schedule',
      'employeeVesting.cliffPeriod': 'Cliff Period',
      'employeeVesting.frequency': 'Frequency',
      'employeeVesting.type': 'Type',
      'employeeVesting.duration': 'Duration',
      'employeeVesting.months': 'months',
      'employeeVesting.years': 'years',
      'employeeVesting.vestingProgress': 'Vesting Progress',
      'employeeVesting.vested': 'vested',
      'employeeVesting.vestingEvent': 'Vesting Event',
      'employeeVesting.shares': 'shares',
      'employeeVesting.active': 'Active',
      'employeeVesting.pendingSignature': 'Pending Signature',
      'employeeVesting.contractSigned': 'Contract Signed',
      'employeeVesting.contractExecuted': 'Contract Executed',
      'employeeVesting.draftContract': 'Draft Contract',
      'employeeVesting.contract': 'Contract',
      'employeeVesting.plan': 'Plan',
      'employeeVesting.noIndividualRecords': 'No individual vesting records found. This grant may not have been processed with a vesting schedule template.',
      // Employee Portfolio
      'employeePortfolio.title': 'My Portfolio',
      'employeePortfolio.description': 'View your equity portfolio and transaction history',
      'employeePortfolio.loading': 'Loading your portfolio...',
      'employeePortfolio.totalShares': 'Total Shares',
      'employeePortfolio.availableShares': 'Available Shares',
      'employeePortfolio.lockedShares': 'Locked Shares',
      'employeePortfolio.portfolioValue': 'Portfolio Value',
      'employeePortfolio.perShare': 'per share',
      'employeePortfolio.portfolioDetails': 'Portfolio Details',
      'employeePortfolio.portfolioNumber': 'Portfolio Number',
      'employeePortfolio.company': 'Company',
      'employeePortfolio.createdDate': 'Created Date',
      'employeePortfolio.lastUpdated': 'Last Updated',
      'employeePortfolio.noPortfolioFound': 'No Portfolio Found',
      'employeePortfolio.noPortfolioMessage': 'Your portfolio will be created automatically when shares are transferred to you.',
      'employeePortfolio.portfolioValuation': 'Portfolio Valuation',
      'employeePortfolio.grantsBreakdown': 'Grants Breakdown',
      'employeePortfolio.grantNumber': 'Grant Number',
      'employeePortfolio.plan': 'Plan',
      'employeePortfolio.vested': 'Vested',
      'employeePortfolio.unvested': 'Unvested',
      'employeePortfolio.grantDate': 'Grant Date',
      'employeePortfolio.transactionHistory': 'Transaction History',
      'employeePortfolio.transferNumber': 'Transfer Number',
      'employeePortfolio.grant': 'Grant',
      'employeePortfolio.shares': 'Shares',
      'employeePortfolio.date': 'Date',
      'employeePortfolio.status': 'Status',
      'employeePortfolio.noTransactions': 'No transactions yet',
      'employeePortfolio.noTransactionsMessage': 'Your transfer history will appear here once shares are transferred to your portfolio.',
      'employeePortfolio.completed': 'completed',
      'employeePortfolio.pending': 'pending',
      'employeePortfolio.depositCash': 'Deposit Cash',
      'employeePortfolio.cashBalance': 'Cash Balance',
      // Employee Overview
      'employeeOverview.title': 'Overview',
      'employeeOverview.totalPotentialValue': 'Total Potential Value',
      'employeeOverview.completeYourTasks': 'Complete Your Tasks',
      'employeeOverview.available': 'Available',
      'employeeOverview.inProgress': 'In Progress',
      'employeeOverview.availableWithRestrictions': 'Available w/ restrictions',
      'employeeOverview.unavailable': 'Unavailable',
      'employeeOverview.accounts': 'Accounts',
      'employeeOverview.plans': 'Plans',
      'employeeOverview.grants': 'Grants',
      'employeeOverview.shareOwnershipAccount': 'Share Ownership Account',
      'employeeOverview.shareIncentivePlans': 'Share Incentive Plans (SIP)',
      'employeeOverview.upcoming': 'Upcoming',
      'employeeOverview.due': 'Due',
      'employeeOverview.pendingExercise': 'Pending Exercise',
      'employeeOverview.exerciseOptions': 'Exercise Options',
      'employeeOverview.grantDetails': 'Grant Details',
      'employeeOverview.availableShares': 'Available Shares',
      'employeeOverview.total': 'Total',
      'employeeOverview.vested': 'Vested',
      'employeeOverview.unvested': 'Unvested',
      'employeeOverview.shares': 'shares',
      'employeeOverview.noTasks': 'No tasks at this time',
      'employeeOverview.createExerciseOrder': 'Create Exercise Order',
      'employeeOverview.eventId': 'Event ID',
      'employeeOverview.status': 'Status',
      'employeeOverview.plan': 'Plan',
      'employeeOverview.grant': 'Grant',
      'employeeOverview.vestingDate': 'Vesting Date',
      'employeeOverview.sharesToVest': 'Shares to Vest',
      'employeeOverview.exercisePrice': 'Exercise Price',
      'employeeOverview.totalCost': 'Total Cost',
      'employeeOverview.close': 'Close',
      'employeeOverview.details': 'Details',
      'employeeOverview.noGrantsAvailable': 'No grants available',
      'employeeOverview.totalShares': 'Total Shares',
      // Employee Vesting Events
      'employeeVestingEvents.title': 'Vesting Events',
      'employeeVestingEvents.description': 'View and manage your vesting events',
      'employeeVestingEvents.loading': 'Loading vesting events...',
      'employeeVestingEvents.noEvents': 'No vesting events found',
      'employeeVestingEvents.filterByStatus': 'Filter by Status',
      'employeeVestingEvents.filterByType': 'Filter by Type',
      'employeeVestingEvents.allStatuses': 'All Statuses',
      'employeeVestingEvents.allTypes': 'All Types',
      'employeeVestingEvents.viewDetails': 'View Details',
      'employeeVestingEvents.exercise': 'Exercise',
      'employeeVestingEvents.eventDetails': 'Event Details',
      // Employee Performance
      'employeePerformance.title': 'Performance History',
      'employeePerformance.description': 'Track your portfolio value over time',
      'employeePerformance.loading': 'Loading...',
      // Employee Tax Calculator
      'employeeTaxCalculator.title': 'Tax Calculator',
      'employeeTaxCalculator.description': 'Estimate your tax liability on vested shares',
      'employeeTaxCalculator.loading': 'Loading...',
      'employeeTaxCalculator.noGrantData': 'No grant data available',
      // Employee Zakat Calculator
      'employeeZakatCalculator.title': 'Zakat Calculator',
      'employeeZakatCalculator.description': 'Calculate your Islamic wealth tax',
      'employeeZakatCalculator.loading': 'Loading...',
      // Employee Documents
      'employeeDocuments.title': 'Documents',
      'employeeDocuments.description': 'Access and download your equity-related documents',
      // Employee Notifications
      'employeeNotifications.title': 'Notification Preferences',
      'employeeNotifications.description': 'Manage how you receive updates and alerts',
      // Language Switcher
      'language.switch': 'Switch language',
      'language.arabic': 'Arabic',
      'language.english': 'English',
      // Transfers Summary
      'transfers.summaryTitle': 'Transfer Summary',
      'transfers.summaryDescription': 'Overview of share transfers and their status',
      'transfers.totalTransfers': 'Total Transfers',
      'transfers.completed': 'Completed',
      'transfers.averageTransferSize': 'Average Transfer Size',
      'transfers.perTransfer': 'per transfer',
      'transfers.totalValue': 'Total Transfer Value',
      'transfers.sar': 'SAR',
      'transfers.transfersByStatus': 'Transfers by Status',
      'transfers.transfersByType': 'Transfers by Type',
      'transfers.transfers': 'Transfers',
      'transfers.vesting': 'Vesting',
      'transfers.forfeiture': 'Forfeiture',
      'transfers.exercise': 'Exercise',
      'transfers.cancellation': 'Cancellation',
      'transfers.pendingTransfers': 'Pending Transfers',
      'transfers.noTransfersAvailable': 'No transfers available',
      'transfers.noPendingTransfers': 'No pending transfers',
      'transfers.daysRemaining': 'days remaining',
      'transfers.overdue': 'days overdue',
      'transfers.showAllPending': 'Show all pending transfers',
    },
  },
  ar: {
    translation: {
      'common.dashboard': 'لوحة التحكم',
      'common.employees': 'الموظفون',
      'common.plans': 'الخطط',
      'common.grants': 'المنح',
      'common.portfolio': 'المحفظة',
      'common.settings': 'الإعدادات',
      'common.users': 'المستخدمون',
      'common.capTable': 'جدول رأس المال',
      'common.ltipPools': 'مجمعات LTIP',
      'common.vestingSchedules': 'جداول الاستحقاق',
      'common.vestingEvents': 'أحداث الاستحقاق',
      'common.exerciseOrders': 'طلبات ممارسة الخيارات',
      'common.companyCashPortfolio': 'المحفظة النقدية للشركة',
      'common.cashTransfers': 'التحويلات النقدية',
      'common.transfers': 'التحويلات',
      'common.performanceMetrics': 'مقاييس الأداء',
      'common.documents': 'المستندات',
      'common.logout': 'تسجيل الخروج',
      'common.login': 'تسجيل الدخول',
      'common.save': 'حفظ',
      'common.cancel': 'إلغاء',
      'common.delete': 'حذف',
      'common.edit': 'تعديل',
      'common.create': 'إنشاء',
      'common.search': 'بحث',
      'common.loading': 'جاري التحميل...',
      'common.noData': 'لا توجد بيانات متاحة',
      'common.translations': 'الترجمات',
      'common.operatorConsole': 'لوحة المشغل',
      'common.overview': 'نظرة عامة',
      'common.incentivePlans': 'خطط الحوافز',
      // Employee Portal Navigation
      'employee.overview': 'نظرة عامة',
      'employee.dashboard': 'لوحة التحكم',
      'employee.vestingTimeline': 'الجدول الزمني للاستحقاق',
      'employee.vestingEvents': 'أحداث الاستحقاق',
      'employee.cashPortfolio': 'المحفظة النقدية',
      'employee.portfolio': 'المحفظة',
      'employee.performance': 'الأداء',
      'employee.taxCalculator': 'حاسبة الضرائب',
      'employee.zakatCalculator': 'حاسبة الزكاة',
      'employee.documents': 'المستندات',
      'employee.notifications': 'الإشعارات',
      'employee.employeePortal': 'بوابة الموظف',
      'employee.employee': 'موظف',
      'employee.signOut': 'تسجيل الخروج',
      'employee.adminView': 'عرض الإدارة',
      // Employee Dashboard
      'employeeDashboard.title': 'لوحة التحكم الخاصة بي',
      'employeeDashboard.description': 'نظرة عامة على منح حقوق الملكية وحالة الاستحقاق',
      'employeeDashboard.status': 'الحالة',
      'employeeDashboard.number': 'العدد',
      'employeeDashboard.valuation': 'التقييم',
      'employeeDashboard.vested': 'المستحقة',
      'employeeDashboard.unvested': 'غير المستحقة',
      'employeeDashboard.lapsed': 'الملغاة',
      'employeeDashboard.active': 'نشط',
      'employeeDashboard.exercised': 'الممارسة',
      'employeeDashboard.buyBack': 'إعادة الشراء',
      'employeeDashboard.whenIsNextVesting': 'متى يكون موعد الاستحقاق القادم؟',
      'employeeDashboard.options': 'خيارات',
      'employeeDashboard.cumulativeVestedOptions': 'الخيارات المستحقة التراكمية',
      'employeeDashboard.exercisePricePayable': 'سعر الممارسة المستحق',
      'employeeDashboard.sharesRoadmap': 'خارطة طريق الأسهم',
      'employeeDashboard.noDataAvailable': 'لا توجد بيانات متاحة',
      'employeeDashboard.actionRequired': 'إجراء مطلوب',
      'employeeDashboard.actionRequiredMessage': 'لديك منح تتطلب توقيعك. يرجى مراجعة وقبول العقود لتفعيل منح حقوق الملكية الخاصة بك.',
      'employeeDashboard.yourGrants': 'منحك',
      'employeeDashboard.noActiveGrants': 'لا توجد منح نشطة',
      'employeeDashboard.quickStats': 'إحصائيات سريعة',
      'employeeDashboard.vestedSharesLabel': 'الأسهم المستحقة',
      'employeeDashboard.unvestedSharesLabel': 'الأسهم غير المستحقة',
      'employeeDashboard.reviewGrantAgreement': 'مراجعة اتفاقية المنحة',
      'employeeDashboard.vestingEventDetails': 'تفاصيل حدث الاستحقاق',
      'employeeDashboard.sharesToVest': 'الأسهم المستحقة',
      'employeeDashboard.eventType': 'نوع الحدث',
      'employeeDashboard.daysRemaining': 'الأيام المتبقية',
      'employeeDashboard.performanceNotes': 'ملاحظات الأداء',
      'employeeDashboard.pendingSignature': 'في انتظار التوقيع',
      'employeeDashboard.draft': 'مسودة',
      'employeeDashboard.noUpcomingVestingDates': 'لا توجد تواريخ استحقاق قادمة',
      'employeeDashboard.failedToAcceptContract': 'فشل في قبول العقد',
      'employeeDashboard.loadingDashboard': 'جاري تحميل لوحة التحكم...',
      'employeeDashboard.totalSharesGranted': 'إجمالي الأسهم الممنوحة',
      'employeeDashboard.vestedShares': 'الأسهم المستحقة',
      'employeeDashboard.unvestedShares': 'الأسهم غير المستحقة',
      'employeeDashboard.grant': 'منحة',
      'employeeDashboard.grants': 'منح',
      'employeeDashboard.ofTotal': 'من الإجمالي',
      'employeeDashboard.remaining': 'متبقي',
      'employeeDashboard.reviewContract': 'مراجعة العقد',
      'employeeDashboard.yourVestingCalendar': 'تقويم الاستحقاق الخاص بك',
      'employeeDashboard.trackUpcomingVesting': 'تتبع معالم الاستحقاق القادمة ومراجعة الأحداث السابقة.',
      'employeeDashboard.noVestingEventsScheduled': 'لم يتم جدولة أحداث استحقاق بعد. ستظهر معالم الاستحقاق المستقبلية هنا.',
      'employeeDashboard.noActiveGrantsMessage': 'ليس لديك أي منح حقوق ملكية نشطة في هذا الوقت.',
      'employeeDashboard.byAcceptingAgreement': 'بقبول هذه الاتفاقية، فإنك تقر بـ:',
      'employeeDashboard.understandingGrantTerms': 'فهم شروط المنحة وجدول الاستحقاق',
      'employeeDashboard.acceptanceOfConditions': 'قبول شروط خطة حقوق الملكية للشركة',
      'employeeDashboard.agreementToTaxImplications': 'الموافقة على الآثار الضريبية والقيود',
      'employeeDashboard.acceptAgreement': 'قبول الاتفاقية',
      'employeeDashboard.close': 'إغلاق',
      'employeeDashboard.plan': 'الخطة',
      'employeeDashboard.shares': 'أسهم',
      'employeeDashboard.vestedSharesSAR': 'الأسهم المستحقة (ريال سعودي)',
      'employeeDashboard.unvestedSharesSAR': 'الأسهم غير المستحقة (ريال سعودي)',
      'employeeDashboard.vestedIncludes': 'المستحقة تشمل: المستحقة، المنقولة، الممارسة، المستحقة، والأحداث ذات التواريخ السابقة',
      'employeeDashboard.unvestedIncludes': 'غير المستحقة تشمل: الأحداث المعلقة وذات التواريخ المستقبلية',
      'employeeDashboard.noRoadmapDataAvailable': 'لا توجد بيانات خارطة طريق متاحة',
      'employeeDashboard.total': 'الإجمالي',
      // Employee Vesting
      'employeeVesting.title': 'الجدول الزمني للاستحقاق',
      'employeeVesting.description': 'تتبع تقدم استحقاق أسهمك عبر جميع المنح',
      'employeeVesting.loading': 'جاري التحميل...',
      'employeeVesting.noVestingData': 'لا توجد بيانات استحقاق متاحة',
      'employeeVesting.vestingSchedule': 'جدول الاستحقاق',
      'employeeVesting.cliffPeriod': 'فترة الهاوية',
      'employeeVesting.frequency': 'التكرار',
      'employeeVesting.type': 'النوع',
      'employeeVesting.duration': 'المدة',
      'employeeVesting.months': 'أشهر',
      'employeeVesting.years': 'سنوات',
      'employeeVesting.vestingProgress': 'تقدم الاستحقاق',
      'employeeVesting.vested': 'مستحقة',
      'employeeVesting.vestingEvent': 'حدث الاستحقاق',
      'employeeVesting.shares': 'أسهم',
      'employeeVesting.active': 'نشط',
      'employeeVesting.pendingSignature': 'في انتظار التوقيع',
      'employeeVesting.contractSigned': 'تم توقيع العقد',
      'employeeVesting.contractExecuted': 'تم تنفيذ العقد',
      'employeeVesting.draftContract': 'مسودة العقد',
      'employeeVesting.contract': 'العقد',
      'employeeVesting.plan': 'الخطة',
      'employeeVesting.noIndividualRecords': 'لم يتم العثور على سجلات استحقاق فردية. قد لا تكون هذه المنحة قد تمت معالجتها باستخدام قالب جدول الاستحقاق.',
      // Employee Portfolio
      'employeePortfolio.title': 'محفظتي',
      'employeePortfolio.description': 'عرض محفظة حقوق الملكية الخاصة بك وسجل المعاملات',
      'employeePortfolio.loading': 'جاري تحميل محفظتك...',
      'employeePortfolio.totalShares': 'إجمالي الأسهم',
      'employeePortfolio.availableShares': 'الأسهم المتاحة',
      'employeePortfolio.lockedShares': 'الأسهم المقفلة',
      'employeePortfolio.portfolioValue': 'قيمة المحفظة',
      'employeePortfolio.perShare': 'لكل سهم',
      'employeePortfolio.portfolioDetails': 'تفاصيل المحفظة',
      'employeePortfolio.portfolioNumber': 'رقم المحفظة',
      'employeePortfolio.company': 'الشركة',
      'employeePortfolio.createdDate': 'تاريخ الإنشاء',
      'employeePortfolio.lastUpdated': 'آخر تحديث',
      'employeePortfolio.noPortfolioFound': 'لم يتم العثور على محفظة',
      'employeePortfolio.noPortfolioMessage': 'سيتم إنشاء محفظتك تلقائياً عند نقل الأسهم إليك.',
      'employeePortfolio.portfolioValuation': 'تقييم المحفظة',
      'employeePortfolio.grantsBreakdown': 'تفصيل المنح',
      'employeePortfolio.grantNumber': 'رقم المنحة',
      'employeePortfolio.plan': 'الخطة',
      'employeePortfolio.vested': 'مستحقة',
      'employeePortfolio.unvested': 'غير مستحقة',
      'employeePortfolio.grantDate': 'تاريخ المنحة',
      'employeePortfolio.transactionHistory': 'سجل المعاملات',
      'employeePortfolio.transferNumber': 'رقم التحويل',
      'employeePortfolio.grant': 'المنحة',
      'employeePortfolio.shares': 'أسهم',
      'employeePortfolio.date': 'التاريخ',
      'employeePortfolio.status': 'الحالة',
      'employeePortfolio.noTransactions': 'لا توجد معاملات بعد',
      'employeePortfolio.noTransactionsMessage': 'سيظهر سجل التحويلات هنا بمجرد نقل الأسهم إلى محفظتك.',
      'employeePortfolio.completed': 'مكتمل',
      'employeePortfolio.pending': 'قيد الانتظار',
      'employeePortfolio.depositCash': 'إيداع نقدي',
      'employeePortfolio.cashBalance': 'الرصيد النقدي',
      // Employee Overview
      'employeeOverview.title': 'نظرة عامة',
      'employeeOverview.totalPotentialValue': 'إجمالي القيمة المحتملة',
      'employeeOverview.completeYourTasks': 'أكمل مهامك',
      'employeeOverview.available': 'متاح',
      'employeeOverview.inProgress': 'قيد التنفيذ',
      'employeeOverview.availableWithRestrictions': 'متاح مع قيود',
      'employeeOverview.unavailable': 'غير متاح',
      'employeeOverview.accounts': 'الحسابات',
      'employeeOverview.plans': 'الخطط',
      'employeeOverview.grants': 'المنح',
      'employeeOverview.shareOwnershipAccount': 'حساب ملكية الأسهم',
      'employeeOverview.shareIncentivePlans': 'خطط حوافز الأسهم (SIP)',
      'employeeOverview.upcoming': 'قادم',
      'employeeOverview.due': 'مستحق',
      'employeeOverview.pendingExercise': 'ممارسة معلقة',
      'employeeOverview.exerciseOptions': 'خيارات الممارسة',
      'employeeOverview.grantDetails': 'تفاصيل المنحة',
      'employeeOverview.availableShares': 'الأسهم المتاحة',
      'employeeOverview.total': 'الإجمالي',
      'employeeOverview.vested': 'مستحقة',
      'employeeOverview.unvested': 'غير مستحقة',
      'employeeOverview.shares': 'أسهم',
      'employeeOverview.noTasks': 'لا توجد مهام في هذا الوقت',
      'employeeOverview.createExerciseOrder': 'إنشاء طلب ممارسة',
      'employeeOverview.eventId': 'معرف الحدث',
      'employeeOverview.status': 'الحالة',
      'employeeOverview.plan': 'الخطة',
      'employeeOverview.grant': 'المنحة',
      'employeeOverview.vestingDate': 'تاريخ الاستحقاق',
      'employeeOverview.sharesToVest': 'الأسهم المستحقة',
      'employeeOverview.exercisePrice': 'سعر الممارسة',
      'employeeOverview.totalCost': 'التكلفة الإجمالية',
      'employeeOverview.close': 'إغلاق',
      'employeeOverview.details': 'التفاصيل',
      'employeeOverview.noGrantsAvailable': 'لا توجد منح متاحة',
      'employeeOverview.totalShares': 'إجمالي الأسهم',
      // Employee Vesting Events
      'employeeVestingEvents.title': 'أحداث الاستحقاق',
      'employeeVestingEvents.description': 'عرض وإدارة أحداث الاستحقاق الخاصة بك',
      'employeeVestingEvents.loading': 'جاري تحميل أحداث الاستحقاق...',
      'employeeVestingEvents.noEvents': 'لم يتم العثور على أحداث استحقاق',
      'employeeVestingEvents.filterByStatus': 'تصفية حسب الحالة',
      'employeeVestingEvents.filterByType': 'تصفية حسب النوع',
      'employeeVestingEvents.allStatuses': 'جميع الحالات',
      'employeeVestingEvents.allTypes': 'جميع الأنواع',
      'employeeVestingEvents.viewDetails': 'عرض التفاصيل',
      'employeeVestingEvents.exercise': 'ممارسة',
      'employeeVestingEvents.eventDetails': 'تفاصيل الحدث',
      'employeeVestingEvents.yourVestingEvents': 'أحداث الاستحقاق الخاصة بك',
      'employeeVestingEvents.eventId': 'معرف الحدث',
      'employeeVestingEvents.plan': 'الخطة',
      'employeeVestingEvents.eventType': 'نوع الحدث',
      'employeeVestingEvents.vestingDate': 'تاريخ الاستحقاق',
      'employeeVestingEvents.shares': 'الأسهم',
      'employeeVestingEvents.status': 'الحالة',
      'employeeVestingEvents.actions': 'الإجراءات',
      'employeeVestingEvents.noEventsMatchFilters': 'لا توجد أحداث استحقاق تطابق المرشحات الحالية.',
      'employeeVestingEvents.grantNumber': 'رقم المنحة',
      'employeeVestingEvents.exercisePrice': 'سعر الممارسة',
      'employeeVestingEvents.totalExerciseCost': 'التكلفة الإجمالية للممارسة',
      'employeeVestingEvents.exerciseNow': 'ممارسة الآن',
      'employeeVestingEvents.confirmExercise': 'تأكيد الممارسة',
      'employeeVestingEvents.exerciseDetails': 'تفاصيل الممارسة',
      'employeeVestingEvents.sharesToExercise': 'الأسهم للممارسة',
      'employeeVestingEvents.totalCost': 'التكلفة الإجمالية',
      'employeeVestingEvents.availableBalance': 'الرصيد المتاح',
      'employeeVestingEvents.insufficientFunds': 'أموال غير كافية',
      'employeeVestingEvents.depositRequired': 'إيداع مطلوب',
      'employeeVestingEvents.processing': 'جاري المعالجة...',
      'employeeVestingEvents.close': 'إغلاق',
      // Employee Performance
      'employeePerformance.title': 'سجل الأداء',
      'employeePerformance.description': 'تتبع قيمة محفظتك بمرور الوقت',
      'employeePerformance.loading': 'جاري التحميل...',
      // Employee Tax Calculator
      'employeeTaxCalculator.title': 'حاسبة الضرائب',
      'employeeTaxCalculator.description': 'تقدير التزامك الضريبي على الأسهم المستحقة',
      'employeeTaxCalculator.loading': 'جاري التحميل...',
      'employeeTaxCalculator.noGrantData': 'لا توجد بيانات منحة متاحة',
      // Employee Zakat Calculator
      'employeeZakatCalculator.title': 'حاسبة الزكاة',
      'employeeZakatCalculator.description': 'احسب ضريبة الثروة الإسلامية الخاصة بك',
      'employeeZakatCalculator.loading': 'جاري التحميل...',
      // Employee Documents
      'employeeDocuments.title': 'المستندات',
      'employeeDocuments.description': 'الوصول إلى مستنداتك المتعلقة بحقوق الملكية وتنزيلها',
      // Employee Notifications
      'employeeNotifications.title': 'تفضيلات الإشعارات',
      'employeeNotifications.description': 'إدارة كيفية استلامك للتحديثات والتنبيهات',
      // Language Switcher
      'language.switch': 'تبديل اللغة',
      'language.arabic': 'العربية',
      'language.english': 'الإنجليزية',
      // Transfers Summary
      'transfers.summaryTitle': 'ملخص التحويلات',
      'transfers.summaryDescription': 'نظرة عامة على تحويلات الأسهم وحالتها',
      'transfers.totalTransfers': 'إجمالي التحويلات',
      'transfers.completed': 'مكتمل',
      'transfers.averageTransferSize': 'متوسط حجم التحويل',
      'transfers.perTransfer': 'لكل تحويل',
      'transfers.totalValue': 'إجمالي قيمة التحويل',
      'transfers.sar': 'ريال سعودي',
      'transfers.transfersByStatus': 'التحويلات حسب الحالة',
      'transfers.transfersByType': 'التحويلات حسب النوع',
      'transfers.transfers': 'التحويلات',
      'transfers.vesting': 'الاستحقاق',
      'transfers.forfeiture': 'المصادرة',
      'transfers.exercise': 'الممارسة',
      'transfers.cancellation': 'الإلغاء',
      'transfers.pendingTransfers': 'التحويلات المعلقة',
      'transfers.noTransfersAvailable': 'لا توجد تحويلات متاحة',
      'transfers.noPendingTransfers': 'لا توجد تحويلات معلقة',
      'transfers.daysRemaining': 'يوم متبقي',
      'transfers.overdue': 'يوم متأخر',
      'transfers.showAllPending': 'عرض جميع التحويلات المعلقة',
    },
  },
};

// Load translations from database
async function loadTranslationsFromDB(language: string) {
  try {
    const { data, error } = await supabase
      .from('translations')
      .select('translation_key, translation_value')
      .eq('language_code', language)
      .eq('namespace', 'translation');

    if (error) {
      console.error('Error loading translations:', error);
      return {};
    }

    const translations: Record<string, string> = {};
    data?.forEach((item) => {
      translations[item.translation_key] = item.translation_value;
    });

    return translations;
  } catch (error) {
    console.error('Error loading translations from DB:', error);
    return {};
  }
}

// Initialize i18n
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: defaultTranslations,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar'],
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

// Load translations from database after initialization
// Use a more robust loading approach that ensures translations are available
(async () => {
  try {
    const currentLang = i18n.language || 'en';
    const translations = await loadTranslationsFromDB(currentLang);
    if (Object.keys(translations).length > 0) {
      i18n.addResourceBundle(currentLang, 'translation', translations, true, true);
      // Force a reload to ensure all components pick up the translations
      i18n.reloadResources(currentLang);
      console.log(`✓ Loaded ${Object.keys(translations).length} translations for ${currentLang}`);
    } else {
      console.warn(`⚠ No translations found in database for ${currentLang}`);
    }
  } catch (error) {
    console.error('Error loading initial translations:', error);
  }
})();

// Listen for language changes and reload translations
i18n.on('languageChanged', async (lng) => {
  try {
    const translations = await loadTranslationsFromDB(lng);
    if (Object.keys(translations).length > 0) {
      i18n.addResourceBundle(lng, 'translation', translations, true, true);
      // Force a reload to ensure all components pick up the translations
      i18n.reloadResources(lng);
      console.log(`✓ Loaded ${Object.keys(translations).length} translations for ${lng}`);
    } else {
      console.warn(`⚠ No translations found in database for ${lng}`);
    }
    
    // Update document direction for RTL
    if (typeof document !== 'undefined') {
      document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = lng;
    }
  } catch (error) {
    console.error('Error loading translations on language change:', error);
  }
});

// Set initial direction
if (typeof window !== 'undefined') {
  document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = i18n.language;
}

// Export function to reload translations
export async function reloadTranslations(language?: string) {
  try {
    const lng = language || i18n.language;
    const translations = await loadTranslationsFromDB(lng);
    if (Object.keys(translations).length > 0) {
      i18n.addResourceBundle(lng, 'translation', translations, true, true);
      i18n.reloadResources(lng);
      console.log(`✓ Reloaded ${Object.keys(translations).length} translations for ${lng}`);
      return true;
    } else {
      console.warn(`⚠ No translations found in database for ${lng}`);
      return false;
    }
  } catch (error) {
    console.error('Error reloading translations:', error);
    return false;
  }
}

export default i18n;

