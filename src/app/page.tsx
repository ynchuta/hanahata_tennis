'use client';

import { useState, useEffect, useCallback } from 'react';
import { Facility, Reservation, MonthlyReportRow, FeeType, SettlementStatus, LedgerRecord, LedgerCategory } from '@/types';


interface Reserver {
  id: string;
  name: string;
}

export default function Home() {
  // 共有アカウント簡易認証用のステート
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'calendar' | 'ledger' | 'report' | 'settings'>('calendar');

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [reservers, setReservers] = useState<Reserver[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [report, setReport] = useState<MonthlyReportRow[]>([]);
  const [ledgerRecords, setLedgerRecords] = useState<LedgerRecord[]>([]);

  // ローカルタイムゾーンでの日付文字列変換（JST/UTCズレ防止）
  const toLocalDateStr = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    toLocalDateStr(new Date())
  );
  const [reportMonth, setReportMonth] = useState<string>(
    toLocalDateStr(new Date()).slice(0, 7)
  );

  // 会計履歴一覧の月別参照ステート
  const [ledgerMonth, setLedgerMonth] = useState<string>(
    toLocalDateStr(new Date()).slice(0, 7)
  );
  const [showAllLedgerMonths, setShowAllLedgerMonths] = useState(false);

  const [formData, setFormData] = useState({
    facilityName: '',
    reserverName: '',
    courtStartTime: '18:00',
    courtEndTime: '20:00',
    lightHours: 0,
    lightStartTime: '',
    feeType: '大人' as FeeType,
    memo: '',
    settlementStatus: '未返金' as SettlementStatus,
    status: 'active' as 'active' | 'cancelled',
  });
  const [selectedReservationAction, setSelectedReservationAction] = useState<Reservation | null>(null);

  // 会計分類リスト（DB・API経由で管理）
  const [categories, setCategories] = useState<string[]>(['雑費', 'その他']);
  const [categoryList, setCategoryList] = useState<LedgerCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  // 会計フォームステート
  const [ledgerForm, setLedgerForm] = useState({
    date: toLocalDateStr(new Date()),
    description: '',
    type: 'expense' as 'income' | 'expense',
    amount: 0,
    category: '雑費',
  });
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);
  const [selectedLedgerAction, setSelectedLedgerAction] = useState<LedgerRecord | null>(null);

  const [facilityForm, setFacilityForm] = useState({
    id: '',
    name: '',
    adultRatePerHour: 1000,
    childRatePerHour: 500,
    lightRatePerHour: 300,
    allowChildRate: true,
    defaultLightStartTime: '',
  });
  const [isEditingFacility, setIsEditingFacility] = useState(false);
  const [newReserverName, setNewReserverName] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingReservationId, setEditingReservationId] = useState<string | null>(null);
  const [isFacilityFormOpen, setIsFacilityFormOpen] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; show: boolean; loading?: boolean }>({
    message: '',
    show: false,
  });

  // 日没・薄明時刻用ステート
  const [sunsetSettings, setSunsetSettings] = useState<{
    showOnCalendar: boolean;
    locationName: string;
    latitude: number;
    longitude: number;
    twilightType: 'sunset' | 'civil' | 'nautical' | 'astronomical';
  }>({
    showOnCalendar: true,
    locationName: '福岡市南区桧原（テニスコート）',
    latitude: 33.54,
    longitude: 130.395,
    twilightType: 'civil',
  });
  const [sunsetDataMap, setSunsetDataMap] = useState<Record<string, string>>({});
  const [sunsetForm, setSunsetForm] = useState({
    showOnCalendar: true,
    locationName: '福岡市南区桧原（テニスコート）',
    latitude: '33.54',
    longitude: '130.395',
    twilightType: 'civil' as 'sunset' | 'civil' | 'nautical' | 'astronomical',
  });

  const showToast = useCallback((message: string, duration = 3000, loading = false) => {
    setToast({ message, show: true, loading });
    if (!loading && duration > 0) {
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), duration);
    }
  }, []);

  const fetchFacilities = useCallback(async () => {
    try {
      const res = await fetch('/api/facilities');
      if (res.ok) {
        const data = await res.json();
        setFacilities(data);
        if (data.length > 0) {
          setFormData((prev) => prev.facilityName ? prev : {
            ...prev,
            facilityName: data[0].name,
            feeType: data[0].allowChildRate ? '子供' : '大人'
          });
        }
      }
    } catch (err) { console.error(err); }
  }, []);

  const fetchReservers = useCallback(async () => {
    try {
      const res = await fetch('/api/reservers');
      if (res.ok) {
        const data = await res.json();
        setReservers(data);
        if (data.length > 0) {
          setFormData((prev) => prev.reserverName ? prev : { ...prev, reserverName: data[0].name });
        }
      }
    } catch (err) { console.error(err); }
  }, []);

  const fetchReservations = useCallback(async () => {
    try {
      const res = await fetch('/api/records');
      if (res.ok) setReservations(await res.json());
    } catch (err) { console.error(err); }
  }, []);

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/summary?month=${reportMonth}`);
      if (res.ok) setReport(await res.json());
    } catch (err) { console.error(err); }
  }, [reportMonth]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data: LedgerCategory[] = await res.json();
        setCategoryList(data);
        const names = data.map((c) => c.name);
        setCategories(names);
        if (names.length > 0) {
          setLedgerForm((prev) => {
            if (!names.includes(prev.category)) {
              return { ...prev, category: names[0] };
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  }, []);

  const fetchLedgerRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/ledger');
      if (res.ok) {
        const data = await res.json();
        setLedgerRecords(data);
      }
    } catch (err) { console.error(err); }
  }, []);

  const fetchSunsetSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/sunset-settings');
      if (res.ok) {
        const data = await res.json();
        setSunsetSettings(data);
        setSunsetForm({
          showOnCalendar: data.showOnCalendar ?? true,
          locationName: data.locationName || '福岡市南区桧原（テニスコート）',
          latitude: String(data.latitude ?? 33.54),
          longitude: String(data.longitude ?? 130.395),
          twilightType: data.twilightType || 'civil',
        });
      }
    } catch (e) {
      console.error('Failed to fetch sunset settings:', e);
    }
  }, []);

  const fetchSunsets = useCallback(async (targetDates: string[], settings: typeof sunsetSettings) => {
    if (targetDates.length === 0) return;
    try {
      const datesQuery = targetDates.join(',');
      const res = await fetch(
        `/api/sunset?dates=${datesQuery}&lat=${settings.latitude}&lng=${settings.longitude}&twilightType=${settings.twilightType}`
      );
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setSunsetDataMap((prev) => {
            const next = { ...prev };
            Object.entries(json.data as Record<string, { selectedTime: string }>).forEach(([dateStr, val]) => {
              if (val && val.selectedTime) {
                next[dateStr] = val.selectedTime;
              }
            });
            return next;
          });
        }
      }
    } catch (e) {
      console.error('Failed to fetch sunset times:', e);
    }
  }, []);

  // セッション（LocalStorage）のチェック
  useEffect(() => {
    const auth = localStorage.getItem('nighter_auth');
    if (auth === 'true') {
      Promise.resolve().then(() => {
        setIsLoggedIn(true);
      });
    }
    Promise.resolve().then(() => {
      setIsAuthChecking(false);
    });
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      Promise.resolve().then(() => {
        fetchFacilities();
        fetchReservers();
        fetchReservations();
        fetchLedgerRecords();
        fetchCategories();
        fetchSunsetSettings();
      });
    }
  }, [isLoggedIn, fetchFacilities, fetchReservers, fetchReservations, fetchLedgerRecords, fetchCategories, fetchSunsetSettings]);

  // カレンダーの表示月や予約・選択日の変化に合わせて日没時刻を一括取得
  useEffect(() => {
    if (!isLoggedIn) return;
    const days = getDaysInMonth(currentDate);
    const dateStrs = days.map(toLocalDateStr);

    const targetSet = new Set<string>();
    if (selectedDateStr) targetSet.add(selectedDateStr);

    reservations.forEach((r) => {
      if (r.status !== 'cancelled' && dateStrs.includes(r.date)) {
        targetSet.add(r.date);
      }
    });

    const datesToFetch = Array.from(targetSet).filter((d) => !sunsetDataMap[d]);
    if (datesToFetch.length > 0) {
      fetchSunsets(datesToFetch, sunsetSettings);
    }
  }, [currentDate, reservations, selectedDateStr, isLoggedIn, sunsetSettings, sunsetDataMap, fetchSunsets]);

  // カレンダーの月（currentDate）と集計レポートの対象月（reportMonth）を連動させる
  useEffect(() => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    setReportMonth(`${y}-${m}`);
  }, [currentDate]);

  useEffect(() => {
    if (isLoggedIn) {
      Promise.resolve().then(() => {
        fetchReport();
      });
    }
  }, [reportMonth, reservations, isLoggedIn, fetchReport]);

  // ログイン処理
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginId, password: loginPassword }),
      });
      if (res.ok) {
        localStorage.setItem('nighter_auth', 'true');
        setIsLoggedIn(true);
        showToast('ログインしました');
      } else {
        const errData = await res.json();
        setLoginError(errData.error || 'ログインに失敗しました');
      }
    } catch (err) {
      console.error(err);
      setLoginError('通信エラーが発生しました');
    } finally {
      setLoginLoading(false);
    }
  };

  // ログアウト処理
  const handleLogout = () => {
    if (confirm('ログアウトしますか？')) {
      localStorage.removeItem('nighter_auth');
      setIsLoggedIn(false);
      setLoginId('');
      setLoginPassword('');
      setLoginError('');
    }
  };

  // 会計分類の追加（DB / スプレッドシート保存）
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCategoryName.trim();
    if (!cleanName) return;
    if (categories.includes(cleanName)) {
      showToast('その分類は既に登録されています');
      return;
    }
    showToast('分類を追加中...', 0, true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName }),
      });
      if (res.ok) {
        await fetchCategories();
        setLedgerForm((prev) => ({ ...prev, category: cleanName }));
        setNewCategoryName('');
        showToast(`分類「${cleanName}」を追加しました`);
      } else {
        showToast('分類の追加に失敗しました');
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました');
    }
  };

  // 会計分類の削除（DB / スプレッドシート削除）
  const handleDeleteCategory = async (catToDelete: string) => {
    if (categories.length <= 1) {
      showToast('分類は最低1つ必要です');
      return;
    }
    if (confirm(`分類「${catToDelete}」を削除しますか？\n※既存の履歴に登録されている分類名はそのまま残ります。`)) {
      showToast('分類を削除中...', 0, true);
      try {
        const targetObj = categoryList.find((c) => c.name === catToDelete);
        const url = targetObj
          ? `/api/categories?id=${encodeURIComponent(targetObj.id)}`
          : `/api/categories?name=${encodeURIComponent(catToDelete)}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (res.ok) {
          await fetchCategories();
          showToast(`分類「${catToDelete}」を削除しました`);
        } else {
          showToast('分類の削除に失敗しました');
        }
      } catch (err) {
        console.error(err);
        showToast('通信エラーが発生しました');
      }
    }
  };

  // 会計月ナビゲーション
  const changeLedgerMonth = (diff: number) => {
    const [yStr, mStr] = ledgerMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + diff;
    if (m > 12) {
      y += 1;
      m = 1;
    } else if (m < 1) {
      y -= 1;
      m = 12;
    }
    setLedgerMonth(`${y}-${String(m).padStart(2, '0')}`);
    setShowAllLedgerMonths(false);
  };

  // 会計データの編集開始
  const handleEditLedger = (record: LedgerRecord) => {
    setEditingLedgerId(record.id);
    setLedgerForm({
      date: record.date,
      description: record.description,
      type: record.income > 0 ? 'income' : 'expense',
      amount: record.income > 0 ? record.income : record.expense,
      category: record.category,
    });
    // フォームが見える位置へスクロール
    const formEl = document.getElementById('ledger-form-section');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // 会計データ編集のキャンセル
  const handleCancelEditLedger = () => {
    setEditingLedgerId(null);
    setLedgerForm({
      date: toLocalDateStr(new Date()),
      description: '',
      type: 'expense',
      amount: 0,
      category: categories[0] || '雑費',
    });
  };

  // 会計データの削除
  const handleDeleteLedger = async (id: string) => {
    if (!confirm('この会計データを削除しますか？\n※残高は時系列で自動再計算されます。')) return;
    showToast('削除中...', 0, true);
    try {
      const res = await fetch(`/api/ledger/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchLedgerRecords();
        if (editingLedgerId === id) {
          handleCancelEditLedger();
        }
        showToast('会計データを削除しました');
      } else {
        showToast('削除に失敗しました');
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました');
    }
  };

  // 会計記帳登録・更新
  const handleSubmitLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerForm.description.trim()) {
      showToast('摘要を入力してください');
      return;
    }
    if (ledgerForm.amount <= 0) {
      showToast('金額は1円以上を入力してください');
      return;
    }
    showToast('保存中...', 0, true);
    try {
      const payload = {
        date: ledgerForm.date,
        description: ledgerForm.description,
        category: ledgerForm.category,
        income: ledgerForm.type === 'income' ? ledgerForm.amount : 0,
        expense: ledgerForm.type === 'expense' ? ledgerForm.amount : 0,
      };

      const url = editingLedgerId ? `/api/ledger/${editingLedgerId}` : '/api/ledger';
      const method = editingLedgerId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingLedgerId ? { id: editingLedgerId, ...payload } : payload),
      });

      if (res.ok) {
        await fetchLedgerRecords();
        handleCancelEditLedger();
        showToast(editingLedgerId ? '会計データを更新しました！' : '会計データを保存しました！');
      } else {
        const errData = await res.json();
        showToast(`エラー: ${errData.error || '保存に失敗しました'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました');
    }
  };

  const handleSubmitReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.reserverName) {
      showToast('保護者が登録されていません。設定画面から登録してください。');
      return;
    }
    showToast('保存中...', 0, true);
    try {
      const isEditing = !!editingReservationId;
      const payload = isEditing
        ? { id: editingReservationId, date: selectedDateStr, ...formData }
        : { date: selectedDateStr, ...formData };
      const res = await fetch('/api/records', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const savedRecord = await res.json();
        if (isEditing) {
          setReservations((prev) => prev.map((r) => r.id === editingReservationId ? savedRecord : r));
        } else {
          setReservations((prev) => [...prev, savedRecord]);
        }
        setIsFormOpen(false);
        setEditingReservationId(null);
        setFormData((prev) => {
          const currentFacility = facilities.find((f) => f.name === prev.facilityName);
          const defaultLightStart = currentFacility?.defaultLightStartTime || '';
          const calculatedHours = calculateLightHours(prev.courtStartTime, prev.courtEndTime, defaultLightStart);
          return {
            ...prev,
            // courtStartTime と courtEndTime は次回連続入力のためにクリアせず保持する
            lightStartTime: defaultLightStart,
            lightHours: calculatedHours,
            memo: '',
            feeType: (currentFacility && currentFacility.allowChildRate) ? '子供' : '大人',
            settlementStatus: '未返金',
            status: 'active',
          };
        });
        await fetchLedgerRecords(); // 会計も再フェッチ
        showToast(isEditing ? '予約を更新しました！' : '予約を保存しました！');
      } else {
        const errData = await res.json();
        showToast(`エラー: ${errData.error || '保存に失敗しました'}`);
      }
    } catch (err) {

      console.error(err);
      showToast('通信エラーが発生しました');
    }
  };

  // 予約編集を開始する
  const handleEditReservation = (r: Reservation) => {
    // 過去ステータスを正規化
    const normalizedSettlement = (r.settlementStatus === '精算済' || r.settlementStatus === '返金済')
      ? '返金済'
      : (r.settlementStatus === '窓口精算' ? '窓口精算' : '未返金');

    setFormData({
      facilityName: r.facilityName,
      reserverName: r.reserverName,
      courtStartTime: r.courtStartTime ? r.courtStartTime.slice(0, 5) : '',
      courtEndTime: r.courtEndTime ? r.courtEndTime.slice(0, 5) : '',
      lightHours: r.lightHours,
      lightStartTime: r.lightStartTime ? r.lightStartTime.slice(0, 5) : '',
      feeType: r.feeType,
      memo: r.memo,
      settlementStatus: normalizedSettlement as SettlementStatus,
      status: r.status,
    });
    setEditingReservationId(r.id);
    setSelectedDateStr(r.date);
    setIsFormOpen(true);
  };

  // 予約の返金/支払ステータス変更ハンドラ
  const handleChangeSettlementStatus = async (id: string, nextStatus: SettlementStatus) => {
    const targetReservation = reservations.find((r) => r.id === id);
    const currentStatus = targetReservation?.settlementStatus || '未返金';

    // 楽観的更新
    setReservations((prev) => prev.map((r) => r.id === id ? { ...r, settlementStatus: nextStatus } : r));
    if (selectedReservationAction && selectedReservationAction.id === id) {
      setSelectedReservationAction((prev) => prev ? { ...prev, settlementStatus: nextStatus } : null);
    }

    showToast('ステータス更新中...', 0, true);
    try {
      const res = await fetch(`/api/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlementStatus: nextStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setReservations((prev) => prev.map((r) => r.id === id ? updated : r));
        setSelectedReservationAction(null); // ステータス変更後にポップアップを閉じる
        await fetchLedgerRecords(); // 会計データを再取得
        showToast('ステータスを更新しました！');
      } else {
        setReservations((prev) => prev.map((r) => r.id === id ? { ...r, settlementStatus: currentStatus } : r));
        if (selectedReservationAction && selectedReservationAction.id === id) {
          setSelectedReservationAction((prev) => prev ? { ...prev, settlementStatus: currentStatus } : null);
        }
        showToast('ステータス更新に失敗しました');
      }
    } catch (err) {
      console.error(err);
      setReservations((prev) => prev.map((r) => r.id === id ? { ...r, settlementStatus: currentStatus } : r));
      if (selectedReservationAction && selectedReservationAction.id === id) {
        setSelectedReservationAction((prev) => prev ? { ...prev, settlementStatus: currentStatus } : null);
      }
      showToast('通信エラーが発生しました');
    }
  };

  // レポートタブ等での返金トグル（未返金 ⇔ 返金済）
  const handleToggleStatus = async (id: string, currentStatus: SettlementStatus) => {
    const isSettled = currentStatus === '精算済' || currentStatus === '返金済';
    const nextStatus: SettlementStatus = isSettled ? '未返金' : '返金済';
    await handleChangeSettlementStatus(id, nextStatus);
  };

  const handleToggleCancel = async (id: string, currentCancelStatus: 'active' | 'cancelled') => {
    const nextCancelStatus = currentCancelStatus === 'active' ? 'cancelled' : 'active';
    setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: nextCancelStatus } : r));
    if (selectedReservationAction && selectedReservationAction.id === id) {
      setSelectedReservationAction((prev) => prev ? { ...prev, status: nextCancelStatus } : null);
    }
    showToast('キャンセルステータス更新中...', 0, true);
    try {
      const res = await fetch(`/api/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextCancelStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setReservations((prev) => prev.map((r) => r.id === id ? updated : r));
        if (selectedReservationAction && selectedReservationAction.id === id) {
          setSelectedReservationAction(updated);
        }
        showToast(nextCancelStatus === 'cancelled' ? '予約をキャンセルしました' : '予約を復元しました');
      } else {
        setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: currentCancelStatus } : r));
        if (selectedReservationAction && selectedReservationAction.id === id) {
          setSelectedReservationAction((prev) => prev ? { ...prev, status: currentCancelStatus } : null);
        }
        showToast('キャンセル処理に失敗しました');
      }
    } catch (err) {
      console.error(err);
      setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: currentCancelStatus } : r));
      if (selectedReservationAction && selectedReservationAction.id === id) {
        setSelectedReservationAction((prev) => prev ? { ...prev, status: currentCancelStatus } : null);
      }
      showToast('通信エラーが発生しました');
    }
  };

  const handleToggleBulkStatus = async (reserverName: string, currentStatus: SettlementStatus) => {
    const isSettled = currentStatus === '精算済' || currentStatus === '返金済';
    const nextStatus: SettlementStatus = isSettled ? '未返金' : '返金済';
    // 楽観的 UI アップデート（窓口精算は除外して書き換える）
    setReservations((prev) =>
      prev.map((r) =>
        (r.date.startsWith(reportMonth) && r.reserverName === reserverName && r.settlementStatus !== '窓口精算')
          ? { ...r, settlementStatus: nextStatus }
          : r
      )
    );
    showToast('一括更新中...', 0, true);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: reportMonth,
          reserverName,
          settlementStatus: nextStatus,
        }),
      });
      if (res.ok) {
        await fetchReservations();
        await fetchLedgerRecords(); // 会計データを再取得
        showToast('一括返金ステータスを更新しました！');
      } else {
        await fetchReservations();
        showToast('一括更新に失敗しました');
      }
    } catch (err) {
      console.error(err);
      await fetchReservations();
      showToast('通信エラーが発生しました');
    }
  };

  // 予約の削除処理
  const handleDeleteReservation = async (id: string) => {
    if (!confirm('本当にこの予約を物理削除しますか？\nこの操作は取り消せません。')) return;
    showToast('削除中...', 0, true);
    try {
      const res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setReservations((prev) => prev.filter((r) => r.id !== id));
        showToast('予約を物理削除しました');
      } else {
        const err = await res.json();
        showToast(`エラー: ${err.error || '削除に失敗しました'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました');
    }
  };

  const handleSubmitFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    showToast('保存中...', 0, true);
    const method = isEditingFacility ? 'PUT' : 'POST';
    try {
      const res = await fetch('/api/facilities', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(facilityForm),
      });
      if (res.ok) {
        const saved = await res.json();
        if (isEditingFacility) {
          setFacilities((prev) => prev.map((f) => f.id === saved.id ? saved : f));
          setIsEditingFacility(false);
        } else {
          setFacilities((prev) => [...prev, saved]);
          if (!formData.facilityName) setFormData((prev) => ({ ...prev, facilityName: saved.name }));
        }
        setFacilityForm({ id: '', name: '', adultRatePerHour: 1000, childRatePerHour: 500, lightRatePerHour: 300, allowChildRate: true, defaultLightStartTime: '' });
        showToast('施設設定を保存しました');
      } else {
        const err = await res.json();
        showToast(`エラー: ${err.error || '保存できませんでした'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました');
    }
  };

  const handleDeleteFacility = async (id: string) => {
    if (!confirm('本当にこの施設を削除しますか？')) return;
    showToast('削除中...', 0, true);
    try {
      const res = await fetch(`/api/facilities?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFacilities((prev) => prev.filter((f) => f.id !== id));
        showToast('施設を削除しました');
      } else {
        showToast('施設の削除に失敗しました');
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました');
    }
  };

  const handleSubmitReserver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReserverName.trim()) return;
    showToast('登録中...', 0, true);
    try {
      const res = await fetch('/api/reservers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newReserverName }),
      });
      if (res.ok) {
        const saved = await res.json();
        setReservers((prev) => [...prev, saved]);
        setNewReserverName('');
        if (!formData.reserverName) setFormData((prev) => ({ ...prev, reserverName: saved.name }));
        showToast('保護者を登録しました');
      } else {
        const err = await res.json();
        showToast(`エラー: ${err.error || '登録できませんでした'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました');
    }
  };

  const handleDeleteReserver = async (id: string) => {
    if (!confirm('本当にこの保護者を削除しますか？')) return;
    showToast('削除中...', 0, true);
    try {
      const res = await fetch(`/api/reservers?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setReservers((prev) => prev.filter((r) => r.id !== id));
        showToast('保護者を削除しました');
      } else {
        showToast('保護者の削除に失敗しました');
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました');
    }
  };

  // 時間差分から照明時間を計算するヘルパー（1時間単位）
  const calculateLightHours = (courtStart: string, courtEnd: string, lightStart: string | undefined): number => {
    if (!lightStart || !courtStart || !courtEnd) return 0;

    const parseToMin = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const cStart = parseToMin(courtStart);
    let cEnd = parseToMin(courtEnd);
    let lStart = parseToMin(lightStart);

    // 日をまたぐコート時間の調整
    if (cEnd < cStart) cEnd += 24 * 60;

    // 照明開始時間がコート開始より前なら、コート開始時間から点灯とみなす
    // 照明開始時間がコート終了より後なら、点灯なし
    if (lStart < cStart) {
      lStart = cStart;
    }
    if (lStart >= cEnd) return 0;

    const diffMin = cEnd - lStart;
    return Math.max(0, Math.ceil(diffMin / 60)); // 1時間単位に切り上げ
  };

  const handleFacilityChange = (name: string) => {
    const facility = facilities.find((f) => f.name === name);
    const defaultLightStart = facility?.defaultLightStartTime || '';
    setFormData((prev) => {
      const calculatedHours = calculateLightHours(prev.courtStartTime, prev.courtEndTime, defaultLightStart);
      return {
        ...prev,
        facilityName: name,
        feeType: (facility && facility.allowChildRate) ? '子供' : '大人',
        lightStartTime: defaultLightStart,
        lightHours: calculatedHours,
      };
    });
  };

  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // カレンダー構築
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];

    for (let i = firstDay.getDay(); i > 0; i--) days.push(new Date(year, month, 1 - i));
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) days.push(new Date(year, month + 1, i));
    return days;
  };

  const changeMonth = (offset: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
  };

  const getReservationsForDate = (dateStr: string) => reservations.filter((r) => r.date === dateStr);

  // 保護者名から苗字のみを抽出する（モバイル表示用）
  const getLastName = (fullName: string) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/[\s　]+/);
    if (parts.length > 1) {
      return parts[0];
    }
    return fullName.length > 3 ? fullName.slice(0, 2) : fullName;
  };

  const calendarDays = getDaysInMonth(currentDate);
  const selectedDate = new Date(selectedDateStr + 'T00:00:00');

  // LINE共有用テキスト生成
  const generateLineShareText = (): string => {
    if (report.length === 0) return '';
    const monthParts = reportMonth.split('-');
    const monthNum = parseInt(monthParts[1], 10);
    let text = `【${monthNum}月分 ナイター費精算】\n`;

    for (const parent of report) {
      text += `\n━━━━━━━━━━━━\n`;
      text += `👤 ${parent.reserverName}さん\n`;

      for (const r of parent.reservations) {
        if (r.status === 'cancelled') continue;
        const dateParts = r.date.split('-');
        const dateLabel = `${parseInt(dateParts[1], 10)}/${parseInt(dateParts[2], 10)}`;
        const durationMinutes = (() => {
          const [sh, sm] = r.courtStartTime.split(':').map(Number);
          const [eh, em] = r.courtEndTime.split(':').map(Number);
          let diff = (eh * 60 + em) - (sh * 60 + sm);
          if (diff < 0) diff += 24 * 60;
          return diff;
        })();
        const durationHours = durationMinutes / 60;
        const durationLabel = Number.isInteger(durationHours) ? `${durationHours}時間` : `${durationHours}時間`;

        text += `\n■${dateLabel} (${r.facilityName})\n`;
        text += `コート代: ${durationLabel} (${r.feeType}料金) = ${r.courtFee.toLocaleString()}円\n`;
        if (r.lightHours > 0) {
          text += `照明代: ${r.lightHours}時間 = ${r.lightFee.toLocaleString()}円\n`;
        }
        if (r.memo) {
          text += `メモ: ${r.memo}\n`;
        }
        if (r.settlementStatus === '窓口精算') {
          text += `【小計: ${r.totalFee.toLocaleString()}円】（窓口精算済み・返金対象外）\n`;
        } else {
          text += `【小計: ${r.totalFee.toLocaleString()}円】\n`;
        }
      }

      text += `\n■合計返金額: ${parent.totalAmount.toLocaleString()}円\n`;
    }

    return text;
  };
  const currentDayReservations = getReservationsForDate(selectedDateStr);
  const selectedFacilityObj = facilities.find((f) => f.name === formData.facilityName);

  // 照明利用時間の選択肢（0〜6時間, 1時間刻み）
  const lightHoursOptions = Array.from({ length: 7 }, (_, i) => i);

  // 料金種別のラベル生成（施設に応じた単価も表示）
  const getFeeTypeLabel = (type: FeeType) => {
    if (!selectedFacilityObj) return type === '大人' ? '大人料金' : '子供料金';
    const rate = type === '大人'
      ? selectedFacilityObj.adultRatePerHour
      : selectedFacilityObj.childRatePerHour;
    return `${type === '大人' ? '大人' : '子供'}料金 (${rate.toLocaleString()}円/時)`;
  };

  // 認証のローディング中
  if (isAuthChecking) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // 簡易ログイン画面
  if (!isLoggedIn) {
    return (
      <main className="container" style={{ display: 'flex', minHeight: '80vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
          <header className="app-header" style={{ padding: '0 0 1.5rem 0', marginBottom: 0 }}>
            <h1 className="app-title">Tennis Nighter</h1>
            <p className="app-subtitle">テニス部ナイター費精算管理システム</p>
          </header>

          <form onSubmit={handleLogin}>
            <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', textAlign: 'center', color: 'var(--color-secondary)' }}>
              ログイン
            </h3>

            {loginError && (
              <div style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid var(--color-accent)',
                color: 'var(--color-text-main)',
                fontSize: '0.875rem',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                textAlign: 'center'
              }}>
                {loginError}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">ユーザーID</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="User ID"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">パスワード</label>
              <input
                type="password"
                className="form-input"
                required
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '1.5rem' }} disabled={loginLoading}>
              {loginLoading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ログイン後のメイン画面
  return (
    <main className="container">
      <header className="app-header" style={{ position: 'relative' }}>
        <button
          className="btn btn-secondary"
          style={{
            position: 'absolute',
            top: '5px',
            right: '0',
            width: 'auto',
            padding: '4px 10px',
            fontSize: '0.75rem',
            borderColor: 'rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.03)'
          }}
          onClick={handleLogout}
        >
          ログアウト
        </button>
        <h1 className="app-title">Tennis Nighter</h1>
        <p className="app-subtitle">テニス部ナイター費精算管理システム</p>
      </header>

      {/* タブナビゲーション */}
      <nav className="tab-container">
        <button className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
          カレンダー
        </button>
        <button className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`} onClick={() => setActiveTab('ledger')}>
          会計管理
        </button>
        <button className={`tab-btn ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>
          レポート
        </button>
        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          設定
        </button>
      </nav>

      {/* ─── カレンダータブ ─── */}
      {activeTab === 'calendar' && (
        <section>
          <div className="card">
            <div className="calendar">
              <div className="calendar-header">
                <button className="calendar-nav-btn" onClick={() => changeMonth(-1)}>&lt; 前月</button>
                <h2 className="calendar-month-title">
                  {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
                </h2>
                <button className="calendar-nav-btn" onClick={() => changeMonth(1)}>翌月 &gt;</button>
              </div>

              <div className="calendar-grid">
                {['日', '月', '火', '水', '木', '金', '土'].map((d) => (
                  <div key={d} className="calendar-day-label">{d}</div>
                ))}

                {calendarDays.map((day, idx) => {
                  const dayStr = toLocalDateStr(day);
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const isSelected = dayStr === selectedDateStr;
                  const isToday = dayStr === toLocalDateStr(new Date());
                  const dayReservations = getReservationsForDate(dayStr);

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedDateStr(dayStr)}
                      className={`calendar-day ${isCurrentMonth ? '' : 'outside'} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                      style={{ display: 'flex', flexDirection: 'column', minHeight: '64px', position: 'relative' }}
                    >
                      {/* 1. 日付 */}
                      <span className="day-number" style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                        {day.getDate()}
                      </span>

                      {/* 2. 予約情報（日付の直下に固定配置） */}
                      {dayReservations.length > 0 && (
                        sunsetSettings.showOnCalendar ? (
                          /* 日没表示ON時: 日付の直下に固定配置（下に張り付かないよう marginTop: 3px） */
                          <div style={{
                            display: 'flex',
                            gap: '2px',
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginTop: '3px',
                            flexWrap: 'wrap',
                            maxWidth: '100%',
                            maxHeight: '1.5em',
                            overflow: 'hidden',
                          }}>
                            {dayReservations.map((r) => {
                              const isCancelled = r.status === 'cancelled';
                              const isSettled = r.settlementStatus === '精算済' || r.settlementStatus === '返金済';
                              const isCounter = r.settlementStatus === '窓口精算';
                              const statusClass = isCounter ? 'counter' : (isSettled ? 'settled' : 'unsettled');
                              return (
                                <span
                                  key={r.id}
                                  className={`day-reserver-name ${statusClass}`}
                                  style={{
                                    fontSize: '0.55rem',
                                    lineHeight: 1,
                                    padding: 0,
                                    borderRadius: '50%',
                                    textDecoration: isCancelled ? 'line-through' : 'none',
                                    opacity: isCancelled ? 0.35 : 1,
                                    background: 'transparent',
                                    border: 'none',
                                    margin: 0,
                                    display: 'inline-block',
                                  }}
                                  title={`${isCancelled ? '（消）' : ''}${r.reserverName} (${r.facilityName} ${r.courtStartTime}〜)`}
                                >
                                  ●
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          /* 日没表示OFF時: 従来の名前リスト表示 */
                          <div className="day-reserver-list">
                            {dayReservations.map((r) => {
                              const isCancelled = r.status === 'cancelled';
                              const isSettled = r.settlementStatus === '精算済' || r.settlementStatus === '返金済';
                              const isCounter = r.settlementStatus === '窓口精算';
                              const statusClass = isCounter ? 'counter' : (isSettled ? 'settled' : 'unsettled');
                              return (
                                <div
                                  key={r.id}
                                  className={`day-reserver-name ${statusClass}`}
                                  style={{
                                    textDecoration: isCancelled ? 'line-through' : 'none',
                                    opacity: isCancelled ? 0.45 : 1,
                                  }}
                                >
                                  {isCancelled ? '（消）' : ''}{r.reserverName}
                                </div>
                              );
                            })}
                          </div>
                        )
                      )}

                      {/* 3. 日没時間エリア（表示ON時は領域を固定確保し、ドットが上に押し上げられる位置ズレを防ぐ） */}
                      {sunsetSettings.showOnCalendar && (
                        <div style={{ marginTop: 'auto', minHeight: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {(dayReservations.some((r) => r.status !== 'cancelled') || isSelected) && sunsetDataMap[dayStr] && (
                            <div
                              title={`日没・薄明時刻 (${sunsetSettings.locationName})`}
                              style={{
                                fontSize: '0.7rem',
                                color: '#f59e0b',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '2px',
                              }}
                            >
                              <span>🌅</span>
                              <span>{sunsetDataMap[dayStr]}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 選択した日の予約一覧 ＆ 新規登録 */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem' }}>{selectedDateStr} の予約</h3>
              <button
                className="btn btn-primary"
                style={{ width: 'auto', padding: '6px 14px', fontSize: '0.85rem' }}
                onClick={() => {
                  setEditingReservationId(null);
                  setFormData({
                    facilityName: facilities[0]?.name || '',
                    reserverName: reservers[0]?.name || '',
                    courtStartTime: '18:00',
                    courtEndTime: '20:00',
                    lightHours: 0,
                    lightStartTime: '',
                    feeType: facilities[0]?.allowChildRate ? '子供' : '大人',
                    memo: '',
                    settlementStatus: '未返金',
                    status: 'active',
                  });
                  setIsFormOpen(true);
                }}
              >
                ＋ 予約を追加
              </button>
            </div>

            {/* 予約入力フォーム（モーダル／インライン） */}
            {isFormOpen && (
              <form onSubmit={handleSubmitReservation} style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--color-primary)' }}>
                  {editingReservationId ? '予約内容を編集' : '新規予約を登録'}
                </h4>

                {/* 利用施設 */}
                <div className="form-group">
                  <label className="form-label">利用施設</label>
                  <select
                    className="form-select"
                    required
                    value={formData.facilityName}
                    onChange={(e) => {
                      const fac = facilities.find((f) => f.name === e.target.value);
                      setFormData((prev) => {
                        const calculatedHours = calculateLightHours(prev.courtStartTime, prev.courtEndTime, fac?.defaultLightStartTime || '');
                        return {
                          ...prev,
                          facilityName: e.target.value,
                          feeType: fac && !fac.allowChildRate ? '大人' : prev.feeType,
                          lightStartTime: fac?.defaultLightStartTime || '',
                          lightHours: calculatedHours,
                        };
                      });
                    }}
                  >
                    {facilities.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                  </select>
                </div>

                {/* 保護者名 */}
                <div className="form-group">
                  <label className="form-label">保護者名 (予約者)</label>
                  {reservers.length === 0 ? (
                    <p style={{ color: 'var(--color-accent)', fontSize: '0.875rem', padding: '0.5rem 0' }}>
                      ※保護者が登録されていません。「設定」タブから登録してください。
                    </p>
                  ) : (
                    <select className="form-select" required value={formData.reserverName} onChange={(e) => setFormData((prev) => ({ ...prev, reserverName: e.target.value }))}>
                      <option value="" disabled>保護者を選択してください</option>
                      {reservers.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                    </select>
                  )}
                </div>

                {/* 料金種別 */}
                <div className="form-group">
                  <label className="form-label">料金種別</label>
                  <select
                    className="form-select"
                    value={formData.feeType}
                    disabled={selectedFacilityObj ? !selectedFacilityObj.allowChildRate : false}
                    onChange={(e) => setFormData((prev) => ({ ...prev, feeType: e.target.value as FeeType }))}
                  >
                    <option value="大人">{getFeeTypeLabel('大人')}</option>
                    {selectedFacilityObj?.allowChildRate && (
                      <option value="子供">{getFeeTypeLabel('子供')}</option>
                    )}
                  </select>
                  {selectedFacilityObj && !selectedFacilityObj.allowChildRate && (
                    <p className="help-text">※選択した施設は大人料金のみ適用可能です。</p>
                  )}
                </div>

                {/* 支払方法 / 返金ステータス */}
                <div className="form-group">
                  <label className="form-label">支払方法 / 返金ステータス</label>
                  <select
                    className="form-select"
                    value={formData.settlementStatus}
                    onChange={(e) => setFormData((prev) => ({ ...prev, settlementStatus: e.target.value as SettlementStatus }))}
                  >
                    <option value="未返金">立替払い（未返金）</option>
                    <option value="返金済">立替払い（返金済）</option>
                    <option value="窓口精算">窓口精算</option>
                  </select>
                  <p className="help-text">
                    {formData.settlementStatus === '窓口精算'
                      ? '※窓口精算の予約は、保護者別の立替・返金額集計から除外されます。'
                      : '※立替払いの予約は、保護者別の立替・返金額集計の対象となります。'}
                  </p>
                </div>

                {/* コート利用時間 */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">コート利用開始</label>
                    <input
                      type="time"
                      className="form-input"
                      required
                      value={formData.courtStartTime}
                      onChange={(e) => {
                        const start = e.target.value;
                        setFormData((prev) => {
                          const calculatedHours = calculateLightHours(start, prev.courtEndTime, prev.lightStartTime);
                          return { ...prev, courtStartTime: start, lightHours: calculatedHours };
                        });
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">コート利用終了</label>
                    <input
                      type="time"
                      className="form-input"
                      required
                      value={formData.courtEndTime}
                      onChange={(e) => {
                        const end = e.target.value;
                        setFormData((prev) => {
                          const calculatedHours = calculateLightHours(prev.courtStartTime, end, prev.lightStartTime);
                          return { ...prev, courtEndTime: end, lightHours: calculatedHours };
                        });
                      }}
                    />
                  </div>
                </div>

                {/* 照明利用開始時間 */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">
                      照明利用開始時間 (任意)
                    </label>
                    <input
                      type="time"
                      className="form-input"
                      value={formData.lightStartTime}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData((prev) => {
                          const calculatedHours = calculateLightHours(prev.courtStartTime, prev.courtEndTime, val);
                          return { ...prev, lightStartTime: val, lightHours: calculatedHours };
                        });
                      }}
                    />
                    <p className="help-text" style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--color-text-muted)' }}>
                      ※コート終了時間までの照明時間が自動計算されます
                    </p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      照明利用時間 (時間単位)
                      {selectedFacilityObj && selectedFacilityObj.lightRatePerHour > 0 && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem', fontWeight: 400 }}>
                          ({selectedFacilityObj.lightRatePerHour.toLocaleString()}円/時)
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      className="form-input"
                      value={formData.lightHours}
                      onChange={(e) => setFormData((prev) => ({ ...prev, lightHours: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                    />
                  </div>
                </div>

                {/* メモ欄 */}
                <div className="form-group">
                  <label className="form-label">メモ (コート番号など自由記入)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="例: コートA利用、雨天中断など"
                    value={formData.memo}
                    onChange={(e) => setFormData((prev) => ({ ...prev, memo: e.target.value }))}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    {editingReservationId ? '更新する' : '登録する'}
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setIsFormOpen(false)}>
                    キャンセル
                  </button>
                </div>
              </form>
            )}

            {/* 当日の予約カードリスト */}
            {currentDayReservations.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>
                この日の予約はありません
              </p>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {currentDayReservations.map((r) => {
                    const isCancelled = r.status === 'cancelled';
                    const isSettled = r.settlementStatus === '精算済' || r.settlementStatus === '返金済';
                    const isCounter = r.settlementStatus === '窓口精算';
                    const isEditingThis = editingReservationId === r.id;

                    return (
                      <div
                        key={r.id}
                        className="reservation-item clickable"
                        onClick={() => setSelectedReservationAction(r)}
                        style={{
                          opacity: isCancelled ? 0.6 : 1,
                          background: isEditingThis
                            ? 'rgba(6, 182, 212, 0.12)'
                            : (isCancelled ? 'rgba(255, 255, 255, 0.02)' : undefined),
                          borderLeft: isCancelled
                            ? '3px solid var(--color-text-muted)'
                            : (isCounter ? '3px solid var(--color-secondary)' : undefined),
                        }}
                        title="タップして操作メニューを表示"
                      >
                        <div className="reservation-item-header">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: '1.05rem', textDecoration: isCancelled ? 'line-through' : 'none' }}>
                                {r.reserverName}
                              </span>
                              {isCancelled && (
                                <span style={{ fontSize: '0.75rem', background: 'rgba(244,63,94,0.15)', color: 'var(--color-accent)', padding: '2px 6px', borderRadius: '4px' }}>
                                  キャンセル済み
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                              <span className="facility-badge">{r.facilityName}</span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>({r.feeType})</span>
                            </div>
                          </div>
                          <div>
                            {isCounter ? (
                              <span className="status-badge counter">窓口精算</span>
                            ) : isSettled ? (
                              <span className="status-badge settled">返金済</span>
                            ) : (
                              <span className="status-badge unsettled">未返金</span>
                            )}
                          </div>
                        </div>

                        {/* コート利用詳細 */}
                        <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.82rem', color: 'var(--color-text-muted)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                          <span>⏰ {r.courtStartTime}〜{r.courtEndTime}</span>
                          {r.lightHours > 0 && (
                            <span>💡 照明 {r.lightHours}時間{r.lightStartTime ? `（${r.lightStartTime}〜）` : ''}</span>
                          )}
                          <span style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>
                            💴 コート {r.courtFee.toLocaleString()}円
                            {r.lightHours > 0 && ` + 照明 ${r.lightFee.toLocaleString()}円`}
                            {' = '}
                            <span style={{ color: 'var(--color-secondary)' }}>{r.totalFee.toLocaleString()}円</span>
                          </span>
                        </div>
                        {r.memo && (
                          <div className="reservation-memo">📝 {r.memo}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 予約データ選択・操作ポップアップモーダル */}
          {selectedReservationAction && (
            <div
              className="action-modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setSelectedReservationAction(null);
                }
              }}
            >
              <div className="action-modal-card" role="dialog" aria-modal="true" aria-labelledby="reservation-action-title">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h4 id="reservation-action-title" style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>⚙️</span> 予約データの操作
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSelectedReservationAction(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      fontSize: '1.25rem',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      lineHeight: 1,
                    }}
                    aria-label="閉じる"
                  >
                    ✕
                  </button>
                </div>

                {/* プレビュー表示 */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      📅 {selectedReservationAction.date}
                    </span>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <span className="facility-badge" style={{ fontSize: '0.75rem' }}>
                        {selectedReservationAction.facilityName}
                      </span>
                      <span style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-text-muted)',
                        background: 'rgba(255,255,255,0.06)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}>
                        {selectedReservationAction.feeType}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, textDecoration: selectedReservationAction.status === 'cancelled' ? 'line-through' : 'none' }}>
                      {selectedReservationAction.reserverName}
                    </span>
                    {selectedReservationAction.status === 'cancelled' && (
                      <span style={{ fontSize: '0.75rem', background: 'rgba(244,63,94,0.15)', color: 'var(--color-accent)', padding: '2px 6px', borderRadius: '4px' }}>
                        キャンセル済み
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                    ⏰ {selectedReservationAction.courtStartTime}〜{selectedReservationAction.courtEndTime}
                    {selectedReservationAction.lightHours > 0 && ` | 照明 ${selectedReservationAction.lightHours}時間`}
                  </div>

                  {selectedReservationAction.memo && (
                    <div className="reservation-memo" style={{ marginBottom: '0.5rem' }}>
                      📝 {selectedReservationAction.memo}
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    paddingTop: '0.5rem',
                    marginTop: '0.5rem'
                  }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>合計金額</span>
                    <span style={{
                      fontSize: '1.35rem',
                      fontWeight: 700,
                      color: 'var(--color-secondary)'
                    }}>
                      {selectedReservationAction.totalFee.toLocaleString()} 円
                    </span>
                  </div>
                </div>

                {/* ステータス切替セクション */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
                    支払・返金ステータスの変更
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => handleChangeSettlementStatus(selectedReservationAction.id, '未返金')}
                      style={{
                        padding: '8px 4px',
                        fontSize: '0.78rem',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        border: (selectedReservationAction.settlementStatus === '未返金' || selectedReservationAction.settlementStatus === '未精算')
                          ? '2px solid var(--color-accent)'
                          : '1px solid rgba(255,255,255,0.1)',
                        background: (selectedReservationAction.settlementStatus === '未返金' || selectedReservationAction.settlementStatus === '未精算')
                          ? 'rgba(244, 63, 94, 0.25)'
                          : 'rgba(255,255,255,0.04)',
                        color: (selectedReservationAction.settlementStatus === '未返金' || selectedReservationAction.settlementStatus === '未精算')
                          ? 'var(--color-accent)'
                          : 'var(--color-text-muted)',
                      }}
                    >
                      {(selectedReservationAction.settlementStatus === '未返金' || selectedReservationAction.settlementStatus === '未精算') ? '● 未返金' : '未返金'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChangeSettlementStatus(selectedReservationAction.id, '返金済')}
                      style={{
                        padding: '8px 4px',
                        fontSize: '0.78rem',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        border: (selectedReservationAction.settlementStatus === '返金済' || selectedReservationAction.settlementStatus === '精算済')
                          ? '2px solid var(--color-success)'
                          : '1px solid rgba(255,255,255,0.1)',
                        background: (selectedReservationAction.settlementStatus === '返金済' || selectedReservationAction.settlementStatus === '精算済')
                          ? 'rgba(16, 185, 129, 0.25)'
                          : 'rgba(255,255,255,0.04)',
                        color: (selectedReservationAction.settlementStatus === '返金済' || selectedReservationAction.settlementStatus === '精算済')
                          ? 'var(--color-success)'
                          : 'var(--color-text-muted)',
                      }}
                    >
                      {(selectedReservationAction.settlementStatus === '返金済' || selectedReservationAction.settlementStatus === '精算済') ? '● 返金済' : '返金済'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChangeSettlementStatus(selectedReservationAction.id, '窓口精算')}
                      style={{
                        padding: '8px 4px',
                        fontSize: '0.78rem',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        border: selectedReservationAction.settlementStatus === '窓口精算'
                          ? '2px solid var(--color-secondary)'
                          : '1px solid rgba(255,255,255,0.1)',
                        background: selectedReservationAction.settlementStatus === '窓口精算'
                          ? 'rgba(6, 182, 212, 0.25)'
                          : 'rgba(255,255,255,0.04)',
                        color: selectedReservationAction.settlementStatus === '窓口精算'
                          ? 'var(--color-secondary)'
                          : 'var(--color-text-muted)',
                      }}
                    >
                      {selectedReservationAction.settlementStatus === '窓口精算' ? '● 窓口精算' : '窓口精算'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.35rem', marginBottom: 0 }}>
                    ※ 窓口精算は保護者への返金集計から除外されます
                  </p>
                </div>

                {/* 操作ボタン */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      background: 'linear-gradient(135deg, var(--color-secondary), #0284c7)',
                      boxShadow: '0 0 15px rgba(6, 182, 212, 0.3)',
                      padding: '0.8rem 1rem',
                      fontSize: '0.95rem',
                    }}
                    onClick={() => {
                      const r = selectedReservationAction;
                      setSelectedReservationAction(null);
                      handleEditReservation(r);
                    }}
                  >
                    ✏️ この予約を編集する
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{
                        padding: '0.7rem 0.5rem',
                        fontSize: '0.85rem',
                        borderColor: selectedReservationAction.status === 'cancelled' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.15)',
                        color: selectedReservationAction.status === 'cancelled' ? 'var(--color-success)' : 'var(--color-text-main)',
                      }}
                      onClick={() => {
                        const r = selectedReservationAction;
                        handleToggleCancel(r.id, r.status);
                      }}
                    >
                      {selectedReservationAction.status === 'cancelled' ? '↩️ 予約を復元' : '🚫 予約取消'}
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{
                        padding: '0.7rem 0.5rem',
                        fontSize: '0.85rem',
                        color: 'var(--color-accent)',
                        borderColor: 'rgba(244, 63, 94, 0.4)',
                      }}
                      onClick={() => {
                        const r = selectedReservationAction;
                        setSelectedReservationAction(null);
                        handleDeleteReservation(r.id);
                      }}
                    >
                      🗑️ 削除する
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ─── 会計管理タブ ─── */}
      {activeTab === 'ledger' && (() => {
        // 全期間の財布の残高（総収入 - 総支出）
        const walletBalance = ledgerRecords.reduce((sum, r) => sum + r.income - r.expense, 0);

        // 表示対象レコード（月別または全期間）
        const displayedLedgerRecords = showAllLedgerMonths
          ? [...ledgerRecords].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
          : [...ledgerRecords]
            .filter((r) => r.date.startsWith(ledgerMonth))
            .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

        const monthIncome = displayedLedgerRecords.reduce((sum, r) => sum + r.income, 0);
        const monthExpense = displayedLedgerRecords.reduce((sum, r) => sum + r.expense, 0);
        const monthDiff = monthIncome - monthExpense;

        const [lYear, lMonth] = ledgerMonth.split('-');

        return (
          <section>
            {/* 現在の残高（財布の中身）表示 */}
            <div className="card" style={{
              background: 'linear-gradient(135deg, rgba(20, 26, 46, 0.85) 0%, rgba(139, 92, 246, 0.15) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              textAlign: 'center',
              padding: '1.75rem'
            }}>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontWeight: 500 }}>
                現在の財布の残高 (全期間合計)
              </h3>
              <div style={{
                fontSize: '2.5rem',
                fontWeight: 700,
                color: '#fff',
                textShadow: '0 0 15px rgba(255,255,255,0.1)',
                background: 'linear-gradient(135deg, #fff, var(--color-secondary))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {walletBalance.toLocaleString()}円
              </div>
            </div>

            {/* 月別集計・月ナビゲーション */}
            <div className="card" style={{ padding: '1.25rem' }}>
              {/* カレンダー画面に統一した月ナビゲーション（前月:左, 年月:中央, 翌月:右） */}
              <div className="calendar-header" style={{ marginBottom: '1rem' }}>
                <button className="calendar-nav-btn" onClick={() => changeLedgerMonth(-1)} title="前月">&lt; 前月</button>
                <h2 className="calendar-month-title" style={{ fontSize: '1.25rem', margin: 0, textAlign: 'center' }}>
                  {showAllLedgerMonths ? '全期間' : `${lYear}年 ${parseInt(lMonth, 10)}月`}
                </h2>
                <button className="calendar-nav-btn" onClick={() => changeLedgerMonth(1)} title="翌月">翌月 &gt;</button>
              </div>

              {/* 年月セレクタと全期間トグル（中央揃え） */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <input
                  type="month"
                  className="form-input"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '0.85rem' }}
                  value={ledgerMonth}
                  onChange={(e) => {
                    if (e.target.value) {
                      setLedgerMonth(e.target.value);
                      setShowAllLedgerMonths(false);
                    }
                  }}
                />
                <button
                  className="btn btn-secondary"
                  style={{
                    width: 'auto',
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    borderColor: showAllLedgerMonths ? 'var(--color-primary)' : 'rgba(255,255,255,0.15)',
                    color: showAllLedgerMonths ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    background: showAllLedgerMonths ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                  }}
                  onClick={() => setShowAllLedgerMonths((prev) => !prev)}
                >
                  {showAllLedgerMonths ? '月別表示に戻す' : '全期間表示'}
                </button>
              </div>

              {/* 月別サマリーカード（中央揃え） */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.75rem',
                maxWidth: '600px',
                margin: '0 auto',
              }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '0.85rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                    {showAllLedgerMonths ? '全期間 収入' : `${parseInt(lMonth, 10)}月 収入`}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success)' }}>
                    +{monthIncome.toLocaleString()}円
                  </div>
                </div>
                <div style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)', borderRadius: '10px', padding: '0.85rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                    {showAllLedgerMonths ? '全期間 支出' : `${parseInt(lMonth, 10)}月 支出`}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                    -{monthExpense.toLocaleString()}円
                  </div>
                </div>
                <div style={{
                  background: monthDiff >= 0 ? 'rgba(6, 182, 212, 0.08)' : 'rgba(244, 63, 94, 0.08)',
                  border: `1px solid ${monthDiff >= 0 ? 'rgba(6, 182, 212, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
                  borderRadius: '10px',
                  padding: '0.85rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                    {showAllLedgerMonths ? '全期間 収支差額' : `${parseInt(lMonth, 10)}月 収支差額`}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: monthDiff >= 0 ? 'var(--color-secondary)' : 'var(--color-accent)' }}>
                    {monthDiff >= 0 ? `+${monthDiff.toLocaleString()}円` : `${monthDiff.toLocaleString()}円`}
                  </div>
                </div>
              </div>
            </div>

            {/* 入力・編集フォーム */}
            <div className="card" id="ledger-form-section">
              {editingLedgerId && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.6rem 0.85rem',
                  marginBottom: '1rem',
                  borderRadius: '8px',
                  background: 'rgba(6, 182, 212, 0.12)',
                  border: '1px solid rgba(6, 182, 212, 0.35)',
                  color: 'var(--color-secondary)',
                  fontSize: '0.85rem',
                  flexWrap: 'wrap',
                }}>
                  <span style={{ fontWeight: 600 }}>✏️ 会計データを編集中です</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '3px 10px', fontSize: '0.75rem' }}
                    onClick={handleCancelEditLedger}
                  >
                    編集をキャンセル
                  </button>
                </div>
              )}
              <h3 style={{ marginBottom: '1.25rem', color: 'var(--color-secondary)', fontSize: '1.1rem', textAlign: 'center' }}>
                {editingLedgerId ? '収支データを編集' : '収支を登録'}
              </h3>
              <form onSubmit={handleSubmitLedger}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">日付</label>
                    <input
                      type="date"
                      className="form-input"
                      required
                      value={ledgerForm.date}
                      onChange={(e) => setLedgerForm((prev) => ({ ...prev, date: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">区分</label>
                    <select
                      className="form-select"
                      value={ledgerForm.type}
                      onChange={(e) => setLedgerForm((prev) => ({ ...prev, type: e.target.value as 'income' | 'expense' }))}
                    >
                      <option value="expense">支出 (支払い)</option>
                      <option value="income">収入 (受け取り)</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">分類</label>
                    <select
                      className="form-select"
                      value={ledgerForm.category}
                      onChange={(e) => setLedgerForm((prev) => ({ ...prev, category: e.target.value }))}
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">金額 (円)</label>
                    <input
                      type="number"
                      className="form-input"
                      required
                      min="1"
                      placeholder="金額を入力"
                      value={ledgerForm.amount || ''}
                      onChange={(e) => setLedgerForm((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">摘要 (メモ)</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="例: ボール購入、7月分部費回収など"
                    value={ledgerForm.description}
                    onChange={(e) => setLedgerForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    {editingLedgerId ? '更新する' : '登録する'}
                  </button>
                  {editingLedgerId && (
                    <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={handleCancelEditLedger}>
                      キャンセル
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* 会計履歴一覧 */}
            <div className="card" style={{ padding: '1rem 0.5rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1rem', padding: '0 0.75rem' }}>
                <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{showAllLedgerMonths ? '会計履歴一覧 (全期間)' : `${parseInt(lMonth, 10)}月の会計履歴一覧`}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 'normal', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '12px' }}>
                    {displayedLedgerRecords.length} 件
                  </span>
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.35rem 0 0 0' }}>
                  ※ データをタップすると編集・削除ができます
                </p>
              </div>
              {displayedLedgerRecords.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                  {showAllLedgerMonths ? '会計データはありません' : `${lYear}年${parseInt(lMonth, 10)}月の会計データはありません`}
                </p>
              ) : (
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--color-text-muted)' }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600 }}>日付</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600 }}>摘要 / 分類</th>
                        <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 600 }}>収支</th>
                        <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 600 }}>残高</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedLedgerRecords.map((record) => {
                        const isIncome = record.income > 0;
                        const isEditingThis = editingLedgerId === record.id;
                        return (
                          <tr
                            key={record.id}
                            className="ledger-table-row"
                            onClick={() => setSelectedLedgerAction(record)}
                            style={{
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              background: isEditingThis ? 'rgba(6, 182, 212, 0.12)' : undefined,
                            }}
                            title="タップして編集または削除"
                          >
                            {/* 日付 */}
                            <td style={{ padding: '12px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                              {record.date.replace(/^\d{4}-/, '')}
                            </td>
                            {/* 摘要・分類 */}
                            <td style={{ padding: '12px 8px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 500, wordBreak: 'break-all' }}>{record.description}</div>
                              <span style={{
                                fontSize: '0.72rem',
                                color: 'var(--color-text-muted)',
                                background: 'rgba(255,255,255,0.04)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                display: 'inline-block',
                                marginTop: '2px'
                              }}>
                                {record.category}
                              </span>
                            </td>
                            {/* 金額 */}
                            <td style={{
                              padding: '12px 8px',
                              textAlign: 'right',
                              verticalAlign: 'middle',
                              fontWeight: 600,
                              color: isIncome ? 'var(--color-success)' : 'var(--color-accent)',
                              whiteSpace: 'nowrap'
                            }}>
                              {isIncome ? `+${record.income.toLocaleString()}` : `-${record.expense.toLocaleString()}`}
                            </td>
                            {/* 残高 */}
                            <td style={{
                              padding: '12px 8px',
                              textAlign: 'right',
                              verticalAlign: 'middle',
                              color: 'var(--color-text-muted)',
                              whiteSpace: 'nowrap'
                            }}>
                              {record.balance.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 会計データ選択・操作ポップアップモーダル */}
            {selectedLedgerAction && (
              <div
                className="action-modal-backdrop"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setSelectedLedgerAction(null);
                  }
                }}
              >
                <div className="action-modal-card" role="dialog" aria-modal="true" aria-labelledby="ledger-action-title">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h4 id="ledger-action-title" style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>⚙️</span> 会計データの操作
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSelectedLedgerAction(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        fontSize: '1.25rem',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        lineHeight: 1,
                      }}
                      aria-label="閉じる"
                    >
                      ✕
                    </button>
                  </div>

                  {/* プレビュー表示 */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '0.75rem',
                    padding: '1rem',
                    marginBottom: '1.25rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        📅 {selectedLedgerAction.date}
                      </span>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          background: selectedLedgerAction.income > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                          color: selectedLedgerAction.income > 0 ? 'var(--color-success)' : 'var(--color-accent)',
                        }}>
                          {selectedLedgerAction.income > 0 ? '収入' : '支出'}
                        </span>
                        <span style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-text-muted)',
                          background: 'rgba(255,255,255,0.06)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}>
                          {selectedLedgerAction.category}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.6rem', wordBreak: 'break-all' }}>
                      {selectedLedgerAction.description}
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      paddingTop: '0.5rem',
                      marginTop: '0.5rem'
                    }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>金額</span>
                      <span style={{
                        fontSize: '1.35rem',
                        fontWeight: 700,
                        color: selectedLedgerAction.income > 0 ? 'var(--color-success)' : 'var(--color-accent)'
                      }}>
                        {selectedLedgerAction.income > 0
                          ? `+${selectedLedgerAction.income.toLocaleString()} 円`
                          : `-${selectedLedgerAction.expense.toLocaleString()} 円`}
                      </span>
                    </div>
                  </div>

                  {/* 操作ボタン */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{
                        background: 'linear-gradient(135deg, var(--color-secondary), #0284c7)',
                        boxShadow: '0 0 15px rgba(6, 182, 212, 0.3)',
                        padding: '0.8rem 1rem',
                        fontSize: '0.95rem',
                      }}
                      onClick={() => {
                        const record = selectedLedgerAction;
                        setSelectedLedgerAction(null);
                        handleEditLedger(record);
                      }}
                    >
                      ✏️ このデータを編集する
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{
                        color: 'var(--color-accent)',
                        borderColor: 'rgba(244, 63, 94, 0.4)',
                        background: 'rgba(244, 63, 94, 0.08)',
                        padding: '0.8rem 1rem',
                        fontSize: '0.95rem',
                      }}
                      onClick={() => {
                        const id = selectedLedgerAction.id;
                        setSelectedLedgerAction(null);
                        handleDeleteLedger(id);
                      }}
                    >
                      🗑️ このデータを削除する
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.65rem 1rem', marginTop: '0.25rem' }}
                      onClick={() => setSelectedLedgerAction(null)}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* ─── レポートタブ ─── */}
      {activeTab === 'report' && (
        <section>
          <div className="card">
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">対象年月を選択</label>
              <input type="month" className="form-input" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
            </div>

            {report.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>
                選択した月の精算データはありません
              </p>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.1rem' }}>保護者別の立替合計</h3>
                  <button
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem', borderColor: 'rgba(16,185,129,0.4)', color: 'var(--color-success)' }}
                    onClick={async () => {
                      const text = generateLineShareText();
                      if (!text) { showToast('共有するデータがありません'); return; }
                      try {
                        await navigator.clipboard.writeText(text);
                        showToast('LINE共有用テキストをコピーしました！');
                      } catch {
                        showToast('コピーに失敗しました');
                      }
                    }}
                  >
                    📋 LINE共有用にコピー
                  </button>
                </div>
                {report.map((parent) => {
                  const isOpen = !!openAccordions[parent.reserverName];
                  return (
                    <div key={parent.reserverName} className={`accordion-item ${isOpen ? 'open' : ''}`}>
                      <div className="accordion-header" onClick={() => toggleAccordion(parent.reserverName)}>
                        <div className="accordion-title">
                          <span className="accordion-arrow">▼</span>
                          <span style={{ fontWeight: 600 }}>{parent.reserverName}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
                          <span style={{ fontWeight: 700, color: 'var(--color-secondary)' }}>
                            {parent.totalAmount.toLocaleString()}円
                          </span>
                          {(() => {
                            const isParentSettled = parent.settlementStatus === '精算済' || parent.settlementStatus === '返金済';
                            return (
                              <div className="settlement-checkbox-wrapper">
                                <span className={`status-badge ${isParentSettled ? 'settled' : 'unsettled'}`}>
                                  {isParentSettled ? '返金済' : '未返金'}
                                </span>
                                <label className="switch">
                                  <input
                                    type="checkbox"
                                    checked={isParentSettled}
                                    onChange={() => handleToggleBulkStatus(parent.reserverName, parent.settlementStatus)}
                                  />
                                  <span className="slider"></span>
                                </label>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {isOpen && (
                        <div className="accordion-content">
                          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {parent.reservations.map((r) => {
                              const isCancelled = r.status === 'cancelled';
                              const isCounter = r.settlementStatus === '窓口精算';
                              const isSettled = r.settlementStatus === '精算済' || r.settlementStatus === '返金済';

                              return (
                                <div
                                  key={r.id}
                                  style={{
                                    padding: '0.5rem 0',
                                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                    opacity: isCancelled ? 0.5 : 1,
                                    textDecoration: isCancelled ? 'line-through' : 'none',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                    <div>
                                      <div style={{ fontWeight: 500 }}>
                                        {isCancelled ? '（消）' : ''}{r.date.replace(/-/g, '/')} <span className="facility-badge" style={{ fontSize: '0.72rem' }}>{r.facilityName}</span>
                                      </div>
                                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                                        {r.courtStartTime}〜{r.courtEndTime}
                                        {r.lightHours > 0 && ` | 照明${r.lightHours}時間 (${r.lightStartTime || ''}〜)`}
                                        {' | '}{r.feeType}
                                      </div>
                                      {r.memo && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                                          📝 {r.memo}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                      <span style={{ fontWeight: 600 }}>{r.totalFee.toLocaleString()}円</span>
                                      {isCounter ? (
                                        <span className="status-badge counter" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                          窓口精算
                                        </span>
                                      ) : (
                                        <div className="settlement-checkbox-wrapper">
                                          <span style={{ fontSize: '0.75rem', color: isSettled ? 'var(--color-success)' : 'var(--color-accent)' }}>
                                            {isSettled ? '返金済' : '未返金'}
                                          </span>
                                          <label className="switch">
                                            <input
                                              type="checkbox"
                                              checked={isSettled}
                                              onChange={() => handleToggleStatus(r.id, r.settlementStatus)}
                                            />
                                            <span className="slider"></span>
                                          </label>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── 設定タブ ─── */}
      {activeTab === 'settings' && (
        <section>
          <div className="card">
            <h3 style={{ marginBottom: '1.25rem', color: 'var(--color-secondary)' }}>コート料金設定</h3>

            {/* 施設フォーム折りたたみトグル */}
            {!isFacilityFormOpen && (
              <button
                className="btn btn-secondary"
                style={{
                  marginBottom: '1.5rem',
                  padding: '10px 16px',
                  fontSize: '0.9rem',
                  borderColor: 'rgba(139, 92, 246, 0.3)',
                  color: 'var(--color-primary)',
                }}
                onClick={() => setIsFacilityFormOpen(true)}
              >
                ＋ 施設設定を追加・編集する
              </button>
            )}

            {isFacilityFormOpen && (
              <form onSubmit={handleSubmitFacility} style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>
                  {isEditingFacility ? 'コート情報を編集' : '新規コートを追加'}
                </h4>

                <div className="form-group">
                  <label className="form-label">コート名 (施設名)</label>
                  <input type="text" className="form-input" required placeholder="例: 桧原運動公園" value={facilityForm.name} onChange={(e) => setFacilityForm((prev) => ({ ...prev, name: e.target.value }))} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">大人料金 (1時間)</label>
                    <input type="number" className="form-input" required min="0" value={facilityForm.adultRatePerHour} onChange={(e) => setFacilityForm((prev) => ({ ...prev, adultRatePerHour: Number(e.target.value) }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">子供料金 (1時間)</label>
                    <input type="number" className="form-input" required min="0" disabled={!facilityForm.allowChildRate} value={facilityForm.allowChildRate ? facilityForm.childRatePerHour : facilityForm.adultRatePerHour} onChange={(e) => setFacilityForm((prev) => ({ ...prev, childRatePerHour: Number(e.target.value) }))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">照明料金 (1時間)</label>
                    <input type="number" className="form-input" required min="0" value={facilityForm.lightRatePerHour} onChange={(e) => setFacilityForm((prev) => ({ ...prev, lightRatePerHour: Number(e.target.value) }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">デフォルト照明利用開始時間</label>
                    <input type="time" className="form-input" value={facilityForm.defaultLightStartTime} onChange={(e) => setFacilityForm((prev) => ({ ...prev, defaultLightStartTime: e.target.value }))} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={facilityForm.allowChildRate}
                      onChange={(e) => setFacilityForm((prev) => ({
                        ...prev,
                        allowChildRate: e.target.checked,
                        childRatePerHour: e.target.checked ? prev.childRatePerHour : prev.adultRatePerHour,
                      }))}
                    />
                    子供料金の選択を許可する
                  </label>
                </div>

                <div className="form-row" style={{ marginTop: '1rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setIsEditingFacility(false);
                    setIsFacilityFormOpen(false);
                    setFacilityForm({ id: '', name: '', adultRatePerHour: 1000, childRatePerHour: 500, lightRatePerHour: 300, allowChildRate: true, defaultLightStartTime: '' });
                  }}>閉じる</button>
                  <button type="submit" className="btn btn-primary">{isEditingFacility ? '更新する' : '追加する'}</button>
                </div>
              </form>
            )}

            {/* コート一覧 */}
            <div>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>登録済みコート一覧</h4>
              {facilities.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>登録されているコートはありません</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {facilities.map((f) => (
                    <div key={f.id} className="reservation-item" style={{ margin: 0, padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{f.name}</span>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                            大人: {f.adultRatePerHour.toLocaleString()}円/h
                            {f.allowChildRate ? ` | 子供: ${f.childRatePerHour.toLocaleString()}円/h` : ' | 子供料金なし'}
                            {' | '}照明: {f.lightRatePerHour.toLocaleString()}円/h
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}
                            onClick={() => {
                              setIsEditingFacility(true);
                              setIsFacilityFormOpen(true);
                              setFacilityForm({
                                id: f.id,
                                name: f.name,
                                adultRatePerHour: f.adultRatePerHour,
                                childRatePerHour: f.childRatePerHour,
                                lightRatePerHour: f.lightRatePerHour,
                                allowChildRate: f.allowChildRate,
                                defaultLightStartTime: f.defaultLightStartTime || '',
                              });
                            }}
                          >編集</button>
                          <button
                            className="btn btn-secondary"
                            style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', color: 'var(--color-accent)', borderColor: 'rgba(244,63,94,0.3)' }}
                            onClick={() => handleDeleteFacility(f.id)}
                          >削除</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 保護者設定 */}
          <div className="card">
            <h3 style={{ marginBottom: '1.25rem', color: 'var(--color-secondary)' }}>保護者 (予約者) 設定</h3>

            <form onSubmit={handleSubmitReserver} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input type="text" className="form-input" required placeholder="例: 佐藤" value={newReserverName} onChange={(e) => setNewReserverName(e.target.value)} />
              <button type="submit" className="btn btn-primary" style={{ width: 'auto', whiteSpace: 'nowrap' }}>登録する</button>
            </form>

            <div>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>登録済み保護者一覧</h4>
              {reservers.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>保護者が登録されていません</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {reservers.map((r) => (
                    <div key={r.id} className="reservation-item" style={{ margin: 0, padding: '0.5rem 0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500 }}>{r.name}</span>
                        <button
                          className="btn btn-secondary"
                          style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', color: 'var(--color-accent)', borderColor: 'rgba(244,63,94,0.3)' }}
                          onClick={() => handleDeleteReserver(r.id)}
                        >削除</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 会計分類設定 */}
          <div className="card">
            <h3 style={{ marginBottom: '1.25rem', color: 'var(--color-secondary)' }}>会計分類設定</h3>

            <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input
                type="text"
                className="form-input"
                required
                placeholder="新しい分類名 (例: 備品購入)"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" style={{ width: 'auto', whiteSpace: 'nowrap' }}>分類を追加</button>
            </form>

            <div>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>登録済み分類一覧</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {categories.map((cat) => (
                  <div key={cat} className="reservation-item" style={{ margin: 0, padding: '0.5rem 0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 500 }}>{cat}</span>
                      <button
                        className="btn btn-secondary"
                        style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', color: 'var(--color-accent)', borderColor: 'rgba(244,63,94,0.3)' }}
                        onClick={() => handleDeleteCategory(cat)}
                      >削除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 日没・薄明時刻設定 */}
          <div className="card">
            <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-secondary)' }}>🌅 日没・薄明時刻表示設定</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
              カレンダー上に表示する日没・薄明時刻のON/OFFや基準位置、表示基準を設定します。設定はすべてGoogleスプレッドシートに自動保存されます。
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              showToast('日没設定を保存中...', 0, true);
              try {
                const lat = parseFloat(sunsetForm.latitude);
                const lng = parseFloat(sunsetForm.longitude);
                if (isNaN(lat) || isNaN(lng)) {
                  showToast('緯度・経度は正しい数値で入力してください');
                  return;
                }
                const res = await fetch('/api/sunset-settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    showOnCalendar: sunsetForm.showOnCalendar,
                    locationName: sunsetForm.locationName,
                    latitude: lat,
                    longitude: lng,
                    twilightType: sunsetForm.twilightType,
                  }),
                });
                if (res.ok) {
                  const saved = await res.json();
                  setSunsetSettings(saved);
                  setSunsetDataMap({});
                  showToast('日没設定を保存しました（Googleスプレッドシートに反映）');
                } else {
                  showToast('設定の保存に失敗しました');
                }
              } catch (err) {
                console.error(err);
                showToast('通信エラーが発生しました');
              }
            }}>
              {/* 日没表示ON/OFFスイッチ */}
              <div className="form-group" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div>
                    <label className="form-label" style={{ marginBottom: '0.25rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                      カレンダー画面に日没・薄明時刻を表示する
                    </label>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                      ※ スイッチをONにすると、カレンダー上に「🌅 18:24」形式で表示され、予約データは●（ドット）で簡略表示してセルの高さのブレを防ぎます。OFFにすると従来の名前一覧表示になります。
                    </p>
                  </div>
                  <div className="settlement-checkbox-wrapper" style={{ margin: 0, flexShrink: 0 }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={sunsetForm.showOnCalendar}
                        onChange={async (e) => {
                          const nextVal = e.target.checked;
                          setSunsetForm((prev) => ({ ...prev, showOnCalendar: nextVal }));
                          setSunsetSettings((prev) => ({ ...prev, showOnCalendar: nextVal }));
                          try {
                            const lat = parseFloat(sunsetForm.latitude);
                            const lng = parseFloat(sunsetForm.longitude);
                            await fetch('/api/sunset-settings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                showOnCalendar: nextVal,
                                locationName: sunsetForm.locationName,
                                latitude: isNaN(lat) ? 33.54 : lat,
                                longitude: isNaN(lng) ? 130.395 : lng,
                                twilightType: sunsetForm.twilightType,
                              }),
                            });
                            showToast(nextVal ? '日没時刻の表示をONにしました' : '日没時刻の表示をOFFにしました');
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">基準場所名称</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="例: 福岡市南区桧原（テニスコート）"
                  value={sunsetForm.locationName}
                  onChange={(e) => setSunsetForm((prev) => ({ ...prev, locationName: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">緯度 (Latitude)</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    required
                    placeholder="例: 33.54"
                    value={sunsetForm.latitude}
                    onChange={(e) => setSunsetForm((prev) => ({ ...prev, latitude: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">経度 (Longitude)</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    required
                    placeholder="例: 130.395"
                    value={sunsetForm.longitude}
                    onChange={(e) => setSunsetForm((prev) => ({ ...prev, longitude: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">表示する時刻の基準</label>
                <select
                  className="form-select"
                  value={sunsetForm.twilightType}
                  onChange={(e) => setSunsetForm((prev) => ({ ...prev, twilightType: e.target.value as any }))}
                >
                  <option value="civil">市民薄明終了時刻（屋外運動で暗さを感じ始める目安 / おすすめ）</option>
                  <option value="sunset">日の入り時刻（太陽が地平線下に隠れる時刻）</option>
                  <option value="nautical">航海薄明終了時刻（かなり暗くなる時刻）</option>
                  <option value="astronomical">天文薄明終了時刻（完全に暗くなる時刻）</option>
                </select>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.75rem' }}>
                日没設定を保存する
              </button>
            </form>
          </div>
        </section>
      )}

      {/* トースト通知 */}
      <div className={`toast ${toast.show ? 'show' : ''}`}>
        {toast.loading && <div className="spinner"></div>}
        <span>{toast.message}</span>
      </div>
    </main>
  );
}
