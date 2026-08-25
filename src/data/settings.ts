export const dayDefinitions = [
  { key: 'monday', label: '週一', schemaDay: 'Monday' },
  { key: 'tuesday', label: '週二', schemaDay: 'Tuesday' },
  { key: 'wednesday', label: '週三', schemaDay: 'Wednesday' },
  { key: 'thursday', label: '週四', schemaDay: 'Thursday' },
  { key: 'friday', label: '週五', schemaDay: 'Friday' },
  { key: 'saturday', label: '週六', schemaDay: 'Saturday' },
  { key: 'sunday', label: '週日', schemaDay: 'Sunday' },
] as const;

export type DayKey = (typeof dayDefinitions)[number]['key'];
export type BookingMode = 'appointment_only' | 'reservation_recommended';
export type BusinessStatus = 'open' | 'full' | 'closed' | 'paused';

export interface EditableSiteSettings {
  phone: string;
  lineId: string;
  address: string;
  businessHours: Record<DayKey, string>;
  bookingMode: BookingMode;
  businessStatus: BusinessStatus;
}

export interface SettingsValidationIssue {
  field: string;
  message: string;
}

export type SettingsValidationResult =
  | { ok: true; value: EditableSiteSettings }
  | { ok: false; issues: SettingsValidationIssue[] };

export const bookingModeOptions: ReadonlyArray<{ value: BookingMode; label: string }> = [
  { value: 'appointment_only', label: '全預約制' },
  { value: 'reservation_recommended', label: '建議提前預約' },
];

export const businessStatusOptions: ReadonlyArray<{ value: BusinessStatus; label: string }> = [
  { value: 'open', label: '正常營業' },
  { value: 'full', label: '今日預約已滿' },
  { value: 'closed', label: '今日公休' },
  { value: 'paused', label: '暫停接受預約' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBookingMode(value: unknown): value is BookingMode {
  return value === 'appointment_only' || value === 'reservation_recommended';
}

function isBusinessStatus(value: unknown): value is BusinessStatus {
  return value === 'open' || value === 'full' || value === 'closed' || value === 'paused';
}

function normalizeHours(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized === '公休') return normalized;
  return /^(?:[01]\d|2[0-3]):[0-5]\d - (?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)
    ? normalized
    : null;
}

export function validateEditableSiteSettings(value: unknown): SettingsValidationResult {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ field: 'settings', message: '設定格式不正確。' }] };
  }

  const issues: SettingsValidationIssue[] = [];
  const phone = typeof value.phone === 'string' ? value.phone.replace(/\D/g, '') : '';
  const lineId = typeof value.lineId === 'string' ? value.lineId.trim() : '';
  const address = typeof value.address === 'string' ? value.address.trim() : '';

  if (!/^\d{8,12}$/.test(phone)) {
    issues.push({ field: 'phone', message: '電話請輸入 8 至 12 位數字。' });
  }
  if (!/^@?[A-Za-z0-9._-]{4,50}$/.test(lineId)) {
    issues.push({ field: 'lineId', message: 'LINE ID 格式不正確。' });
  }
  if (address.length < 5 || address.length > 120) {
    issues.push({ field: 'address', message: '地址長度需為 5 至 120 個字。' });
  }

  const rawHours = isRecord(value.businessHours) ? value.businessHours : {};
  const businessHours = {} as Record<DayKey, string>;
  for (const day of dayDefinitions) {
    const hours = normalizeHours(rawHours[day.key]);
    if (!hours) {
      issues.push({ field: `businessHours.${day.key}`, message: `${day.label}時間格式不正確。` });
    } else {
      businessHours[day.key] = hours;
    }
  }

  if (!isBookingMode(value.bookingMode)) {
    issues.push({ field: 'bookingMode', message: '預約方式不正確。' });
  }
  if (!isBusinessStatus(value.businessStatus)) {
    issues.push({ field: 'businessStatus', message: '營業狀態不正確。' });
  }

  if (issues.length > 0 || !isBookingMode(value.bookingMode) || !isBusinessStatus(value.businessStatus)) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      phone,
      lineId,
      address,
      businessHours,
      bookingMode: value.bookingMode,
      businessStatus: value.businessStatus,
    },
  };
}

export function formatPhone(phone: string): string {
  if (/^09\d{8}$/.test(phone)) {
    return `${phone.slice(0, 4)}-${phone.slice(4, 7)}-${phone.slice(7)}`;
  }
  return phone;
}

export function deriveSiteSettings(settings: EditableSiteSettings, businessName: string) {
  const hoursValues = dayDefinitions.map((day) => settings.businessHours[day.key]);
  const firstHours = hoursValues[0];
  const sameHoursEveryDay = hoursValues.every((hours) => hours === firstHours);
  const openEveryDay = hoursValues.every((hours) => hours !== '公休');
  const hoursLabel = sameHoursEveryDay && firstHours !== '公休'
    ? `每日 ${firstHours}`
    : '各日營業時間請見聯絡頁';

  const bookingLabel = settings.bookingMode === 'appointment_only'
    ? `${openEveryDay ? '全年無休・' : ''}全預約制`
    : '建議提前預約';

  const businessNoticeByStatus: Record<BusinessStatus, string> = {
    open: settings.bookingMode === 'appointment_only'
      ? '目前採全預約制，歡迎透過 LINE 詢問可預約時段。'
      : '歡迎透過 LINE 或電話詢問近期可預約時段。',
    full: '今日預約時段已滿，歡迎詢問其他日期。',
    closed: '本店今日公休，訊息將於營業時間依序回覆。',
    paused: '目前暫停接受新預約，恢復時間將另行公告。',
  };

  const mapQuery = `${businessName} ${settings.address}`;
  const openingHoursSpecification = dayDefinitions.flatMap((day) => {
    const hours = settings.businessHours[day.key];
    if (hours === '公休') return [];
    const [opens, closes] = hours.split(' - ');
    return [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: day.schemaDay,
      opens,
      closes,
    }];
  });

  return {
    phoneDisplay: formatPhone(settings.phone),
    phoneUrl: `tel:${settings.phone}`,
    lineUrl: `https://line.me/ti/p/${encodeURIComponent(settings.lineId)}`,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`,
    mapEmbedUrl: `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`,
    hoursLabel,
    bookingLabel,
    businessNotice: businessNoticeByStatus[settings.businessStatus],
    openingHoursSpecification,
  };
}
