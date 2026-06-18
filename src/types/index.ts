export interface Facility {
  id: string;
  name: string;
  adultRatePerHour: number;
  childRatePerHour: number;
  lightRatePerHour: number;
  allowChildRate: boolean;
}

export type FeeType = '大人' | '子供';
export type SettlementStatus = '未精算' | '精算済';

export interface Reservation {
  id: string;
  date: string; // YYYY-MM-DD
  facilityName: string;
  reserverName: string;
  courtStartTime: string; // HH:MM
  courtEndTime: string;   // HH:MM
  lightStartTime: string; // HH:MM (空文字可)
  lightEndTime: string;   // HH:MM (空文字可)
  feeType: FeeType;
  courtFee: number;
  lightFee: number;
  totalFee: number;
  status: SettlementStatus;
  createdAt: string; // ISO String
}

export interface MonthlyReportRow {
  reserverName: string;
  totalAmount: number;
  status: SettlementStatus;
  reservations: Reservation[];
}
