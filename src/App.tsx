import React, { useState, useEffect, useId, useCallback } from 'react';
import { 
  Coffee, 
  RotateCcw, 
  CheckCircle, 
  AlertCircle, 
  ClipboardList, 
  Clock, 
  Plus, 
  Minus,
  RefreshCw
} from 'lucide-react';
import {
  getSupabaseClient,
  testSupabaseConnection,
  insertOrderToSupabase,
  fetchOrdersFromSupabase
} from './lib/supabase.ts';

// ==========================================
// 1. 메뉴 및 옵션 데이터 정의
// ==========================================

// 음료 인터페이스
interface BeverageItem {
  id: string;
  name: string;
  price: number;
}

// 음료 메뉴 목록
const BEVERAGES: BeverageItem[] = [
  { id: 'americano', name: '아메리카노', price: 3500 },
  { id: 'latte', name: '카페라떼', price: 4000 },
  { id: 'mocha', name: '카페모카', price: 4500 },
  { id: 'vanilla', name: '바닐라라떼', price: 4500 },
  { id: 'green_tea', name: '녹차라떼', price: 4500 },
];

// 사이즈 옵션 목록
interface SizeItem {
  id: 'S' | 'M' | 'L';
  name: string;
  extraPrice: number;
}

const SIZES: SizeItem[] = [
  { id: 'S', name: 'S (+0원)', extraPrice: 0 },
  { id: 'M', name: 'M (+500원)', extraPrice: 500 },
  { id: 'L', name: 'L (+1,000원)', extraPrice: 1000 },
];

// 추가 옵션 목록
interface OptionItem {
  id: string;
  name: string;
  price: number;
}

const OPTIONS: OptionItem[] = [
  { id: 'shot', name: '샷 추가 (+500원)', price: 500 },
  { id: 'cream', name: '크림 추가 (+500원)', price: 500 },
  { id: 'syrup', name: '시럽 추가 (+300원)', price: 300 },
  { id: 'decaf', name: '디카페인 (+0원)', price: 0 },
];

// 완료된 주문 이력 인터페이스
interface OrderRecord {
  id: string;
  customerName: string;
  phoneNumber: string;
  beverageName: string;
  sizeName: string;
  options: string[];
  quantity: number;
  totalPrice: number;
  requests: string;
  orderedAt: string;
  isFromSupabase?: boolean;
}

// ==========================================
// 2. 메인 컴포넌트
// ==========================================

export default function App() {
  // ----------------------------------------
  // 입력 폼 상태(State) 관리
  // ----------------------------------------
  const [customerName, setCustomerName] = useState<string>(''); // 이름 (필수)
  const [phoneNumber, setPhoneNumber] = useState<string>('');   // 전화번호
  const [selectedBeverageId, setSelectedBeverageId] = useState<string>(''); // 선택된 음료 ID
  const [selectedSize, setSelectedSize] = useState<'S' | 'M' | 'L'>('M'); // 사이즈 (기본값: M)
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]); // 선택된 추가 옵션 ID 배열
  const [quantity, setQuantity] = useState<number>(1); // 수량 (기본값: 1, 최소 1, 최대 10)
  const [requests, setRequests] = useState<string>(''); // 요청사항

  // ----------------------------------------
  // UI 피드백 및 주문 내역 상태
  // ----------------------------------------
  const [errorMessage, setErrorMessage] = useState<string>(''); // 유효성 검사 에러 메시지
  const [confirmationMessage, setConfirmationMessage] = useState<string>(''); // 주문 완료 메시지
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false); // 주문 진행 중 상태
  const [orders, setOrders] = useState<OrderRecord[]>([]); // 주문 목록

  // 탭 상태: 'order' (주문서 작성), 'board' (주문 게시판/내역)
  const [activeTab, setActiveTab] = useState<'order' | 'board'>('order');

  // Supabase 연동 상태
  const [isConnectedToSupabase, setIsConnectedToSupabase] = useState<boolean>(false);

  // 고유 ID 생성을 위한 React useId 훅 (label 태그 연결용)
  const nameInputId = useId();
  const phoneInputId = useId();
  const beverageSelectId = useId();
  const quantityInputId = useId();
  const requestsTextareaId = useId();

  // ----------------------------------------
  // Supabase로부터 주문 데이터 동기화 함수
  // ----------------------------------------
  const loadOrders = useCallback(async () => {
    const client = getSupabaseClient();
    if (client) {
      const res = await fetchOrdersFromSupabase();
      if (res.success && res.data) {
        setIsConnectedToSupabase(true);
        // Supabase 행 데이터를 앱 내부 인터페이스로 매핑
        const mappedOrders: OrderRecord[] = res.data.map((row) => ({
          id: `SB-${row.id}`,
          customerName: row.customer_name,
          phoneNumber: row.phone_number || '미입력',
          beverageName: row.beverage_name,
          sizeName: row.size,
          options: row.options || [],
          quantity: row.quantity,
          totalPrice: row.total_price,
          requests: row.requests || '요청사항 없음',
          orderedAt: row.created_at
            ? new Date(row.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            : '방금 전',
          isFromSupabase: true,
        }));
        setOrders(mappedOrders);
        return;
      }
    }

    // Supabase 미연동 시 로컬 스토리지 데이터 폴백
    try {
      const saved = localStorage.getItem('vibe_cafe_orders');
      if (saved) {
        setOrders(JSON.parse(saved));
        return;
      }
    } catch {
      // 로컬 스토리지 파싱 에러 무시
    }

    // 기본 가짜 샘플 데이터 1건
    setOrders([
      {
        id: 'ord-001',
        customerName: '홍길동',
        phoneNumber: '010-1234-5678',
        beverageName: '카페라떼',
        sizeName: 'M',
        options: ['샷 추가'],
        quantity: 1,
        totalPrice: 5000,
        requests: '시럽 덜 달게 부탁드려요~',
        orderedAt: '오늘 오전 10:15',
        isFromSupabase: false,
      }
    ]);
  }, []);

  // 마운트 시 초기 연결 확인 및 주문 목록 로드 + 실시간 구독
  useEffect(() => {
    loadOrders();

    testSupabaseConnection().then((res) => {
      setIsConnectedToSupabase(res.success && !!res.tableExists);
    });

    // Supabase 실시간 변경사항(Realtime) 구독 설정
    const client = getSupabaseClient();
    if (client) {
      const channel = client
        .channel('cafe_orders_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cafe_menu' },
          () => {
            loadOrders();
          }
        )
        .subscribe();

      return () => {
        client.removeChannel(channel);
      };
    }
  }, [loadOrders]);

  // ----------------------------------------
  // 실시간 예상 금액 계산 (JavaScript 기능)
  // ----------------------------------------
  // 1) 선택된 음료 기본 가격
  const currentBeverage = BEVERAGES.find((b) => b.id === selectedBeverageId);
  const beverageBasePrice = currentBeverage ? currentBeverage.price : 0;

  // 2) 선택된 사이즈 추가 금액
  const currentSizeObj = SIZES.find((s) => s.id === selectedSize);
  const sizeExtraPrice = currentSizeObj ? currentSizeObj.extraPrice : 0;

  // 3) 선택된 추가 옵션들의 합산 금액
  const optionsExtraPrice = selectedOptions.reduce((acc, optId) => {
    const opt = OPTIONS.find((o) => o.id === optId);
    return acc + (opt ? opt.price : 0);
  }, 0);

  // 4) 1잔당 단가
  const singleUnitPrice = beverageBasePrice + sizeExtraPrice + optionsExtraPrice;

  // 5) 총 예상 금액 = (음료선택 시 단가 * 수량, 미선택 시 0)
  const estimatedTotalPrice = selectedBeverageId ? singleUnitPrice * quantity : 0;

  // ----------------------------------------
  // 이벤트 핸들러: 추가 옵션 체크박스 토글
  // ----------------------------------------
  const handleOptionToggle = (optionId: string) => {
    setSelectedOptions((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  // ----------------------------------------
  // 이벤트 핸들러: 수량 조절
  // ----------------------------------------
  const handleQuantityChange = (val: number) => {
    if (isNaN(val)) return;
    const clamped = Math.min(10, Math.max(1, val));
    setQuantity(clamped);
  };

  // ----------------------------------------
  // 이벤트 핸들러: 다시 작성 (초기화)
  // ----------------------------------------
  const handleReset = () => {
    setCustomerName('');
    setPhoneNumber('');
    setSelectedBeverageId('');
    setSelectedSize('M'); // 기본값 M
    setSelectedOptions([]);
    setQuantity(1);
    setRequests('');
    setErrorMessage('');
    setConfirmationMessage('');
  };

  // ----------------------------------------
  // 이벤트 핸들러: 주문하기 버튼 클릭 (Supabase 연동)
  // ----------------------------------------
  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setConfirmationMessage('');

    // [유효성 검사 1]: 이름이 비어있으면 알림
    if (!customerName.trim()) {
      setErrorMessage('이름을 입력해주세요');
      return;
    }

    // [유효성 검사 2]: 음료를 선택하지 않았으면 알림
    if (!selectedBeverageId || !currentBeverage) {
      setErrorMessage('음료를 선택해주세요');
      return;
    }

    setIsSubmitting(true);

    // 선택된 옵션명 배열 추출
    const selectedOptionNames = selectedOptions.map((optId) => {
      const found = OPTIONS.find((o) => o.id === optId);
      return found ? found.name.split(' ')[0] : optId;
    });

    // 확인 메시지용 옵션 문자열 형식화
    const optionText =
      selectedOptionNames.length > 0
        ? ` (${selectedOptionNames.join(', ')} 추가)`
        : '';

    // 주문 확인 메시지 생성
    // 요구사항 포맷: "홍길동님, 카페라떼 M사이즈 (샷 추가) 1잔, 총 5,000원 주문이 접수되었습니다!"
    const formattedMessage = `${customerName.trim()}님, ${currentBeverage.name} ${selectedSize}사이즈${optionText} ${quantity}잔, 총 ${estimatedTotalPrice.toLocaleString()}원 주문이 접수되었습니다!`;

    // 1) Supabase에 실제 데이터 INSERT 시도
    const client = getSupabaseClient();
    let savedToSupabase = false;

    if (client) {
      const insertResult = await insertOrderToSupabase({
        customer_name: customerName.trim(),
        phone_number: phoneNumber.trim() || null,
        beverage_name: currentBeverage.name,
        size: selectedSize,
        options: selectedOptionNames,
        quantity,
        requests: requests.trim() || null,
        total_price: estimatedTotalPrice,
        order_status: '주문접수',
      });

      if (insertResult.success) {
        savedToSupabase = true;
        setIsConnectedToSupabase(true);
        // 주문 목록 다시 불러오기
        await loadOrders();
      } else {
        console.warn('Supabase INSERT 실패, 로컬 스토리지에 백업 저장합니다:', insertResult.error);
      }
    }

    // 2) Supabase 미연결 또는 실패 시 로컬 스토리지에 동기화
    if (!savedToSupabase) {
      const newLocalOrder: OrderRecord = {
        id: `ord-${Date.now().toString().slice(-4)}`,
        customerName: customerName.trim(),
        phoneNumber: phoneNumber.trim() || '미입력',
        beverageName: currentBeverage.name,
        sizeName: selectedSize,
        options: selectedOptionNames,
        quantity,
        totalPrice: estimatedTotalPrice,
        requests: requests.trim() || '요청사항 없음',
        orderedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        isFromSupabase: false,
      };

      const updated = [newLocalOrder, ...orders];
      setOrders(updated);
      try {
        localStorage.setItem('vibe_cafe_orders', JSON.stringify(updated));
      } catch {
        // ignore
      }
    }

    setIsSubmitting(false);
    setConfirmationMessage(formattedMessage);
  };

  return (
    <div className="min-h-screen bg-[#faf6f0] text-[#3d2b1f] py-8 px-4 flex flex-col items-center">
      {/* 
        [상단 네비게이션: 주문서 / 게시판 탭]
      */}
      <header className="w-full max-w-[520px] mb-4 flex items-center justify-center">
        <div className="inline-flex p-1 bg-[#ede4d8] rounded-xl border border-[#dfd0bf] shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('order')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'order'
                ? 'bg-[#6b4226] text-white shadow-sm'
                : 'text-[#6b4226] hover:text-[#422917]'
            }`}
          >
            ☕ 주문서 작성
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('board')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'board'
                ? 'bg-[#6b4226] text-white shadow-sm'
                : 'text-[#6b4226] hover:text-[#422917]'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>주문 게시판 ({orders.length})</span>
          </button>
        </div>
      </header>

      {/* 
        ====================================================
        [메인 카드 컨테이너] 최대 너비 520px, 부드러운 그림자
        ====================================================
      */}
      <main className="w-full max-w-[520px] bg-white rounded-2xl shadow-md border border-[#ebdccb] overflow-hidden">
        {/* 
          [페이지 상단]
          - 카페 로고: ☕ 이모지 크게
          - 카페 이름: "바이브 카페"
          - 부제: "당신의 하루에 바이브를 더하다"
        */}
        <div className="bg-gradient-to-b from-[#f7ede2] to-white pt-8 pb-6 px-6 text-center border-b border-[#f0e4d7]">
          <div className="inline-block p-3 bg-white rounded-2xl shadow-sm border border-[#ebdccb] mb-3 transform hover:scale-105 transition-transform cursor-pointer">
            <span className="text-4xl select-none" role="img" aria-label="coffee">
              ☕
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#6b4226] tracking-tight">
            바이브 카페
          </h1>
          <p className="text-sm text-[#8c6b54] mt-1 font-medium">
            당신의 하루에 바이브를 더하다
          </p>
        </div>

        {/* ==================================================== */}
        {/* TAB 1: 주문서 작성 폼 (메인 기능)                     */}
        {/* ==================================================== */}
        {activeTab === 'order' && (
          <form onSubmit={handleOrderSubmit} className="p-6 space-y-5">
            {/* 1. 이름 (필수, text) */}
            <div>
              <label
                htmlFor={nameInputId}
                className="block text-sm font-semibold text-[#5a3920] mb-1.5"
              >
                1. 이름 <span className="text-red-500 font-bold">*</span>
              </label>
              <input
                id={nameInputId}
                type="text"
                placeholder="주문자 성함을 입력해주세요 (예: 홍길동)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="cafe-input text-sm text-[#3d2b1f] placeholder-[#b8a698]"
              />
            </div>

            {/* 2. 전화번호 (tel) */}
            <div>
              <label
                htmlFor={phoneInputId}
                className="block text-sm font-semibold text-[#5a3920] mb-1.5"
              >
                2. 전화번호
              </label>
              <input
                id={phoneInputId}
                type="tel"
                placeholder="연락처를 입력해주세요 (예: 010-1234-5678)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="cafe-input text-sm text-[#3d2b1f] placeholder-[#b8a698]"
              />
            </div>

            {/* 3. 음료 선택 (드롭다운) */}
            <div>
              <label
                htmlFor={beverageSelectId}
                className="block text-sm font-semibold text-[#5a3920] mb-1.5"
              >
                3. 음료 선택 <span className="text-red-500 font-bold">*</span>
              </label>
              <select
                id={beverageSelectId}
                value={selectedBeverageId}
                onChange={(e) => setSelectedBeverageId(e.target.value)}
                className="cafe-input text-sm text-[#3d2b1f] bg-white cursor-pointer"
              >
                <option value="">-- 음료를 선택해주세요 --</option>
                {BEVERAGES.map((bev) => (
                  <option key={bev.id} value={bev.id}>
                    {bev.name} ({bev.price.toLocaleString()}원)
                  </option>
                ))}
              </select>
            </div>

            {/* 4. 사이즈 (라디오 버튼, 가로 배치) */}
            <div>
              <span className="block text-sm font-semibold text-[#5a3920] mb-2">
                4. 사이즈 선택
              </span>
              <div className="flex flex-wrap gap-4 items-center bg-[#faf6f0] p-3 rounded-xl border border-[#ebdccb]">
                {SIZES.map((size) => (
                  <label
                    key={size.id}
                    htmlFor={`size_${size.id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4a301e] cursor-pointer hover:text-[#6b4226] select-none"
                  >
                    <input
                      id={`size_${size.id}`}
                      type="radio"
                      name="cafe_size"
                      value={size.id}
                      checked={selectedSize === size.id}
                      onChange={() => setSelectedSize(size.id)}
                      className="w-4 h-4 text-[#6b4226] accent-[#6b4226] cursor-pointer"
                    />
                    <span>{size.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 5. 추가 옵션 (체크박스, 가로 배치) */}
            <div>
              <span className="block text-sm font-semibold text-[#5a3920] mb-2">
                5. 추가 옵션
              </span>
              <div className="flex flex-wrap gap-4 items-center bg-[#faf6f0] p-3 rounded-xl border border-[#ebdccb]">
                {OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    htmlFor={`opt_${opt.id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4a301e] cursor-pointer hover:text-[#6b4226] select-none"
                  >
                    <input
                      id={`opt_${opt.id}`}
                      type="checkbox"
                      checked={selectedOptions.includes(opt.id)}
                      onChange={() => handleOptionToggle(opt.id)}
                      className="w-4 h-4 text-[#6b4226] accent-[#6b4226] rounded cursor-pointer"
                    />
                    <span>{opt.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 6. 수량 (number 타입, 최소 1, 최대 10, 기본값 1) */}
            <div>
              <label
                htmlFor={quantityInputId}
                className="block text-sm font-semibold text-[#5a3920] mb-1.5"
              >
                6. 수량 (최소 1잔 ~ 최대 10잔)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity - 1)}
                  disabled={quantity <= 1}
                  className="w-10 h-10 flex items-center justify-center bg-[#f2e7db] text-[#6b4226] rounded-lg hover:bg-[#ebdccb] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  aria-label="수량 감소"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  id={quantityInputId}
                  type="number"
                  min="1"
                  max="10"
                  value={quantity}
                  onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10))}
                  className="cafe-input text-center text-base font-semibold text-[#3d2b1f] max-w-[120px]"
                />
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity + 1)}
                  disabled={quantity >= 10}
                  className="w-10 h-10 flex items-center justify-center bg-[#f2e7db] text-[#6b4226] rounded-lg hover:bg-[#ebdccb] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  aria-label="수량 증가"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <span className="text-xs text-[#8c6b54] ml-2">
                  (단가: {selectedBeverageId ? singleUnitPrice.toLocaleString() : 0}원)
                </span>
              </div>
            </div>

            {/* 7. 요청사항 (textarea) */}
            <div>
              <label
                htmlFor={requestsTextareaId}
                className="block text-sm font-semibold text-[#5a3920] mb-1.5"
              >
                7. 요청사항
              </label>
              <textarea
                id={requestsTextareaId}
                rows={3}
                placeholder="예: 얼음 적게 넣어주세요, 테이크아웃 잔에 담아주세요 등"
                value={requests}
                onChange={(e) => setRequests(e.target.value)}
                className="cafe-input text-sm text-[#3d2b1f] placeholder-[#b8a698] resize-none"
              />
            </div>

            {/* [유효성 검사 에러 알림 영역] */}
            {errorMessage && (
              <div 
                role="alert" 
                className="bg-[#fdeded] text-[#b71c1c] border border-[#f5c6cb] rounded-xl p-3 flex items-center gap-2 text-sm font-medium animate-fadeIn"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 
              [예상 금액 영역]
              - 주문하기 버튼 바로 위에 큰 글씨(24px), 갈색, 굵게, 가운데 정렬
              - 요구사항: "예상 금액: 5,000원"
            */}
            <div className="pt-2 pb-1 text-center bg-[#fbf8f4] py-3.5 px-4 rounded-xl border border-[#ebdccb]">
              <div className="text-xs font-medium text-[#8c6b54] mb-0.5">실시간 자동 계산</div>
              <div className="text-[24px] font-bold text-[#6b4226] tracking-tight">
                예상 금액: {estimatedTotalPrice.toLocaleString()}원
              </div>
            </div>

            {/* 8. 주문하기 버튼 & 9. 다시 작성 버튼 */}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 bg-[#6b4226] hover:bg-[#7e4f30] active:scale-[0.99] text-white font-bold rounded-xl shadow transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>주문 전송 중...</span>
                  </>
                ) : (
                  <>
                    <span>☕</span>
                    <span>주문하기</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="py-3 px-4 bg-[#f2e7db] hover:bg-[#ebdccb] active:scale-[0.99] text-[#6b4226] font-semibold rounded-xl border border-[#d8cbbf] transition-all flex items-center gap-1.5 cursor-pointer text-sm"
                title="모든 입력값 초기화"
              >
                <RotateCcw className="w-4 h-4" />
                <span>다시 작성</span>
              </button>
            </div>

            {/* 
              [주문 확인 메시지 영역]
              - 연두색 배경, 초록 글씨, 둥근 모서리
              - 예: "홍길동님, 카페라떼 M사이즈 (샷 추가) 1잔, 총 5,000원 주문이 접수되었습니다!"
            */}
            {confirmationMessage && (
              <div 
                className="bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9] rounded-xl p-4 mt-4 shadow-sm animate-fadeIn"
              >
                <div className="flex items-start gap-2.5">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#2e7d32]" />
                  <div className="text-sm font-semibold leading-relaxed">
                    {confirmationMessage}
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-[#c8e6c9] flex items-center justify-between text-xs text-[#388e3c]">
                  <span>
                    {isConnectedToSupabase ? '🟢 Supabase DB에 저장되었습니다.' : '💾 로컬 저장소에 보관되었습니다.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('board')}
                    className="underline font-bold hover:text-[#1b5e20] cursor-pointer"
                  >
                    게시판에서 확인 →
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {/* ==================================================== */}
        {/* TAB 2: 카페 주문 내역 / 게시판 (Cafe Board)           */}
        {/* ==================================================== */}
        {activeTab === 'board' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#ebdccb]">
              <div>
                <h2 className="text-base font-bold text-[#6b4226]">주문 접수 게시판</h2>
                <p className="text-xs text-[#8c6b54]">
                  {isConnectedToSupabase ? 'Supabase 실시간 데이터베이스 연동 중' : '로컬 저장소 주문 목록'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadOrders}
                  className="p-1.5 text-[#6b4226] hover:bg-[#f2e7db] rounded-lg transition-colors cursor-pointer"
                  title="주문 목록 새로고침"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <span className="text-xs px-2.5 py-1 bg-[#6b4226]/10 text-[#6b4226] font-semibold rounded-full">
                  총 {orders.length}건
                </span>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="py-12 text-center text-[#8c6b54]">
                <Coffee className="w-10 h-10 mx-auto text-[#ebdccb] mb-2" />
                <p className="text-sm">아직 접수된 주문이 없습니다.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('order')}
                  className="mt-3 text-xs font-bold text-[#6b4226] underline cursor-pointer"
                >
                  첫 주문을 작성해보세요!
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-3.5 bg-[#faf6f0] rounded-xl border border-[#ebdccb] hover:border-[#6b4226]/40 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs text-[#8c6b54] mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[#6b4226]">{ord.id}</span>
                        {ord.isFromSupabase && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#3ecf8e]/20 text-[#15803d] font-bold rounded">
                            Supabase
                          </span>
                        )}
                      </div>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {ord.orderedAt}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <div className="text-sm font-bold text-[#422917]">
                        {ord.customerName} 고객님
                      </div>
                      <div className="text-sm font-bold text-[#6b4226]">
                        {ord.totalPrice.toLocaleString()}원
                      </div>
                    </div>

                    <div className="text-xs text-[#6b513d] mt-1.5 bg-white p-2.5 rounded-lg border border-[#ebdccb]/60">
                      <div className="font-medium">
                        ☕ {ord.beverageName} ({ord.sizeName}사이즈) × {ord.quantity}잔
                      </div>
                      {ord.options.length > 0 && (
                        <div className="text-[#8c6b54] mt-0.5">
                          추가옵션: {ord.options.join(', ')}
                        </div>
                      )}
                      {ord.requests && ord.requests !== '요청사항 없음' && (
                        <div className="text-[#a0522d] mt-1 italic">
                          "{ord.requests}"
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('order')}
                className="w-full py-2.5 bg-[#6b4226] hover:bg-[#7e4f30] text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>새로운 주문 작성하기</span>
              </button>
            </div>
          </div>
        )}

        {/* 
          [하단 푸터 영역]
        */}
        <div className="bg-[#faf6f0] p-4 text-center border-t border-[#ebdccb] text-xs text-[#8c6b54]">
          <p className="font-medium">바이브 카페 • 매일 08:30 ~ 22:00 영업</p>
          <p className="text-[11px] text-[#a89280] mt-0.5">
            따뜻한 커피 한 잔과 함께 편안한 하루를 보내세요.
          </p>
        </div>
      </main>
    </div>
  );
}
