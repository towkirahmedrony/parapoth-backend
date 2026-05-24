import { Database } from '../../types/database.type';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type UserRole = Database['public']['Tables']['user_roles']['Row'];
export type RolePermission = Database['public']['Tables']['role_permissions']['Row'];
export type AdminSession = Database['public']['Tables']['admin_sessions']['Row'];
export type UserDevice = Database['public']['Tables']['user_devices']['Row'];
