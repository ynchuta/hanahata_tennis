'use client';

import { useState, useEffect, useCallback } from 'react';
import { Facility, Reservation, MonthlyReportRow, FeeType, SettlementStatus } from '@/types';

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

  const [activeTab, setActiveTab] = useState<'calendar' | 'report' | 'settings'>('calendar');

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [reservers, setReservers] = useState<Reserver[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [report, setReport] = useState<MonthlyReportRow[]>([]);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [reportMonth, setReportMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );

  const [formData, setFormData] = useState({
    facilityName: '',
    reserverName: '',
    courtStartTime: '18:00',
    courtEndTime: '20:00',
    lightHours: 0,
    feeType: '大人' as FeeType,
    memo: '',
  });

  const [facilityForm, setFacilityForm] = useState({
    id: '',
    name: '',
    adultRatePerHour: 1000,
    childRatePerHour: 500,
    lightRatePerHour: 300,
    allowChildRate: true,
  });
  const [isEditingFacility, setIsEditingFacility] = useState(false);
  const [newReserverName, setNewReserverName] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; show: boolean; loading?: boolean }>({
    message: '',
    show: false,
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
          setFormData((prev) => prev.facilityName ? prev : { ...prev, facilityName: data[0].name });
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
      });
    }
  }, [isLoggedIn, fetchFacilities, fetchReservers, fetchReservations]);

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

  const handleSubmitReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.reserverName) {
      showToast('保護者が登録されていません。設定画面から登録してください。');
      return;
    }
    showToast('保存中...', 0, true);
    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDateStr, ...formData }),
      });
      if (res.ok) {
        const newRecord = await res.json();
        setReservations((prev) => [...prev, newRecord]);
        setIsFormOpen(false);
        setFormData((prev) => ({
          ...prev,
          courtStartTime: '18:00',
          courtEndTime: '20:00',
          lightHours: 0,
          memo: '',
        }));
        showToast('予約を保存しました！');
      } else {
        const errData = await res.json();
        showToast(`エラー: ${errData.error || '保存に失敗しました'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました');
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === '未精算' ? '精算済' : '未精算';
    setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: nextStatus } : r));
    showToast('ステータス更新中...', 0, true);
    try {
      const res = await fetch(`/api/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setReservations((prev) => prev.map((r) => r.id === id ? updated : r));
        showToast('精算ステータスを更新しました！');
      } else {
        setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: currentStatus as SettlementStatus } : r));
        showToast('ステータス更新に失敗しました');
      }
    } catch (err) {
      console.error(err);
      setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: currentStatus as SettlementStatus } : r));
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
        setFacilityForm({ id: '', name: '', adultRatePerHour: 1000, childRatePerHour: 500, lightRatePerHour: 300, allowChildRate: true });
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

  const handleFacilityChange = (name: string) => {
    const facility = facilities.find((f) => f.name === name);
    setFormData((prev) => ({
      ...prev,
      facilityName: name,
      feeType: (facility && !facility.allowChildRate) ? '大人' : prev.feeType,
    }));
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
  const currentDayReservations = getReservationsForDate(selectedDateStr);
  const selectedFacilityObj = facilities.find((f) => f.name === formData.facilityName);

  // 照明利用時間の選択肢（0〜6時間, 0.5刻み）
  const lightHoursOptions = Array.from({ length: 13 }, (_, i) => i * 0.5);

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
        <button className={`tab-btn ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>
          集計レポート
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
                  const dayStr = day.toISOString().split('T')[0];
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const isSelected = dayStr === selectedDateStr;
                  const isToday = dayStr === new Date().toISOString().split('T')[0];
                  const dayReservations = getReservationsForDate(dayStr);

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedDateStr(dayStr)}
                      className={`calendar-day ${isCurrentMonth ? '' : 'outside'} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                      style={{ flexDirection: 'column', alignItems: 'stretch', padding: '4px' }}
                    >
                      <span className="day-number" style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                        {day.getDate()}
                      </span>
                      {/* 予約者名バッジ（予約がある日のみ、モバイル向けに苗字のみ表示） */}
                      {dayReservations.length > 0 && isCurrentMonth && (
                        <div className="day-reserver-list">
                          {dayReservations.slice(0, 3).map((r) => {
                            const lastName = getLastName(r.reserverName);
                            // セル幅に収めるためさらに短縮
                            const displayName = lastName.length > 3 ? lastName.slice(0, 2) + '…' : lastName;
                            return (
                              <span
                                key={r.id}
                                className={`day-reserver-name ${r.status === '精算済' ? 'settled' : 'unsettled'}`}
                              >
                                {displayName}
                              </span>
                            );
                          })}
                          {dayReservations.length > 3 && (
                            <span className="day-reserver-name" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--color-text-muted)' }}>
                              +{dayReservations.length - 3}件
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 選択日の予約一覧 */}
          <div className="card">
            <div className="reservation-list-title">
              <h3>{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日の予約一覧</h3>
              {!isFormOpen && (
                <button
                  className="btn btn-primary"
                  style={{ width: 'auto', padding: '6px 14px', fontSize: '0.875rem' }}
                  onClick={() => setIsFormOpen(true)}
                >
                  予約追加
                </button>
              )}
            </div>

            {/* 新規予約フォーム */}
            {isFormOpen && (
              <form onSubmit={handleSubmitReservation} style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--color-secondary)' }}>新規予約登録</h4>

                <div className="form-group">
                  <label className="form-label">施設名</label>
                  {facilities.length === 0 ? (
                    <p style={{ color: 'var(--color-accent)', fontSize: '0.85rem' }}>
                      施設が登録されていません。設定画面から登録してください。
                    </p>
                  ) : (
                    <select className="form-select" value={formData.facilityName} onChange={(e) => handleFacilityChange(e.target.value)}>
                      {facilities.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                    </select>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">予約者名 (保護者)</label>
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

                {/* 料金種別（単価表示付き） */}
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

                {/* コート利用時間 */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">コート利用開始</label>
                    <input type="time" className="form-input" required value={formData.courtStartTime} onChange={(e) => setFormData((prev) => ({ ...prev, courtStartTime: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">コート利用終了</label>
                    <input type="time" className="form-input" required value={formData.courtEndTime} onChange={(e) => setFormData((prev) => ({ ...prev, courtEndTime: e.target.value }))} />
                  </div>
                </div>

                {/* 照明利用時間（1時間単位の数値選択） */}
                <div className="form-group">
                  <label className="form-label">
                    照明利用時間
                    {selectedFacilityObj && formData.lightHours > 0 && (
                      <span style={{ marginLeft: '0.5rem', color: 'var(--color-secondary)', fontWeight: 400 }}>
                        （照明代: {(formData.lightHours * selectedFacilityObj.lightRatePerHour).toLocaleString()}円）
                      </span>
                    )}
                  </label>
                  <select
                    className="form-select"
                    value={formData.lightHours}
                    onChange={(e) => setFormData((prev) => ({ ...prev, lightHours: Number(e.target.value) }))}
                  >
                    {lightHoursOptions.map((h) => (
                      <option key={h} value={h}>
                        {h === 0 ? '照明なし' : `${h}時間`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* メモ */}
                <div className="form-group">
                  <label className="form-label">メモ (任意)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="例: コートA使用、練習試合など..."
                    value={formData.memo}
                    onChange={(e) => setFormData((prev) => ({ ...prev, memo: e.target.value }))}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div className="form-row" style={{ marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>キャンセル</button>
                  <button type="submit" className="btn btn-primary" disabled={reservers.length === 0 || facilities.length === 0}>保存する</button>
                </div>
              </form>
            )}

            {/* 当日の予約レコード */}
            {currentDayReservations.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                予約データが登録されていません
              </p>
            ) : (
              <div>
                {currentDayReservations.map((r) => (
                  <div key={r.id} className="reservation-item">
                    <div className="reservation-item-header">
                      <div>
                        <span className="reserver-name">{r.reserverName}</span>
                        <div style={{ marginTop: '0.25rem' }}>
                          <span className="facility-badge">{r.facilityName}</span>
                          <span
                            className="status-badge"
                            style={{
                              marginLeft: '0.5rem',
                              background: r.feeType === '大人' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: r.feeType === '大人' ? 'var(--color-primary)' : 'var(--color-success)',
                              border: r.feeType === '大人' ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                            }}
                          >
                            {r.feeType}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                        <div className="settlement-checkbox-wrapper">
                          <span style={{ fontSize: '0.85rem', color: r.status === '精算済' ? 'var(--color-success)' : 'var(--color-accent)' }}>
                            {r.status}
                          </span>
                          <label className="switch">
                            <input type="checkbox" checked={r.status === '精算済'} onChange={() => handleToggleStatus(r.id, r.status)} />
                            <span className="slider"></span>
                          </label>
                        </div>
                        {/* 予約削除ボタン */}
                        <button
                          className="btn btn-secondary"
                          style={{
                            width: 'auto',
                            padding: '4px 8px',
                            fontSize: '0.7rem',
                            color: 'var(--color-accent)',
                            borderColor: 'rgba(244,63,94,0.3)',
                            background: 'rgba(244,63,94,0.03)',
                            marginTop: '0.25rem'
                          }}
                          onClick={() => handleDeleteReservation(r.id)}
                        >
                          削除
                        </button>
                      </div>
                    </div>

                    <div className="reservation-time-details">
                      <div>コート時間: {r.courtStartTime} 〜 {r.courtEndTime}</div>
                      {r.lightHours > 0 && <div>照明: {r.lightHours}時間</div>}
                    </div>

                    <div className="reservation-fees">
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        コート: {r.courtFee.toLocaleString()}円
                        {r.lightFee > 0 && ` | 照明: ${r.lightFee.toLocaleString()}円`}
                      </div>
                      <div className="fee-total">合計: {r.totalFee.toLocaleString()}円</div>
                    </div>

                    {r.memo && <div className="reservation-memo">📝 {r.memo}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── 集計レポートタブ ─── */}
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
                <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>保護者別の立替合計</h3>
                {report.map((parent) => {
                  const isOpen = !!openAccordions[parent.reserverName];
                  return (
                    <div key={parent.reserverName} className={`accordion-item ${isOpen ? 'open' : ''}`}>
                      <div className="accordion-header" onClick={() => toggleAccordion(parent.reserverName)}>
                        <div className="accordion-title">
                          <span className="accordion-arrow">▼</span>
                          <span style={{ fontWeight: 600 }}>{parent.reserverName}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-secondary)' }}>
                            {parent.totalAmount.toLocaleString()}円
                          </span>
                          <span className={`status-badge ${parent.status === '精算済' ? 'settled' : 'unsettled'}`}>
                            {parent.status}
                          </span>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="accordion-content">
                          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {parent.reservations.map((r) => (
                              <div
                                key={r.id}
                                style={{
                                  padding: '0.5rem 0',
                                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                  <div>
                                    <div style={{ fontWeight: 500 }}>
                                      {r.date} <span className="facility-badge" style={{ fontSize: '0.72rem' }}>{r.facilityName}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.2' }}>
                                      {r.courtStartTime}〜{r.courtEndTime}
                                      {r.lightHours > 0 && ` | 照明${r.lightHours}時間`}
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
                                    <label className="switch">
                                      <input type="checkbox" checked={r.status === '精算済'} onChange={() => handleToggleStatus(r.id, r.status)} />
                                      <span className="slider"></span>
                                    </label>
                                    {/* アコーディオン内の予約削除ボタン */}
                                    <button
                                      className="btn btn-secondary"
                                      style={{
                                        width: 'auto',
                                        padding: '4px 8px',
                                        fontSize: '0.7rem',
                                        color: 'var(--color-accent)',
                                        borderColor: 'rgba(244,63,94,0.3)',
                                        background: 'rgba(244,63,94,0.03)',
                                        marginLeft: '0.25rem'
                                      }}
                                      onClick={() => handleDeleteReservation(r.id)}
                                    >
                                      削除
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
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
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.25rem' }}>
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
              </div>

              <div className="form-row" style={{ marginTop: '1rem' }}>
                {isEditingFacility && (
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setIsEditingFacility(false);
                    setFacilityForm({ id: '', name: '', adultRatePerHour: 1000, childRatePerHour: 500, lightRatePerHour: 300, allowChildRate: true });
                  }}>キャンセル</button>
                )}
                <button type="submit" className="btn btn-primary">{isEditingFacility ? '更新する' : '追加する'}</button>
              </div>
            </form>

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
                              setFacilityForm({ id: f.id, name: f.name, adultRatePerHour: f.adultRatePerHour, childRatePerHour: f.childRatePerHour, lightRatePerHour: f.lightRatePerHour, allowChildRate: f.allowChildRate });
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
