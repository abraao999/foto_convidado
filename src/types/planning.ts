export type TableFill = 'available' | 'partial' | 'full';

export interface TableInfo {
  id: string;
  galleryId: string;
  name: string;
  seats: number;
  occupied: number;
  available: number;
  fill: TableFill;
  notes?: string;
  sortOrder: number;
}

export interface SeatedGuest {
  id: string;
  fullName: string;
  confirmedCompanionCount: number;
  partySize: number;
  tableId?: string;
  attendanceStatus: string;
}

export interface UnconfirmedGuest {
  id: string;
  fullName: string;
  attendanceStatus: string;
  inviteStatus: string;
}

export const tableFillLabel: Record<TableFill, string> = {
  available: 'Disponível',
  partial: 'Parcialmente ocupada',
  full: 'Lotada',
};

export interface PlanningSummary {
  event: {
    id: string;
    title: string;
    eventDate?: string;
    location?: string;
    slug: string;
  };
  guests: {
    total: number;
    confirmed: number;
    declined: number;
    pending: number;
    noResponse: number;
    confirmedPeople: number;
    confirmedCompanions: number;
    expectedPeople: number;
  };
  tables: {
    count: number;
    seats: number;
    occupied: number;
    available: number;
  };
  gifts: {
    total: number;
    purchased: number;
    available: number;
    reserved: number;
  };
}
