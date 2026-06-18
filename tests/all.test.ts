import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateFees } from '../src/lib/calculator';
import { Facility } from '../src/types';
import fs from 'fs';
import path from 'path';

// テスト用の施設マスタ定義
const hibaru: Facility = {
  id: '1',
  name: '桧原運動公園',
  adultRatePerHour: 1000,
  childRatePerHour: 500,
  lightRatePerHour: 300,
  allowChildRate: true,
};

const hakatamori: Facility = {
  id: '2',
  name: '博多の森',
  adultRatePerHour: 1200,
  childRatePerHour: 1200,
  lightRatePerHour: 400,
  allowChildRate: false,
};

// モックファイルの保存先パス
const mockFacilitiesPath = path.join(process.cwd(), 'mock-data', 'facilities.json');
const mockRecordsPath = path.join(process.cwd(), 'mock-data', 'records.json');
const mockReserversPath = path.join(process.cwd(), 'mock-data', 'reservers.json');
const mockGithubOutputPath = path.join(process.cwd(), 'mock-data', 'settlement_status.json');

describe('テニス部ナイター費精算管理システム テストスイート', () => {

  describe('料金計算ロジック検証', () => {
    
    test('テストケース[正常系]: 桧原運動公園で子供料金、コート2時間、照明1時間の場合の計算', () => {
      const result = calculateFees({
        facility: hibaru,
        feeType: '子供',
        courtStartTime: '18:00',
        courtEndTime: '20:00',
        lightStartTime: '19:00',
        lightEndTime: '20:00',
      });

      assert.strictEqual(result.appliedFeeType, '子供');
      assert.strictEqual(result.courtFee, 1000);
      assert.strictEqual(result.lightFee, 300);
      assert.strictEqual(result.totalFee, 1300);
    });

    test('テストケース[計算精度]: 1時間10分（70分）の利用における端数処理（切り上げ）の検証', () => {
      const result = calculateFees({
        facility: hibaru,
        feeType: '大人',
        courtStartTime: '18:00',
        courtEndTime: '19:10',
        lightStartTime: '',
        lightEndTime: '',
      });

      assert.strictEqual(result.totalFee, 1167);
    });

    test('テストケース[制約]: 博多の森を選択した際の子供料金無効化（大人料金の強制適用）検証', () => {
      const result = calculateFees({
        facility: hakatamori,
        feeType: '子供',
        courtStartTime: '18:00',
        courtEndTime: '19:00',
        lightStartTime: '',
        lightEndTime: '',
      });

      assert.strictEqual(result.appliedFeeType, '大人');
      assert.strictEqual(result.totalFee, 1200);
    });
  });

  describe('データ保存・連携検証', () => {
    
    fs.writeFileSync(mockRecordsPath, '[]', 'utf-8');

    test('テストケース[複数予約]: 同一日で複数名が別々の予約を登録した際、データが競合せず個別に保存されるか検証', async () => {
      process.env.USE_MOCK = 'true';

      const { addReservation, getReservations } = await import('../src/lib/db');

      await addReservation({
        date: '2026-06-18',
        facilityName: '桧原運動公園',
        reserverName: '保護者A',
        courtStartTime: '18:00',
        courtEndTime: '20:00',
        lightStartTime: '',
        lightEndTime: '',
        feeType: '大人',
        courtFee: 2000,
        lightFee: 0,
        totalFee: 2000,
        status: '未精算',
      });

      await addReservation({
        date: '2026-06-18',
        facilityName: '桧原運動公園',
        reserverName: '保護者B',
        courtStartTime: '19:00',
        courtEndTime: '21:00',
        lightStartTime: '',
        lightEndTime: '',
        feeType: '大人',
        courtFee: 2000,
        lightFee: 0,
        totalFee: 2000,
        status: '未精算',
      });

      const records = await getReservations();
      assert.strictEqual(records.length, 2);

      const parentA = records.find(r => r.reserverName === '保護者A');
      const parentB = records.find(r => r.reserverName === '保護者B');

      assert.ok(parentA);
      assert.ok(parentB);
      assert.strictEqual(parentA.courtStartTime, '18:00');
      assert.strictEqual(parentB.courtStartTime, '19:00');
    });

    test('テストケース[外部連携]: データを保存した際に、非公開情報を除外した精算情報が正しく書き出されるか検証', async () => {
      const { getReservations } = await import('../src/lib/db');
      const { syncSettlementStatusToGithub } = await import('../src/lib/github');

      const records = await getReservations();
      
      const publicData = records.map((r) => ({
        date: r.date,
        reserverName: r.reserverName,
        status: r.status,
      }));

      const success = await syncSettlementStatusToGithub(publicData);
      assert.ok(success);

      assert.ok(fs.existsSync(mockGithubOutputPath));
      const fileContentStr = fs.readFileSync(mockGithubOutputPath, 'utf-8');
      const parsed = JSON.parse(fileContentStr);

      assert.strictEqual(parsed.length, 2);
      assert.strictEqual(parsed[0].reserverName, '保護者A');
      
      assert.strictEqual((parsed[0] as any).courtFee, undefined);
      assert.strictEqual((parsed[0] as any).lightFee, undefined);
      assert.strictEqual((parsed[0] as any).totalFee, undefined);
    });
  });

  describe('設定管理機能（追加要件）の検証', () => {
    
    test('コート（施設）マスタの動的更新（追加・編集・削除）検証', async () => {
      const { getFacilities, addFacility, updateFacility, deleteFacility } = await import('../src/lib/db');

      // 1. 施設追加
      const newFacility = await addFacility({
        name: 'テストコート',
        adultRatePerHour: 800,
        childRatePerHour: 400,
        lightRatePerHour: 200,
        allowChildRate: true,
      });
      assert.ok(newFacility.id);

      let list = await getFacilities();
      assert.ok(list.some(f => f.name === 'テストコート'));

      // 2. 施設編集 (大人料金を800円 -> 900円)
      const updated = await updateFacility(newFacility.id, {
        adultRatePerHour: 900,
      });
      assert.ok(updated);
      assert.strictEqual(updated.adultRatePerHour, 900);

      list = await getFacilities();
      const checkTarget = list.find(f => f.id === newFacility.id);
      assert.ok(checkTarget);
      assert.strictEqual(checkTarget.adultRatePerHour, 900);

      // 3. 施設削除
      const deleteSuccess = await deleteFacility(newFacility.id);
      assert.ok(deleteSuccess);

      list = await getFacilities();
      assert.strictEqual(list.some(f => f.id === newFacility.id), false);
    });

    test('保護者（予約者）マスタの動的登録（追加・削除）検証', async () => {
      const { getReservers, addReserver, deleteReserver } = await import('../src/lib/db');

      // 1. 保護者追加
      const newReserver = await addReserver('テスト保護者');
      assert.ok(newReserver.id);
      assert.strictEqual(newReserver.name, 'テスト保護者');

      let list = await getReservers();
      assert.ok(list.some(r => r.name === 'テスト保護者'));

      // 2. 保護者削除
      const deleteSuccess = await deleteReserver(newReserver.id);
      assert.ok(deleteSuccess);

      list = await getReservers();
      assert.strictEqual(list.some(r => r.id === newReserver.id), false);
    });
  });
});
