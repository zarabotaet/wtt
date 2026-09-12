export type MatchStatus = 'scheduled' | 'live' | 'done';

export interface Player {
  name: string;
  seed: string | number | null;
}

export interface Match {
  code: string;
  normCode: string;
  startDate: string;
  endDate: string;
  status: MatchStatus;
  round: string;
  subEvent: string | undefined;
  table: string;
  venue: string;
  players: Player[];
  gameScores: [number[], number[]] | null;
  winnerIdx: 0 | 1 | null;
  isTbd: boolean;
}

export type EventStatus = 'ongoing' | 'future' | 'past';

export interface NormalizedEvent {
  eventId: string;
  eventName: string;
  startDateTime: string;
  endDateTime: string;
  status: EventStatus;
}

export interface RawEventListItem {
  eventId: string;
  eventName: string;
  startDateTime: string;
  endDateTime: string;
}

export interface RawStart {
  Competitor?: {
    Description?: { TeamName?: string };
    Seed?: string | number;
  };
}

export interface RawUnit {
  Code: string;
  ScheduleStatus: 'Scheduled' | 'Start List' | 'Official' | string;
  StartDate: string;
  EndDate: string;
  StartList?: { Start?: RawStart[] };
  ItemDescription?: { Value: string }[];
  SubEvent?: string;
  VenueDescription?: { LocationName?: string; VenueName?: string };
}

export interface RawScheduleItem {
  Competition: { Unit: RawUnit[] };
}

export interface MatchCardCompetitor {
  competitiorName?: string;
  scores?: string;
}

export interface MatchCard {
  competitiors?: MatchCardCompetitor[];
  matchConfig?: { bestOfXGames?: number };
  subEventDescription?: string;
  subEventName?: string;
  tableName?: string;
  venueName?: string;
}

export interface RawArchiveItem {
  documentCode: string;
  startDateLocal: string;
  match_card: MatchCard | null;
}

export interface RawResults10Item {
  documentCode: string;
  match_card: MatchCard;
}

export interface RawLiveIdsItem {
  e: string;
  d: string;
  s: string;
}
