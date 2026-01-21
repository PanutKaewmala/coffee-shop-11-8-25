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
        }
        Relationships: []
      }
      contact: {
        Row: {
          category: Database["public"]["Enums"]["contact_category"]
          created_at: string | null
          email: string | null
          id: string
          message: string | null
          name: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["contact_category"]
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string | null
          name: string
        }
        Update: {
          category?: Database["public"]["Enums"]["contact_category"]
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string | null
          name?: string
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
          signature?: string
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          archived_at: string | null
          base_unit: string
          category: string | null
          cost_per_unit: number | null
          id: string
          is_active: boolean
          lead_time_days: number
          low_stock_days: number
          min_stock: number
          name: string
          name_key: string | null
          safety_stock_qty: number | null
          stock: number
          unit: string
          updated_at: string | null
          warn_stock_days: number
        }
        Insert: {
          archived_at?: string | null
          base_unit: string
          category?: string | null
          cost_per_unit?: number | null
          id?: string
          is_active?: boolean
          lead_time_days?: number
          low_stock_days?: number
          min_stock?: number
          name: string
          name_key?: string | null
          safety_stock_qty?: number | null
          stock?: number
          unit: string
          updated_at?: string | null
          warn_stock_days?: number
        }
        Update: {
          archived_at?: string | null
          base_unit?: string
          category?: string | null
          cost_per_unit?: number | null
          id?: string
          is_active?: boolean
          lead_time_days?: number
          low_stock_days?: number
          min_stock?: number
          name?: string
          name_key?: string | null
          safety_stock_qty?: number | null
          stock?: number
          unit?: string
          updated_at?: string | null
          warn_stock_days?: number
        }
        Relationships: []
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
        }
        Insert: {
          category_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price: number
        }
        Update: {
          category_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_category_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      menu_serve_types: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      menu_serves: {
        Row: {
          created_at: string
          id: string
          menu_id: string
          serve_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_id: string
          serve_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_id?: string
          serve_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_serves_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_serves_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_pos_menu"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "menu_serves_serve_type_id_fkey"
            columns: ["serve_type_id"]
            isOneToOne: false
            referencedRelation: "menu_serve_types"
            referencedColumns: ["id"]
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
          size?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_variants_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_variants_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_pos_menu"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "menu_variants_serve_type_id_fkey"
            columns: ["serve_type_id"]
            isOneToOne: false
            referencedRelation: "menu_serve_types"
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
          title: string
        }
        Insert: {
          category: string
          content?: string | null
          created_at?: string
          event_date: string
          id?: string
          image_url?: string | null
          title: string
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string
          event_date?: string
          id?: string
          image_url?: string | null
          title?: string
        }
        Relationships: []
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
          cancel_note: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          note: string | null
          paid_at: string | null
          payment_method: string
          status: string
          stock_refunded: boolean
          stock_refunded_at: string | null
          total: number
        }
        Insert: {
          cancel_note?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string | null
          payment_method?: string
          status?: string
          stock_refunded?: boolean
          stock_refunded_at?: string | null
          total: number
        }
        Update: {
          cancel_note?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string | null
          payment_method?: string
          status?: string
          stock_refunded?: boolean
          stock_refunded_at?: string | null
          total?: number
        }
        Relationships: []
      }
      pos_idempotency: {
        Row: {
          created_at: string
          key: string
          response: Json
        }
        Insert: {
          created_at?: string
          key: string
          response: Json
        }
        Update: {
          created_at?: string
          key?: string
          response?: Json
        }
        Relationships: []
      }
      recipe_items: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          quantity: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          quantity: number
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          quantity?: number
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
        }
        Insert: {
          id?: string
          ingredient_id: string
          menu_id: string
          quantity: number
        }
        Update: {
          id?: string
          ingredient_id?: string
          menu_id?: string
          quantity?: number
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
            foreignKeyName: "fk_recipe_menu"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_pos_menu"
            referencedColumns: ["menu_id"]
          },
        ]
      }
      stock_logs: {
        Row: {
          after_stock: number | null
          amount: number
          before_stock: number | null
          created_at: string | null
          id: string
          ingredient_id: string
          note: string | null
          order_id: string | null
          type: string | null
        }
        Insert: {
          after_stock?: number | null
          amount: number
          before_stock?: number | null
          created_at?: string | null
          id?: string
          ingredient_id: string
          note?: string | null
          order_id?: string | null
          type?: string | null
        }
        Update: {
          after_stock?: number | null
          amount?: number
          before_stock?: number | null
          created_at?: string | null
          id?: string
          ingredient_id?: string
          note?: string | null
          order_id?: string | null
          type?: string | null
        }
        Relationships: [
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
            foreignKeyName: "stock_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
        Relationships: []
      }
    }
    Views: {
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
      v_pos_menu: {
        Row: {
          menu_id: string | null
          name: string | null
          price: number | null
          serves: Json | null
        }
        Relationships: []
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
      deduct_stock_atomic: {
        Args: { p_items: Json; p_note: string; p_order_id: string }
        Returns: {
          after_stock: number
          before_stock: number
          deduct: number
          ingredient_id: string
        }[]
      }
      increment_stock: {
        Args: { diff: number; ing_id: string }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
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

