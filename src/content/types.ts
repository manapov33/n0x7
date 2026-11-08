export type Spread = {
  id: string;
  kind: 'cover' | 'work' | 'services';
  title: string;
  task?: string;
  isConcept?: boolean;
  left?: string;
  right: string;
  alt: string;
  /** Кадры ролика работы: public/<dir>/d-000.webp (count) и p-000.webp (phoneCount). */
  video?: { dir: string; count: number; phoneCount: number };
};

export type Service = { name: string; priceFrom: string };

export type Site = {
  name: 'N0X7';
  tagline: string;
  telegramUrl: string;
  phone: string;
  services: Service[];
  spreads: Spread[];
};
