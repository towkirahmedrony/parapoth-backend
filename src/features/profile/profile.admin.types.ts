export interface UpdateAdminProfileDTO {
  full_name?: string;
  username?: string;
  bio?: string;
  gender?: string;
  date_of_birth?: string;
  address?: Record<string, any>;
  language_preference?: string;
  phone_number?: string;
  avatar_url?: string;
}

export interface Toggle2FADTO {
  is_enabled: boolean;
}
