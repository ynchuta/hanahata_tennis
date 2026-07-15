import { google } from 'googleapis';
import { Facility, Reservation, SettlementStatus } from '../types';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { calculateFees } from './calculator';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY
  ?.replace(/^"|"$/g, '') // ダブルクォーテーションで囲まれている場合のトリム
  ?.replace(/\\n/g, '\n');

// 実行時に動的にモックモード判定を行う
export function getUseMock(): boolean {
  return (
    process.env.USE_MOCK === 'true' ||
    !SPREADSHEET_ID ||
    !GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !GOOGLE_PRIVATE_KEY
  );
}

// 後方互換性のための定数（実行時に getUseMock() を呼ぶ）
export const USE_MOCK = getUseMock();

const mockFacilitiesPath = path.join(process.cwd(), 'mock-data', 'facilities.json');
const mockRecordsPath = path.join(process.cwd(), 'mock-data', 'records.json');
const mockReserversPath = path.join(process.cwd(), 'mock-data', 'reservers.json');

export interface Reserver {
  id: string;
  name: string;
  createdAt: string;
}

// 短縮キー形式のインターフェース定義（モック用）
interface KVFacility {
  id: string;
  n: string;   // name
  a: number;   // adultRatePerHour
  c: number;   // childRatePerHour
  l: number;   // lightRatePerHour
  ac: boolean; // allowChildRate
  lst?: string; // defaultLightStartTime (HH:MM)
}

interface KVReserver {
  id: string;
  n: string;   // name
  ca: string;  // createdAt
}

interface KVReservation {
  id: string;
  d: string;   // date (YYYY-MM-DD)
  fid: string; // facilityId
  rn: string;  // reserverName
  st: string;  // courtStartTime (HH:MM)
  et: string;  // courtEndTime (HH:MM)
  lh: number;  // lightHours
  ft: '大人' | '子供'; // feeType
  m: string;   // memo
  s: '未精算' | '精算済'; // settlementStatus
  cs?: 'active' | 'cancelled'; // cancelStatus (未設定時は active)
  ca: string;  // createdAt
  lst?: string; // lightStartTime (HH:MM)
}

// モックデータ読み書きヘルパー
function readMockData<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    let data = fs.readFileSync(filePath, 'utf-8');
    if (data.startsWith('\uFEFF')) {
      data = data.slice(1);
    }
    return JSON.parse(data) as T[];
  } catch (error) {
    console.error(`Error reading mock data from ${filePath}:`, error);
    return [];
  }
}

function writeMockData<T>(filePath: string, data: T[]): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error writing mock data to ${filePath}:`, error);
  }
}

// Google Sheets クライアントの取得
let _sheetsClient: any = null;
function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;
  const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

// シートIDの取得
async function getSheetIdByName(sheets: any, sheetName: string): Promise<number | null> {
  try {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const sheet = spreadsheet.data.sheets?.find(
      (s: any) => s.properties?.title === sheetName
    );
    return sheet?.properties?.sheetId ?? null;
  } catch (error) {
    console.error(`Error getting sheetId for ${sheetName}:`, error);
    return null;
  }
}

/* =========================================================================
   施設マスタ (Facilities)
   ========================================================================= */

export async function getFacilities(): Promise<Facility[]> {
  if (getUseMock()) {
    const list = readMockData<KVFacility>(mockFacilitiesPath);
    return list.map((f) => ({
      id: f.id,
      name: f.n,
      adultRatePerHour: f.a,
      childRatePerHour: f.c,
      lightRatePerHour: f.l,
      allowChildRate: f.ac,
      defaultLightStartTime: f.lst,
    }));
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'facilities!A2:G',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    return rows.map((row: any) => ({
      id: row[0],
      name: row[1],
      adultRatePerHour: Number(row[2]) || 0,
      childRatePerHour: Number(row[3]) || 0,
      lightRatePerHour: Number(row[4]) || 0,
      allowChildRate: row[5] === 'TRUE',
      defaultLightStartTime: row[6] || undefined,
    }));
  } catch (error) {
    console.error('Google Sheets API Error (getFacilities), falling back to mock:', error);
    const list = readMockData<KVFacility>(mockFacilitiesPath);
    return list.map((f) => ({
      id: f.id,
      name: f.n,
      adultRatePerHour: f.a,
      childRatePerHour: f.c,
      lightRatePerHour: f.l,
      allowChildRate: f.ac,
      defaultLightStartTime: f.lst,
    }));
  }
}

export async function addFacility(facility: Omit<Facility, 'id'>): Promise<Facility> {
  const newFacility: Facility = {
    id: crypto.randomUUID(),
    ...facility,
  };

  if (getUseMock()) {
    const list = readMockData<KVFacility>(mockFacilitiesPath);
    list.push({
      id: newFacility.id,
      n: newFacility.name,
      a: newFacility.adultRatePerHour,
      c: newFacility.childRatePerHour,
      l: newFacility.lightRatePerHour,
      ac: newFacility.allowChildRate,
      lst: newFacility.defaultLightStartTime,
    });
    writeMockData(mockFacilitiesPath, list);
    return newFacility;
  }

  try {
    const sheets = getSheetsClient();
    const values = [[
      newFacility.id,
      newFacility.name,
      newFacility.adultRatePerHour,
      newFacility.childRatePerHour,
      newFacility.lightRatePerHour,
      newFacility.allowChildRate ? 'TRUE' : 'FALSE',
      newFacility.defaultLightStartTime || '',
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'facilities!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    return newFacility;
  } catch (error) {
    console.error('Google Sheets API Error (addFacility), falling back to mock:', error);
    const list = readMockData<KVFacility>(mockFacilitiesPath);
    list.push({
      id: newFacility.id,
      n: newFacility.name,
      a: newFacility.adultRatePerHour,
      c: newFacility.childRatePerHour,
      l: newFacility.lightRatePerHour,
      ac: newFacility.allowChildRate,
      lst: newFacility.defaultLightStartTime,
    });
    writeMockData(mockFacilitiesPath, list);
    return newFacility;
  }
}

export async function updateFacility(id: string, facility: Partial<Omit<Facility, 'id'>>): Promise<Facility | null> {
  if (getUseMock()) {
    const list = readMockData<KVFacility>(mockFacilitiesPath);
    const index = list.findIndex((f) => f.id === id);
    if (index === -1) return null;
    const current = list[index];
    list[index] = {
      id: current.id,
      n: facility.name !== undefined ? facility.name : current.n,
      a: facility.adultRatePerHour !== undefined ? facility.adultRatePerHour : current.a,
      c: facility.childRatePerHour !== undefined ? facility.childRatePerHour : current.c,
      l: facility.lightRatePerHour !== undefined ? facility.lightRatePerHour : current.l,
      ac: facility.allowChildRate !== undefined ? facility.allowChildRate : current.ac,
      lst: facility.defaultLightStartTime !== undefined ? facility.defaultLightStartTime : current.lst,
    };
    writeMockData(mockFacilitiesPath, list);
    return {
      id: list[index].id,
      name: list[index].n,
      adultRatePerHour: list[index].a,
      childRatePerHour: list[index].c,
      lightRatePerHour: list[index].l,
      allowChildRate: list[index].ac,
      defaultLightStartTime: list[index].lst,
    };
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'facilities!A:A',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return null;

    const rowIndex = rows.findIndex((row: any) => row[0] === id) + 1;
    if (rowIndex === 0) return null;

    const currentFacilities = await getFacilities();
    const current = currentFacilities.find((f) => f.id === id);
    if (!current) return null;

    const updated = {
      id,
      name: facility.name !== undefined ? facility.name : current.name,
      adultRatePerHour: facility.adultRatePerHour !== undefined ? facility.adultRatePerHour : current.adultRatePerHour,
      childRatePerHour: facility.childRatePerHour !== undefined ? facility.childRatePerHour : current.childRatePerHour,
      lightRatePerHour: facility.lightRatePerHour !== undefined ? facility.lightRatePerHour : current.lightRatePerHour,
      allowChildRate: facility.allowChildRate !== undefined ? facility.allowChildRate : current.allowChildRate,
      defaultLightStartTime: facility.defaultLightStartTime !== undefined ? facility.defaultLightStartTime : current.defaultLightStartTime,
    };

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `facilities!A${rowIndex}:G${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          updated.id,
          updated.name,
          updated.adultRatePerHour,
          updated.childRatePerHour,
          updated.lightRatePerHour,
          updated.allowChildRate ? 'TRUE' : 'FALSE',
          updated.defaultLightStartTime || '',
        ]],
      },
    });

    return updated;
  } catch (error) {
    console.error('Google Sheets API Error (updateFacility), falling back to mock:', error);
    return null;
  }
}

export async function deleteFacility(id: string): Promise<boolean> {
  if (getUseMock()) {
    const list = readMockData<KVFacility>(mockFacilitiesPath);
    const filtered = list.filter((f) => f.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockFacilitiesPath, filtered);
    return true;
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'facilities!A:A',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return false;

    const rowIndex = rows.findIndex((row: any) => row[0] === id) + 1;
    if (rowIndex === 0) return false;

    const sheetId = await getSheetIdByName(sheets, 'facilities');
    if (sheetId === null) return false;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    });

    return true;
  } catch (error) {
    console.error('Google Sheets API Error (deleteFacility), falling back to mock:', error);
    const list = readMockData<KVFacility>(mockFacilitiesPath);
    const filtered = list.filter((f) => f.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockFacilitiesPath, filtered);
    return true;
  }
}

/* =========================================================================
   保護者マスタ (Reservers)
   ========================================================================= */

export async function getReservers(): Promise<Reserver[]> {
  if (getUseMock()) {
    const list = readMockData<KVReserver>(mockReserversPath);
    return list.map((r) => ({
      id: r.id,
      name: r.n,
      createdAt: r.ca,
    }));
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'reservers!A2:C',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    return rows.map((row: any) => ({
      id: row[0],
      name: row[1],
      createdAt: row[2],
    }));
  } catch (error) {
    console.error('Google Sheets API Error (getReservers), falling back to mock:', error);
    const list = readMockData<KVReserver>(mockReserversPath);
    return list.map((r) => ({
      id: r.id,
      name: r.n,
      createdAt: r.ca,
    }));
  }
}

export async function addReserver(name: string): Promise<Reserver> {
  const newReserver: Reserver = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  };

  if (getUseMock()) {
    const list = readMockData<KVReserver>(mockReserversPath);
    list.push({
      id: newReserver.id,
      n: newReserver.name,
      ca: newReserver.createdAt,
    });
    writeMockData(mockReserversPath, list);
    return newReserver;
  }

  try {
    const sheets = getSheetsClient();
    const values = [[
      newReserver.id,
      newReserver.name,
      newReserver.createdAt,
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'reservers!A:C',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    return newReserver;
  } catch (error) {
    console.error('Google Sheets API Error (addReserver), falling back to mock:', error);
    const list = readMockData<KVReserver>(mockReserversPath);
    list.push({
      id: newReserver.id,
      n: newReserver.name,
      ca: newReserver.createdAt,
    });
    writeMockData(mockReserversPath, list);
    return newReserver;
  }
}

export async function deleteReserver(id: string): Promise<boolean> {
  if (getUseMock()) {
    const list = readMockData<KVReserver>(mockReserversPath);
    const filtered = list.filter((r) => r.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockReserversPath, filtered);
    return true;
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'reservers!A:A',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return false;

    const rowIndex = rows.findIndex((row: any) => row[0] === id) + 1;
    if (rowIndex === 0) return false;

    const sheetId = await getSheetIdByName(sheets, 'reservers');
    if (sheetId === null) return false;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    });

    return true;
  } catch (error) {
    console.error('Google Sheets API Error (deleteReserver), falling back to mock:', error);
    const list = readMockData<KVReserver>(mockReserversPath);
    const filtered = list.filter((r) => r.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockReserversPath, filtered);
    return true;
  }
}

/* =========================================================================
   予約記録 (Reservations)
   ========================================================================= */

export async function getReservations(): Promise<Reservation[]> {
  const facilities = await getFacilities();
  const facMap = new Map<string, Facility>();
  for (const f of facilities) {
    facMap.set(f.id, f);
  }

  let list: KVReservation[] = [];

  if (getUseMock()) {
    list = readMockData<KVReservation>(mockRecordsPath);
  } else {
    try {
      const sheets = getSheetsClient();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'records!A2:O',
      });

      const rows = response.data.values;
      if (rows && rows.length > 0) {
        list = rows.map((row: any) => ({
          id: row[0],
          d: row[1],
          fid: row[2],
          rn: row[3],
          st: row[4],
          et: row[5],
          lst: row[6] || undefined,
          lh: Number(row[7]) || 0,
          ft: row[8] as any,
          s: row[12] as any,
          ca: row[13],
          cs: (row[14] as any) || 'active',
          m: row[15] || '', // スプレッドシート側のメモ列（P列など）から読み込み。A-Oなので15番目はP
        }));
      }
    } catch (error) {
      console.error('Google Sheets API Error (getReservations), falling back to mock:', error);
      list = readMockData<KVReservation>(mockRecordsPath);
    }
  }

  return list.map((r) => {
    const facility = facMap.get(r.fid) || {
      id: r.fid,
      name: '不明な施設',
      adultRatePerHour: 0,
      childRatePerHour: 0,
      lightRatePerHour: 0,
      allowChildRate: false,
    };

    const { courtFee, lightFee, totalFee } = calculateFees({
      facility,
      feeType: r.ft,
      courtStartTime: r.st,
      courtEndTime: r.et,
      lightHours: r.lh,
    });

    return {
      id: r.id,
      date: r.d,
      facilityName: facility.name,
      reserverName: r.rn,
      courtStartTime: r.st,
      courtEndTime: r.et,
      lightHours: r.lh,
      lightStartTime: r.lst,
      feeType: r.ft,
      courtFee,
      lightFee,
      totalFee,
      memo: r.m || '',
      settlementStatus: r.s,
      status: r.cs || 'active',
      createdAt: r.ca,
    };
  });
}

export async function addReservation(
  reservation: Omit<Reservation, 'id' | 'createdAt' | 'courtFee' | 'lightFee' | 'totalFee' | 'facilityName'> & {
    facilityId: string;
  }
): Promise<Reservation> {
  const newId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const kvRec: KVReservation = {
    id: newId,
    d: reservation.date,
    fid: reservation.facilityId,
    rn: reservation.reserverName,
    st: reservation.courtStartTime,
    et: reservation.courtEndTime,
    lh: reservation.lightHours,
    ft: reservation.feeType,
    m: reservation.memo,
    s: reservation.settlementStatus,
    cs: reservation.status || 'active',
    ca: createdAt,
    lst: reservation.lightStartTime,
  };

  const facilities = await getFacilities();
  const facility = facilities.find((f) => f.id === reservation.facilityId) || {
    id: reservation.facilityId,
    name: '不明な施設',
    adultRatePerHour: 0,
    childRatePerHour: 0,
    lightRatePerHour: 0,
    allowChildRate: false,
  };

  const { courtFee, lightFee, totalFee } = calculateFees({
    facility,
    feeType: reservation.feeType,
    courtStartTime: reservation.courtStartTime,
    courtEndTime: reservation.courtEndTime,
    lightHours: reservation.lightHours,
  });

  if (getUseMock()) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    list.push(kvRec);
    writeMockData(mockRecordsPath, list);
  } else {
    try {
      const sheets = getSheetsClient();
      const values = [[
        kvRec.id,
        kvRec.d,
        kvRec.fid,
        kvRec.rn,
        kvRec.st,
        kvRec.et,
        kvRec.lst || '',
        kvRec.lh,
        kvRec.ft,
        courtFee,
        lightFee,
        totalFee,
        kvRec.s,
        kvRec.ca,
        kvRec.cs || 'active',
        kvRec.m || '',
      ]];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'records!A:P',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    } catch (error) {
      console.error('Google Sheets API Error (addReservation), falling back to mock:', error);
      const list = readMockData<KVReservation>(mockRecordsPath);
      list.push(kvRec);
      writeMockData(mockRecordsPath, list);
    }
  }

  return {
    id: newId,
    date: reservation.date,
    facilityName: facility.name,
    reserverName: reservation.reserverName,
    courtStartTime: reservation.courtStartTime,
    courtEndTime: reservation.courtEndTime,
    lightHours: reservation.lightHours,
    lightStartTime: reservation.lightStartTime,
    feeType: reservation.feeType,
    courtFee,
    lightFee,
    totalFee,
    memo: reservation.memo,
    settlementStatus: reservation.settlementStatus,
    status: reservation.status || 'active',
    createdAt,
  };
}

export async function updateReservationSettlementStatus(id: string, settlementStatus: SettlementStatus): Promise<Reservation | null> {
  let kvRec: KVReservation | null = null;

  if (getUseMock()) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    const index = list.findIndex((r) => r.id === id);
    if (index !== -1) {
      list[index].s = settlementStatus;
      writeMockData(mockRecordsPath, list);
      kvRec = list[index];
    }
  } else {
    try {
      const sheets = getSheetsClient();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'records!A:A',
      });

      const rows = response.data.values;
      if (rows && rows.length > 0) {
        const rowIndex = rows.findIndex((row: any) => row[0] === id) + 1;
        if (rowIndex > 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `records!M${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [[settlementStatus]],
            },
          });

          // 更新後のデータをフェッチして返す
          const updatedRows = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `records!A${rowIndex}:P${rowIndex}`,
          });
          const row = updatedRows.data.values?.[0];
          if (row) {
            kvRec = {
              id: row[0],
              d: row[1],
              fid: row[2],
              rn: row[3],
              st: row[4],
              et: row[5],
              lst: row[6] || undefined,
              lh: Number(row[7]) || 0,
              ft: row[8] as any,
              s: row[12] as any,
              ca: row[13],
              cs: (row[14] as any) || 'active',
              m: row[15] || '',
            };
          }
        }
      }
    } catch (error) {
      console.error('Google Sheets API Error (updateReservationSettlementStatus), falling back to mock:', error);
      const list = readMockData<KVReservation>(mockRecordsPath);
      const index = list.findIndex((r) => r.id === id);
      if (index !== -1) {
        list[index].s = settlementStatus;
        writeMockData(mockRecordsPath, list);
        kvRec = list[index];
      }
    }
  }

  if (!kvRec) return null;

  const facilities = await getFacilities();
  const facility = facilities.find((f) => f.id === kvRec!.fid) || {
    id: kvRec!.fid,
    name: '不明な施設',
    adultRatePerHour: 0,
    childRatePerHour: 0,
    lightRatePerHour: 0,
    allowChildRate: false,
  };

  const { courtFee, lightFee, totalFee } = calculateFees({
    facility,
    feeType: kvRec.ft,
    courtStartTime: kvRec.st,
    courtEndTime: kvRec.et,
    lightHours: kvRec.lh,
  });

  return {
    id: kvRec.id,
    date: kvRec.d,
    facilityName: facility.name,
    reserverName: kvRec.rn,
    courtStartTime: kvRec.st,
    courtEndTime: kvRec.et,
    lightHours: kvRec.lh,
    lightStartTime: kvRec.lst,
    feeType: kvRec.ft,
    courtFee,
    lightFee,
    totalFee,
    memo: kvRec.m || '',
    settlementStatus: kvRec.s,
    status: kvRec.cs || 'active',
    createdAt: kvRec.ca,
  };
}

export async function updateReservationCancelStatus(id: string, status: 'active' | 'cancelled'): Promise<Reservation | null> {
  let kvRec: KVReservation | null = null;

  if (getUseMock()) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    const index = list.findIndex((r) => r.id === id);
    if (index !== -1) {
      list[index].cs = status;
      writeMockData(mockRecordsPath, list);
      kvRec = list[index];
    }
  } else {
    try {
      const sheets = getSheetsClient();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'records!A:A',
      });

      const rows = response.data.values;
      if (rows && rows.length > 0) {
        const rowIndex = rows.findIndex((row: any) => row[0] === id) + 1;
        if (rowIndex > 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `records!O${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [[status]],
            },
          });

          // 更新後のデータをフェッチして返す
          const updatedRows = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `records!A${rowIndex}:P${rowIndex}`,
          });
          const row = updatedRows.data.values?.[0];
          if (row) {
            kvRec = {
              id: row[0],
              d: row[1],
              fid: row[2],
              rn: row[3],
              st: row[4],
              et: row[5],
              lst: row[6] || undefined,
              lh: Number(row[7]) || 0,
              ft: row[8] as any,
              s: row[12] as any,
              ca: row[13],
              cs: (row[14] as any) || 'active',
              m: row[15] || '',
            };
          }
        }
      }
    } catch (error) {
      console.error('Google Sheets API Error (updateReservationCancelStatus), falling back to mock:', error);
      const list = readMockData<KVReservation>(mockRecordsPath);
      const index = list.findIndex((r) => r.id === id);
      if (index !== -1) {
        list[index].cs = status;
        writeMockData(mockRecordsPath, list);
        kvRec = list[index];
      }
    }
  }

  if (!kvRec) return null;

  const facilities = await getFacilities();
  const facility = facilities.find((f) => f.id === kvRec!.fid) || {
    id: kvRec!.fid,
    name: '不明な施設',
    adultRatePerHour: 0,
    childRatePerHour: 0,
    lightRatePerHour: 0,
    allowChildRate: false,
  };

  const { courtFee, lightFee, totalFee } = calculateFees({
    facility,
    feeType: kvRec.ft,
    courtStartTime: kvRec.st,
    courtEndTime: kvRec.et,
    lightHours: kvRec.lh,
  });

  return {
    id: kvRec.id,
    date: kvRec.d,
    facilityName: facility.name,
    reserverName: kvRec.rn,
    courtStartTime: kvRec.st,
    courtEndTime: kvRec.et,
    lightHours: kvRec.lh,
    lightStartTime: kvRec.lst,
    feeType: kvRec.ft,
    courtFee,
    lightFee,
    totalFee,
    memo: kvRec.m || '',
    settlementStatus: kvRec.s,
    status: kvRec.cs || 'active',
    createdAt: kvRec.ca,
  };
}

export async function deleteReservation(id: string): Promise<boolean> {
  if (getUseMock()) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    const filtered = list.filter((r) => r.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockRecordsPath, filtered);
    return true;
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'records!A:A',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return false;

    const rowIndex = rows.findIndex((row: any) => row[0] === id) + 1;
    if (rowIndex === 0) return false;

    const sheetId = await getSheetIdByName(sheets, 'records');
    if (sheetId === null) return false;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    });

    return true;
  } catch (error) {
    console.error('Google Sheets API Error (deleteReservation), falling back to mock:', error);
    const list = readMockData<KVReservation>(mockRecordsPath);
    const filtered = list.filter((r) => r.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockRecordsPath, filtered);
    return true;
  }
}

export async function testKVConnection(): Promise<string | null> {
  if (getUseMock()) return 'MOCK_MODE';
  try {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'facilities!A1:A1',
    });
    return null; // null = 成功
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function updateReservation(
  id: string,
  data: {
    date: string;
    facilityId: string;
    reserverName: string;
    courtStartTime: string;
    courtEndTime: string;
    lightHours: number;
    lightStartTime?: string;
    feeType: '大人' | '子供';
    memo: string;
    settlementStatus: SettlementStatus;
    status: 'active' | 'cancelled';
  }
): Promise<Reservation | null> {
  let kvRec: KVReservation | null = null;

  const facilities = await getFacilities();
  const facility = facilities.find((f) => f.id === data.facilityId) || {
    id: data.facilityId,
    name: '不明な施設',
    adultRatePerHour: 0,
    childRatePerHour: 0,
    lightRatePerHour: 0,
    allowChildRate: false,
  };

  const { courtFee, lightFee, totalFee } = calculateFees({
    facility,
    feeType: data.feeType,
    courtStartTime: data.courtStartTime,
    courtEndTime: data.courtEndTime,
    lightHours: data.lightHours,
  });

  if (getUseMock()) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    const index = list.findIndex((r) => r.id === id);
    if (index !== -1) {
      list[index] = {
        ...list[index],
        d: data.date,
        fid: data.facilityId,
        rn: data.reserverName,
        st: data.courtStartTime,
        et: data.courtEndTime,
        lh: data.lightHours,
        ft: data.feeType,
        m: data.memo,
        s: data.settlementStatus,
        cs: data.status,
        lst: data.lightStartTime,
      };
      writeMockData(mockRecordsPath, list);
      kvRec = list[index];
    }
  } else {
    try {
      const sheets = getSheetsClient();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'records!A:A',
      });

      const rows = response.data.values;
      if (rows && rows.length > 0) {
        const rowIndex = rows.findIndex((row: any) => row[0] === id) + 1;
        if (rowIndex > 0) {
          const updatedRow = [
            id,
            data.date,
            data.facilityId,
            data.reserverName,
            data.courtStartTime,
            data.courtEndTime,
            data.lightStartTime || '',
            data.lightHours,
            data.feeType,
            courtFee,
            lightFee,
            totalFee,
            data.settlementStatus,
            new Date().toISOString(),
            data.status,
            data.memo,
          ];

          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `records!A${rowIndex}:P${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [updatedRow],
            },
          });

          kvRec = {
            id,
            d: data.date,
            fid: data.facilityId,
            rn: data.reserverName,
            st: data.courtStartTime,
            et: data.courtEndTime,
            lst: data.lightStartTime,
            lh: data.lightHours,
            ft: data.feeType,
            m: data.memo,
            s: data.settlementStatus,
            ca: updatedRow[13] as string,
            cs: data.status,
          };
        }
      }
    } catch (error) {
      console.error('Google Sheets API Error (updateReservation), falling back to mock:', error);
    }
  }

  if (!kvRec) return null;

  return {
    id: kvRec.id,
    date: kvRec.d,
    facilityName: facility.name,
    reserverName: kvRec.rn,
    courtStartTime: kvRec.st,
    courtEndTime: kvRec.et,
    lightHours: kvRec.lh,
    lightStartTime: kvRec.lst,
    feeType: kvRec.ft,
    courtFee,
    lightFee,
    totalFee,
    memo: kvRec.m || '',
    settlementStatus: kvRec.s,
    status: kvRec.cs || 'active',
    createdAt: kvRec.ca,
  };
}

export async function updateReservationsStatusByReserverMonth(
  reserverName: string,
  month: string,
  status: SettlementStatus
): Promise<boolean> {
  if (getUseMock()) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    let updated = false;
    for (const r of list) {
      if (r.rn === reserverName && r.d.startsWith(month) && (r.cs || 'active') !== 'cancelled') {
        r.s = status;
        updated = true;
      }
    }
    if (updated) {
      writeMockData(mockRecordsPath, list);
    }
    return updated;
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'records!A:O',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return false;

    let updated = false;
    const batchUpdates = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rDate = row[1];
      const rReserver = row[3];
      const rCancel = row[14] || 'active';

      if (rReserver === reserverName && rDate.startsWith(month) && rCancel !== 'cancelled') {
        batchUpdates.push({
          range: `records!M${i + 1}`,
          values: [[status]],
        });
        updated = true;
      }
    }

    if (batchUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          data: batchUpdates,
          valueInputOption: 'USER_ENTERED',
        },
      });
    }

    return updated;
  } catch (error) {
    console.error('Google Sheets API Error (updateReservationsStatusByReserverMonth), falling back to mock:', error);
    return false;
  }
}
