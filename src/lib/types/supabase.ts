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
      admins: {
        Row: {
          branch_id: string | null
          email: string
          full_name: string
          id: string
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          email: string
          full_name: string
          id: string
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          email?: string
          full_name?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admins_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      borrow_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          estimated_return_date: string
          id: string
          request_date: string | null
          requested_by: string
          status: string | null
          tool_id: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          estimated_return_date: string
          id?: string
          request_date?: string | null
          requested_by: string
          status?: string | null
          tool_id: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          estimated_return_date?: string
          id?: string
          request_date?: string | null
          requested_by?: string
          status?: string | null
          tool_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "borrow_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borrow_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borrow_requests_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          id: string
          location: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          location?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          location?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      department_offices: {
        Row: {
          branch_id: string | null
          created_at: string | null
          head_id: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          head_id?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          head_id?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_department_offices_branch"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_department_offices_head"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "office_heads"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          address: string | null
          assigned_vehicle_id: string | null
          branch_id: string | null
          date_of_birth: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          hire_date: string | null
          id: string
          license_expiry: string | null
          license_number: string | null
          license_type: string | null
          notes: string | null
          phone: string | null
          sss_number: string | null
          status: string | null
          tin: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          assigned_vehicle_id?: string | null
          branch_id?: string | null
          date_of_birth?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          hire_date?: string | null
          id: string
          license_expiry?: string | null
          license_number?: string | null
          license_type?: string | null
          notes?: string | null
          phone?: string | null
          sss_number?: string | null
          status?: string | null
          tin?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          assigned_vehicle_id?: string | null
          branch_id?: string | null
          date_of_birth?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          license_type?: string | null
          notes?: string | null
          phone?: string | null
          sss_number?: string | null
          status?: string | null
          tin?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_allocations: {
        Row: {
          approved_by_evp: string | null
          approved_by_evp_operations: string | null
          branch_id: string | null
          created_at: string | null
          date: string
          disapproved_reason: string | null
          fuel_type: string
          id: string
          km: number
          liters: number
          purpose: string
          requested_by: string
          status: string | null
          trip_ticket_id: string
          trip_to: string
          updated_at: string | null
          vehicle_id: string
        }
        Insert: {
          approved_by_evp?: string | null
          approved_by_evp_operations?: string | null
          branch_id?: string | null
          created_at?: string | null
          date: string
          disapproved_reason?: string | null
          fuel_type: string
          id?: string
          km: number
          liters: number
          purpose: string
          requested_by: string
          status?: string | null
          trip_ticket_id: string
          trip_to: string
          updated_at?: string | null
          vehicle_id: string
        }
        Update: {
          approved_by_evp?: string | null
          approved_by_evp_operations?: string | null
          branch_id?: string | null
          created_at?: string | null
          date?: string
          disapproved_reason?: string | null
          fuel_type?: string
          id?: string
          km?: number
          liters?: number
          purpose?: string
          requested_by?: string
          status?: string | null
          trip_ticket_id?: string
          trip_to?: string
          updated_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_allocations_approved_by_evp_fkey"
            columns: ["approved_by_evp"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_allocations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_allocations_trip_ticket_id_fkey"
            columns: ["trip_ticket_id"]
            isOneToOne: true
            referencedRelation: "trip_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_allocations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_area: {
        Row: {
          geofence_id: string
          geofence_name: string | null
          latitude_center: number | null
          longitude_center: number | null
          radius_meters: number | null
        }
        Insert: {
          geofence_id?: string
          geofence_name?: string | null
          latitude_center?: number | null
          longitude_center?: number | null
          radius_meters?: number | null
        }
        Update: {
          geofence_id?: string
          geofence_name?: string | null
          latitude_center?: number | null
          longitude_center?: number | null
          radius_meters?: number | null
        }
        Relationships: []
      }
      geofence_violation: {
        Row: {
          created_at: string
          event_type: string | null
          geofence_id: string | null
          gfv_latitude: number | null
          gfv_longitude: number | null
          remarks: string | null
          trip_id: string | null
          violation_id: string
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          geofence_id?: string | null
          gfv_latitude?: number | null
          gfv_longitude?: number | null
          remarks?: string | null
          trip_id?: string | null
          violation_id?: string
        }
        Update: {
          created_at?: string
          event_type?: string | null
          geofence_id?: string | null
          gfv_latitude?: number | null
          gfv_longitude?: number | null
          remarks?: string | null
          trip_id?: string | null
          violation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofence_violation_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "geofence_area"
            referencedColumns: ["geofence_id"]
          },
          {
            foreignKeyName: "geofence_violation_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_data: {
        Row: {
          created_at: string
          engine_status: string | null
          gps_id: string
          heading: number | null
          latitude: number | null
          longitude: number | null
          speed: number | null
          trip_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          engine_status?: string | null
          gps_id?: string
          heading?: number | null
          latitude?: number | null
          longitude?: number | null
          speed?: number | null
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          engine_status?: string | null
          gps_id?: string
          heading?: number | null
          latitude?: number | null
          longitude?: number | null
          speed?: number | null
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_data_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_data_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_orders: {
        Row: {
          actual_date_of_release: string | null
          approved_by: string | null
          assigned_mechanic: string | null
          created_at: string | null
          damage_info: string | null
          date_approved: string | null
          date_of_request: string | null
          id: string
          images: string[] | null
          incident_date: string
          incident_details: string | null
          job_descriptions: string[] | null
          noted_by: string | null
          remarks: string | null
          repair_done: number | null
          repair_plan: string | null
          requested_by: string | null
          status: string | null
          submitted_by: string
          target_date: string | null
          updated_at: string | null
          vehicle_id: string
        }
        Insert: {
          actual_date_of_release?: string | null
          approved_by?: string | null
          assigned_mechanic?: string | null
          created_at?: string | null
          damage_info?: string | null
          date_approved?: string | null
          date_of_request?: string | null
          id?: string
          images?: string[] | null
          incident_date: string
          incident_details?: string | null
          job_descriptions?: string[] | null
          noted_by?: string | null
          remarks?: string | null
          repair_done?: number | null
          repair_plan?: string | null
          requested_by?: string | null
          status?: string | null
          submitted_by: string
          target_date?: string | null
          updated_at?: string | null
          vehicle_id: string
        }
        Update: {
          actual_date_of_release?: string | null
          approved_by?: string | null
          assigned_mechanic?: string | null
          created_at?: string | null
          damage_info?: string | null
          date_approved?: string | null
          date_of_request?: string | null
          id?: string
          images?: string[] | null
          incident_date?: string
          incident_details?: string | null
          job_descriptions?: string[] | null
          noted_by?: string | null
          remarks?: string | null
          repair_done?: number | null
          repair_plan?: string | null
          requested_by?: string | null
          status?: string | null
          submitted_by?: string
          target_date?: string | null
          updated_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_orders_noted_by_fkey"
            columns: ["noted_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_orders_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance: {
        Row: {
          cost: number | null
          created_at: string | null
          date: string
          description: string | null
          id: string
          mileage: number | null
          next_due: string | null
          type: string
          updated_at: string | null
          vehicle_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          mileage?: number | null
          next_due?: string | null
          type: string
          updated_at?: string | null
          vehicle_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          mileage?: number | null
          next_due?: string | null
          type?: string
          updated_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_completion_logs: {
        Row: {
          completed_by: string
          completed_date: string
          completed_mileage: number
          created_at: string | null
          id: string
          notes: string | null
          vehicle_maintenance_tracking_id: string
        }
        Insert: {
          completed_by: string
          completed_date?: string
          completed_mileage: number
          created_at?: string | null
          id?: string
          notes?: string | null
          vehicle_maintenance_tracking_id: string
        }
        Update: {
          completed_by?: string
          completed_date?: string
          completed_mileage?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          vehicle_maintenance_tracking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_completion_logs_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_completion_logs_tracking_id_fkey"
            columns: ["vehicle_maintenance_tracking_id"]
            isOneToOne: false
            referencedRelation: "vehicle_maintenance_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_schedule_items: {
        Row: {
          created_at: string | null
          id: string
          interval_mileage: number | null
          interval_months: number | null
          interval_type: string
          maintenance_standard_id: string
          task_description: string | null
          task_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          interval_mileage?: number | null
          interval_months?: number | null
          interval_type: string
          maintenance_standard_id: string
          task_description?: string | null
          task_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          interval_mileage?: number | null
          interval_months?: number | null
          interval_type?: string
          maintenance_standard_id?: string
          task_description?: string | null
          task_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_schedule_items_standard_id_fkey"
            columns: ["maintenance_standard_id"]
            isOneToOne: false
            referencedRelation: "maintenance_standards"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_standards: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      office_heads: {
        Row: {
          branch_id: string | null
          created_at: string | null
          id: string
          name: string
          office_id: string | null
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          office_id?: string | null
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          office_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_office_heads_branch"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_office_heads_office"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "department_offices"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      tools: {
        Row: {
          borrowed_by: string | null
          borrowed_date: string | null
          created_at: string | null
          description: string | null
          estimated_return_date: string | null
          id: string
          image: string | null
          name: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          borrowed_by?: string | null
          borrowed_date?: string | null
          created_at?: string | null
          description?: string | null
          estimated_return_date?: string | null
          id?: string
          image?: string | null
          name: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          borrowed_by?: string | null
          borrowed_date?: string | null
          created_at?: string | null
          description?: string | null
          estimated_return_date?: string | null
          id?: string
          image?: string | null
          name?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tools_borrowed_by_fkey"
            columns: ["borrowed_by"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_tickets: {
        Row: {
          allocation_approved_by_evp_operations: string | null
          allocation_date: string | null
          allocation_fuel_type: string | null
          allocation_liters: number | null
          allocation_purpose: string | null
          allocation_trip_to: string | null
          allocation_vehicle_id: string | null
          approved_by_admin: string | null
          approved_by_evp_operation: string | null
          attachment_path: string | null
          branch_id: string
          cancellation_reason: string | null
          created_at: string | null
          date_requested: string
          destination: string
          disapproved_reason: string | null
          driver_id: string
          end_ts: string | null
          fuel_allocation_id: string | null
          id: string
          office_head_id: string | null
          office_id: string | null
          participants: string[] | null
          participants_count: number | null
          pdf_path: string | null
          post_trip_checked_at: string | null
          post_trip_checked_by: string | null
          post_trip_guard: string | null
          pre_trip_checked_at: string | null
          pre_trip_checked_by: string | null
          pre_trip_guard: string | null
          prepared_by: string
          purpose: string
          remarks: string | null
          requested_by: string | null
          start_ts: string | null
          status: string | null
          updated_at: string | null
          vehicle_id: string
        }
        Insert: {
          allocation_approved_by_evp_operations?: string | null
          allocation_date?: string | null
          allocation_fuel_type?: string | null
          allocation_liters?: number | null
          allocation_purpose?: string | null
          allocation_trip_to?: string | null
          allocation_vehicle_id?: string | null
          approved_by_admin?: string | null
          approved_by_evp_operation?: string | null
          attachment_path?: string | null
          branch_id: string
          cancellation_reason?: string | null
          created_at?: string | null
          date_requested: string
          destination: string
          disapproved_reason?: string | null
          driver_id: string
          end_ts?: string | null
          fuel_allocation_id?: string | null
          id?: string
          office_head_id?: string | null
          office_id?: string | null
          participants?: string[] | null
          participants_count?: number | null
          pdf_path?: string | null
          post_trip_checked_at?: string | null
          post_trip_checked_by?: string | null
          post_trip_guard?: string | null
          pre_trip_checked_at?: string | null
          pre_trip_checked_by?: string | null
          pre_trip_guard?: string | null
          prepared_by: string
          purpose: string
          remarks?: string | null
          requested_by?: string | null
          start_ts?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_id: string
        }
        Update: {
          allocation_approved_by_evp_operations?: string | null
          allocation_date?: string | null
          allocation_fuel_type?: string | null
          allocation_liters?: number | null
          allocation_purpose?: string | null
          allocation_trip_to?: string | null
          allocation_vehicle_id?: string | null
          approved_by_admin?: string | null
          approved_by_evp_operation?: string | null
          attachment_path?: string | null
          branch_id?: string
          cancellation_reason?: string | null
          created_at?: string | null
          date_requested?: string
          destination?: string
          disapproved_reason?: string | null
          driver_id?: string
          end_ts?: string | null
          fuel_allocation_id?: string | null
          id?: string
          office_head_id?: string | null
          office_id?: string | null
          participants?: string[] | null
          participants_count?: number | null
          pdf_path?: string | null
          post_trip_checked_at?: string | null
          post_trip_checked_by?: string | null
          post_trip_guard?: string | null
          pre_trip_checked_at?: string | null
          pre_trip_checked_by?: string | null
          pre_trip_guard?: string | null
          prepared_by?: string
          purpose?: string
          remarks?: string | null
          requested_by?: string | null
          start_ts?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_tickets_allocation_vehicle_fkey"
            columns: ["allocation_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tickets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tickets_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tickets_fuel_allocation_id_fkey"
            columns: ["fuel_allocation_id"]
            isOneToOne: false
            referencedRelation: "fuel_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tickets_office_head_id_fkey"
            columns: ["office_head_id"]
            isOneToOne: false
            referencedRelation: "office_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tickets_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          branch_id: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string | null
          avatar_url: string | null
          branch_id: string | null
          role: string
          role_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          role: string
          role_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          role?: string
          role_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance_tracking: {
        Row: {
          created_at: string | null
          id: string
          last_completed_date: string | null
          last_completed_mileage: number | null
          maintenance_schedule_item_id: string
          next_due_date: string | null
          next_due_mileage: number | null
          status: string | null
          updated_at: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_completed_date?: string | null
          last_completed_mileage?: number | null
          maintenance_schedule_item_id: string
          next_due_date?: string | null
          next_due_mileage?: number | null
          status?: string | null
          updated_at?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_completed_date?: string | null
          last_completed_mileage?: number | null
          maintenance_schedule_item_id?: string
          next_due_date?: string | null
          next_due_mileage?: number | null
          status?: string | null
          updated_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_tracking_schedule_item_id_fkey"
            columns: ["maintenance_schedule_item_id"]
            isOneToOne: false
            referencedRelation: "maintenance_schedule_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_tracking_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          branch: string
          capacity: number
          created_at: string | null
          fuel_type: string
          id: string
          images: string[] | null
          insurance_expiry: string
          license_plate: string
          maintenance_standard_id: string | null
          make: string
          mileage: number
          model: string
          registration_expiry: string
          status: string
          updated_at: string | null
          vin: string
          year: number
        }
        Insert: {
          branch: string
          capacity: number
          created_at?: string | null
          fuel_type: string
          id?: string
          images?: string[] | null
          insurance_expiry: string
          license_plate: string
          maintenance_standard_id?: string | null
          make: string
          mileage: number
          model: string
          registration_expiry: string
          status: string
          updated_at?: string | null
          vin: string
          year: number
        }
        Update: {
          branch?: string
          capacity?: number
          created_at?: string | null
          fuel_type?: string
          id?: string
          images?: string[] | null
          insurance_expiry?: string
          license_plate?: string
          maintenance_standard_id?: string | null
          make?: string
          mileage?: number
          model?: string
          registration_expiry?: string
          status?: string
          updated_at?: string | null
          vin?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_maintenance_standard_id_fkey"
            columns: ["maintenance_standard_id"]
            isOneToOne: false
            referencedRelation: "maintenance_standards"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_profiles_with_roles: {
        Row: {
          address: string | null
          avatar_url: string | null
          branch_id: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          id: string | null
          phone: string | null
          roles: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          phone?: string | null
          roles?: never
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          phone?: string | null
          roles?: never
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_profiles_with_roles_detailed: {
        Row: {
          address: string | null
          avatar_url: string | null
          branch_id: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          id: string | null
          phone: string | null
          roles_detailed: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          phone?: string | null
          roles_detailed?: never
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          phone?: string | null
          roles_detailed?: never
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_next_due_date: {
        Args: {
          p_interval_mileage: number
          p_interval_months: number
          p_interval_type: string
          p_last_completed_date: string
          p_last_completed_mileage: number
        }
        Returns: {
          next_due_date: string
          next_due_mileage: number
        }[]
      }
      get_all_user_profiles: {
        Args: never
        Returns: {
          address: string | null
          avatar_url: string | null
          branch_id: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          status: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_custom_jwt_claims: { Args: { uid: string }; Returns: Json }
      is_current_user_admin: { Args: never; Returns: boolean }
      is_user_admin: { Args: { p_user: string }; Returns: boolean }
      safe_uuid: { Args: { input: string }; Returns: string }
      user_is_admin: { Args: { p_user: string }; Returns: boolean }
      user_is_admin_text: { Args: { p_user_text: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "driver"
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
      app_role: ["admin", "driver"],
    },
  },
} as const
