import { google } from 'googleapis';
import { Facility, Reservation, SettlementStatus } from '../types';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

export const USE_MOCK =
  process.env.USE_MOCK === 'true' ||
  !SPREADSHEET_ID ||
  !GOOGLE_SERVICE_ACCOUNT_EMAIL ||
  !GOOGLE_PRIVATE_KEY;

const mockFacilitiesPath = path.join(process.cwd(), 'mock-data', 'facilities.json');
const mockRecordsPath = path.join(process.cwd(), 'mock-data', 'records.json');
const mockReserversPath = path.join(process.cwd(), 'mock-data', 'reservers.json');

export interface Reserver {
  id: string;
  name: string;
  createdAt: string;
}

// ヘルパー: モックデータの読み込み
function readMockData<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as T[];
  } catch (error) {
    console.error(`Error reading mock data from ${filePath}:`, error);
    return [];
  }
}

// ヘルパー: モックデータの書き込み
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

// Google Sheets クライアントの初期化
function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ヘルパー: シート名からシートIDを取得する
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

/**
 * 施設マスタ一覧を取得する
 */
export async function getFacilities(): Promise<Facility[]> {
  if (USE_MOCK) {
    return readMockData<Facility>(mockFacilitiesPath);
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'facilities!A2:F',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    return rows.map((row) => ({
      id: row[0],
      name: row[1],
      adultRatePerHour: Number(row[2]) || 0,
      childRatePerHour: Number(row[3]) || 0,
      lightRatePerHour: Number(row[4]) || 0,
      allowChildRate: row[5] === 'TRUE',
    }));
  } catch (error) {
    console.error('Google Sheets API Error (getFacilities), falling back to mock:', error);
    return readMockData<Facility>(mockFacilitiesPath);
  }
}

/**
 * 施設マスタを追加する
 */
export async function addFacility(facility: Omit<Facility, 'id'>): Promise<Facility> {
  const newFacility: Facility = {
    id: crypto.randomUUID(),
    ...facility,
  };

  if (USE_MOCK) {
    const list = readMockData<Facility>(mockFacilitiesPath);
    list.push(newFacility);
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
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'facilities!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    return newFacility;
  } catch (error) {
    console.error('Google Sheets API Error (addFacility), falling back to mock:', error);
    const list = readMockData<Facility>(mockFacilitiesPath);
    list.push(newFacility);
    writeMockData(mockFacilitiesPath, list);
    return newFacility;
  }
}

/**
 * 施設マスタを更新する
 */
export async function updateFacility(id: string, facility: Partial<Omit<Facility, 'id'>>): Promise<Facility | null> {
  if (USE_MOCK) {
    const list = readMockData<Facility>(mockFacilitiesPath);
    const index = list.findIndex((f) => f.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...facility };
    writeMockData(mockFacilitiesPath, list);
    return list[index];
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'facilities!A:A',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return null;

    const rowIndex = rows.findIndex((row) => row[0] === id) + 1;
    if (rowIndex === 0) return null;

    const currentList = await getFacilities();
    const current = currentList.find((f) => f.id === id);
    if (!current) return null;

    const updated = { ...current, ...facility };
    
    // A〜F列を一括更新
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `facilities!A${rowIndex}:F${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          updated.id,
          updated.name,
          updated.adultRatePerHour,
          updated.childRatePerHour,
          updated.lightRatePerHour,
          updated.allowChildRate ? 'TRUE' : 'FALSE',
        ]],
      },
    });

    return updated;
  } catch (error) {
    console.error('Google Sheets API Error (updateFacility), falling back to mock:', error);
    const list = readMockData<Facility>(mockFacilitiesPath);
    const index = list.findIndex((f) => f.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...facility };
    writeMockData(mockFacilitiesPath, list);
    return list[index];
  }
}

/**
 * 施設マスタを削除する
 */
export async function deleteFacility(id: string): Promise<boolean> {
  if (USE_MOCK) {
    const list = readMockData<Facility>(mockFacilitiesPath);
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

    const rowIndex = rows.findIndex((row) => row[0] === id) + 1;
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
    const list = readMockData<Facility>(mockFacilitiesPath);
    const filtered = list.filter((f) => f.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockFacilitiesPath, filtered);
    return true;
  }
}

/* =========================================================================
   保護者マスタ (Reservers)
   ========================================================================= */

/**
 * 保護者一覧を取得する
 */
export async function getReservers(): Promise<Reserver[]> {
  if (USE_MOCK) {
    return readMockData<Reserver>(mockReserversPath);
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'reservers!A2:C',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    return rows.map((row) => ({
      id: row[0],
      name: row[1],
      createdAt: row[2],
    }));
  } catch (error) {
    console.error('Google Sheets API Error (getReservers), falling back to mock:', error);
    return readMockData<Reserver>(mockReserversPath);
  }
}

/**
 * 保護者を追加する
 */
export async function addReserver(name: string): Promise<Reserver> {
  const newReserver: Reserver = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  };

  if (USE_MOCK) {
    const list = readMockData<Reserver>(mockReserversPath);
    list.push(newReserver);
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
    const list = readMockData<Reserver>(mockReserversPath);
    list.push(newReserver);
    writeMockData(mockReserversPath, list);
    return newReserver;
  }
}

/**
 * 保護者を削除する
 */
export async function deleteReserver(id: string): Promise<boolean> {
  if (USE_MOCK) {
    const list = readMockData<Reserver>(mockReserversPath);
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

    const rowIndex = rows.findIndex((row) => row[0] === id) + 1;
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
    const list = readMockData<Reserver>(mockReserversPath);
    const filtered = list.filter((r) => r.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockReserversPath, filtered);
    return true;
  }
}

/* =========================================================================
   予約記録 (Reservations)
   ========================================================================= */

/**
 * 予約記録一覧を取得する
 */
export async function getReservations(): Promise<Reservation[]> {
  if (USE_MOCK) {
    return readMockData<Reservation>(mockRecordsPath);
  }

  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'records!A2:N',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    return rows.map((row) => ({
      id: row[0],
      date: row[1],
      facilityName: row[2],
      reserverName: row[3],
      courtStartTime: row[4],
      courtEndTime: row[5],
      lightStartTime: row[6] || '',
      lightEndTime: row[7] || '',
      feeType: row[8] as any,
      courtFee: Number(row[9]) || 0,
      lightFee: Number(row[10]) || 0,
      totalFee: Number(row[11]) || 0,
      status: row[12] as any,
      createdAt: row[13],
    }));
  } catch (error) {
    console.error('Google Sheets API Error (getReservations), falling back to mock:', error);
    return readMockData<Reservation>(mockRecordsPath);
  }
}

/**
 * 新しい予約記録を追加する
 */
export async function addReservation(reservation: Omit<Reservation, 'id' | 'createdAt'>): Promise<Reservation> {
  const newId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const newReservation: Reservation = {
    id: newId,
    createdAt,
    ...reservation,
  };

  if (USE_MOCK) {
    const records = readMockData<Reservation>(mockRecordsPath);
    records.push(newReservation);
    writeMockData(mockRecordsPath, records);
    return newReservation;
  }

  try {
    const sheets = getSheetsClient();
    const values = [[
      newReservation.id,
      newReservation.date,
      newReservation.facilityName,
      newReservation.reserverName,
      newReservation.courtStartTime,
      newReservation.courtEndTime,
      newReservation.lightStartTime,
      newReservation.lightEndTime,
      newReservation.feeType,
      newReservation.courtFee,
      newReservation.lightFee,
      newReservation.totalFee,
      newReservation.status,
      newReservation.createdAt,
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'records!A:N',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    return newReservation;
  } catch (error) {
    console.error('Google Sheets API Error (addReservation), falling back to mock:', error);
    const records = readMockData<Reservation>(mockRecordsPath);
    records.push(newReservation);
    writeMockData(mockRecordsPath, records);
    return newReservation;
  }
}

/**
 * 予約の精算ステータスを更新する
 */
export async function updateReservationStatus(id: string, status: SettlementStatus): Promise<Reservation | null> {
  if (USE_MOCK) {
    const records = readMockData<Reservation>(mockRecordsPath);
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) return null;
    records[index].status = status;
    writeMockData(mockRecordsPath, records);
    return records[index];
  }

  try {
    const sheets = getSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'records!A:A',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return null;

    const rowIndex = rows.findIndex((row) => row[0] === id) + 1;
    if (rowIndex === 0) return null;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `records!M${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[status]],
      },
    });

    const allRecords = await getReservations();
    return allRecords.find((r) => r.id === id) || null;
  } catch (error) {
    console.error('Google Sheets API Error (updateReservationStatus), falling back to mock:', error);
    const records = readMockData<Reservation>(mockRecordsPath);
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) return null;
    records[index].status = status;
    writeMockData(mockRecordsPath, records);
    return records[index];
  }
}
