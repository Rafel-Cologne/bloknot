export type AppRole = 'guest' | 'owner' | 'cleaner' | 'admin'
export type BookingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'
export type BookingSource = 'platform' | 'airbnb' | 'booking' | 'other'
export type CleaningPaymentMethod = 'guest_cash' | 'owner_transfer' | 'paypal'
export type BlockedDateReason = 'blocked' | 'pending'

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
        }
        Update: {
          status?: BookingStatus
          total_amount?: number | null
          offer_price?: number | null
          share_contact_with_cleaner?: boolean
          guest_rating?: number | null
          owner_notes?: string | null
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
        }
        Update: {
          status?: string
          payment_method?: CleaningPaymentMethod | null
          payment_status?: string
          notes?: string | null
          completed_at?: string | null
        }
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
    }
    Functions: {
      has_role: {
        Args: { _user_id: string; _role: AppRole }
        Returns: boolean
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
