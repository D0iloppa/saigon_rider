export interface CountryCode {
  iso: string;   // 2-letter ISO 3166-1 alpha-2
  dial: string;  // e.g. "+84"
  name: string;
  flag: string;  // Unicode flag emoji
}

function flag(iso: string): string {
  return [...iso.toUpperCase()].map(
    (c) => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
  ).join('');
}

export const COUNTRY_CODES: CountryCode[] = [
  // 동남아 우선
  { iso: 'VN', dial: '+84',  name: 'Việt Nam',        flag: flag('VN') },
  { iso: 'TH', dial: '+66',  name: 'Thailand',        flag: flag('TH') },
  { iso: 'ID', dial: '+62',  name: 'Indonesia',       flag: flag('ID') },
  { iso: 'PH', dial: '+63',  name: 'Philippines',     flag: flag('PH') },
  { iso: 'MY', dial: '+60',  name: 'Malaysia',        flag: flag('MY') },
  { iso: 'SG', dial: '+65',  name: 'Singapore',       flag: flag('SG') },
  { iso: 'MM', dial: '+95',  name: 'Myanmar',         flag: flag('MM') },
  { iso: 'KH', dial: '+855', name: 'Cambodia',        flag: flag('KH') },
  { iso: 'LA', dial: '+856', name: 'Laos',            flag: flag('LA') },
  { iso: 'BN', dial: '+673', name: 'Brunei',          flag: flag('BN') },
  { iso: 'TL', dial: '+670', name: 'Timor-Leste',     flag: flag('TL') },
  // 동아시아
  { iso: 'KR', dial: '+82',  name: '대한민국',         flag: flag('KR') },
  { iso: 'JP', dial: '+81',  name: '日本',             flag: flag('JP') },
  { iso: 'CN', dial: '+86',  name: '中国',             flag: flag('CN') },
  { iso: 'TW', dial: '+886', name: 'Taiwan',          flag: flag('TW') },
  { iso: 'HK', dial: '+852', name: 'Hong Kong',       flag: flag('HK') },
  { iso: 'MO', dial: '+853', name: 'Macau',           flag: flag('MO') },
  // 남아시아
  { iso: 'IN', dial: '+91',  name: 'India',           flag: flag('IN') },
  { iso: 'PK', dial: '+92',  name: 'Pakistan',        flag: flag('PK') },
  { iso: 'BD', dial: '+880', name: 'Bangladesh',      flag: flag('BD') },
  { iso: 'LK', dial: '+94',  name: 'Sri Lanka',       flag: flag('LK') },
  { iso: 'NP', dial: '+977', name: 'Nepal',           flag: flag('NP') },
  // 중동
  { iso: 'AE', dial: '+971', name: 'UAE',             flag: flag('AE') },
  { iso: 'SA', dial: '+966', name: 'Saudi Arabia',    flag: flag('SA') },
  { iso: 'QA', dial: '+974', name: 'Qatar',           flag: flag('QA') },
  { iso: 'KW', dial: '+965', name: 'Kuwait',          flag: flag('KW') },
  { iso: 'BH', dial: '+973', name: 'Bahrain',         flag: flag('BH') },
  { iso: 'OM', dial: '+968', name: 'Oman',            flag: flag('OM') },
  { iso: 'JO', dial: '+962', name: 'Jordan',          flag: flag('JO') },
  { iso: 'IL', dial: '+972', name: 'Israel',          flag: flag('IL') },
  { iso: 'TR', dial: '+90',  name: 'Türkiye',         flag: flag('TR') },
  { iso: 'IR', dial: '+98',  name: 'Iran',            flag: flag('IR') },
  // 유럽
  { iso: 'GB', dial: '+44',  name: 'United Kingdom',  flag: flag('GB') },
  { iso: 'DE', dial: '+49',  name: 'Deutschland',     flag: flag('DE') },
  { iso: 'FR', dial: '+33',  name: 'France',          flag: flag('FR') },
  { iso: 'IT', dial: '+39',  name: 'Italia',          flag: flag('IT') },
  { iso: 'ES', dial: '+34',  name: 'España',          flag: flag('ES') },
  { iso: 'PT', dial: '+351', name: 'Portugal',        flag: flag('PT') },
  { iso: 'NL', dial: '+31',  name: 'Netherlands',     flag: flag('NL') },
  { iso: 'BE', dial: '+32',  name: 'Belgium',         flag: flag('BE') },
  { iso: 'CH', dial: '+41',  name: 'Switzerland',     flag: flag('CH') },
  { iso: 'AT', dial: '+43',  name: 'Austria',         flag: flag('AT') },
  { iso: 'SE', dial: '+46',  name: 'Sweden',          flag: flag('SE') },
  { iso: 'NO', dial: '+47',  name: 'Norway',          flag: flag('NO') },
  { iso: 'DK', dial: '+45',  name: 'Denmark',         flag: flag('DK') },
  { iso: 'FI', dial: '+358', name: 'Finland',         flag: flag('FI') },
  { iso: 'PL', dial: '+48',  name: 'Poland',          flag: flag('PL') },
  { iso: 'RU', dial: '+7',   name: 'Россия',          flag: flag('RU') },
  { iso: 'UA', dial: '+380', name: 'Ukraine',         flag: flag('UA') },
  { iso: 'GR', dial: '+30',  name: 'Greece',          flag: flag('GR') },
  { iso: 'RO', dial: '+40',  name: 'Romania',         flag: flag('RO') },
  { iso: 'CZ', dial: '+420', name: 'Czechia',         flag: flag('CZ') },
  { iso: 'HU', dial: '+36',  name: 'Hungary',         flag: flag('HU') },
  // 아메리카
  { iso: 'US', dial: '+1',   name: 'United States',   flag: flag('US') },
  { iso: 'CA', dial: '+1',   name: 'Canada',          flag: flag('CA') },
  { iso: 'MX', dial: '+52',  name: 'México',          flag: flag('MX') },
  { iso: 'BR', dial: '+55',  name: 'Brasil',          flag: flag('BR') },
  { iso: 'AR', dial: '+54',  name: 'Argentina',       flag: flag('AR') },
  { iso: 'CL', dial: '+56',  name: 'Chile',           flag: flag('CL') },
  { iso: 'CO', dial: '+57',  name: 'Colombia',        flag: flag('CO') },
  { iso: 'PE', dial: '+51',  name: 'Perú',            flag: flag('PE') },
  // 아프리카/오세아니아
  { iso: 'AU', dial: '+61',  name: 'Australia',       flag: flag('AU') },
  { iso: 'NZ', dial: '+64',  name: 'New Zealand',     flag: flag('NZ') },
  { iso: 'ZA', dial: '+27',  name: 'South Africa',    flag: flag('ZA') },
  { iso: 'NG', dial: '+234', name: 'Nigeria',         flag: flag('NG') },
  { iso: 'EG', dial: '+20',  name: 'Egypt',           flag: flag('EG') },
  { iso: 'GH', dial: '+233', name: 'Ghana',           flag: flag('GH') },
  { iso: 'KE', dial: '+254', name: 'Kenya',           flag: flag('KE') },
  { iso: 'MA', dial: '+212', name: 'Morocco',         flag: flag('MA') },
];

export const DEFAULT_COUNTRY = COUNTRY_CODES[0]; // +84 Vietnam
