
import { CrossValidationResult, PriceData } from '../types';

interface AggregateMetrics {
  mae: number;
  rmse: number;
  r2: number;
}

const computeFoldMetrics = (slice: PriceData[]): AggregateMetrics => {
  const valid = slice.filter((point) => point.actualPrice !== undefined);
  if (valid.length === 0) {
    return { mae: 0, rmse: 0, r2: 0 };
  }

  const actuals = valid.map((point) => point.actualPrice as number);
  const predictions = valid.map((point) => point.predictedPrice);
  const meanActual = actuals.reduce((sum, value) => sum + value, 0) / actuals.length;

  let absoluteError = 0;
  let squaredError = 0;
  let totalVariance = 0;

  for (let i = 0; i < valid.length; i++) {
    const error = predictions[i] - actuals[i];
    absoluteError += Math.abs(error);
    squaredError += error * error;
    const centered = actuals[i] - meanActual;
    totalVariance += centered * centered;
  }

  const mae = absoluteError / valid.length;
  const rmse = Math.sqrt(squaredError / valid.length);
  const r2 = totalVariance === 0 ? 0 : 1 - squaredError / totalVariance;

  return { mae, rmse, r2 };
};

/**
 * Simulates Time Series Cross-Validation using a Forward-Chaining (Expanding Window) approach.
 * respects the temporal order of data.
 */
export const performTimeSeriesCV = (data: PriceData[]): CrossValidationResult[] => {
  const historical = data.filter((point) => point.actualPrice !== undefined && !point.isFuture);
  if (historical.length < 12) {
    return [];
  }

  const folds = 4;
  const results: CrossValidationResult[] = [];
  const totalSize = historical.length;
  const foldSize = Math.floor(totalSize / (folds + 1));

  if (foldSize < 2) {
    return [];
  }

  for (let i = 1; i <= folds; i++) {
    const trainEnd = i * foldSize;
    const testEnd = Math.min(totalSize, (i + 1) * foldSize);
    const testSlice = historical.slice(trainEnd, testEnd);

    const { mae, rmse } = computeFoldMetrics(testSlice);

    results.push({
      fold: i,
      trainSize: trainEnd,
      testSize: testSlice.length,
      mae: parseFloat(mae.toFixed(2)),
      rmse: parseFloat(rmse.toFixed(2))
    });
  }

  return results;
};

export const computeAggregateMetrics = (data: PriceData[]): AggregateMetrics => {
  const historical = data.filter((point) => point.actualPrice !== undefined && !point.isFuture);
  const metrics = computeFoldMetrics(historical);

  return {
    mae: parseFloat(metrics.mae.toFixed(2)),
    rmse: parseFloat(metrics.rmse.toFixed(2)),
    r2: parseFloat(metrics.r2.toFixed(2)),
  };
};

/**
 * Generates a 3-hour ahead prediction based on current trends.
 */
export const predictHorizon = (currentPrice: number, currentTemp: number): number => {
  const heatingDemand = Math.max(0, 15 - currentTemp);
  return parseFloat((currentPrice + heatingDemand * 0.35).toFixed(2));
};
