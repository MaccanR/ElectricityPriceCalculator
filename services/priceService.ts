export interface SpotPricePoint {
  timestamp: string;
  price: number;
  isFuture: boolean;
}

interface LatestPricesResponse {
  prices?: Array<{
    price: number;
    startDate: string;
    endDate: string;
  }>;
}

const LATEST_PRICES_URL = 'https://api.porssisahko.net/v1/latest-prices.json';

const toHourIso = (dateInput: string | Date): string => {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    return '';
  }
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
};

export const fetchFinlandSpotPriceTimeline = async (): Promise<SpotPricePoint[]> => {
  try {
    const response = await fetch(LATEST_PRICES_URL);
    if (!response.ok) {
      throw new Error(`Spot price API failed with status ${response.status}`);
    }

    const payload = (await response.json()) as LatestPricesResponse;
    const now = Date.now();

    const points = (payload.prices || [])
      .map((entry) => {
        const timestamp = toHourIso(entry.startDate);
        const price = Number(entry.price);

        if (!timestamp || !Number.isFinite(price)) {
          return null;
        }

        return {
          timestamp,
          price,
          isFuture: new Date(timestamp).getTime() > now,
        } as SpotPricePoint;
      })
      .filter((entry): entry is SpotPricePoint => entry !== null)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return points;
  } catch (error) {
    console.error('Error fetching Finland spot prices:', error);
    return [];
  }
};
