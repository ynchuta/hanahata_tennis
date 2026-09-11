import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

process.env.USE_MOCK = 'true';

import { calculateFees } from '../src/lib/calculator';
import { Facility } from '../src/types';

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
const mockLedgerPath = path.join(process.cwd(), 'mock-data', 'ledger.json');
const mockCategoriesPath = path.join(process.cwd(), 'mock-data', 'categories.json');

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
        status: 'active',
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
        status: 'active',
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

  describe('会計管理機能の検証', () => {
    fs.writeFileSync(mockLedgerPath, '[]', 'utf-8');

    test('テストケース[時系列入力]: 過去・現在・未来の日付を順不同で入力した場合でも、時系列順で残高が再計算されるか検証', async () => {
      const { addLedgerRecord, getLedgerRecords } = await import('../src/lib/db');

      // 1. 2026-06-15 に 10,000円 の収入
      await addLedgerRecord({
        date: '2026-06-15',
        description: '部費集金',
        income: 10000,
        expense: 0,
        category: '部費',
      });

      // 2. 過去日付 2026-06-05 に 3,000円 の支出（時系列順序が逆）
      await addLedgerRecord({
        date: '2026-06-05',
        description: 'ボール購入（過去）',
        income: 0,
        expense: 3000,
        category: '雑費',
      });

      // 3. 未来日付 2026-06-25 に 2,000円 の支出
      await addLedgerRecord({
        date: '2026-06-25',
        description: 'ラインテープ購入',
        income: 0,
        expense: 2000,
        category: '雑費',
      });

      const records = await getLedgerRecords();
      assert.strictEqual(records.length, 3);

      // 時系列順（日付昇順）で検証
      // 1件目: 2026-06-05 支出3000 => 残高 -3000
      assert.strictEqual(records[0].date, '2026-06-05');
      assert.strictEqual(records[0].balance, -3000);

      // 2件目: 2026-06-15 収入10000 => 残高 -3000 + 10000 = 7000
      assert.strictEqual(records[1].date, '2026-06-15');
      assert.strictEqual(records[1].balance, 7000);

      // 3件目: 2026-06-25 支出2000 => 残高 7000 - 2000 = 5000
      assert.strictEqual(records[2].date, '2026-06-25');
      assert.strictEqual(records[2].balance, 5000);
    });

    test('テストケース[会計編集]: 過去のレコードを編集した際、後続レコードの残高が連動して正しく再計算されるか検証', async () => {
      const { getLedgerRecords, updateLedgerRecord } = await import('../src/lib/db');
      const records = await getLedgerRecords();

      // 先頭（2026-06-05）の支出を 3,000円 から 1,000円 に変更
      const firstRecord = records[0];
      const updated = await updateLedgerRecord(firstRecord.id, {
        date: firstRecord.date,
        description: firstRecord.description,
        income: 0,
        expense: 1000,
        category: firstRecord.category,
      });

      assert.ok(updated);
      assert.strictEqual(updated.balance, -1000);

      const afterUpdate = await getLedgerRecords();
      // 1件目: 支出1000 => 残高 -1000
      assert.strictEqual(afterUpdate[0].balance, -1000);
      // 2件目: 収入10000 => 残高 9000
      assert.strictEqual(afterUpdate[1].balance, 9000);
      // 3件目: 支出2000 => 残高 7000
      assert.strictEqual(afterUpdate[2].balance, 7000);
    });

    test('テストケース[会計削除]: レコードを削除した際、残高が正しく再計算されるか検証', async () => {
      const { getLedgerRecords, deleteLedgerRecord } = await import('../src/lib/db');
      const records = await getLedgerRecords();

      // 2件目（2026-06-15 収入10000）を削除
      const secondRecord = records[1];
      const deleteSuccess = await deleteLedgerRecord(secondRecord.id);
      assert.ok(deleteSuccess);

      const afterDelete = await getLedgerRecords();
      assert.strictEqual(afterDelete.length, 2);

      // 1件目: 2026-06-05 支出1000 => 残高 -1000
      assert.strictEqual(afterDelete[0].balance, -1000);
      // 2件目: 2026-06-25 支出2000 => 残高 -3000
      assert.strictEqual(afterDelete[1].balance, -3000);
    });
  });

  describe('会計分類マスタの検証', () => {
    fs.writeFileSync(mockCategoriesPath, '[]', 'utf-8');

    test('会計分類の追加・取得・削除の検証', async () => {
      const { getCategories, addCategory, deleteCategory } = await import('../src/lib/db');

      // 初期状態の取得（デフォルトで雑費、その他が入る）
      const initial = await getCategories();
      assert.ok(initial.some(c => c.name === '雑費'));
      assert.ok(initial.some(c => c.name === 'その他'));

      // 新規分類追加
      const newCat = await addCategory('ボール代');
      assert.ok(newCat.id);
      assert.strictEqual(newCat.name, 'ボール代');

      const afterAdd = await getCategories();
      assert.ok(afterAdd.some(c => c.name === 'ボール代'));

      // 削除
      const deleteSuccess = await deleteCategory(newCat.id);
      assert.ok(deleteSuccess);

      const afterDelete = await getCategories();
      assert.strictEqual(afterDelete.some(c => c.name === 'ボール代'), false);
    });
  });

  describe('窓口精算・保護者返金ステータス機能の検証', () => {
    test('窓口精算として予約登録およびステータス取得の検証', async () => {
      const { addFacility, addReservation, getReservations, updateReservationSettlementStatus, updateReservationsStatusByReserverMonth } = await import('../src/lib/db');

      const fac = await addFacility({
        name: '窓口精算テスト施設',
        adultRatePerHour: 1000,
        childRatePerHour: 500,
        lightRatePerHour: 300,
        allowChildRate: true,
      });

      // 1. 窓口精算として予約登録
      const rCounter = await addReservation({
        date: '2026-07-10',
        facilityId: fac.id,
        reserverName: '保護者C',
        courtStartTime: '18:00',
        courtEndTime: '20:00',
        lightHours: 0,
        feeType: '大人',
        memo: '窓口現金払い',
        settlementStatus: '窓口精算',
        status: 'active',
      });
      assert.strictEqual(rCounter.settlementStatus, '窓口精算');

      // 2. 通常の立替予約登録（未返金）
      const rAdvance = await addReservation({
        date: '2026-07-15',
        facilityId: fac.id,
        reserverName: '保護者C',
        courtStartTime: '18:00',
        courtEndTime: '20:00',
        lightHours: 0,
        feeType: '大人',
        memo: '立替',
        settlementStatus: '未返金',
        status: 'active',
      });
      assert.strictEqual(rAdvance.settlementStatus, '未返金');

      // 3. 単体ステータス更新の検証（未返金 → 返金済）
      const updatedAdvance = await updateReservationSettlementStatus(rAdvance.id, '返金済');
      assert.ok(updatedAdvance);
      assert.strictEqual(updatedAdvance.settlementStatus, '返金済');

      // 4. 一括更新（返金済 → 未返金）時に窓口精算が巻き込まれず維持されるかの検証
      const count = await updateReservationsStatusByReserverMonth('2026-07', '保護者C', '未返金');
      // 立替予約1件のみが更新され、窓口精算は更新されない
      assert.strictEqual(count, 1);

      const allRecords = await getReservations();
      const checkCounter = allRecords.find((r) => r.id === rCounter.id);
      const checkAdvance = allRecords.find((r) => r.id === rAdvance.id);

      assert.strictEqual(checkCounter?.settlementStatus, '窓口精算');
      assert.strictEqual(checkAdvance?.settlementStatus, '未返金');
    });
  });
});
