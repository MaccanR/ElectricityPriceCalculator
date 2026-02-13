
import { PriceData, ModelMetric, ExperimentRun } from '../types';
import { FmiDataPoint } from './fmiService';
import { SpotPricePoint } from './priceService';

const toHourIso = (dateInput: string | Date): string => {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    return '';
  }
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
};

const mean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const buildHourlyProfile = (pairs: Array<{ timestamp: string; price: number }>): Record<number, number> => {
  const grouped: Record<number, number[]> = {};
  pairs.forEach((point) => {
    const hour = new Date(point.timestamp).getUTCHours();
    if (!grouped[hour]) grouped[hour] = [];
    grouped[hour].push(point.price);
  });

  const profile: Record<number, number> = {};
  for (let hour = 0; hour < 24; hour++) {
    profile[hour] = mean(grouped[hour] || []);
  }
  return profile;
};

const estimateTemperatureBeta = (
  pairs: Array<{ temperature: number; price: number }>,
  comfortTemp: number
): number => {
  if (pairs.length < 2) return 0;

  const demand = pairs.map((point) => Math.max(0, comfortTemp - point.temperature));
  const prices = pairs.map((point) => point.price);
  const demandMean = mean(demand);
  const priceMean = mean(prices);

  let covariance = 0;
  let variance = 0;

  for (let i = 0; i < pairs.length; i++) {
    const demandCentered = demand[i] - demandMean;
    covariance += demandCentered * (prices[i] - priceMean);
    variance += demandCentered * demandCentered;
  }

  if (variance === 0) return 0;
  const beta = covariance / variance;
  return Math.max(-2.5, Math.min(6, beta));
};

// This simulates the "Inference" part of your ML pipeline.
// In a real project, this would be a Python service serving a scikit-learn .pkl file.
export const generatePriceFromWeather = (
  weatherData: FmiDataPoint[], 
  spotPrices: SpotPricePoint[] = [],
  modelType: string = 'Gradient Boosting'
): PriceData[] => {
  const sortedWeather = [...weatherData].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  const marketPriceMap = new Map<string, number>();
  spotPrices.forEach((point) => {
    const hourIso = toHourIso(point.timestamp);
    if (hourIso && Number.isFinite(point.price)) {
      marketPriceMap.set(hourIso, point.price);
    }
  });

  const historicalPairs = sortedWeather
    .filter((obs) => !obs.isForecast)
    .map((obs) => {
      const timestamp = toHourIso(obs.time);
      const actualPrice = marketPriceMap.get(timestamp);
      if (actualPrice === undefined) return null;

      return {
        timestamp,
        temperature: obs.temperature,
        price: actualPrice,
      };
    })
    .filter((entry): entry is { timestamp: string; temperature: number; price: number } => entry !== null);

  const comfortTemp = 15;
  const globalMean = mean(historicalPairs.map((point) => point.price)) || 30;
  const hourlyProfile = buildHourlyProfile(historicalPairs);
  const avgDemand = mean(historicalPairs.map((point) => Math.max(0, comfortTemp - point.temperature)));
  const tempBeta = estimateTemperatureBeta(historicalPairs, comfortTemp);

  const modelWeights: Record<string, { lag1: number; lag24: number; hour: number; mean: number; temp: number }> = {
    'Linear Regression': { lag1: 0.45, lag24: 0.00, hour: 0.35, mean: 0.20, temp: 0.9 },
    'Random Forest': { lag1: 0.54, lag24: 0.06, hour: 0.30, mean: 0.10, temp: 1.05 },
    'Gradient Boosting': { lag1: 0.60, lag24: 0.05, hour: 0.28, mean: 0.07, temp: 1.15 },
  };

  const weights = modelWeights[modelType] || modelWeights['Gradient Boosting'];
  const lagHistory = new Map<string, number>();
  let prevPrice = globalMean;

  return sortedWeather.map((obs) => {
    const timestamp = toHourIso(obs.time) || obs.time;
    const date = new Date(timestamp);
    const hour = date.getUTCHours();
    const demand = Math.max(0, comfortTemp - obs.temperature);
    const centeredDemand = demand - avgDemand;

    const prevHour = new Date(date.getTime() - 60 * 60 * 1000).toISOString();
    const prev24Hour = new Date(date.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const lag1 = lagHistory.get(prevHour) ?? prevPrice;
    const lag24 = lagHistory.get(prev24Hour) ?? globalMean;
    const hourMean = Number.isFinite(hourlyProfile[hour]) && hourlyProfile[hour] > 0 ? hourlyProfile[hour] : globalMean;

    const predictedRaw =
      weights.lag1 * lag1 +
      weights.lag24 * lag24 +
      weights.hour * hourMean +
      weights.mean * globalMean +
      weights.temp * tempBeta * centeredDemand;

    const predictedPrice = parseFloat(Math.max(-20, Math.min(450, predictedRaw)).toFixed(2));

    const marketPrice = marketPriceMap.get(timestamp);
    const actualPrice = !obs.isForecast && marketPrice !== undefined ? parseFloat(marketPrice.toFixed(2)) : undefined;
    const realizedForLag = actualPrice ?? predictedPrice;

    lagHistory.set(timestamp, realizedForLag);
    prevPrice = realizedForLag;

    return {
      timestamp,
      actualPrice,
      predictedPrice,
      temperature: obs.temperature,
      isFuture: obs.isForecast,
    };
  });
};

export const modelMetrics: ModelMetric[] = [
  { name: 'Linear Regression', mae: 0, rmse: 0, r2: 0, trainingTime: '1.2s' },
  { name: 'Random Forest', mae: 0, rmse: 0, r2: 0, trainingTime: '14.5s' },
  { name: 'Gradient Boosting', mae: 0, rmse: 0, r2: 0, trainingTime: '22.1s' },
];

export const experimentHistory: ExperimentRun[] = [
  {
    id: 'run_a7f8b2',
    startTime: '2025-02-18 10:45',
    modelType: 'Gradient Boosting',
    parameters: { n_estimators: 250, learning_rate: 0.08, max_depth: 6 },
    metrics: { mae: 5.7, rmse: 7.9 },
    status: 'Finished'
  }
];
