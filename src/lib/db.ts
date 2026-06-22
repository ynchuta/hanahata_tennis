import { createClient } from '@vercel/kv';
import Redis from 'ioredis';
import { Facility, Reservation, SettlementStatus } from '../types';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { calculateFees } from './calculator';

const KV_REDIS_URL = process.env.KV_REDIS_URL;
const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
// Vercel KV 標準変数 (KV_REST_API_URL) または KV_REDIS_URL のいずれかが設定されていれば KV を使用する
export const USE_MOCK = !KV_REDIS_URL && !KV_REST_API_URL;

// KV クライアントを初期化する
function initKVClient() {
  // ① Vercel KV 標準環境変数 (REST) を優先する
  if (KV_REST_API_URL && KV_REST_API_TOKEN) {
    try {
      return createClient({
        url: KV_REST_API_URL,
        token: KV_REST_API_TOKEN,
      });
    } catch (error) {
      console.error('Error initializing KV client from KV_REST_API_URL:', error);
    }
  }

  // ② KV_REDIS_URL から初期化する
  if (!KV_REDIS_URL) return null;
  try {
    if (KV_REDIS_URL.startsWith('redis://') || KV_REDIS_URL.startsWith('rediss://')) {
      // TCP 接続用の通常の Redis (または Upstash Redis への TCP 接続)
      // ioredis を使用して接続する
      const redisClient = new Redis(KV_REDIS_URL, {
        maxRetriesPerRequest: 1, // サーバーレス環境でのハングアップを避けるための設定
        connectTimeout: 5000,
      });

      // エラーイベントハンドラを登録（接続エラー等でプロセスがクラッシュするのを防ぐ）
      redisClient.on('error', (err) => {
        console.error('ioredis client connection error:', err);
      });

      // @vercel/kv のインターフェース (get, set) と互換性のあるラッパーオブジェクトを返す
      return {
        get: async <T>(key: string): Promise<T | null> => {
          try {
            const val = await redisClient.get(key);
            if (val === null) return null;
            return JSON.parse(val) as T;
          } catch (e) {
            console.error(`ioredis.get error for key ${key}:`, e);
            throw e;
          }
        },
        set: async (key: string, value: unknown): Promise<'OK'> => {
          try {
            const str = typeof value === 'string' ? value : JSON.stringify(value);
            await redisClient.set(key, str);
            return 'OK';
          } catch (e) {
            console.error(`ioredis.set error for key ${key}:`, e);
            throw e;
          }
        }
      };
    } else {
      // すでに https:// 形式 (Upstash REST API など)
      return createClient({
        url: KV_REDIS_URL,
        token: KV_REST_API_TOKEN || '',
      });
    }
  } catch (error) {
    console.error('Error initializing KV client from KV_REDIS_URL:', error);
    return null;
  }
}

const kv = initKVClient();

const mockFacilitiesPath = path.join(process.cwd(), 'mock-data', 'facilities.json');
const mockRecordsPath = path.join(process.cwd(), 'mock-data', 'records.json');
const mockReserversPath = path.join(process.cwd(), 'mock-data', 'reservers.json');

// 短縮キー形式のインターフェース定義
interface KVFacility {
  id: string;
  n: string;   // name
  a: number;   // adultRatePerHour
  c: number;   // childRatePerHour
  l: number;   // lightRatePerHour
  ac: boolean; // allowChildRate
  lst?: string; // defaultLightStartTime (HH:MM)
}

export interface Reserver {
  id: string;
  name: string;
  createdAt: string;
}

interface KVReserver {
  id: string;
  n: string;   // name
  ca: string;  // createdAt
}

interface KVReservation {
  id: string;
  d: string;   // date (YYYY-MM-DD)
  fid: string; // facilityId (正規化: 施設名や料金は持たない)
  rn: string;  // reserverName
  st: string;  // courtStartTime (HH:MM)
  et: string;  // courtEndTime (HH:MM)
  lh: number;  // lightHours
  ft: '大人' | '子供'; // feeType
  m: string;   // memo
  s: '未精算' | '精算済'; // status
  ca: string;  // createdAt
  lst?: string; // lightStartTime (HH:MM)
}

interface OldFacility {
  id: string;
  name: string;
  adultRatePerHour: number;
  childRatePerHour: number;
  lightRatePerHour: number;
  allowChildRate: boolean;
  defaultLightStartTime?: string;
}

interface OldReserver {
  id: string;
  name: string;
  createdAt: string;
}

interface OldReservation {
  id: string;
  date: string;
  facilityName: string;
  reserverName: string;
  courtStartTime: string;
  courtEndTime: string;
  lightHours?: number;
  feeType?: '大人' | '子供';
  memo?: string;
  status?: '未精算' | '精算済';
  createdAt?: string;
  lightStartTime?: string;
}

// 既存モックデータのマイグレーション処理
function migrateMockDataIfNecessary() {
  if (USE_MOCK) {
    // facilities.json
    if (fs.existsSync(mockFacilitiesPath)) {
      try {
        let raw = fs.readFileSync(mockFacilitiesPath, 'utf-8');
        if (raw.startsWith('\uFEFF')) {
          raw = raw.slice(1);
        }
        const data = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0 && 'name' in data[0]) {
          const migrated = (data as OldFacility[]).map((f) => ({
            id: f.id,
            n: f.name,
            a: f.adultRatePerHour,
            c: f.childRatePerHour,
            l: f.lightRatePerHour,
            ac: f.allowChildRate
          }));
          fs.writeFileSync(mockFacilitiesPath, JSON.stringify(migrated, null, 2), 'utf-8');
          console.log('[Migration] Migrated facilities.json to short key format');
        }
      } catch (e) {
        console.error('Migration error (facilities):', e);
      }
    }

    // reservers.json
    if (fs.existsSync(mockReserversPath)) {
      try {
        let raw = fs.readFileSync(mockReserversPath, 'utf-8');
        if (raw.startsWith('\uFEFF')) {
          raw = raw.slice(1);
        }
        const data = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0 && 'name' in data[0]) {
          const migrated = (data as OldReserver[]).map((r) => ({
            id: r.id,
            n: r.name,
            ca: r.createdAt
          }));
          fs.writeFileSync(mockReserversPath, JSON.stringify(migrated, null, 2), 'utf-8');
          console.log('[Migration] Migrated reservers.json to short key format');
        }
      } catch (e) {
        console.error('Migration error (reservers):', e);
      }
    }

    // records.json
    if (fs.existsSync(mockRecordsPath)) {
      try {
        let raw = fs.readFileSync(mockRecordsPath, 'utf-8');
        if (raw.startsWith('\uFEFF')) {
          raw = raw.slice(1);
        }
        const data = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0 && 'facilityName' in data[0]) {
          const facMap = new Map<string, string>();
          if (fs.existsSync(mockFacilitiesPath)) {
            let facRaw = fs.readFileSync(mockFacilitiesPath, 'utf-8');
            if (facRaw.startsWith('\uFEFF')) {
              facRaw = facRaw.slice(1);
            }
            const facData = JSON.parse(facRaw) as Record<string, unknown>[];
            for (const f of facData) {
              const name = (f.n || f.name) as string;
              const id = f.id as string;
              facMap.set(name, id);
            }
          }

          const migrated = (data as OldReservation[]).map((r) => {
            const fid = facMap.get(r.facilityName) || 'unknown';
            return {
              id: r.id,
              d: r.date,
              fid: fid,
              rn: r.reserverName,
              st: r.courtStartTime,
              et: r.courtEndTime,
              lh: r.lightHours || 0,
              ft: r.feeType || '大人',
              m: r.memo || '',
              s: r.status || '未精算',
              ca: r.createdAt || new Date().toISOString()
            };
          });
          fs.writeFileSync(mockRecordsPath, JSON.stringify(migrated, null, 2), 'utf-8');
          console.log('[Migration] Migrated records.json to short key format and normalized facilityId');
        }
      } catch (e) {
        console.error('Migration error (records):', e);
      }
    }
  }
}

// マイグレーションの実行
migrateMockDataIfNecessary();

// ヘルパー: モックデータの読み込み
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

/* =========================================================================
   施設マスタ (Facilities)
   ========================================================================= */

export async function getFacilities(): Promise<Facility[]> {
  let list: KVFacility[] = [];
  if (USE_MOCK) {
    list = readMockData<KVFacility>(mockFacilitiesPath);
  } else {
    try {
      list = (await kv!.get<KVFacility[]>('nighter:facs')) || [];
    } catch (error) {
      console.error('Redis Error (getFacilities), falling back to mock:', error);
      list = readMockData<KVFacility>(mockFacilitiesPath);
    }
  }

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

export async function addFacility(facility: Omit<Facility, 'id'>): Promise<Facility> {
  const newFacility: Facility = {
    id: crypto.randomUUID(),
    ...facility,
  };
  const kvFac: KVFacility = {
    id: newFacility.id,
    n: newFacility.name,
    a: newFacility.adultRatePerHour,
    c: newFacility.childRatePerHour,
    l: newFacility.lightRatePerHour,
    ac: newFacility.allowChildRate,
    lst: newFacility.defaultLightStartTime,
  };

  if (USE_MOCK) {
    const list = readMockData<KVFacility>(mockFacilitiesPath);
    list.push(kvFac);
    writeMockData(mockFacilitiesPath, list);
  } else {
    try {
      const list = (await kv!.get<KVFacility[]>('nighter:facs')) || [];
      list.push(kvFac);
      await kv!.set('nighter:facs', list);
    } catch (error) {
      console.error('Redis Error (addFacility), falling back to mock:', error);
      const list = readMockData<KVFacility>(mockFacilitiesPath);
      list.push(kvFac);
      writeMockData(mockFacilitiesPath, list);
    }
  }

  return newFacility;
}

export async function updateFacility(id: string, facility: Partial<Omit<Facility, 'id'>>): Promise<Facility | null> {
  let updatedFacility: Facility | null = null;

  if (USE_MOCK) {
    const list = readMockData<KVFacility>(mockFacilitiesPath);
    const index = list.findIndex((f) => f.id === id);
    if (index !== -1) {
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
      updatedFacility = {
        id: list[index].id,
        name: list[index].n,
        adultRatePerHour: list[index].a,
        childRatePerHour: list[index].c,
        lightRatePerHour: list[index].l,
        allowChildRate: list[index].ac,
        defaultLightStartTime: list[index].lst,
      };
    }
  } else {
    try {
      const list = (await kv!.get<KVFacility[]>('nighter:facs')) || [];
      const index = list.findIndex((f) => f.id === id);
      if (index !== -1) {
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
        await kv!.set('nighter:facs', list);
        updatedFacility = {
          id: list[index].id,
          name: list[index].n,
          adultRatePerHour: list[index].a,
          childRatePerHour: list[index].c,
          lightRatePerHour: list[index].l,
          allowChildRate: list[index].ac,
          defaultLightStartTime: list[index].lst,
        };
      }
    } catch (error) {
      console.error('Redis Error (updateFacility), falling back to mock:', error);
      // フォールバック
      const list = readMockData<KVFacility>(mockFacilitiesPath);
      const index = list.findIndex((f) => f.id === id);
      if (index !== -1) {
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
        updatedFacility = {
          id: list[index].id,
          name: list[index].n,
          adultRatePerHour: list[index].a,
          childRatePerHour: list[index].c,
          lightRatePerHour: list[index].l,
          allowChildRate: list[index].ac,
          defaultLightStartTime: list[index].lst,
        };
      }
    }
  }

  return updatedFacility;
}

export async function deleteFacility(id: string): Promise<boolean> {
  if (USE_MOCK) {
    const list = readMockData<KVFacility>(mockFacilitiesPath);
    const filtered = list.filter((f) => f.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockFacilitiesPath, filtered);
    return true;
  }

  try {
    const list = (await kv!.get<KVFacility[]>('nighter:facs')) || [];
    const filtered = list.filter((f) => f.id !== id);
    if (list.length === filtered.length) return false;
    await kv!.set('nighter:facs', filtered);
    return true;
  } catch (error) {
    console.error('Redis Error (deleteFacility), falling back to mock:', error);
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
  let list: KVReserver[] = [];
  if (USE_MOCK) {
    list = readMockData<KVReserver>(mockReserversPath);
  } else {
    try {
      list = (await kv!.get<KVReserver[]>('nighter:resvs')) || [];
    } catch (error) {
      console.error('Redis Error (getReservers), falling back to mock:', error);
      list = readMockData<KVReserver>(mockReserversPath);
    }
  }

  return list.map((r) => ({
    id: r.id,
    name: r.n,
    createdAt: r.ca,
  }));
}

export async function addReserver(name: string): Promise<Reserver> {
  const newReserver: Reserver = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  };
  const kvRes: KVReserver = {
    id: newReserver.id,
    n: newReserver.name,
    ca: newReserver.createdAt,
  };

  if (USE_MOCK) {
    const list = readMockData<KVReserver>(mockReserversPath);
    list.push(kvRes);
    writeMockData(mockReserversPath, list);
  } else {
    try {
      const list = (await kv!.get<KVReserver[]>('nighter:resvs')) || [];
      list.push(kvRes);
      await kv!.set('nighter:resvs', list);
    } catch (error) {
      console.error('Redis Error (addReserver), falling back to mock:', error);
      const list = readMockData<KVReserver>(mockReserversPath);
      list.push(kvRes);
      writeMockData(mockReserversPath, list);
    }
  }

  return newReserver;
}

export async function deleteReserver(id: string): Promise<boolean> {
  if (USE_MOCK) {
    const list = readMockData<KVReserver>(mockReserversPath);
    const filtered = list.filter((r) => r.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockReserversPath, filtered);
    return true;
  }

  try {
    const list = (await kv!.get<KVReserver[]>('nighter:resvs')) || [];
    const filtered = list.filter((r) => r.id !== id);
    if (list.length === filtered.length) return false;
    await kv!.set('nighter:resvs', filtered);
    return true;
  } catch (error) {
    console.error('Redis Error (deleteReserver), falling back to mock:', error);
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
  let records: KVReservation[] = [];
  if (USE_MOCK) {
    records = readMockData<KVReservation>(mockRecordsPath);
  } else {
    try {
      records = (await kv!.get<KVReservation[]>('nighter:recs')) || [];
    } catch (error) {
      console.error('Redis Error (getReservations), falling back to mock:', error);
      records = readMockData<KVReservation>(mockRecordsPath);
    }
  }

  // 施設マスタを並行して取得して結合・計算する
  const facilities = await getFacilities();
  const facilityMap = new Map<string, Facility>();
  for (const f of facilities) {
    facilityMap.set(f.id, f);
  }

  return records.map((r) => {
    // 施設情報を ID でマッピングする（見つからない場合は仮の施設オブジェクトを作る）
    const facility = facilityMap.get(r.fid) || {
      id: r.fid,
      name: '不明な施設',
      adultRatePerHour: 0,
      childRatePerHour: 0,
      lightRatePerHour: 0,
      allowChildRate: false,
    };

    // 料金を動的計算する
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
      memo: r.m,
      status: r.s,
      createdAt: r.ca,
    };
  });
}

// 予約を追加する際、施設名から施設IDへの解決を行うための引数を取る
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
    s: reservation.status,
    ca: createdAt,
    lst: reservation.lightStartTime,
  };

  if (USE_MOCK) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    list.push(kvRec);
    writeMockData(mockRecordsPath, list);
  } else {
    try {
      const list = (await kv!.get<KVReservation[]>('nighter:recs')) || [];
      list.push(kvRec);
      await kv!.set('nighter:recs', list);
    } catch (error) {
      console.error('Redis Error (addReservation), falling back to mock:', error);
      const list = readMockData<KVReservation>(mockRecordsPath);
      list.push(kvRec);
      writeMockData(mockRecordsPath, list);
    }
  }

  // 呼び出し元が使いやすいように、結合した Reservation を返す
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
    status: reservation.status,
    createdAt,
  };
}

export async function updateReservationStatus(id: string, status: SettlementStatus): Promise<Reservation | null> {
  let kvRec: KVReservation | null = null;

  if (USE_MOCK) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    const index = list.findIndex((r) => r.id === id);
    if (index !== -1) {
      list[index].s = status;
      writeMockData(mockRecordsPath, list);
      kvRec = list[index];
    }
  } else {
    try {
      const list = (await kv!.get<KVReservation[]>('nighter:recs')) || [];
      const index = list.findIndex((r) => r.id === id);
      if (index !== -1) {
        list[index].s = status;
        await kv!.set('nighter:recs', list);
        kvRec = list[index];
      }
    } catch (error) {
      console.error('Redis Error (updateReservationStatus), falling back to mock:', error);
      const list = readMockData<KVReservation>(mockRecordsPath);
      const index = list.findIndex((r) => r.id === id);
      if (index !== -1) {
        list[index].s = status;
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
    memo: kvRec.m,
    status: kvRec.s,
    createdAt: kvRec.ca,
  };
}

export async function deleteReservation(id: string): Promise<boolean> {
  if (USE_MOCK) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    const filtered = list.filter((r) => r.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockRecordsPath, filtered);
    return true;
  }

  try {
    const list = (await kv!.get<KVReservation[]>('nighter:recs')) || [];
    const filtered = list.filter((r) => r.id !== id);
    if (list.length === filtered.length) return false;
    await kv!.set('nighter:recs', filtered);
    return true;
  } catch (error) {
    console.error('Redis Error (deleteReservation), falling back to mock:', error);
    const list = readMockData<KVReservation>(mockRecordsPath);
    const filtered = list.filter((r) => r.id !== id);
    if (list.length === filtered.length) return false;
    writeMockData(mockRecordsPath, filtered);
    return true;
  }
}

export async function testKVConnection(): Promise<boolean> {
  if (USE_MOCK || !kv) return false;
  try {
    // 疎通確認として 'nighter:ping' を get してみる
    await kv.get('nighter:ping');
    return true;
  } catch (error) {
    console.error('KV Connection test failed:', error);
    return false;
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
    status: '未精算' | '精算済';
  }
): Promise<Reservation | null> {
  const updatedKV: Partial<KVReservation> = {
    d: data.date,
    fid: data.facilityId,
    rn: data.reserverName,
    st: data.courtStartTime,
    et: data.courtEndTime,
    lh: data.lightHours,
    ft: data.feeType,
    m: data.memo,
    s: data.status,
    lst: data.lightStartTime,
  };

  let kvRec: KVReservation | null = null;

  if (USE_MOCK) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    const index = list.findIndex((r) => r.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...updatedKV };
    writeMockData(mockRecordsPath, list);
    kvRec = list[index];
  } else {
    try {
      const list = (await kv!.get<KVReservation[]>('nighter:recs')) || [];
      const index = list.findIndex((r) => r.id === id);
      if (index === -1) return null;
      list[index] = { ...list[index], ...updatedKV };
      await kv!.set('nighter:recs', list);
      kvRec = list[index];
    } catch (error) {
      console.error('Redis Error (updateReservation), falling back to mock:', error);
      const list = readMockData<KVReservation>(mockRecordsPath);
      const index = list.findIndex((r) => r.id === id);
      if (index === -1) return null;
      list[index] = { ...list[index], ...updatedKV };
      writeMockData(mockRecordsPath, list);
      kvRec = list[index];
    }
  }

  if (!kvRec) return null;

  const facilities = await getFacilities();
  const facility = facilities.find((f) => f.id === kvRec!.fid) || {
    id: kvRec.fid,
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
    memo: kvRec.m,
    status: kvRec.s,
    createdAt: kvRec.ca,
  };
}

export async function updateReservationsStatusByReserverMonth(
  month: string,
  reserverName: string,
  status: SettlementStatus
): Promise<number> {
  if (USE_MOCK) {
    const list = readMockData<KVReservation>(mockRecordsPath);
    let count = 0;
    for (const r of list) {
      if (r.d.startsWith(month) && r.rn === reserverName) {
        if (r.s !== status) {
          r.s = status;
          count++;
        }
      }
    }
    if (count > 0) {
      writeMockData(mockRecordsPath, list);
    }
    return count;
  }

  try {
    const list = (await kv!.get<KVReservation[]>('nighter:recs')) || [];
    let count = 0;
    for (const r of list) {
      if (r.d.startsWith(month) && r.rn === reserverName) {
        if (r.s !== status) {
          r.s = status;
          count++;
        }
      }
    }
    if (count > 0) {
      await kv!.set('nighter:recs', list);
    }
    return count;
  } catch (error) {
    console.error('Redis Error (updateReservationsStatusByReserverMonth), falling back to mock:', error);
    const list = readMockData<KVReservation>(mockRecordsPath);
    let count = 0;
    for (const r of list) {
      if (r.d.startsWith(month) && r.rn === reserverName) {
        if (r.s !== status) {
          r.s = status;
          count++;
        }
      }
    }
    if (count > 0) {
      writeMockData(mockRecordsPath, list);
    }
    return count;
  }
}
