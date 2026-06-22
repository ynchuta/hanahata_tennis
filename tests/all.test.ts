import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateFees } from '../src/lib/calculator';
import { Facility } from '../src/types';
import fs from 'fs';
import path from 'path';

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

const mockRecordsPath = path.join(process.cwd(), 'mock-data', 'records.json');
const mockReserversPath = path.join(process.cwd(), 'mock-data', 'reservers.json');

describe('テニス部ナイター費精算管理システム テストスイート', () => {

  describe('料金計算ロジック検証', () => {
    
    test('テストケース[正常系]: 桧原運動公園で子供料金、コート2時間、照明1時間の場合の計算', () => {
      const result = calculateFees({
        facility: hibaru,
        feeType: '子供',
        courtStartTime: '18:00',
        courtEndTime: '20:00',
        lightHours: 1,  // 1時間単位に変更
      });
      // コート: 500円/時 × 2時間 = 1000円
      // 照明: 300円/時 × 1時間 = 300円
      // 合計: 1300円
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
        lightHours: 0,
      });
      // 計算: (70 / 60) * 1000 = 1166.66... 円 → 切り上げて 1167円
      assert.strictEqual(result.totalFee, 1167);
    });

    test('テストケース[制約]: 博多の森を選択した際の子供料金無効化（大人料金の強制適用）検証', () => {
      const result = calculateFees({
        facility: hakatamori,
        feeType: '子供',
        courtStartTime: '18:00',
        courtEndTime: '19:00',
        lightHours: 0,
      });
      // 博多の森は allowChildRate が false のため大人料金 (1200円) が強制適用される
      assert.strictEqual(result.appliedFeeType, '大人');
      assert.strictEqual(result.totalFee, 1200);
    });

    test('テストケース[照明1時間単位]: 照明2時間分が正しく計算されるか', () => {
      const result = calculateFees({
        facility: hibaru,
        feeType: '大人',
        courtStartTime: '18:00',
        courtEndTime: '19:00',
        lightHours: 2,
      });
      // コート: 1000円 + 照明: 300×2 = 600円 = 合計1600円
      assert.strictEqual(result.lightFee, 600);
      assert.strictEqual(result.totalFee, 1600);
    });
  });

  describe('データ保存・連携検証', () => {

    fs.writeFileSync(mockRecordsPath, '[]', 'utf-8');
    fs.writeFileSync(mockReserversPath, '[]', 'utf-8');

    test('テストケース[複数予約]: 同一日で複数名が別々の予約を登録した際、データが競合せず個別に保存されるか検証', async () => {
      process.env.USE_MOCK = 'true';

      const { addReservation, getReservations, addFacility } = await import('../src/lib/db');

      // テスト用に施設を登録する
      const testFacility = await addFacility({
        name: '桧原運動公園',
        adultRatePerHour: 1000,
        childRatePerHour: 500,
        lightRatePerHour: 300,
        allowChildRate: true,
      });

      await addReservation({
        date: '2026-06-18',
        facilityId: testFacility.id,
        reserverName: '保護者A',
        courtStartTime: '18:00',
        courtEndTime: '20:00',
        lightHours: 0,
        feeType: '大人',
        memo: '',
        status: '未精算',
      });

      await addReservation({
        date: '2026-06-18',
        facilityId: testFacility.id,
        reserverName: '保護者B',
        courtStartTime: '19:00',
        courtEndTime: '21:00',
        lightHours: 1,
        feeType: '大人',
        memo: 'コートA使用',
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
      assert.strictEqual(parentB.lightHours, 1);
      assert.strictEqual(parentB.memo, 'コートA使用');
    });

    test('テストケース[メモ保存]: 予約にメモが正しく保存・取得できるか検証', async () => {
      const { getReservations } = await import('../src/lib/db');
      const records = await getReservations();
      const withMemo = records.find(r => r.memo !== '');
      assert.ok(withMemo);
      assert.strictEqual(withMemo.memo, 'コートA使用');
    });
  });

  describe('設定管理機能の検証', () => {

    test('コート（施設）マスタの動的更新（追加・編集・削除）検証', async () => {
      const { getFacilities, addFacility, updateFacility, deleteFacility } = await import('../src/lib/db');

      const newFacility = await addFacility({
        name: 'テストコート',
        adultRatePerHour: 800,
        childRatePerHour: 400,
        lightRatePerHour: 200,
        allowChildRate: true,
      });
      assert.ok(newFacility.id);

      const updated = await updateFacility(newFacility.id, { adultRatePerHour: 900 });
      assert.ok(updated);
      assert.strictEqual(updated.adultRatePerHour, 900);

      const deleteSuccess = await deleteFacility(newFacility.id);
      assert.ok(deleteSuccess);

      const list = await getFacilities();
      assert.strictEqual(list.some(f => f.id === newFacility.id), false);
    });

    test('保護者（予約者）マスタの動的登録（追加・削除）検証', async () => {
      const { getReservers, addReserver, deleteReserver } = await import('../src/lib/db');

      const newReserver = await addReserver('テスト保護者2');
      assert.ok(newReserver.id);
      assert.strictEqual(newReserver.name, 'テスト保護者2');

      const deleteSuccess = await deleteReserver(newReserver.id);
      assert.ok(deleteSuccess);

      const list = await getReservers();
      assert.strictEqual(list.some(r => r.id === newReserver.id), false);
    });
  });
});
