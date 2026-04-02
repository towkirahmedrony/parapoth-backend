export interface IMarkReadPayload {
  notification_id: string;
  is_clicked?: boolean;
}

export interface IDeviceTokenPayload {
  device_id: string;
  device_name?: string;
  os_or_browser?: string;
  fcm_token: string | null;
}
