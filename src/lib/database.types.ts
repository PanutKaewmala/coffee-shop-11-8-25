export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      _backup_shopa_mismatch_ingredient_logs: {
        Row: {
          after_stock: number | null
          amount: number | null
          before_stock: number | null
          branch_id: string | null
          created_at: string | null
          id: string | null
          ingredient_id: string | null
          note: string | null
          order_id: string | null
          shop_id: string | null
          type: string | null
        }
        Insert: {
          after_stock?: number | null
          amount?: number | null
          before_stock?: number | null
          branch_id?: string | null
          created_at?: string | null
          id?: string | null
          ingredient_id?: string | null
          note?: string | null
          order_id?: string | null
          shop_id?: string | null
          type?: string | null
        }
        Update: {
          after_stock?: number | null
          amount?: number | null
          before_stock?: number | null
          branch_id?: string | null
          created_at?: string | null
          id?: string | null
          ingredient_id?: string | null
          note?: string | null
          order_id?: string | null
          shop_id?: string | null
          type?: string | null
        }
        Relationships: []
      }
      _backup_stock_logs_shopa_before_fix: {
        Row: {
          after_stock: number | null
          amount: number | null
          before_stock: number | null
          branch_id: string | null
          created_at: string | null
          id: string | null
          ingredient_id: string | null
          note: string | null
          order_id: string | null
          shop_id: string | null
          type: string | null
        }
        Insert: {
          after_stock?: number | null
          amount?: number | null
          before_stock?: number | null
          branch_id?: string | null
          created_at?: string | null
          id?: string | null
          ingredient_id?: string | null
          note?: string | null
          order_id?: string | null
          shop_id?: string | null
          type?: string | null
        }
        Update: {
          after_stock?: number | null
          amount?: number | null
          before_stock?: number | null
          branch_id?: string | null
          created_at?: string | null
          id?: string | null
          ingredient_id?: string | null
          note?: string | null
          order_id?: string | null
          shop_id?: string | null
          type?: string | null
        }
        Relationships: []
      }
      branch: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          map_url: string | null
          name: string
          opening_hours: string | null
          phone: string | null
          shop_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          map_url?: string | null
          name: string
          opening_hours?: string | null
          phone?: string | null
          shop_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          map_url?: string | null
          name?: string
          opening_hours?: string | null
          phone?: string | null
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_menu_availability: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_enabled: boolean
          menu_id: string
          shop_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          menu_id: string
          shop_id?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          menu_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_menu_availability_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_menu_availability_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_menu_availability_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      contact: {
        Row: {
          category: Database["public"]["Enums"]["contact_category"]
          created_at: string | null
          email: string | null
          id: string
          message: string | null
          name: string
          shop_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["contact_category"]
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string | null
          name: string
          shop_id?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["contact_category"]
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string | null
          name?: string
          shop_id?: string
        }
        Relationships: []
      }
      hero: {
        Row: {
          cta_link: string
          cta_text: string
          id: string
          image_url: string
          seasonal: string
          secondary_link: string
          secondary_text: string
          shop_id: string | null
          signature: string
          subtitle: string
          title: string
          updated_at: string
        }
        Insert: {
          cta_link: string
          cta_text: string
          id?: string
          image_url: string
          seasonal: string
          secondary_link: string
          secondary_text: string
          shop_id?: string | null
          signature: string
          subtitle: string
          title: string
          updated_at?: string
        }
        Update: {
          cta_link?: string
          cta_text?: string
          id?: string
          image_url?: string
          seasonal?: string
          secondary_link?: string
          secondary_text?: string
          shop_id?: string | null
          signature?: string
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingredient_expiry_settings: {
        Row: {
          after_open_days: number | null
          alert_enabled: boolean
          created_at: string
          critical_expiry_days: number
          id: string
          ingredient_id: string
          near_expiry_days: number
          sale_block_mode: string
          shelf_life_days: number | null
          shop_id: string
          tracking_mode: string
          updated_at: string
          waste_action_hint: string
        }
        Insert: {
          after_open_days?: number | null
          alert_enabled?: boolean
          created_at?: string
          critical_expiry_days?: number
          id?: string
          ingredient_id: string
          near_expiry_days?: number
          sale_block_mode?: string
          shelf_life_days?: number | null
          shop_id: string
          tracking_mode?: string
          updated_at?: string
          waste_action_hint?: string
        }
        Update: {
          after_open_days?: number | null
          alert_enabled?: boolean
          created_at?: string
          critical_expiry_days?: number
          id?: string
          ingredient_id?: string
          near_expiry_days?: number
          sale_block_mode?: string
          shelf_life_days?: number | null
          shop_id?: string
          tracking_mode?: string
          updated_at?: string
          waste_action_hint?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_expiry_settings_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_expiry_settings_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredients_alert"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_expiry_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_lots: {
        Row: {
          best_before_at: string | null
          branch_id: string
          cost_per_unit: number | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          ingredient_id: string
          invoice_ref: string | null
          lot_code: string | null
          manufactured_at: string | null
          notes: string | null
          opened_at: string | null
          qty_received: number
          qty_remaining: number
          received_at: string
          shop_id: string
          source_type: string
          status: string
          supplier_name: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          best_before_at?: string | null
          branch_id: string
          cost_per_unit?: number | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ingredient_id: string
          invoice_ref?: string | null
          lot_code?: string | null
          manufactured_at?: string | null
          notes?: string | null
          opened_at?: string | null
          qty_received: number
          qty_remaining: number
          received_at?: string
          shop_id: string
          source_type?: string
          status?: string
          supplier_name?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          best_before_at?: string | null
          branch_id?: string
          cost_per_unit?: number | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ingredient_id?: string
          invoice_ref?: string | null
          lot_code?: string | null
          manufactured_at?: string | null
          notes?: string | null
          opened_at?: string | null
          qty_received?: number
          qty_remaining?: number
          received_at?: string
          shop_id?: string
          source_type?: string
          status?: string
          supplier_name?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_lots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_lots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_shop_permissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ingredient_lots_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_lots_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredients_alert"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_lots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          archived_at: string | null
          base_unit: string
          branch_id: string | null
          category: string | null
          cost_per_unit: number | null
          created_at: string
          default_after_open_days: number | null
          default_critical_expiry_days: number
          default_near_expiry_days: number
          default_shelf_life_days: number | null
          expiry_tracking_enabled: boolean
          id: string
          is_active: boolean
          lead_time_days: number
          low_stock_days: number
          min_stock: number
          name: string
          name_key: string | null
          safety_stock_qty: number | null
          shop_id: string
          stock: number
          track_lots: boolean
          unit: string
          updated_at: string | null
          warn_stock_days: number
          waste_cost_per_unit: number | null
        }
        Insert: {
          archived_at?: string | null
          base_unit: string
          branch_id?: string | null
          category?: string | null
          cost_per_unit?: number | null
          created_at?: string
          default_after_open_days?: number | null
          default_critical_expiry_days?: number
          default_near_expiry_days?: number
          default_shelf_life_days?: number | null
          expiry_tracking_enabled?: boolean
          id?: string
          is_active?: boolean
          lead_time_days?: number
          low_stock_days?: number
          min_stock?: number
          name: string
          name_key?: string | null
          safety_stock_qty?: number | null
          shop_id?: string
          stock?: number
          track_lots?: boolean
          unit: string
          updated_at?: string | null
          warn_stock_days?: number
          waste_cost_per_unit?: number | null
        }
        Update: {
          archived_at?: string | null
          base_unit?: string
          branch_id?: string | null
          category?: string | null
          cost_per_unit?: number | null
          created_at?: string
          default_after_open_days?: number | null
          default_critical_expiry_days?: number
          default_near_expiry_days?: number
          default_shelf_life_days?: number | null
          expiry_tracking_enabled?: boolean
          id?: string
          is_active?: boolean
          lead_time_days?: number
          low_stock_days?: number
          min_stock?: number
          name?: string
          name_key?: string | null
          safety_stock_qty?: number | null
          shop_id?: string
          stock?: number
          track_lots?: boolean
          unit?: string
          updated_at?: string | null
          warn_stock_days?: number
          waste_cost_per_unit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      menu: {
        Row: {
          category_id: string
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          shop_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price: number
          shop_id?: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_category_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          shop_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          shop_id?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          shop_id?: string
        }
        Relationships: []
      }
      menu_serve_types: {
        Row: {
          created_at: string | null
          id: string
          is_system: boolean
          name: string
          shop_id: string
          system_key: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_system?: boolean
          name: string
          shop_id?: string
          system_key?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_system?: boolean
          name?: string
          shop_id?: string
          system_key?: string | null
        }
        Relationships: []
      }
      menu_serves: {
        Row: {
          created_at: string
          id: string
          menu_id: string
          serve_type_id: string
          shop_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_id: string
          serve_type_id: string
          shop_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_id?: string
          serve_type_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_serves_menu_shop_fkey"
            columns: ["menu_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "menu"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "menu_serves_serve_type_shop_fkey"
            columns: ["serve_type_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "menu_serve_types"
            referencedColumns: ["id", "shop_id"]
          },
        ]
      }
      menu_variants: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_default: boolean
          menu_id: string
          price_override: number | null
          serve_type_id: string
          shop_id: string
          size: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_default?: boolean
          menu_id: string
          price_override?: number | null
          serve_type_id: string
          shop_id?: string
          size?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_default?: boolean
          menu_id?: string
          price_override?: number | null
          serve_type_id?: string
          shop_id?: string
          size?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_variants_menu_shop_fkey"
            columns: ["menu_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "menu"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "menu_variants_serve_type_shop_fkey"
            columns: ["serve_type_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "menu_serve_types"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "menu_variants_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      news: {
        Row: {
          category: string
          content: string | null
          created_at: string
          event_date: string
          id: string
          image_url: string | null
          shop_id: string
          title: string
        }
        Insert: {
          category: string
          content?: string | null
          created_at?: string
          event_date: string
          id?: string
          image_url?: string | null
          shop_id?: string
          title: string
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string
          event_date?: string
          id?: string
          image_url?: string | null
          shop_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          menu_id: string | null
          name: string
          order_id: string | null
          price: number
          qty: number
          shop_id: string
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          menu_id?: string | null
          name: string
          order_id?: string | null
          price: number
          qty: number
          shop_id?: string
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          menu_id?: string | null
          name?: string
          order_id?: string | null
          price?: number
          qty?: number
          shop_id?: string
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "menu_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch_id: string
          cancel_note: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          change_amount: number | null
          created_at: string
          id: string
          note: string | null
          paid_amount: number | null
          paid_at: string | null
          payment_method: string
          shop_id: string
          status: string
          stock_refunded: boolean
          stock_refunded_at: string | null
          total: number
        }
        Insert: {
          branch_id?: string
          cancel_note?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          change_amount?: number | null
          created_at?: string
          id?: string
          note?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string
          shop_id?: string
          status?: string
          stock_refunded?: boolean
          stock_refunded_at?: string | null
          total: number
        }
        Update: {
          branch_id?: string
          cancel_note?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          change_amount?: number | null
          created_at?: string
          id?: string
          note?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string
          shop_id?: string
          status?: string
          stock_refunded?: boolean
          stock_refunded_at?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_idempotency: {
        Row: {
          created_at: string
          key: string
          response: Json
          shop_id: string
        }
        Insert: {
          created_at?: string
          key: string
          response: Json
          shop_id?: string
        }
        Update: {
          created_at?: string
          key?: string
          response?: Json
          shop_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          current_branch_id: string | null
          current_shop_id: string | null
          email: string | null
          id: string
          role: string
        }
        Insert: {
          current_branch_id?: string | null
          current_shop_id?: string | null
          email?: string | null
          id: string
          role: string
        }
        Update: {
          current_branch_id?: string | null
          current_shop_id?: string | null
          email?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_branch_id_fkey"
            columns: ["current_branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_current_shop_id_fkey"
            columns: ["current_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "v_user_shop_permissions"
            referencedColumns: ["user_id"]
          },
        ]
      }
      recipe_items: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          quantity: number
          shop_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          quantity: number
          shop_id?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          quantity?: number
          shop_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredients_alert"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "menu_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          id: string
          ingredient_id: string
          menu_id: string
          quantity: number
          shop_id: string
        }
        Insert: {
          id?: string
          ingredient_id: string
          menu_id: string
          quantity: number
          shop_id?: string
        }
        Update: {
          id?: string
          ingredient_id?: string
          menu_id?: string
          quantity?: number
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_recipe_ingredient"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_recipe_ingredient"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredients_alert"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_recipe_menu"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_members: {
        Row: {
          created_at: string
          role: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_shop_permissions"
            referencedColumns: ["user_id"]
          },
        ]
      }
      shops: {
        Row: {
          created_at: string
          id: string
          name: string
          receipt_footer: string | null
          slug: string
          tax_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          receipt_footer?: string | null
          slug: string
          tax_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          receipt_footer?: string | null
          slug?: string
          tax_id?: string | null
        }
        Relationships: []
      }
      stock_logs: {
        Row: {
          after_stock: number | null
          amount: number
          before_stock: number | null
          branch_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          ingredient_id: string
          ingredient_lot_id: string | null
          movement_type: string | null
          note: string | null
          opened_at: string | null
          order_id: string | null
          reference_id: string | null
          reference_type: string | null
          shop_id: string | null
          type: string | null
        }
        Insert: {
          after_stock?: number | null
          amount: number
          before_stock?: number | null
          branch_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          ingredient_id: string
          ingredient_lot_id?: string | null
          movement_type?: string | null
          note?: string | null
          opened_at?: string | null
          order_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          shop_id?: string | null
          type?: string | null
        }
        Update: {
          after_stock?: number | null
          amount?: number
          before_stock?: number | null
          branch_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          ingredient_id?: string
          ingredient_lot_id?: string | null
          movement_type?: string | null
          note?: string | null
          opened_at?: string | null
          order_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          shop_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_logs_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_logs_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredients_alert"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_logs_ingredient_lot_id_fkey"
            columns: ["ingredient_lot_id"]
            isOneToOne: false
            referencedRelation: "ingredient_lot_expiry_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_logs_ingredient_lot_id_fkey"
            columns: ["ingredient_lot_id"]
            isOneToOne: false
            referencedRelation: "ingredient_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_logs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          is_admin: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          is_admin?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          is_admin?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_shop_permissions"
            referencedColumns: ["user_id"]
          },
        ]
      }
      waste_logs: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          estimated_cost: number | null
          id: string
          ingredient_id: string
          ingredient_lot_id: string | null
          notes: string | null
          qty: number
          reason: string
          shop_id: string
          unit: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          estimated_cost?: number | null
          id?: string
          ingredient_id: string
          ingredient_lot_id?: string | null
          notes?: string | null
          qty: number
          reason: string
          shop_id: string
          unit: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          estimated_cost?: number | null
          id?: string
          ingredient_id?: string
          ingredient_lot_id?: string | null
          notes?: string | null
          qty?: number
          reason?: string
          shop_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_shop_permissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "waste_logs_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredients_alert"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_ingredient_lot_id_fkey"
            columns: ["ingredient_lot_id"]
            isOneToOne: false
            referencedRelation: "ingredient_lot_expiry_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_ingredient_lot_id_fkey"
            columns: ["ingredient_lot_id"]
            isOneToOne: false
            referencedRelation: "ingredient_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ingredient_expiry_summary: {
        Row: {
          active_lot_count: number | null
          branch_id: string | null
          ingredient_id: string | null
          ingredient_name: string | null
          nearest_days_to_expiry: number | null
          nearest_expiry_at: string | null
          risk_value: number | null
          shop_id: string | null
          summary_status: string | null
          total_qty_remaining: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_lots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_lots_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_lots_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredients_alert"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_lots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_lot_expiry_status: {
        Row: {
          after_open_days: number | null
          alert_enabled: boolean | null
          best_before_at: string | null
          branch_id: string | null
          computed_status: string | null
          cost_per_unit: number | null
          created_at: string | null
          critical_expiry_days: number | null
          days_to_expiry: number | null
          effective_expiry_at: string | null
          expires_at: string | null
          id: string | null
          ingredient_id: string | null
          ingredient_name: string | null
          lot_code: string | null
          manufactured_at: string | null
          near_expiry_days: number | null
          notes: string | null
          opened_at: string | null
          qty_received: number | null
          qty_remaining: number | null
          received_at: string | null
          sale_block_mode: string | null
          shelf_life_days: number | null
          shop_id: string | null
          source_type: string | null
          stored_status: string | null
          tracking_mode: string | null
          unit: string | null
          updated_at: string | null
          waste_action_hint: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_lots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_lots_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_lots_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredients_alert"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_lots_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ingredients_alert: {
        Row: {
          archived_at: string | null
          category: string | null
          days_left_est: number | null
          id: string | null
          is_active: boolean | null
          lead_time_days: number | null
          low_stock_days: number | null
          min_stock: number | null
          name: string | null
          safety_stock_qty: number | null
          stock: number | null
          stock_status: string | null
          unit: string | null
          used_per_day: number | null
          warn_stock_days: number | null
        }
        Relationships: []
      }
      v_user_shop_permissions: {
        Row: {
          can_manage_billing: boolean | null
          can_manage_menu: boolean | null
          can_manage_staff: boolean | null
          can_use_pos: boolean | null
          email: string | null
          role: string | null
          shop_id: string | null
          shop_name: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_stock: {
        Args: { diff: number; ing_id: string; note?: string }
        Returns: undefined
      }
      cancel_order: {
        Args: {
          p_cancelled_by?: string
          p_note?: string
          p_order_id: string
          p_reason: string
          p_restock?: boolean
        }
        Returns: Json
      }
      current_branch_id: { Args: never; Returns: string }
      current_shop_id: { Args: never; Returns: string }
      deduct_stock_atomic: {
        Args: { p_items: Json; p_note: string; p_order_id: string }
        Returns: {
          after_stock: number
          before_stock: number
          deduct: number
          ingredient_id: string
        }[]
      }
      discard_ingredient_lot: {
        Args: {
          p_lot_id: string
          p_notes?: string
          p_qty: number
          p_reason: string
        }
        Returns: undefined
      }
      ensure_default_serve_type: {
        Args: { p_shop_id: string }
        Returns: undefined
      }
      get_expiry_alert_summary: {
        Args: { p_branch_id?: string; p_shop_id: string }
        Returns: {
          critical_count: number
          expired_count: number
          near_expiry_count: number
          risk_value: number
        }[]
      }
      increment_stock: {
        Args: { diff: number; ing_id: string }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      is_owner_in_current_shop: { Args: never; Returns: boolean }
      is_shop_member: { Args: { p_shop_id: string }; Returns: boolean }
      is_shop_owner: { Args: { p_shop_id: string }; Returns: boolean }
      is_staff_in_current_shop: { Args: never; Returns: boolean }
      mark_ingredient_lot_opened: {
        Args: { p_lot_id: string }
        Returns: {
          best_before_at: string | null
          branch_id: string
          cost_per_unit: number | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          ingredient_id: string
          invoice_ref: string | null
          lot_code: string | null
          manufactured_at: string | null
          notes: string | null
          opened_at: string | null
          qty_received: number
          qty_remaining: number
          received_at: string
          shop_id: string
          source_type: string
          status: string
          supplier_name: string | null
          unit: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ingredient_lots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      process_pos_checkout: {
        Args: { p_branch_id: string; p_items: Json }
        Returns: Json
      }
      revenue_summary_range: {
        Args: { p_by?: string; p_end: string; p_start: string }
        Returns: {
          count: number
          total: number
        }[]
      }
      set_current_context: {
        Args: { p_branch_id?: string; p_shop_id: string }
        Returns: undefined
      }
      set_current_shop: { Args: { p_shop_id: string }; Returns: boolean }
    }
    Enums: {
      contact_category:
        | "praise"
        | "issue"
        | "question"
        | "other"
        | "business"
        | "complaint"
        | "feedback"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      contact_category: [
        "praise",
        "issue",
        "question",
        "other",
        "business",
        "complaint",
        "feedback",
      ],
    },
  },
} as const
