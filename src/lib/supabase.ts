import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ==========================================
// Supabase 설정 및 클라이언트 관리 모듈
// ==========================================

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

// 로컬 스토리지 키
const STORAGE_KEY = 'vibe_cafe_supabase_config';

// 1. 현재 저장된 Supabase 설정 가져오기 (환경변수 우선, 없으면 로컬 스토리지)
export function getStoredSupabaseConfig(): SupabaseConfig {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  if (envUrl && envKey && !envUrl.includes('your-project')) {
    return { url: envUrl, anonKey: envKey };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.url && parsed.anonKey) {
        return parsed;
      }
    }
  } catch {
    // 로컬 스토리지 파싱 에러 무시
  }

  return { url: '', anonKey: '' };
}

// 2. 사용자가 UI에서 입력한 Supabase 설정 저장
export function saveSupabaseConfig(config: SupabaseConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    cachedClient = null; // 클라이언트 캐시 무효화
  } catch {
    console.error('Supabase 설정 저장 실패');
  }
}

// 3. 싱글톤 클라이언트 캐시
let cachedClient: SupabaseClient | null = null;
let lastUsedConfig: string = '';

export function getSupabaseClient(): SupabaseClient | null {
  const config = getStoredSupabaseConfig();
  if (!config.url || !config.anonKey) {
    return null;
  }

  const configKey = `${config.url}_${config.anonKey}`;
  if (cachedClient && lastUsedConfig === configKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
      },
    });
    lastUsedConfig = configKey;
    return cachedClient;
  } catch (error) {
    console.error('Supabase 클라이언트 생성 실패:', error);
    return null;
  }
}

// 4. Supabase 연결 및 cafe_menu 테이블 존재 여부 테스트
export async function testSupabaseConnection(config?: SupabaseConfig): Promise<{
  success: boolean;
  message: string;
  tableExists?: boolean;
}> {
  let client: SupabaseClient;

  if (config && config.url && config.anonKey) {
    try {
      client = createClient(config.url, config.anonKey, {
        auth: { persistSession: false },
      });
    } catch {
      return { success: false, message: 'URL 형식 또는 키가 올바르지 않습니다.' };
    }
  } else {
    const active = getSupabaseClient();
    if (!active) {
      return { success: false, message: 'Supabase URL과 Anon Key가 입력되지 않았습니다.' };
    }
    client = active;
  }

  try {
    // cafe_menu 테이블에 1건 조회를 시도하여 테이블 및 권한 확인
    const { data, error } = await client
      .from('cafe_menu')
      .select('id')
      .limit(1);

    if (error) {
      // 테이블이 아직 생성되지 않은 경우 (42P01 error)
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        return {
          success: true,
          tableExists: false,
          message: 'Supabase 연결 성공! 단, cafe_menu 테이블 생성이 필요합니다.',
        };
      }
      return {
        success: false,
        message: `Supabase 에러: ${error.message} (코드: ${error.code})`,
      };
    }

    return {
      success: true,
      tableExists: true,
      message: 'Supabase 연결 및 cafe_menu 테이블 조회 성공!',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `연결 실패: ${errorMsg}`,
    };
  }
}

// ==========================================
// 데이터베이스 CRUD 함수
// ==========================================

export interface SupabaseOrderRow {
  id?: number;
  customer_name: string;
  phone_number?: string | null;
  beverage_name: string;
  size: string;
  options: string[];
  quantity: number;
  requests?: string | null;
  total_price: number;
  order_status?: string;
  created_at?: string;
}

// 주문서 cafe_menu 테이블에 INSERT
export async function insertOrderToSupabase(order: SupabaseOrderRow): Promise<{
  success: boolean;
  data?: SupabaseOrderRow;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Supabase 클라이언트가 설정되지 않았습니다.',
    };
  }

  try {
    const { data, error } = await client
      .from('cafe_menu')
      .insert([
        {
          customer_name: order.customer_name,
          phone_number: order.phone_number || null,
          beverage_name: order.beverage_name,
          size: order.size,
          options: order.options,
          quantity: order.quantity,
          requests: order.requests || null,
          total_price: order.total_price,
          order_status: order.order_status || '주문접수',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase INSERT 에러:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as SupabaseOrderRow };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

// cafe_menu 테이블에서 주문 목록 SELECT
export async function fetchOrdersFromSupabase(): Promise<{
  success: boolean;
  data: SupabaseOrderRow[];
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      data: [],
      error: 'Supabase가 아직 연결되지 않았습니다.',
    };
  }

  try {
    const { data, error } = await client
      .from('cafe_menu')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase SELECT 에러:', error);
      return { success: false, data: [], error: error.message };
    }

    return { success: true, data: (data as SupabaseOrderRow[]) || [] };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, data: [], error: errorMsg };
  }
}
