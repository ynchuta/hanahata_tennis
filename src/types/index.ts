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
  date: string;         // YYYY-MM-DD
  facilityName: string;
  reserverName: string;
  courtStartTime: string; // HH:MM
  courtEndTime: string;   // HH:MM
  lightHours: number;   // 照明利用時間 (時間単位: 0, 0.5, 1, 1.5, ...)
  feeType: FeeType;
  courtFee: number;
  lightFee: number;
  totalFee: number;
  memo: string;         // 自由記入メモ
  status: SettlementStatus;
  createdAt: string;    // ISO String
}

export interface MonthlyReportRow {
  reserverName: string;
  totalAmount: number;
  status: SettlementStatus;
  reservations: Reservation[];
}
