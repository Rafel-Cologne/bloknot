export type AppRole = 'guest' | 'owner' | 'cleaner' | 'admin'
export type BookingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'
export type BookingSource = 'platform' | 'airbnb' | 'booking' | 'other'
export type CleaningPaymentMethod = 'guest_cash' | 'owner_transfer' | 'paypal'
export type BlockedDateReason = 'blocked' | 'pending'

// ── New types (Migration 005) ──────────────────────────────────────────────
export type ExpenseSource = 'manual' | 'email_agent'
export type ExpenseStatus = 'pending_confirmation' | 'confirmed' | 'rejected'
export type AgentRunStatus = 'success' | 'partial' | 'failed'

export type ExpenseCategory =
  | 'water'
  | 'electricity'
  | 'gas'
  | 'internet'
  | 'repair'
  | 'furniture'
  | 'appliances'
  | 'insurance'
  | 'ibi'
  | 'cleaning'
  | 'other'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          email: string | null
          phone: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name?: string
          email?: string | null
          phone?: string | null
          is_active?: boolean
        }
        Update: {
          name?: string
          email?: string | null
          phone?: string | null
          is_active?: boolean
        }
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: AppRole
        }
        Insert: {
          user_id: string
          role?: AppRole
        }
        Update: {
          role?: AppRole
        }
      }
      apartments: {
        Row: {
          id: string
          owner_id: string
          title: string
          description: string
          address: string
          amenities: string[]
          rules: string[]
          price_per_night: number
          cleaning_fee: number
          max_guests: number
          is_public: boolean
          cleaner_id: string | null
          // ── Migration 005 ──
          cadastral_reference: string | null
          construction_value: number | null
          full_address: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          owner_id: string
          title: string
          description?: string
          address?: string
          amenities?: string[]
          rules?: string[]
          price_per_night?: number
          cleaning_fee?: number
          max_guests?: number
          is_public?: boolean
          cleaner_id?: string | null
          cadastral_reference?: string | null
          construction_value?: number | null
          full_address?: string | null
        }
        Update: {
          title?: string
          description?: string
          address?: string
          amenities?: string[]
          rules?: string[]
          price_per_night?: number
          cleaning_fee?: number
          max_guests?: number
          is_public?: boolean
          cleaner_id?: string | null
          cadastral_reference?: string | null
          construction_value?: number | null
          full_address?: string | null
        }
      }
      apartment_images: {
        Row: {
          id: string
          apartment_id: string
          image_url: string
          order_index: number
          created_at: string
        }
        Insert: {
          apartment_id: string
          image_url: string
          order_index?: number
        }
        Update: {
          image_url?: string
          order_index?: number
        }
      }
      bookings: {
        Row: {
          id: string
          apartment_id: string
          guest_id: string | null
          guest_name: string
          guest_phone: string
          guest_message: string | null
          start_date: string
          end_date: string
          guests_count: number
          status: BookingStatus
          source: BookingSource
          total_amount: number | null
          offer_price: number | null
          share_contact_with_cleaner: boolean
          guest_rating: number | null
          owner_notes: string | null
          // ── Migration 005 ──
          external_booking_id: string | null
          deleted_at: string | null
          created_by_agent: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          apartment_id: string
          guest_id?: string | null
          guest_name: string
          guest_phone?: string
          guest_message?: string | null
          start_date: string
          end_date: string
          guests_count?: number
          status?: BookingStatus
          source?: BookingSource
          total_amount?: number | null
          offer_price?: number | null
          share_contact_with_cleaner?: boolean
          owner_notes?: string | null
          external_booking_id?: string | null
          deleted_at?: string | null
          created_by_agent?: boolean
        }
        Update: {
          status?: BookingStatus
          total_amount?: number | null
          offer_price?: number | null
          share_contact_with_cleaner?: boolean
          guest_rating?: number | null
          owner_notes?: string | null
          external_booking_id?: string | null
          deleted_at?: string | null
          created_by_agent?: boolean
        }
      }
      blocked_dates: {
        Row: {
          id: string
          apartment_id: string
          date: string
          reason: BlockedDateReason
          created_at: string
        }
        Insert: {
          apartment_id: string
          date: string
          reason?: BlockedDateReason
        }
        Update: {
          reason?: BlockedDateReason
        }
      }
      custom_pricing: {
        Row: {
          id: string
          apartment_id: string
          date: string
          price: number
          created_at: string
        }
        Insert: {
          apartment_id: string
          date: string
          price: number
        }
        Update: {
          price?: number
        }
      }
      cleaning_tasks: {
        Row: {
          id: string
          booking_id: string
          cleaner_id: string | null
          cleaning_fee: number
          status: string
          payment_method: CleaningPaymentMethod | null
          payment_status: string
          notes: string | null
          cleaner_comment: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          booking_id: string
          cleaner_id?: string | null
          cleaning_fee?: number
          status?: string
          payment_method?: CleaningPaymentMethod | null
          payment_status?: string
          notes?: string | null
          cleaner_comment?: string | null
        }
        Update: {
          status?: string
          payment_method?: CleaningPaymentMethod | null
          payment_status?: string
          notes?: string | null
          cleaner_comment?: string | null
          completed_at?: string | null
        }
      }
      cash_ledger: {
        Row: {
          id: string
          cleaner_id: string
          owner_id: string
          booking_id: string | null
          cleaning_task_id: string | null
          type: 'deposit' | 'withdrawal'
          amount: number
          note: string | null
          created_at: string
        }
        Insert: {
          cleaner_id: string
          owner_id: string
          booking_id?: string | null
          cleaning_task_id?: string | null
          type: 'deposit' | 'withdrawal'
          amount: number
          note?: string | null
        }
        Update: object
      }
      booking_notes: {
        Row: {
          id: string
          booking_id: string
          owner_id: string
          note: string
          created_at: string
        }
        Insert: {
          booking_id: string
          owner_id: string
          note: string
        }
        Update: {
          note?: string
        }
      }
      messages: {
        Row: {
          id: string
          booking_id: string
          sender_id: string
          content: string
          read: boolean
          created_at: string
        }
        Insert: {
          booking_id: string
          sender_id: string
          content: string
          read?: boolean
        }
        Update: {
          read?: boolean
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          message: string
          link: string | null
          read: boolean
          created_at: string
        }
        Insert: {
          user_id: string
          title: string
          message: string
          link?: string | null
          read?: boolean
        }
        Update: {
          read?: boolean
        }
      }
      // ── Migration 005: new tables ──────────────────────────────────────
      expenses: {
        Row: {
          id: string
          apartment_id: string
          owner_id: string
          category: string            // ExpenseCategory или произвольная строка
          amount: number
          invoice_period_start: string | null
          invoice_period_end: string | null
          expense_date: string
          provider: string | null
          description: string | null
          source: ExpenseSource
          status: ExpenseStatus
          attachment_url: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          apartment_id: string
          owner_id: string
          category: string
          amount: number
          invoice_period_start?: string | null
          invoice_period_end?: string | null
          expense_date: string
          provider?: string | null
          description?: string | null
          source?: ExpenseSource
          status?: ExpenseStatus
          attachment_url?: string | null
          deleted_at?: string | null
        }
        Update: {
          category?: string
          amount?: number
          invoice_period_start?: string | null
          invoice_period_end?: string | null
          expense_date?: string
          provider?: string | null
          description?: string | null
          source?: ExpenseSource
          status?: ExpenseStatus
          attachment_url?: string | null
          deleted_at?: string | null
        }
      }
      agent_logs: {
        Row: {
          id: string
          run_at: string
          emails_checked: number
          bookings_created: number
          bookings_updated: number
          expenses_created: number
          skipped: number
          errors: Record<string, unknown>[] | null  // [{email_id, error, stage}]
          status: AgentRunStatus
        }
        Insert: {
          run_at?: string
          emails_checked?: number
          bookings_created?: number
          bookings_updated?: number
          expenses_created?: number
          skipped?: number
          errors?: Record<string, unknown>[] | null
          status?: AgentRunStatus
        }
        Update: {
          emails_checked?: number
          bookings_created?: number
          bookings_updated?: number
          expenses_created?: number
          skipped?: number
          errors?: Record<string, unknown>[] | null
          status?: AgentRunStatus
        }
      }
      user_email_aliases: {
        Row: {
          id: string
          user_id: string
          alias: string
          created_at: string
        }
        Insert: {
          user_id: string
          alias: string
        }
        Update: {
          alias?: string
        }
      }
      // ── Legacy tables (pre-005, kept for backwards compatibility) ──────
      expense_categories: {
        Row: {
          id: string
          owner_id: string
          name: string
        }
        Insert: {
          owner_id: string
          name: string
        }
        Update: {
          name?: string
        }
      }
    }
    Views: {
      // all_expenses — legacy view/table, используется старым кодом расходов
      all_expenses: {
        Row: {
          id: string
          apartment_id: string
          category_name: string
          amount: number
          paid_date: string
          period_note: string | null
          is_recurring: boolean
          notes: string | null
          created_at: string
        }
      }
    }
    Functions: {
      has_role: {
        Args: { _user_id: string; _role: AppRole }
        Returns: boolean
      }
      is_owner_of_apartment: {
        Args: { _apartment_id: string }
        Returns: boolean
      }
      is_owner_of_booking: {
        Args: { _booking_id: string }
        Returns: boolean
      }
      restore_booking: {
        Args: { _booking_id: string }
        Returns: void
      }
      restore_expense: {
        Args: { _expense_id: string }
        Returns: void
      }
    }
    Enums: {
      app_role: AppRole
      booking_status: BookingStatus
      booking_source: BookingSource
      cleaning_payment_method: CleaningPaymentMethod
    }
  }
}
