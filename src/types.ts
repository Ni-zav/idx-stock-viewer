export interface ChartData {
  date: string;
  ticker: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumeData {
  time: number;
  value: number;
  color: string;
}

export interface TickerStats {
  ticker: string;
  current: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  volume: number;
  dailyChangePercent?: number;
  weeklyChangePercent?: number;
  monthlyChangePercent?: number;
  sixMonthChangePercent?: number;
  oneYearChangePercent?: number;
  fiveYearChangePercent?: number;
  maxChangePercent?: number;
  // Volume statistics
  dailyVolume?: number;
  weeklyVolume?: number;
  monthlyVolume?: number;
  sixMonthVolume?: number;
  oneYearVolume?: number;
  fiveYearVolume?: number;
  maxVolume?: number;
  // Period-based Open/High/Low stats
  periodStats?: {
    [key: string]: {
      open: number;
      high: number;
      low: number;
    };
  };
}
