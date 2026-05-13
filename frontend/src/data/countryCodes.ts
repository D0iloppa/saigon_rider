export interface CountryCode {
  iso: string;   // 2-letter ISO 3166-1 alpha-2 (used with flag-icons: fi fi-{iso.toLowerCase()})
  dial: string;  // e.g. "+84"
  name: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  // 동남아 우선
  { iso: 'VN', dial: '+84',  name: 'Việt Nam'       },
  { iso: 'TH', dial: '+66',  name: 'Thailand'       },
  { iso: 'ID', dial: '+62',  name: 'Indonesia'      },
  { iso: 'PH', dial: '+63',  name: 'Philippines'    },
  { iso: 'MY', dial: '+60',  name: 'Malaysia'       },
  { iso: 'SG', dial: '+65',  name: 'Singapore'      },
  { iso: 'MM', dial: '+95',  name: 'Myanmar'        },
  { iso: 'KH', dial: '+855', name: 'Cambodia'       },
  { iso: 'LA', dial: '+856', name: 'Laos'           },
  { iso: 'BN', dial: '+673', name: 'Brunei'         },
  { iso: 'TL', dial: '+670', name: 'Timor-Leste'    },
  // 동아시아
  { iso: 'KR', dial: '+82',  name: '대한민국'        },
  { iso: 'JP', dial: '+81',  name: '日本'            },
  { iso: 'CN', dial: '+86',  name: '中国'            },
  { iso: 'TW', dial: '+886', name: 'Taiwan'         },
  { iso: 'HK', dial: '+852', name: 'Hong Kong'      },
  { iso: 'MO', dial: '+853', name: 'Macau'          },
  // 남아시아
  { iso: 'IN', dial: '+91',  name: 'India'          },
  { iso: 'PK', dial: '+92',  name: 'Pakistan'       },
  { iso: 'BD', dial: '+880', name: 'Bangladesh'     },
  { iso: 'LK', dial: '+94',  name: 'Sri Lanka'      },
  { iso: 'NP', dial: '+977', name: 'Nepal'          },
  // 중동
  { iso: 'AE', dial: '+971', name: 'UAE'            },
  { iso: 'SA', dial: '+966', name: 'Saudi Arabia'   },
  { iso: 'QA', dial: '+974', name: 'Qatar'          },
  { iso: 'KW', dial: '+965', name: 'Kuwait'         },
  { iso: 'BH', dial: '+973', name: 'Bahrain'        },
  { iso: 'OM', dial: '+968', name: 'Oman'           },
  { iso: 'JO', dial: '+962', name: 'Jordan'         },
  { iso: 'IL', dial: '+972', name: 'Israel'         },
  { iso: 'TR', dial: '+90',  name: 'Türkiye'        },
  { iso: 'IR', dial: '+98',  name: 'Iran'           },
  // 유럽
  { iso: 'GB', dial: '+44',  name: 'United Kingdom' },
  { iso: 'DE', dial: '+49',  name: 'Deutschland'    },
  { iso: 'FR', dial: '+33',  name: 'France'         },
  { iso: 'IT', dial: '+39',  name: 'Italia'         },
  { iso: 'ES', dial: '+34',  name: 'España'         },
  { iso: 'PT', dial: '+351', name: 'Portugal'       },
  { iso: 'NL', dial: '+31',  name: 'Netherlands'    },
  { iso: 'BE', dial: '+32',  name: 'Belgium'        },
  { iso: 'CH', dial: '+41',  name: 'Switzerland'    },
  { iso: 'AT', dial: '+43',  name: 'Austria'        },
  { iso: 'SE', dial: '+46',  name: 'Sweden'         },
  { iso: 'NO', dial: '+47',  name: 'Norway'         },
  { iso: 'DK', dial: '+45',  name: 'Denmark'        },
  { iso: 'FI', dial: '+358', name: 'Finland'        },
  { iso: 'PL', dial: '+48',  name: 'Poland'         },
  { iso: 'RU', dial: '+7',   name: 'Россия'         },
  { iso: 'UA', dial: '+380', name: 'Ukraine'        },
  { iso: 'GR', dial: '+30',  name: 'Greece'         },
  { iso: 'RO', dial: '+40',  name: 'Romania'        },
  { iso: 'CZ', dial: '+420', name: 'Czechia'        },
  { iso: 'HU', dial: '+36',  name: 'Hungary'        },
  // 아메리카
  { iso: 'US', dial: '+1',   name: 'United States'  },
  { iso: 'CA', dial: '+1',   name: 'Canada'         },
  { iso: 'MX', dial: '+52',  name: 'México'         },
  { iso: 'BR', dial: '+55',  name: 'Brasil'         },
  { iso: 'AR', dial: '+54',  name: 'Argentina'      },
  { iso: 'CL', dial: '+56',  name: 'Chile'          },
  { iso: 'CO', dial: '+57',  name: 'Colombia'       },
  { iso: 'PE', dial: '+51',  name: 'Perú'           },
  // 아프리카/오세아니아
  { iso: 'AU', dial: '+61',  name: 'Australia'      },
  { iso: 'NZ', dial: '+64',  name: 'New Zealand'    },
  { iso: 'ZA', dial: '+27',  name: 'South Africa'   },
  { iso: 'NG', dial: '+234', name: 'Nigeria'        },
  { iso: 'EG', dial: '+20',  name: 'Egypt'          },
  { iso: 'GH', dial: '+233', name: 'Ghana'          },
  { iso: 'KE', dial: '+254', name: 'Kenya'          },
  { iso: 'MA', dial: '+212', name: 'Morocco'        },
];

export const DEFAULT_COUNTRY = COUNTRY_CODES[0]; // +84 Vietnam
