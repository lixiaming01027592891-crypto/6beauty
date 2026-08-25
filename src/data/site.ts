import rawSettings from './settings.json';
import {
  dayDefinitions,
  deriveSiteSettings,
  validateEditableSiteSettings,
} from './settings';

export interface Service {
  slug: string;
  title: string;
  englishTitle: string;
  subtitle: string;
  summary: string;
  description: string[];
  image: string;
  imageAlt: string;
  tag: string;
  highlights: string[];
  suitableFor: string[];
  note: string;
}

const businessName = '6號美容美學';
const settingsValidation = validateEditableSiteSettings(rawSettings);

if (!settingsValidation.ok) {
  throw new Error(`網站基本資料格式不正確：${settingsValidation.issues.map((issue) => issue.message).join('、')}`);
}

export const editableSiteSettings = settingsValidation.value;
const derivedSettings = deriveSiteSettings(editableSiteSettings, businessName);

export const siteConfig = {
  brandName: '6號美學',
  businessName,
  englishName: 'No.6 Aesthetics',
  defaultTitle: '6號美學｜桃園藝文特區美容護膚、清粉刺與熱蠟除毛',
  defaultDescription:
    '6號美學位於桃園藝文特區，提供臉部護理、身體 SPA、熱蠟除毛、敏感肌保養與孕婦護理，全預約制。',
  siteUrl: 'https://no6beauty.net',
  phoneDisplay: derivedSettings.phoneDisplay,
  phoneUrl: derivedSettings.phoneUrl,
  lineId: editableSiteSettings.lineId,
  lineUrl: derivedSettings.lineUrl,
  address: editableSiteSettings.address,
  mapUrl: derivedSettings.mapUrl,
  mapEmbedUrl: derivedSettings.mapEmbedUrl,
  hoursLabel: derivedSettings.hoursLabel,
  bookingLabel: derivedSettings.bookingLabel,
  businessNotice: derivedSettings.businessNotice,
  openingHoursSpecification: derivedSettings.openingHoursSpecification,
};

export const navItems = [
  { href: '/', label: '首頁' },
  { href: '/services/', label: '服務項目' },
  { href: '/about/', label: '關於我們' },
  { href: '/blog/', label: '美容知識' },
  { href: '/contact/', label: '聯絡預約' },
] as const;

export const businessHours = dayDefinitions.map((day) => ({
  day: day.label,
  hours: editableSiteSettings.businessHours[day.key],
}));

export const services: Service[] = [
  {
    slug: 'facial-care',
    title: '臉部護理',
    englishTitle: 'Facial Care',
    subtitle: '清粉刺・煥膚・日常保養',
    summary:
      '先了解膚況與日常保養習慣，再依需求安排清潔、粉刺護理、臉部撥筋與修眉等服務。',
    description: [
      '臉部護理從溝通膚況與在意的問題開始，依當日狀況調整清潔與保養步驟，不以單一固定流程套用在每位顧客身上。',
      '服務可包含清潔、粉刺護理、臉部撥筋、修眉與保濕保養；杏仁酸、藻針等項目會依現場評估與預約內容安排。',
    ],
    image: '/images/service-facial-real.jpg',
    imageAlt: '美容師為顧客進行溫和臉部保養',
    tag: '人氣課程',
    highlights: ['預約前先溝通膚況', '依需求安排護理步驟', '提供護理後日常保養提醒'],
    suitableFor: ['想進行日常臉部清潔保養', '在意粉刺與肌膚觸感', '希望獲得個人化護理建議'],
    note: '實際服務內容會依當日膚況調整；若正接受皮膚科治療或有明顯不適，請先告知。',
  },
  {
    slug: 'body-spa',
    title: '身體 SPA',
    englishTitle: 'Body Spa',
    subtitle: '經絡按摩・精油護理',
    summary:
      '以放鬆與舒適為核心，依需求安排經絡按摩、芳療與身體舒壓，讓日常緊繃有一段安靜休息的時間。',
    description: [
      '身體 SPA 會先了解平時容易緊繃的部位與按摩偏好，再安排合適的力道與服務節奏。',
      '可依預約內容安排經絡護理、芳療與精油舒壓，實際使用品項及服務範圍請於預約時確認。',
    ],
    image: '/images/service-spa.jpg',
    imageAlt: '身體 SPA 與精油舒壓服務',
    tag: '舒壓首選',
    highlights: ['預先溝通力道與部位', '安靜且具隱私的預約時段', '依個人感受調整服務節奏'],
    suitableFor: ['想安排日常放鬆時間', '長時間維持固定姿勢', '偏好精油與經絡舒壓'],
    note: '孕期、術後或有特殊身體狀況者，預約前請先說明並依醫療專業建議安排。',
  },
  {
    slug: 'waxing',
    title: '熱蠟除毛',
    englishTitle: 'Waxing',
    subtitle: '女士除毛・私密處護理',
    summary:
      '提供女士熱蠟除毛服務，重視操作前溝通、服務隱私與護理後注意事項。',
    description: [
      '熱蠟除毛會依服務部位、肌膚狀況與過往除毛經驗先行溝通，確認適合的安排後再開始服務。',
      '可預約腋下、手腳及私密處等部位；實際可服務範圍、所需時間與事前準備請透過 LINE 詢問。',
    ],
    image: '/images/service-waxing.jpg',
    imageAlt: '專業熱蠟除毛服務用品',
    tag: '細緻護理',
    highlights: ['重視個人隱私', '服務前確認部位與狀況', '說明護理後注意事項'],
    suitableFor: ['希望維持肌膚整潔觸感', '想預約腋下或手腳除毛', '需要私密處除毛服務'],
    note: '若服務部位有傷口、發炎、曬傷或近期接受特殊療程，請先告知並暫緩安排。',
  },
  {
    slug: 'sensitive-skin-care',
    title: '敏感肌保養',
    englishTitle: 'Gentle Skincare',
    subtitle: '溫和清潔・保濕修護',
    summary:
      '針對容易乾燥或不穩定的肌膚，採取較溫和的清潔與保養節奏，並依當日狀況彈性調整。',
    description: [
      '敏感肌保養著重事前詢問與減少不必要刺激，服務前會了解近期使用產品、膚況與在意的部位。',
      '實際步驟以溫和清潔、保濕與舒適感受為原則；若當日肌膚明顯不適，會建議暫緩美容服務。',
    ],
    image: '/images/service-skincare.jpg',
    imageAlt: '溫和肌膚保養與保濕護理',
    tag: '溫和專業',
    highlights: ['先了解近期膚況', '減少不必要刺激', '依當日感受彈性調整'],
    suitableFor: ['肌膚容易乾燥緊繃', '希望採取溫和保養方式', '想建立較穩定的日常護理節奏'],
    note: '本服務不取代醫療診斷與治療；持續紅腫、疼痛或有其他疑慮時，請先諮詢皮膚科。',
  },
  {
    slug: 'prenatal-care',
    title: '孕婦護理',
    englishTitle: 'Prenatal Care',
    subtitle: '孕期保養・安心舒壓',
    summary:
      '依孕期與個人狀況安排較溫和的護理內容，預約前充分了解需求與需要避開的項目。',
    description: [
      '孕期的身體感受與肌膚狀況可能隨階段變化，預約時請主動告知孕期、近期狀況與醫師提醒。',
      '服務以舒適、溫和及充分溝通為原則，實際內容會依當日感受調整，不勉強進行任何不舒服的步驟。',
    ],
    image: '/images/service-prenatal.jpg',
    imageAlt: '孕期專屬溫和保養與舒壓服務',
    tag: '準媽媽專屬',
    highlights: ['預約前確認孕期與狀況', '採取溫和服務節奏', '隨時依感受調整或停止'],
    suitableFor: ['孕期想安排溫和臉部保養', '希望有安靜放鬆的預約時段', '願意在服務前充分說明身體狀況'],
    note: '如有高風險孕期、身體不適或任何醫療疑慮，請先取得醫療專業人員的建議。',
  },
];

export function getServiceBySlug(slug: string) {
  return services.find((service) => service.slug === slug);
}
