export type Spread = {
  id: string;
  kind: 'cover' | 'work' | 'services';
  title: string;
  task?: string;
  isConcept?: boolean;
  left?: string;
  right: string;
  alt: string;
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
