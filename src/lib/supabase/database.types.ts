export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activities: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          prospect_id: string;
          title: string | null;
          type: Database['public']['Enums']['activity_type'];
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          prospect_id: string;
          title?: string | null;
          type: Database['public']['Enums']['activity_type'];
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          prospect_id?: string;
          title?: string | null;
          type?: Database['public']['Enums']['activity_type'];
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activities_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      addon_options: {
        Row: {
          category: Database['public']['Enums']['addon_category'];
          code: string;
          created_at: string;
          description_en: string | null;
          description_fr: string | null;
          display_order: number;
          id: string;
          is_active: boolean;
          name_en: string;
          name_fr: string;
          price_eur_ht: number;
          scope: Database['public']['Enums']['addon_scope'];
          season_id: string;
          sellsy_item_id: number | null;
          sellsy_sku: string | null;
          unit: Database['public']['Enums']['attachment_unit'];
        };
        Insert: {
          category: Database['public']['Enums']['addon_category'];
          code: string;
          created_at?: string;
          description_en?: string | null;
          description_fr?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          name_en: string;
          name_fr: string;
          price_eur_ht: number;
          scope?: Database['public']['Enums']['addon_scope'];
          season_id: string;
          sellsy_item_id?: number | null;
          sellsy_sku?: string | null;
          unit?: Database['public']['Enums']['attachment_unit'];
        };
        Update: {
          category?: Database['public']['Enums']['addon_category'];
          code?: string;
          created_at?: string;
          description_en?: string | null;
          description_fr?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          name_en?: string;
          name_fr?: string;
          price_eur_ht?: number;
          scope?: Database['public']['Enums']['addon_scope'];
          season_id?: string;
          sellsy_item_id?: number | null;
          sellsy_sku?: string | null;
          unit?: Database['public']['Enums']['attachment_unit'];
        };
        Relationships: [
          {
            foreignKeyName: 'addon_options_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      affiliate_clicks: {
        Row: {
          affiliate_id: string;
          created_at: string;
          id: string;
          ip_address: unknown;
          referrer: string | null;
          resulted_in_signup_id: string | null;
          user_agent: string | null;
          utm_campaign: string | null;
          utm_medium: string | null;
          utm_source: string | null;
        };
        Insert: {
          affiliate_id: string;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          referrer?: string | null;
          resulted_in_signup_id?: string | null;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Update: {
          affiliate_id?: string;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          referrer?: string | null;
          resulted_in_signup_id?: string | null;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'affiliate_clicks_affiliate_id_fkey';
            columns: ['affiliate_id'];
            isOneToOne: false;
            referencedRelation: 'affiliates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'affiliate_clicks_resulted_in_signup_id_fkey';
            columns: ['resulted_in_signup_id'];
            isOneToOne: false;
            referencedRelation: 'public_signup_attempts';
            referencedColumns: ['id'];
          },
        ];
      };
      affiliates: {
        Row: {
          commission_percent: number;
          company_id: string | null;
          contact_email: string | null;
          contact_first_name: string | null;
          contact_last_name: string | null;
          contact_phone: string | null;
          created_at: string;
          created_by_user_id: string | null;
          display_name: string;
          display_name_normalized: string;
          id: string;
          is_active: boolean;
          notes_internal: string | null;
          token: string;
          updated_at: string;
        };
        Insert: {
          commission_percent?: number;
          company_id?: string | null;
          contact_email?: string | null;
          contact_first_name?: string | null;
          contact_last_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          display_name: string;
          display_name_normalized: string;
          id?: string;
          is_active?: boolean;
          notes_internal?: string | null;
          token: string;
          updated_at?: string;
        };
        Update: {
          commission_percent?: number;
          company_id?: string | null;
          contact_email?: string | null;
          contact_first_name?: string | null;
          contact_last_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          display_name?: string;
          display_name_normalized?: string;
          id?: string;
          is_active?: boolean;
          notes_internal?: string | null;
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'affiliates_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'affiliates_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      app_settings: {
        Row: {
          category: Database['public']['Enums']['app_setting_category'];
          description: string | null;
          key: string;
          updated_at: string;
          updated_by_user_id: string | null;
          value: Json;
        };
        Insert: {
          category?: Database['public']['Enums']['app_setting_category'];
          description?: string | null;
          key: string;
          updated_at?: string;
          updated_by_user_id?: string | null;
          value: Json;
        };
        Update: {
          category?: Database['public']['Enums']['app_setting_category'];
          description?: string | null;
          key?: string;
          updated_at?: string;
          updated_by_user_id?: string | null;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'app_settings_updated_by_user_id_fkey';
            columns: ['updated_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: Database['public']['Enums']['audit_action'];
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_address: unknown;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          action: Database['public']['Enums']['audit_action'];
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip_address?: unknown;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: Database['public']['Enums']['audit_action'];
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip_address?: unknown;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      booth_inventory: {
        Row: {
          code: string;
          created_at: string;
          event: Database['public']['Enums']['booth_event'];
          id: string;
          label: string | null;
          notes_internal: string | null;
          option_expires_at: string | null;
          pack_code: Database['public']['Enums']['pack_code'] | null;
          pole_id: string | null;
          reserved_for_company_id: string | null;
          room: string | null;
          season_id: string;
          status: Database['public']['Enums']['booth_status'];
          surface_m2: number | null;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          event: Database['public']['Enums']['booth_event'];
          id?: string;
          label?: string | null;
          notes_internal?: string | null;
          option_expires_at?: string | null;
          pack_code?: Database['public']['Enums']['pack_code'] | null;
          pole_id?: string | null;
          reserved_for_company_id?: string | null;
          room?: string | null;
          season_id: string;
          status?: Database['public']['Enums']['booth_status'];
          surface_m2?: number | null;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          event?: Database['public']['Enums']['booth_event'];
          id?: string;
          label?: string | null;
          notes_internal?: string | null;
          option_expires_at?: string | null;
          pack_code?: Database['public']['Enums']['pack_code'] | null;
          pole_id?: string | null;
          reserved_for_company_id?: string | null;
          room?: string | null;
          season_id?: string;
          status?: Database['public']['Enums']['booth_status'];
          surface_m2?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booth_inventory_pole_id_fkey';
            columns: ['pole_id'];
            isOneToOne: false;
            referencedRelation: 'poles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booth_inventory_reserved_for_company_id_fkey';
            columns: ['reserved_for_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booth_inventory_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_conversations: {
        Row: {
          archived: boolean;
          estimated_cost_eur: number;
          id: string;
          last_message_at: string;
          message_count: number;
          started_at: string;
          title: string | null;
          total_tokens_used: number;
          user_id: string;
          user_type: Database['public']['Enums']['chat_user_type'];
        };
        Insert: {
          archived?: boolean;
          estimated_cost_eur?: number;
          id?: string;
          last_message_at?: string;
          message_count?: number;
          started_at?: string;
          title?: string | null;
          total_tokens_used?: number;
          user_id: string;
          user_type: Database['public']['Enums']['chat_user_type'];
        };
        Update: {
          archived?: boolean;
          estimated_cost_eur?: number;
          id?: string;
          last_message_at?: string;
          message_count?: number;
          started_at?: string;
          title?: string | null;
          total_tokens_used?: number;
          user_id?: string;
          user_type?: Database['public']['Enums']['chat_user_type'];
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          content: Json;
          conversation_id: string;
          created_at: string;
          id: string;
          model_used: string | null;
          role: Database['public']['Enums']['chat_role'];
          tokens_input: number;
          tokens_output: number;
        };
        Insert: {
          content: Json;
          conversation_id: string;
          created_at?: string;
          id?: string;
          model_used?: string | null;
          role: Database['public']['Enums']['chat_role'];
          tokens_input?: number;
          tokens_output?: number;
        };
        Update: {
          content?: Json;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          model_used?: string | null;
          role?: Database['public']['Enums']['chat_role'];
          tokens_input?: number;
          tokens_output?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'chat_conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      companies: {
        Row: {
          alternate_domains: string[];
          brevo_company_id: string | null;
          category: Database['public']['Enums']['category_tarif'];
          connectonair_id: string | null;
          country: string | null;
          created_at: string;
          description: string | null;
          id: string;
          last_synced_brevo_at: string | null;
          last_synced_sellsy_at: string | null;
          name: string;
          name_normalized: string;
          notes: string | null;
          pole_classified_at: string | null;
          pole_classified_by: Database['public']['Enums']['classification_source'] | null;
          pole_confidence: number | null;
          pole_id: string | null;
          preferred_room: string | null;
          primary_domain: string | null;
          sellsy_id: string | null;
          updated_at: string;
          vat_country: string | null;
          vat_number: string | null;
          vat_verified: Database['public']['Enums']['vat_status'];
          vat_verified_at: string | null;
          was_prs_2026_exhibitor: boolean;
          website: string | null;
        };
        Insert: {
          alternate_domains?: string[];
          brevo_company_id?: string | null;
          category?: Database['public']['Enums']['category_tarif'];
          connectonair_id?: string | null;
          country?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          name: string;
          name_normalized: string;
          notes?: string | null;
          pole_classified_at?: string | null;
          pole_classified_by?: Database['public']['Enums']['classification_source'] | null;
          pole_confidence?: number | null;
          pole_id?: string | null;
          preferred_room?: string | null;
          primary_domain?: string | null;
          sellsy_id?: string | null;
          updated_at?: string;
          vat_country?: string | null;
          vat_number?: string | null;
          vat_verified?: Database['public']['Enums']['vat_status'];
          vat_verified_at?: string | null;
          was_prs_2026_exhibitor?: boolean;
          website?: string | null;
        };
        Update: {
          alternate_domains?: string[];
          brevo_company_id?: string | null;
          category?: Database['public']['Enums']['category_tarif'];
          connectonair_id?: string | null;
          country?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          name?: string;
          name_normalized?: string;
          notes?: string | null;
          pole_classified_at?: string | null;
          pole_classified_by?: Database['public']['Enums']['classification_source'] | null;
          pole_confidence?: number | null;
          pole_id?: string | null;
          preferred_room?: string | null;
          primary_domain?: string | null;
          sellsy_id?: string | null;
          updated_at?: string;
          vat_country?: string | null;
          vat_number?: string | null;
          vat_verified?: Database['public']['Enums']['vat_status'];
          vat_verified_at?: string | null;
          was_prs_2026_exhibitor?: boolean;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'companies_pole_id_fkey';
            columns: ['pole_id'];
            isOneToOne: false;
            referencedRelation: 'poles';
            referencedColumns: ['id'];
          },
        ];
      };
      company_profiles: {
        Row: {
          attachments: Json;
          company_id: string;
          completion_status: Database['public']['Enums']['lifecycle_completion_status'];
          description_en: string | null;
          description_fr: string | null;
          id: string;
          keywords: string[];
          last_updated_by: Database['public']['Enums']['last_updated_by'] | null;
          linkedin_url: string | null;
          logo_url: string | null;
          public_contacts: Json;
          social_networks: Json;
          tagline_en: string | null;
          tagline_fr: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          attachments?: Json;
          company_id: string;
          completion_status?: Database['public']['Enums']['lifecycle_completion_status'];
          description_en?: string | null;
          description_fr?: string | null;
          id?: string;
          keywords?: string[];
          last_updated_by?: Database['public']['Enums']['last_updated_by'] | null;
          linkedin_url?: string | null;
          logo_url?: string | null;
          public_contacts?: Json;
          social_networks?: Json;
          tagline_en?: string | null;
          tagline_fr?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          attachments?: Json;
          company_id?: string;
          completion_status?: Database['public']['Enums']['lifecycle_completion_status'];
          description_en?: string | null;
          description_fr?: string | null;
          id?: string;
          keywords?: string[];
          last_updated_by?: Database['public']['Enums']['last_updated_by'] | null;
          linkedin_url?: string | null;
          logo_url?: string | null;
          public_contacts?: Json;
          social_networks?: Json;
          tagline_en?: string | null;
          tagline_fr?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'company_profiles_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: true;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      contacts: {
        Row: {
          brevo_contact_id: string | null;
          company_id: string;
          created_at: string;
          email: string;
          email_deliverability_checked_at: string | null;
          email_deliverability_status: Database['public']['Enums']['email_deliverability_status'];
          email_verified: boolean;
          email_verified_at: string | null;
          first_name: string | null;
          id: string;
          is_primary: boolean;
          language: Database['public']['Enums']['language_code'];
          last_name: string | null;
          last_synced_brevo_at: string | null;
          last_synced_sellsy_at: string | null;
          lifecycle_emails_enabled: boolean;
          marketing_consent: boolean;
          phone: string | null;
          role: string | null;
          sellsy_contact_id: string | null;
        };
        Insert: {
          brevo_contact_id?: string | null;
          company_id: string;
          created_at?: string;
          email: string;
          email_deliverability_checked_at?: string | null;
          email_deliverability_status?: Database['public']['Enums']['email_deliverability_status'];
          email_verified?: boolean;
          email_verified_at?: string | null;
          first_name?: string | null;
          id?: string;
          is_primary?: boolean;
          language?: Database['public']['Enums']['language_code'];
          last_name?: string | null;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          lifecycle_emails_enabled?: boolean;
          marketing_consent?: boolean;
          phone?: string | null;
          role?: string | null;
          sellsy_contact_id?: string | null;
        };
        Update: {
          brevo_contact_id?: string | null;
          company_id?: string;
          created_at?: string;
          email?: string;
          email_deliverability_checked_at?: string | null;
          email_deliverability_status?: Database['public']['Enums']['email_deliverability_status'];
          email_verified?: boolean;
          email_verified_at?: string | null;
          first_name?: string | null;
          id?: string;
          is_primary?: boolean;
          language?: Database['public']['Enums']['language_code'];
          last_name?: string | null;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          lifecycle_emails_enabled?: boolean;
          marketing_consent?: boolean;
          phone?: string | null;
          role?: string | null;
          sellsy_contact_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contacts_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      email_campaigns: {
        Row: {
          attachments_urls: string[];
          body_en: string | null;
          body_fr: string | null;
          bounce_count: number;
          brevo_campaign_id: string | null;
          click_count: number;
          created_at: string;
          created_by_user_id: string;
          id: string;
          name: string;
          open_count: number;
          recipient_count: number;
          scheduled_at: string | null;
          sent_at: string | null;
          status: Database['public']['Enums']['campaign_status'];
          subject_en: string | null;
          subject_fr: string | null;
          target_filter: Json;
          unsubscribe_count: number;
        };
        Insert: {
          attachments_urls?: string[];
          body_en?: string | null;
          body_fr?: string | null;
          bounce_count?: number;
          brevo_campaign_id?: string | null;
          click_count?: number;
          created_at?: string;
          created_by_user_id: string;
          id?: string;
          name: string;
          open_count?: number;
          recipient_count?: number;
          scheduled_at?: string | null;
          sent_at?: string | null;
          status?: Database['public']['Enums']['campaign_status'];
          subject_en?: string | null;
          subject_fr?: string | null;
          target_filter?: Json;
          unsubscribe_count?: number;
        };
        Update: {
          attachments_urls?: string[];
          body_en?: string | null;
          body_fr?: string | null;
          bounce_count?: number;
          brevo_campaign_id?: string | null;
          click_count?: number;
          created_at?: string;
          created_by_user_id?: string;
          id?: string;
          name?: string;
          open_count?: number;
          recipient_count?: number;
          scheduled_at?: string | null;
          sent_at?: string | null;
          status?: Database['public']['Enums']['campaign_status'];
          subject_en?: string | null;
          subject_fr?: string | null;
          target_filter?: Json;
          unsubscribe_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'email_campaigns_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      exhibitor_resources: {
        Row: {
          body_en: string | null;
          body_fr: string | null;
          display_order: number;
          id: string;
          is_published: boolean;
          slug: string;
          title_en: string;
          title_fr: string;
          updated_at: string;
          updated_by_user_id: string | null;
        };
        Insert: {
          body_en?: string | null;
          body_fr?: string | null;
          display_order?: number;
          id?: string;
          is_published?: boolean;
          slug: string;
          title_en: string;
          title_fr: string;
          updated_at?: string;
          updated_by_user_id?: string | null;
        };
        Update: {
          body_en?: string | null;
          body_fr?: string | null;
          display_order?: number;
          id?: string;
          is_published?: boolean;
          slug?: string;
          title_en?: string;
          title_fr?: string;
          updated_at?: string;
          updated_by_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'exhibitor_resources_updated_by_user_id_fkey';
            columns: ['updated_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      exhibitor_sessions: {
        Row: {
          contact_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          ip_address: unknown;
          sent_at: string;
          sent_to_email: string;
          token: string;
          used_at: string | null;
          user_agent: string | null;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          ip_address?: unknown;
          sent_at?: string;
          sent_to_email: string;
          token?: string;
          used_at?: string | null;
          user_agent?: string | null;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          ip_address?: unknown;
          sent_at?: string;
          sent_to_email?: string;
          token?: string;
          used_at?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'exhibitor_sessions_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      mcp_tokens: {
        Row: {
          call_count: number;
          created_at: string;
          expires_at: string | null;
          id: string;
          last_used_at: string | null;
          last_used_ip: unknown;
          name: string;
          prefix: string;
          revoked_at: string | null;
          scopes: string[];
          token_hash: string;
          user_id: string;
        };
        Insert: {
          call_count?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          last_used_ip?: unknown;
          name: string;
          prefix: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash: string;
          user_id: string;
        };
        Update: {
          call_count?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          last_used_ip?: unknown;
          name?: string;
          prefix?: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mcp_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      poles: {
        Row: {
          code: Database['public']['Enums']['pole_code'];
          color_hex: string;
          description_en: string | null;
          description_fr: string | null;
          display_order: number;
          emoji: string | null;
          id: string;
          is_active: boolean;
          name_en: string;
          name_fr: string;
          rooms: string[];
          short_name_en: string;
          short_name_fr: string;
        };
        Insert: {
          code: Database['public']['Enums']['pole_code'];
          color_hex: string;
          description_en?: string | null;
          description_fr?: string | null;
          display_order?: number;
          emoji?: string | null;
          id?: string;
          is_active?: boolean;
          name_en: string;
          name_fr: string;
          rooms?: string[];
          short_name_en: string;
          short_name_fr: string;
        };
        Update: {
          code?: Database['public']['Enums']['pole_code'];
          color_hex?: string;
          description_en?: string | null;
          description_fr?: string | null;
          display_order?: number;
          emoji?: string | null;
          id?: string;
          is_active?: boolean;
          name_en?: string;
          name_fr?: string;
          rooms?: string[];
          short_name_en?: string;
          short_name_fr?: string;
        };
        Relationships: [];
      };
      pricing_tiers: {
        Row: {
          category: Database['public']['Enums']['category_tarif'];
          created_at: string;
          description_full_en: string | null;
          description_full_fr: string | null;
          description_short_en: string | null;
          description_short_fr: string | null;
          id: string;
          is_active: boolean;
          marseille_supplement_eur_ht: number | null;
          pack_code: Database['public']['Enums']['pack_code'];
          pole_restrictions: string[] | null;
          price_eur_ht: number;
          season_id: string;
          sellsy_item_id: number | null;
          sellsy_sku: string | null;
        };
        Insert: {
          category: Database['public']['Enums']['category_tarif'];
          created_at?: string;
          description_full_en?: string | null;
          description_full_fr?: string | null;
          description_short_en?: string | null;
          description_short_fr?: string | null;
          id?: string;
          is_active?: boolean;
          marseille_supplement_eur_ht?: number | null;
          pack_code: Database['public']['Enums']['pack_code'];
          pole_restrictions?: string[] | null;
          price_eur_ht: number;
          season_id: string;
          sellsy_item_id?: number | null;
          sellsy_sku?: string | null;
        };
        Update: {
          category?: Database['public']['Enums']['category_tarif'];
          created_at?: string;
          description_full_en?: string | null;
          description_full_fr?: string | null;
          description_short_en?: string | null;
          description_short_fr?: string | null;
          id?: string;
          is_active?: boolean;
          marseille_supplement_eur_ht?: number | null;
          pack_code?: Database['public']['Enums']['pack_code'];
          pole_restrictions?: string[] | null;
          price_eur_ht?: number;
          season_id?: string;
          sellsy_item_id?: number | null;
          sellsy_sku?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pricing_tiers_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      prospects: {
        Row: {
          acompte_amount_eur: number | null;
          acompte_paid_at: string | null;
          acompte_status: Database['public']['Enums']['acompte_status'];
          affiliate_id: string | null;
          commission_eur_ht: number | null;
          commission_paid_at: string | null;
          commission_status: Database['public']['Enums']['commission_status'];
          company_id: string;
          created_at: string;
          deposit_percentage_at_creation: number | null;
          estimated_amount: number | null;
          events_interest: string[];
          expected_close_date: string | null;
          id: string;
          is_test: boolean;
          last_activity_at: string;
          last_sync_error_at: string | null;
          last_sync_error_message: string | null;
          last_sync_error_provider: string | null;
          last_synced_brevo_at: string | null;
          last_synced_sellsy_at: string | null;
          last_synced_stripe_at: string | null;
          notes: string | null;
          owner_id: string | null;
          pack_code: Database['public']['Enums']['pack_code'];
          payment_path: Database['public']['Enums']['payment_path'] | null;
          primary_contact_id: string | null;
          probability: number | null;
          recap_pdf_generated_at: string | null;
          recap_pdf_url: string | null;
          season_id: string;
          selected_addon_ids: string[];
          selected_booth_id: string | null;
          sellsy_devis_id: string | null;
          sellsy_invoice_id: string | null;
          sellsy_opportunity_id: string | null;
          sellsy_proforma_id: string | null;
          source: Database['public']['Enums']['prospect_source'];
          source_detail: string | null;
          status: Database['public']['Enums']['prospect_status'];
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          updated_at: string;
          vat_rate_at_creation: number | null;
        };
        Insert: {
          acompte_amount_eur?: number | null;
          acompte_paid_at?: string | null;
          acompte_status?: Database['public']['Enums']['acompte_status'];
          affiliate_id?: string | null;
          commission_eur_ht?: number | null;
          commission_paid_at?: string | null;
          commission_status?: Database['public']['Enums']['commission_status'];
          company_id: string;
          created_at?: string;
          deposit_percentage_at_creation?: number | null;
          estimated_amount?: number | null;
          events_interest?: string[];
          expected_close_date?: string | null;
          id?: string;
          is_test?: boolean;
          last_activity_at?: string;
          last_sync_error_at?: string | null;
          last_sync_error_message?: string | null;
          last_sync_error_provider?: string | null;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          last_synced_stripe_at?: string | null;
          notes?: string | null;
          owner_id?: string | null;
          pack_code?: Database['public']['Enums']['pack_code'];
          payment_path?: Database['public']['Enums']['payment_path'] | null;
          primary_contact_id?: string | null;
          probability?: number | null;
          recap_pdf_generated_at?: string | null;
          recap_pdf_url?: string | null;
          season_id: string;
          selected_addon_ids?: string[];
          selected_booth_id?: string | null;
          sellsy_devis_id?: string | null;
          sellsy_invoice_id?: string | null;
          sellsy_opportunity_id?: string | null;
          sellsy_proforma_id?: string | null;
          source?: Database['public']['Enums']['prospect_source'];
          source_detail?: string | null;
          status?: Database['public']['Enums']['prospect_status'];
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
          vat_rate_at_creation?: number | null;
        };
        Update: {
          acompte_amount_eur?: number | null;
          acompte_paid_at?: string | null;
          acompte_status?: Database['public']['Enums']['acompte_status'];
          affiliate_id?: string | null;
          commission_eur_ht?: number | null;
          commission_paid_at?: string | null;
          commission_status?: Database['public']['Enums']['commission_status'];
          company_id?: string;
          created_at?: string;
          deposit_percentage_at_creation?: number | null;
          estimated_amount?: number | null;
          events_interest?: string[];
          expected_close_date?: string | null;
          id?: string;
          is_test?: boolean;
          last_activity_at?: string;
          last_sync_error_at?: string | null;
          last_sync_error_message?: string | null;
          last_sync_error_provider?: string | null;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          last_synced_stripe_at?: string | null;
          notes?: string | null;
          owner_id?: string | null;
          pack_code?: Database['public']['Enums']['pack_code'];
          payment_path?: Database['public']['Enums']['payment_path'] | null;
          primary_contact_id?: string | null;
          probability?: number | null;
          recap_pdf_generated_at?: string | null;
          recap_pdf_url?: string | null;
          season_id?: string;
          selected_addon_ids?: string[];
          selected_booth_id?: string | null;
          sellsy_devis_id?: string | null;
          sellsy_invoice_id?: string | null;
          sellsy_opportunity_id?: string | null;
          sellsy_proforma_id?: string | null;
          source?: Database['public']['Enums']['prospect_source'];
          source_detail?: string | null;
          status?: Database['public']['Enums']['prospect_status'];
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
          vat_rate_at_creation?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prospects_affiliate_fk';
            columns: ['affiliate_id'];
            isOneToOne: false;
            referencedRelation: 'affiliates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_primary_contact_id_fkey';
            columns: ['primary_contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_selected_booth_id_fkey';
            columns: ['selected_booth_id'];
            isOneToOne: false;
            referencedRelation: 'booth_inventory';
            referencedColumns: ['id'];
          },
        ];
      };
      prs_2026_exhibitors: {
        Row: {
          company_name: string;
          company_name_normalized: string;
          id: string;
          imported_at: string;
          matched_company_id: string | null;
          season_id: string;
          source: Database['public']['Enums']['prs_exhibitor_source'];
        };
        Insert: {
          company_name: string;
          company_name_normalized: string;
          id?: string;
          imported_at?: string;
          matched_company_id?: string | null;
          season_id: string;
          source?: Database['public']['Enums']['prs_exhibitor_source'];
        };
        Update: {
          company_name?: string;
          company_name_normalized?: string;
          id?: string;
          imported_at?: string;
          matched_company_id?: string | null;
          season_id?: string;
          source?: Database['public']['Enums']['prs_exhibitor_source'];
        };
        Relationships: [
          {
            foreignKeyName: 'prs_2026_exhibitors_matched_company_id_fkey';
            columns: ['matched_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prs_2026_exhibitors_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      public_signup_attempts: {
        Row: {
          affiliate_id: string | null;
          affiliate_input_raw: string | null;
          ai_classification: Json | null;
          category: string | null;
          cgv_accepted_at: string | null;
          cgv_version: number | null;
          company_name_input: string | null;
          contact_first_name: string | null;
          contact_last_name: string | null;
          contact_phone: string | null;
          contact_role: string | null;
          converted_to_prospect_id: string | null;
          created_at: string;
          derived_category: Database['public']['Enums']['category_tarif'];
          doi_token: string | null;
          doi_token_expires_at: string | null;
          email: string;
          email_domain: string | null;
          email_validation_status: Database['public']['Enums']['email_validation_status'];
          id: string;
          ip_address: unknown;
          is_new_company: boolean;
          language: Database['public']['Enums']['language_code'];
          marketing_consent: boolean;
          matched_company_id: string | null;
          neverbounce_result: string | null;
          referrer: string | null;
          short_token: string | null;
          short_token_expires_at: string | null;
          status: Database['public']['Enums']['signup_status'];
          step2_payload: Json | null;
          step2_submitted_at: string | null;
          user_agent: string | null;
          utm_campaign: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          verification_sent_at: string | null;
          verification_token: string;
          verified_at: string | null;
        };
        Insert: {
          affiliate_id?: string | null;
          affiliate_input_raw?: string | null;
          ai_classification?: Json | null;
          category?: string | null;
          cgv_accepted_at?: string | null;
          cgv_version?: number | null;
          company_name_input?: string | null;
          contact_first_name?: string | null;
          contact_last_name?: string | null;
          contact_phone?: string | null;
          contact_role?: string | null;
          converted_to_prospect_id?: string | null;
          created_at?: string;
          derived_category?: Database['public']['Enums']['category_tarif'];
          doi_token?: string | null;
          doi_token_expires_at?: string | null;
          email: string;
          email_domain?: string | null;
          email_validation_status: Database['public']['Enums']['email_validation_status'];
          id?: string;
          ip_address?: unknown;
          is_new_company?: boolean;
          language?: Database['public']['Enums']['language_code'];
          marketing_consent?: boolean;
          matched_company_id?: string | null;
          neverbounce_result?: string | null;
          referrer?: string | null;
          short_token?: string | null;
          short_token_expires_at?: string | null;
          status?: Database['public']['Enums']['signup_status'];
          step2_payload?: Json | null;
          step2_submitted_at?: string | null;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          verification_sent_at?: string | null;
          verification_token?: string;
          verified_at?: string | null;
        };
        Update: {
          affiliate_id?: string | null;
          affiliate_input_raw?: string | null;
          ai_classification?: Json | null;
          category?: string | null;
          cgv_accepted_at?: string | null;
          cgv_version?: number | null;
          company_name_input?: string | null;
          contact_first_name?: string | null;
          contact_last_name?: string | null;
          contact_phone?: string | null;
          contact_role?: string | null;
          converted_to_prospect_id?: string | null;
          created_at?: string;
          derived_category?: Database['public']['Enums']['category_tarif'];
          doi_token?: string | null;
          doi_token_expires_at?: string | null;
          email?: string;
          email_domain?: string | null;
          email_validation_status?: Database['public']['Enums']['email_validation_status'];
          id?: string;
          ip_address?: unknown;
          is_new_company?: boolean;
          language?: Database['public']['Enums']['language_code'];
          marketing_consent?: boolean;
          matched_company_id?: string | null;
          neverbounce_result?: string | null;
          referrer?: string | null;
          short_token?: string | null;
          short_token_expires_at?: string | null;
          status?: Database['public']['Enums']['signup_status'];
          step2_payload?: Json | null;
          step2_submitted_at?: string | null;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          verification_sent_at?: string | null;
          verification_token?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'public_signup_attempts_converted_to_prospect_id_fkey';
            columns: ['converted_to_prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_signup_attempts_matched_company_id_fkey';
            columns: ['matched_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signup_attempts_affiliate_fk';
            columns: ['affiliate_id'];
            isOneToOne: false;
            referencedRelation: 'affiliates';
            referencedColumns: ['id'];
          },
        ];
      };
      reminders: {
        Row: {
          body: string | null;
          company_id: string | null;
          completed_at: string | null;
          created_at: string;
          due_at: string;
          id: string;
          prospect_id: string | null;
          reminded_at: string | null;
          source: Database['public']['Enums']['reminder_source'];
          title: string;
          type: Database['public']['Enums']['reminder_type'];
          user_id: string;
        };
        Insert: {
          body?: string | null;
          company_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          due_at: string;
          id?: string;
          prospect_id?: string | null;
          reminded_at?: string | null;
          source?: Database['public']['Enums']['reminder_source'];
          title: string;
          type?: Database['public']['Enums']['reminder_type'];
          user_id: string;
        };
        Update: {
          body?: string | null;
          company_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          due_at?: string;
          id?: string;
          prospect_id?: string | null;
          reminded_at?: string | null;
          source?: Database['public']['Enums']['reminder_source'];
          title?: string;
          type?: Database['public']['Enums']['reminder_type'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reminders_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reminders_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reminders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      seasons: {
        Row: {
          code: string;
          created_at: string;
          end_date: string | null;
          id: string;
          is_active: boolean;
          name_en: string;
          name_fr: string;
          start_date: string | null;
          status: Database['public']['Enums']['season_status'];
        };
        Insert: {
          code: string;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_active?: boolean;
          name_en: string;
          name_fr: string;
          start_date?: string | null;
          status?: Database['public']['Enums']['season_status'];
        };
        Update: {
          code?: string;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_active?: boolean;
          name_en?: string;
          name_fr?: string;
          start_date?: string | null;
          status?: Database['public']['Enums']['season_status'];
        };
        Relationships: [];
      };
      sellsy_events_processed: {
        Row: {
          event_id: string;
          event_type: string;
          payload: Json | null;
          processed_at: string;
          prospect_id: string | null;
        };
        Insert: {
          event_id: string;
          event_type: string;
          payload?: Json | null;
          processed_at?: string;
          prospect_id?: string | null;
        };
        Update: {
          event_id?: string;
          event_type?: string;
          payload?: Json | null;
          processed_at?: string;
          prospect_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sellsy_events_processed_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      sellsy_products_mirror: {
        Row: {
          internal_ref: string | null;
          is_active: boolean;
          last_synced_at: string;
          name_en: string | null;
          name_fr: string | null;
          sellsy_product_id: string;
          sku: string | null;
          unit_price_eur_ht: number | null;
          vat_rate_percent: number | null;
        };
        Insert: {
          internal_ref?: string | null;
          is_active?: boolean;
          last_synced_at?: string;
          name_en?: string | null;
          name_fr?: string | null;
          sellsy_product_id: string;
          sku?: string | null;
          unit_price_eur_ht?: number | null;
          vat_rate_percent?: number | null;
        };
        Update: {
          internal_ref?: string | null;
          is_active?: boolean;
          last_synced_at?: string;
          name_en?: string | null;
          name_fr?: string | null;
          sellsy_product_id?: string;
          sku?: string | null;
          unit_price_eur_ht?: number | null;
          vat_rate_percent?: number | null;
        };
        Relationships: [];
      };
      stripe_events_processed: {
        Row: {
          event_id: string;
          event_type: string;
          payload: Json | null;
          processed_at: string;
          prospect_id: string | null;
        };
        Insert: {
          event_id: string;
          event_type: string;
          payload?: Json | null;
          processed_at?: string;
          prospect_id?: string | null;
        };
        Update: {
          event_id?: string;
          event_type?: string;
          payload?: Json | null;
          processed_at?: string;
          prospect_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stripe_events_processed_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      sync_logs: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          error_message: string | null;
          id: string;
          operation: Database['public']['Enums']['sync_op'];
          payload: Json | null;
          status: Database['public']['Enums']['sync_status'];
          target: Database['public']['Enums']['sync_target'];
        };
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: string;
          error_message?: string | null;
          id?: string;
          operation: Database['public']['Enums']['sync_op'];
          payload?: Json | null;
          status: Database['public']['Enums']['sync_status'];
          target: Database['public']['Enums']['sync_target'];
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          error_message?: string | null;
          id?: string;
          operation?: Database['public']['Enums']['sync_op'];
          payload?: Json | null;
          status?: Database['public']['Enums']['sync_status'];
          target?: Database['public']['Enums']['sync_target'];
        };
        Relationships: [];
      };
      users: {
        Row: {
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          role: Database['public']['Enums']['user_role'];
          totp_enabled: boolean;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          role?: Database['public']['Enums']['user_role'];
          totp_enabled?: boolean;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          role?: Database['public']['Enums']['user_role'];
          totp_enabled?: boolean;
        };
        Relationships: [];
      };
      vat_verifications: {
        Row: {
          country: string;
          is_valid: boolean;
          request_date: string;
          trader_address: string | null;
          trader_name: string | null;
          vat_number: string;
        };
        Insert: {
          country: string;
          is_valid: boolean;
          request_date?: string;
          trader_address?: string | null;
          trader_name?: string | null;
          vat_number: string;
        };
        Update: {
          country?: string;
          is_valid?: boolean;
          request_date?: string;
          trader_address?: string | null;
          trader_name?: string | null;
          vat_number?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: { Args: never; Returns: boolean };
      is_admin_or_sales: { Args: never; Returns: boolean };
    };
    Enums: {
      acompte_status: 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded';
      activity_type:
        | 'note'
        | 'email_sent'
        | 'email_received'
        | 'call'
        | 'meeting'
        | 'devis_sent'
        | 'devis_signed'
        | 'web_signup_attempt'
        | 'web_signup_verified'
        | 'company_classified'
        | 'category_assigned'
        | 'sync_sellsy'
        | 'sync_brevo'
        | 'sync_connectonair'
        | 'booth_reserved'
        | 'booth_released'
        | 'lifecycle_email_sent';
      addon_category:
        | 'logistique'
        | 'audiovisuel'
        | 'connectivite'
        | 'espaces'
        | 'visibilite'
        | 'communication'
        | 'goodies';
      addon_scope: 'prs_only' | 'mds_only' | 'both';
      app_setting_category: 'finance' | 'rgpd' | 'integrations' | 'general' | 'email';
      attachment_unit: 'unit' | 'per_brand' | 'per_1000';
      audit_action:
        | 'create'
        | 'update'
        | 'delete'
        | 'login'
        | 'rgpd_rtbf'
        | 'rgpd_export'
        | 'sync_manual';
      booth_event: 'paris' | 'marseille' | 'bruxelles';
      booth_status: 'available' | 'option' | 'reserved' | 'signed';
      campaign_status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'archived' | 'cancelled';
      category_tarif: 'prs_exhibitor' | 'standard' | 'non_eligible';
      chat_role: 'user' | 'assistant' | 'tool_use' | 'tool_result';
      chat_user_type: 'admin' | 'sales' | 'partner';
      classification_source: 'ai' | 'manual';
      commission_status: 'not_applicable' | 'due' | 'paid';
      email_deliverability_status: 'unchecked' | 'valid' | 'invalid' | 'unknown' | 'accept_all';
      email_validation_status: 'valid' | 'free_provider' | 'disposable' | 'domain_mismatch';
      language_code: 'FR' | 'EN';
      last_updated_by: 'exhibitor' | 'admin';
      lifecycle_completion_status: 'empty' | 'in_progress' | 'profil_complet';
      pack_code: 'ACCESS' | 'CLASSIC' | 'PREMIUM' | 'A_DEFINIR';
      payment_path:
        | 'devis_sepa'
        | 'devis_acompte_stripe'
        | 'proforma_acompte'
        | 'facture_integrale';
      pole_code:
        | 'REGIES_RETAIL_MEDIA'
        | 'AUDIO_RADIO'
        | 'DIFFUSION_INFRA'
        | 'VIDEO_CTV'
        | 'OUTDOOR_DOOH'
        | 'DATA_ADTECH'
        | 'INCONNU';
      prospect_source: 'inscription_web' | 'direct' | 'salon' | 'reference' | 'campagne';
      prospect_status: 'lead' | 'contact' | 'devis_envoye' | 'acompte_paye' | 'signe' | 'perdu';
      prs_exhibitor_source: 'xlsx_seed' | 'manual_admin' | 'sellsy_export';
      reminder_source: 'manual' | 'ai_assistant';
      reminder_type:
        | 'call_back'
        | 'send_email'
        | 'follow_up'
        | 'check_payment'
        | 'meeting'
        | 'other';
      season_status: 'planning' | 'active' | 'archived';
      signup_status:
        | 'awaiting_verification'
        | 'verified'
        | 'expired'
        | 'rejected'
        | 'converted'
        | 'step2_started'
        | 'step2_completed';
      sync_op: 'create' | 'update' | 'pull' | 'check';
      sync_status: 'success' | 'pending' | 'error';
      sync_target: 'sellsy' | 'brevo' | 'connectonair';
      user_role: 'admin' | 'sales';
      vat_status: 'unverified' | 'pending' | 'valid' | 'invalid';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      acompte_status: ['not_required', 'pending', 'paid', 'failed', 'refunded'],
      activity_type: [
        'note',
        'email_sent',
        'email_received',
        'call',
        'meeting',
        'devis_sent',
        'devis_signed',
        'web_signup_attempt',
        'web_signup_verified',
        'company_classified',
        'category_assigned',
        'sync_sellsy',
        'sync_brevo',
        'sync_connectonair',
        'booth_reserved',
        'booth_released',
        'lifecycle_email_sent',
      ],
      addon_category: [
        'logistique',
        'audiovisuel',
        'connectivite',
        'espaces',
        'visibilite',
        'communication',
        'goodies',
      ],
      addon_scope: ['prs_only', 'mds_only', 'both'],
      app_setting_category: ['finance', 'rgpd', 'integrations', 'general', 'email'],
      attachment_unit: ['unit', 'per_brand', 'per_1000'],
      audit_action: [
        'create',
        'update',
        'delete',
        'login',
        'rgpd_rtbf',
        'rgpd_export',
        'sync_manual',
      ],
      booth_event: ['paris', 'marseille', 'bruxelles'],
      booth_status: ['available', 'option', 'reserved', 'signed'],
      campaign_status: ['draft', 'scheduled', 'sending', 'sent', 'archived', 'cancelled'],
      category_tarif: ['prs_exhibitor', 'standard', 'non_eligible'],
      chat_role: ['user', 'assistant', 'tool_use', 'tool_result'],
      chat_user_type: ['admin', 'sales', 'partner'],
      classification_source: ['ai', 'manual'],
      commission_status: ['not_applicable', 'due', 'paid'],
      email_deliverability_status: ['unchecked', 'valid', 'invalid', 'unknown', 'accept_all'],
      email_validation_status: ['valid', 'free_provider', 'disposable', 'domain_mismatch'],
      language_code: ['FR', 'EN'],
      last_updated_by: ['exhibitor', 'admin'],
      lifecycle_completion_status: ['empty', 'in_progress', 'profil_complet'],
      pack_code: ['ACCESS', 'CLASSIC', 'PREMIUM', 'A_DEFINIR'],
      payment_path: ['devis_sepa', 'devis_acompte_stripe', 'proforma_acompte', 'facture_integrale'],
      pole_code: [
        'REGIES_RETAIL_MEDIA',
        'AUDIO_RADIO',
        'DIFFUSION_INFRA',
        'VIDEO_CTV',
        'OUTDOOR_DOOH',
        'DATA_ADTECH',
        'INCONNU',
      ],
      prospect_source: ['inscription_web', 'direct', 'salon', 'reference', 'campagne'],
      prospect_status: ['lead', 'contact', 'devis_envoye', 'acompte_paye', 'signe', 'perdu'],
      prs_exhibitor_source: ['xlsx_seed', 'manual_admin', 'sellsy_export'],
      reminder_source: ['manual', 'ai_assistant'],
      reminder_type: ['call_back', 'send_email', 'follow_up', 'check_payment', 'meeting', 'other'],
      season_status: ['planning', 'active', 'archived'],
      signup_status: [
        'awaiting_verification',
        'verified',
        'expired',
        'rejected',
        'converted',
        'step2_started',
        'step2_completed',
      ],
      sync_op: ['create', 'update', 'pull', 'check'],
      sync_status: ['success', 'pending', 'error'],
      sync_target: ['sellsy', 'brevo', 'connectonair'],
      user_role: ['admin', 'sales'],
      vat_status: ['unverified', 'pending', 'valid', 'invalid'],
    },
  },
} as const;
