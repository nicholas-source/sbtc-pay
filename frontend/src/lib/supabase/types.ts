export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      direct_payments: {
        Row: {
          amount: number
          block_height: number
          created_at: string
          fee: number
          id: number
          memo: string
          merchant_principal: string
          merchant_received: number
          payer: string
          tx_id: string | null
        }
        Insert: {
          amount: number
          block_height: number
          created_at?: string
          fee?: number
          id?: number
          memo?: string
          merchant_principal: string
          merchant_received?: number
          payer: string
          tx_id?: string | null
        }
        Update: {
          amount?: number
          block_height?: number
          created_at?: string
          fee?: number
          id?: number
          memo?: string
          merchant_principal?: string
          merchant_received?: number
          payer?: string
          tx_id?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          block_hash: string | null
          block_height: number
          contract_identifier: string | null
          event_type: string
          id: number
          payload: Json
          processed_at: string
          tx_id: string
        }
        Insert: {
          block_hash?: string | null
          block_height: number
          contract_identifier?: string | null
          event_type: string
          id?: number
          payload?: Json
          processed_at?: string
          tx_id: string
        }
        Update: {
          block_hash?: string | null
          block_height?: number
          contract_identifier?: string | null
          event_type?: string
          id?: number
          payload?: Json
          processed_at?: string
          tx_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          allow_overpay: boolean
          allow_partial: boolean
          amount: number
          amount_paid: number
          amount_refunded: number
          created_at: string
          created_at_block: number
          expires_at_block: number
          id: number
          memo: string
          merchant_id: number
          merchant_principal: string
          paid_at_block: number | null
          payer: string | null
          reference_id: string | null
          refunded_at_block: number | null
          status: number
          updated_at: string
        }
        Insert: {
          allow_overpay?: boolean
          allow_partial?: boolean
          amount: number
          amount_paid?: number
          amount_refunded?: number
          created_at?: string
          created_at_block: number
          expires_at_block: number
          id: number
          memo?: string
          merchant_id: number
          merchant_principal: string
          paid_at_block?: number | null
          payer?: string | null
          reference_id?: string | null
          refunded_at_block?: number | null
          status?: number
          updated_at?: string
        }
        Update: {
          allow_overpay?: boolean
          allow_partial?: boolean
          amount?: number
          amount_paid?: number
          amount_refunded?: number
          created_at?: string
          created_at_block?: number
          expires_at_block?: number
          id?: number
          memo?: string
          merchant_id?: number
          merchant_principal?: string
          paid_at_block?: number | null
          payer?: string | null
          reference_id?: string | null
          refunded_at_block?: number | null
          status?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          created_at: string
          description: string | null
          id: number
          invoice_count: number
          is_active: boolean
          is_verified: boolean
          logo_url: string | null
          name: string
          principal: string
          registered_at: number
          subscription_count: number
          total_received: number
          total_refunded: number
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: number
          invoice_count?: number
          is_active?: boolean
          is_verified?: boolean
          logo_url?: string | null
          name: string
          principal: string
          registered_at: number
          subscription_count?: number
          total_received?: number
          total_refunded?: number
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          invoice_count?: number
          is_active?: boolean
          is_verified?: boolean
          logo_url?: string | null
          name?: string
          principal?: string
          registered_at?: number
          subscription_count?: number
          total_received?: number
          total_refunded?: number
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          block_height: number
          created_at: string
          fee: number
          id: number
          invoice_id: number
          merchant_principal: string
          merchant_received: number
          payer: string
          payment_index: number
          tx_id: string | null
        }
        Insert: {
          amount: number
          block_height: number
          created_at?: string
          fee?: number
          id?: number
          invoice_id: number
          merchant_principal: string
          merchant_received?: number
          payer: string
          payment_index: number
          tx_id?: string | null
        }
        Update: {
          amount?: number
          block_height?: number
          created_at?: string
          fee?: number
          id?: number
          invoice_id?: number
          merchant_principal?: string
          merchant_received?: number
          payer?: string
          payment_index?: number
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_stats: {
        Row: {
          id: number
          total_fees_collected: number
          total_invoices: number
          total_merchants: number
          total_refunds: number
          total_subscriptions: number
          total_volume: number
          updated_at: string
        }
        Insert: {
          id?: number
          total_fees_collected?: number
          total_invoices?: number
          total_merchants?: number
          total_refunds?: number
          total_subscriptions?: number
          total_volume?: number
          updated_at?: string
        }
        Update: {
          id?: number
          total_fees_collected?: number
          total_invoices?: number
          total_merchants?: number
          total_refunds?: number
          total_subscriptions?: number
          total_volume?: number
          updated_at?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          customer: string
          id: number
          invoice_id: number
          merchant_principal: string
          processed_at_block: number
          reason: string
          tx_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          customer: string
          id: number
          invoice_id: number
          merchant_principal: string
          processed_at_block: number
          reason?: string
          tx_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          customer?: string
          id?: number
          invoice_id?: number
          merchant_principal?: string
          processed_at_block?: number
          reason?: string
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          block_height: number
          created_at: string
          fee: number
          id: number
          merchant_principal: string
          merchant_received: number
          payment_number: number
          subscriber: string
          subscription_id: number
          tx_id: string | null
        }
        Insert: {
          amount: number
          block_height: number
          created_at?: string
          fee?: number
          id?: number
          merchant_principal: string
          merchant_received?: number
          payment_number: number
          subscriber: string
          subscription_id: number
          tx_id?: string | null
        }
        Update: {
          amount?: number
          block_height?: number
          created_at?: string
          fee?: number
          id?: number
          merchant_principal?: string
          merchant_received?: number
          payment_number?: number
          subscriber?: string
          subscription_id?: number
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          created_at: string
          created_at_block: number
          id: number
          interval_blocks: number
          last_payment_at_block: number
          merchant_id: number
          merchant_principal: string
          name: string
          next_payment_at_block: number
          payments_made: number
          status: number
          subscriber: string
          total_paid: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_at_block: number
          id: number
          interval_blocks: number
          last_payment_at_block?: number
          merchant_id: number
          merchant_principal: string
          name: string
          next_payment_at_block: number
          payments_made?: number
          status?: number
          subscriber: string
          total_paid?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_at_block?: number
          id?: number
          interval_blocks?: number
          last_payment_at_block?: number
          merchant_id?: number
          merchant_principal?: string
          name?: string
          next_payment_at_block?: number
          payments_made?: number
          status?: number
          subscriber?: string
          total_paid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_merchant_received: {
        Args: { p_amount: number; p_principal: string }
        Returns: undefined
      }
      increment_platform_stat: {
        Args: { increment_by: number; stat_name: string }
        Returns: undefined
      }
      requesting_wallet: { Args: never; Returns: string }
      sync_merchant_cache: {
        Args: {
          p_id: number
          p_principal: string
          p_name: string
          p_description?: string | null
          p_logo_url?: string | null
          p_webhook_url?: string | null
          p_is_active?: boolean
          p_is_verified?: boolean
          p_registered_at?: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  TableName extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]),
> = (DefaultSchema["Tables"] &
  DefaultSchema["Views"])[TableName] extends { Row: infer R }
  ? R
  : never

export type TablesInsert<
  TableName extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][TableName] extends { Insert: infer I } ? I : never

export type TablesUpdate<
  TableName extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][TableName] extends { Update: infer U } ? U : never
