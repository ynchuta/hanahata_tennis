export interface Facility {
  id: string;
  name: string;
  adultRatePerHour: number;
  childRatePerHour: number;
  lightRatePerHour: number;
  allowChildRate: boolean;
  defaultLightStartTime?: string; // デフォルトの照明利用開始時間 (例: "19:00", 空文字またはundefinedで設定なし)
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
  lightHours: number;   // 照明利用時間 (時間単位)
  lightStartTime?: string; // 照明利用開始時間 (HH:MM、空文字またはundefinedで利用なし)
  feeType: FeeType;
  courtFee: number;
  lightFee: number;
  totalFee: number;
  memo: string;         // 自由記入メモ
  settlementStatus: SettlementStatus;
  status: 'active' | 'cancelled';
  createdAt: string;    // ISO String
}

export interface MonthlyReportRow {
  reserverName: string;
  totalAmount: number;
  settlementStatus: SettlementStatus;
  reservations: Reservation[];
}
