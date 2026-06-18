import { Facility, FeeType } from '../types';

/**
 * HH:MM 形式の文字列を分単位の数値に変換する
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

/**
 * 開始時間と終了時間の差分（分）を計算する
 */
export function getDurationMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (endMin < startMin) {
    // 日をまたぐ場合は翌日の時間として計算
    return (24 * 60 - startMin) + endMin;
  }
  return endMin - startMin;
}

/**
 * コート利用料金、照明料金、合計金額を計算する
 * 10分単位で計算し、最終的な合計金額は円単位で切り上げる
 */
export function calculateFees(params: {
  facility: Facility;
  feeType: FeeType;
  courtStartTime: string;
  courtEndTime: string;
  lightStartTime: string;
  lightEndTime: string;
}) {
  const { facility, feeType, courtStartTime, courtEndTime, lightStartTime, lightEndTime } = params;

  // 子供料金適用可否の判定（博多の森などは allowChildRate が false で大人料金強制）
  const actualFeeType = facility.allowChildRate ? feeType : '大人';
  const courtRate = actualFeeType === '大人' ? facility.adultRatePerHour : facility.childRatePerHour;

  // コート利用料の計算 (10分単位、時間換算して計算)
  const courtMinutes = getDurationMinutes(courtStartTime, courtEndTime);
  const courtFeeRaw = (courtMinutes / 60) * courtRate;

  // 照明代の計算 (10分単位、時間換算して計算)
  let lightFeeRaw = 0;
  if (lightStartTime && lightEndTime) {
    const lightMinutes = getDurationMinutes(lightStartTime, lightEndTime);
    lightFeeRaw = (lightMinutes / 60) * facility.lightRatePerHour;
  }

  // 合算してから円単位に切り上げ
  const totalFee = Math.ceil(courtFeeRaw + lightFeeRaw);

  return {
    courtFee: Math.round(courtFeeRaw), // 表示用に四捨五入
    lightFee: Math.round(lightFeeRaw), // 表示用に四捨五入
    totalFee,
    appliedFeeType: actualFeeType
  };
}
