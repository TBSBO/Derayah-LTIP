export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string
          company_name_en: string
          company_name_ar: string
          tadawul_symbol: string
          commercial_registration_number: string
          verification_status: 'pending' | 'verified' | 'rejected'
          verification_documents: Json
          total_reserved_shares: number
          available_shares: number
          current_fmv: number | null
          fmv_source: string | null
          brand_color: string | null
          admin_user_id: string | null
          status: 'active' | 'suspended' | 'inactive'
          created_at: string
          updated_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          company_name_en: string
          company_name_ar: string
          tadawul_symbol: string
          commercial_registration_number: string
          verification_status?: 'pending' | 'verified' | 'rejected'
          verification_documents?: Json
          total_reserved_shares?: number
          available_shares?: number
          current_fmv?: number | null
          fmv_source?: string | null
          brand_color?: string | null
          admin_user_id?: string | null
          status?: 'active' | 'suspended' | 'inactive'
          created_at?: string
          updated_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          company_name_en?: string
          company_name_ar?: string
          tadawul_symbol?: string
          commercial_registration_number?: string
          verification_status?: 'pending' | 'verified' | 'rejected'
          verification_documents?: Json
          total_reserved_shares?: number
          available_shares?: number
          current_fmv?: number | null
          fmv_source?: string | null
          brand_color?: string | null
          admin_user_id?: string | null
          status?: 'active' | 'suspended' | 'inactive'
          created_at?: string
          updated_at?: string
          metadata?: Json
        }
      }
      company_users: {
        Row: {
          id: string
          company_id: string
          user_id: string
          role: 'super_admin' | 'hr_admin' | 'finance_admin' | 'legal_admin' | 'operations_admin' | 'viewer'
          permissions: Json
          is_active: boolean
          display_name_en: string | null
          display_name_ar: string | null
          created_at: string
          last_login_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          role: 'super_admin' | 'hr_admin' | 'finance_admin' | 'legal_admin' | 'operations_admin' | 'viewer'
          permissions?: Json
          is_active?: boolean
          display_name_en?: string | null
          display_name_ar?: string | null
          created_at?: string
          last_login_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          user_id?: string
          role?: 'super_admin' | 'hr_admin' | 'finance_admin' | 'legal_admin' | 'operations_admin' | 'viewer'
          permissions?: Json
          is_active?: boolean
          display_name_en?: string | null
          display_name_ar?: string | null
          created_at?: string
          last_login_at?: string | null
        }
      }
      employees: {
        Row: {
          id: string
          company_id: string
          employee_number: string
          national_id: string
          email: string
          phone: string | null
          first_name_en: string
          last_name_en: string
          first_name_ar: string | null
          last_name_ar: string | null
          department: string | null
          job_title: string | null
          hire_date: string | null
          employment_status: 'active' | 'terminated' | 'resigned' | 'retired'
          termination_date: string | null
          user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          employee_number: string
          national_id: string
          email: string
          phone?: string | null
          first_name_en: string
          last_name_en: string
          first_name_ar?: string | null
          last_name_ar?: string | null
          department?: string | null
          job_title?: string | null
          hire_date?: string | null
          employment_status?: 'active' | 'terminated' | 'resigned' | 'retired'
          termination_date?: string | null
          user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          employee_number?: string
          national_id?: string
          email?: string
          phone?: string | null
          first_name_en?: string
          last_name_en?: string
          first_name_ar?: string | null
          last_name_ar?: string | null
          department?: string | null
          job_title?: string | null
          hire_date?: string | null
          employment_status?: 'active' | 'terminated' | 'resigned' | 'retired'
          termination_date?: string | null
          user_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      employee_financial_info: {
        Row: {
          id: string
          employee_id: string
          company_id: string
          iban: string | null
          bank_name: string | null
          bank_branch_code: string | null
          account_holder_name_ar: string | null
          investment_account_number: string | null
          broker_custodian_name: string | null
          broker_account_number: string | null
          tadawul_investor_number: string | null
          account_status: 'pending' | 'verified' | 'rejected' | 'expired'
          account_verification_date: string | null
          verified_by: string | null
          verified_at: string | null
          verification_notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          employee_id: string
          company_id?: string
          iban?: string | null
          bank_name?: string | null
          bank_branch_code?: string | null
          account_holder_name_ar?: string | null
          investment_account_number?: string | null
          broker_custodian_name?: string | null
          broker_account_number?: string | null
          tadawul_investor_number?: string | null
          account_status?: 'pending' | 'verified' | 'rejected' | 'expired'
          account_verification_date?: string | null
          verified_by?: string | null
          verified_at?: string | null
          verification_notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          employee_id?: string
          company_id?: string
          iban?: string | null
          bank_name?: string | null
          bank_branch_code?: string | null
          account_holder_name_ar?: string | null
          investment_account_number?: string | null
          broker_custodian_name?: string | null
          broker_account_number?: string | null
          tadawul_investor_number?: string | null
          account_status?: 'pending' | 'verified' | 'rejected' | 'expired'
          account_verification_date?: string | null
          verified_by?: string | null
          verified_at?: string | null
          verification_notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
      }
      ltip_pools: {
        Row: {
          id: string
          company_id: string
          pool_name_en: string
          pool_name_ar: string | null
          pool_code: string
          description_en: string | null
          description_ar: string | null
          total_shares_allocated: number
          shares_used: number
          shares_available: number
          pool_type: 'general' | 'executive' | 'employee' | 'retention' | 'performance'
          status: 'active' | 'inactive' | 'exhausted'
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          pool_name_en: string
          pool_name_ar?: string | null
          pool_code: string
          description_en?: string | null
          description_ar?: string | null
          total_shares_allocated?: number
          shares_used?: number
          pool_type?: 'general' | 'executive' | 'employee' | 'retention' | 'performance'
          status?: 'active' | 'inactive' | 'exhausted'
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          pool_name_en?: string
          pool_name_ar?: string | null
          pool_code?: string
          description_en?: string | null
          description_ar?: string | null
          total_shares_allocated?: number
          shares_used?: number
          pool_type?: 'general' | 'executive' | 'employee' | 'retention' | 'performance'
          status?: 'active' | 'inactive' | 'exhausted'
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      incentive_plans: {
        Row: {
          id: string
          company_id: string
          plan_name_en: string
          plan_name_ar: string
          plan_type: 'LTIP_RSU' | 'LTIP_RSA' | 'ESOP'
          plan_code: string
          description_en: string | null
          description_ar: string | null
          vesting_schedule_type: 'time_based' | 'performance_based' | 'hybrid'
          vesting_config: Json
          vesting_schedule_template_id: string | null
          ltip_pool_id: string | null
          exercise_price: number | null
          total_shares_allocated: number
          shares_granted: number
          shares_available: number
          start_date: string
          end_date: string | null
          status: 'draft' | 'active' | 'closed' | 'suspended'
          approval_status: 'pending' | 'approved' | 'rejected'
          approved_by: string | null
          approved_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          plan_name_en: string
          plan_name_ar: string
          plan_type: 'LTIP_RSU' | 'LTIP_RSA' | 'ESOP'
          plan_code: string
          description_en?: string | null
          description_ar?: string | null
          vesting_schedule_type: 'time_based' | 'performance_based' | 'hybrid'
          vesting_config: Json
          vesting_schedule_template_id?: string | null
          ltip_pool_id?: string | null
          exercise_price?: number | null
          total_shares_allocated?: number
          shares_granted?: number
          shares_available?: number
          start_date: string
          end_date?: string | null
          status?: 'draft' | 'active' | 'closed' | 'suspended'
          approval_status?: 'pending' | 'approved' | 'rejected'
          approved_by?: string | null
          approved_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          plan_name_en?: string
          plan_name_ar?: string
          plan_type?: 'LTIP_RSU' | 'LTIP_RSA' | 'ESOP'
          plan_code?: string
          description_en?: string | null
          description_ar?: string | null
          vesting_schedule_type?: 'time_based' | 'performance_based' | 'hybrid'
          vesting_config?: Json
          vesting_schedule_template_id?: string | null
          ltip_pool_id?: string | null
          exercise_price?: number | null
          total_shares_allocated?: number
          shares_granted?: number
          shares_available?: number
          start_date?: string
          end_date?: string | null
          status?: 'draft' | 'active' | 'closed' | 'suspended'
          approval_status?: 'pending' | 'approved' | 'rejected'
          approved_by?: string | null
          approved_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      grant_performance_metrics: {
        Row: {
          id: string
          company_id: string
          grant_id: string
          performance_metric_id: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          grant_id: string
          performance_metric_id: string
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          grant_id?: string
          performance_metric_id?: string
          created_at?: string
        }
      }
      grants: {
        Row: {
          id: string
          grant_number: string
          company_id: string
          plan_id: string
          employee_id: string
          grant_date: string
          total_shares: number
          vested_shares: number
          exercised_shares: number
          forfeited_shares: number
          remaining_unvested_shares: number | null
          vesting_start_date: string
          vesting_end_date: string
          contract_document_url: string | null
          contract_signed_at: string | null
          employee_acceptance_at: string | null
          status: 'pending_signature' | 'active' | 'completed' | 'forfeited' | 'cancelled'
          cancellation_reason: string | null
          exercise_price: number | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          grant_number?: string
          company_id: string
          plan_id: string
          employee_id: string
          grant_date?: string
          total_shares: number
          vested_shares?: number
          exercised_shares?: number
          forfeited_shares?: number
          remaining_unvested_shares?: number | null
          vesting_start_date: string
          vesting_end_date: string
          contract_document_url?: string | null
          contract_signed_at?: string | null
          employee_acceptance_at?: string | null
          status?: 'pending_signature' | 'active' | 'completed' | 'forfeited' | 'cancelled'
          cancellation_reason?: string | null
          exercise_price?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          grant_number?: string
          company_id?: string
          plan_id?: string
          employee_id?: string
          grant_date?: string
          total_shares?: number
          vested_shares?: number
          exercised_shares?: number
          forfeited_shares?: number
          remaining_unvested_shares?: number | null
          vesting_start_date?: string
          vesting_end_date?: string
          contract_document_url?: string | null
          contract_signed_at?: string | null
          employee_acceptance_at?: string | null
          status?: 'pending_signature' | 'active' | 'completed' | 'forfeited' | 'cancelled'
          cancellation_reason?: string | null
          exercise_price?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      market_data: {
        Row: {
          id: string
          tadawul_symbol: string
          trading_date: string
          opening_price: number | null
          closing_price: number
          high_price: number | null
          low_price: number | null
          volume: number | null
          last_updated: string
          source: string | null
        }
      }
      notifications: {
        Row: {
          id: string
          company_id: string | null
          recipient_user_id: string
          notification_type: 'grant_issued' | 'vesting_completed' | 'document_ready' | 'plan_created' | 'contract_signed'
          title_en: string
          title_ar: string | null
          message_en: string
          message_ar: string | null
          priority: 'low' | 'medium' | 'high' | 'urgent'
          read_at: string | null
          delivery_channels: string[]
          delivery_status: Json
          created_at: string
          expires_at: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
