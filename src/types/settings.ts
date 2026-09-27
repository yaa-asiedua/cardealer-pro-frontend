export interface BusinessSettings {
  id: string;
  businessName: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  businessAddress: string | null;
  timeZone: string | null;
  logoUrl: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateBusinessSettingsInput {
  businessName?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  businessAddress?: string | null;
  timeZone?: string | null;
  logoUrl?: string | null;
}
