
export interface PriceData {
  timestamp: string;
  actualPrice?: number; // Nullable for future points
  predictedPrice: number; // The price our model predicts for this timestamp
  temperature: number;
  isFuture: boolean;
}

export interface CrossValidationResult {
  fold: number;
  trainSize: number;
  testSize: number;
  mae: number;
  rmse: number;
}

export interface ModelMetric {
  name: string;
  mae: number;
  rmse: number;
  r2: number;
  trainingTime: string;
  cvResults?: CrossValidationResult[];
}

export interface ExperimentRun {
  id: string;
  startTime: string;
  modelType: string;
  parameters: Record<string, string | number | boolean>;
  metrics: {
    mae: number;
    rmse: number;
  };
  status: 'Finished' | 'Running' | 'Failed';
}

export enum PipelineStep {
  INGESTION = 'Ingestion',
  STORAGE = 'Storage',
  ETL = 'ETL',
  ML = 'ML',
  TRACKING = 'Tracking'
}
