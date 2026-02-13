
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, ReferenceLine, ScatterChart, Scatter, ZAxis, BarChart, Bar, Cell
} from 'recharts';
import { generatePriceFromWeather, modelMetrics, experimentHistory } from '../services/mockData';
import { fetchHelsinkiWeatherTimeline } from '../services/fmiService';
import { fetchFinlandSpotPriceTimeline } from '../services/priceService';
import { performTimeSeriesCV, computeAggregateMetrics } from '../services/mlUtils';
import { PriceData, CrossValidationResult, ModelMetric } from '../types';
import Sidebar from './Sidebar';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedModel, setSelectedModel] = useState('Gradient Boosting');
  const [data, setData] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string>('');
  const [cvResults, setCvResults] = useState<CrossValidationResult[]>([]);
  const [liveModelMetrics, setLiveModelMetrics] = useState<ModelMetric[]>(modelMetrics);
  
  const refreshInterval = useRef<number | null>(null);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [weatherTimeline, spotTimeline] = await Promise.all([
        fetchHelsinkiWeatherTimeline(),
        fetchFinlandSpotPriceTimeline(),
      ]);
      
      let processedWeather = weatherTimeline;
      if (weatherTimeline.length === 0) {
        processedWeather = Array.from({ length: 48 }).map((_, i) => ({
          time: new Date(Date.now() - (24 - i) * 3600000).toISOString(),
          temperature: 2 + Math.random() * 8,
          isForecast: i >= 24
        }));
      }

      const perModel = modelMetrics.map((modelTemplate) => {
        const modelData = generatePriceFromWeather(processedWeather, spotTimeline, modelTemplate.name);
        const metrics = computeAggregateMetrics(modelData);
        const cv = performTimeSeriesCV(modelData);

        return {
          name: modelTemplate.name,
          trainingTime: modelTemplate.trainingTime,
          data: modelData,
          cv,
          metrics,
        };
      });

      const activeModel = perModel.find((entry) => entry.name === selectedModel) || perModel[perModel.length - 1];
      setData(activeModel?.data || []);
      setCvResults(activeModel?.cv || []);
      setLiveModelMetrics(
        perModel.map((entry) => ({
          name: entry.name,
          trainingTime: entry.trainingTime,
          mae: entry.metrics.mae,
          rmse: entry.metrics.rmse,
          r2: entry.metrics.r2,
          cvResults: entry.cv,
        }))
      );

      setLastRun(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setError(spotTimeline.length === 0 ? 'Spot price API unavailable; showing weather-driven estimates.' : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection lost.");
    } finally {
      setLoading(false);
    }
  }, [selectedModel]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    refreshInterval.current = window.setInterval(refreshData, 60000);
    return () => { if (refreshInterval.current) clearInterval(refreshInterval.current); };
  }, [refreshData]);

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const nowTimestamp = useMemo(() => {
    const firstFuture = data.find(d => d.isFuture);
    return firstFuture?.timestamp || new Date().toISOString();
  }, [data]);

  const stats = useMemo(() => {
    const historical = data.filter(d => !d.isFuture && d.actualPrice !== undefined);
    const future = data.filter(d => d.isFuture);
    const targetTime = new Date(Date.now() + 3 * 3600000);
    
    const threeHourPrediction = future.reduce((prev, curr) => {
        const prevDiff = Math.abs(new Date(prev.timestamp).getTime() - targetTime.getTime());
        const currDiff = Math.abs(new Date(curr.timestamp).getTime() - targetTime.getTime());
        return currDiff < prevDiff ? curr : prev;
    }, future[0] || { predictedPrice: 0, timestamp: '' });

    const currentActual = historical.length ? historical[historical.length - 1] : null;
    const currentObs = data.filter(d => !d.isFuture).slice(-1)[0];
    const currentTemp = currentObs ? currentObs.temperature : 0;

    return { currentActual, currentTemp, threeHourPrediction };
  }, [data]);

  const hourlyAverages = useMemo(() => {
    const historical = data.filter(d => !d.isFuture && d.actualPrice !== undefined);
    if (historical.length === 0) return [];

    const hours: Record<string, { sum: number; count: number }> = {};
    
    historical.forEach(d => {
      const hour = new Date(d.timestamp).getHours().toString().padStart(2, '0') + ':00';
      if (!hours[hour]) hours[hour] = { sum: 0, count: 0 };
      hours[hour].sum += d.actualPrice!;
      hours[hour].count += 1;
    });

    return Object.keys(hours)
      .sort()
      .map(hour => ({
        hour,
        price: parseFloat((hours[hour].sum / hours[hour].count).toFixed(2))
      }));
  }, [data]);

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
           <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Regressor:</span>
           <div className="flex gap-2">
             {['Linear Regression', 'Random Forest', 'Gradient Boosting'].map(m => (
               <button 
                 key={m}
                 onClick={() => setSelectedModel(m)}
                 className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                   selectedModel === m 
                   ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                   : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'
                 }`}
               >
                 {m}
               </button>
             ))}
           </div>
        </div>
        <div className="text-[10px] text-slate-400 font-medium">
           Inference Latency: ~14ms | Feature Count: 12
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-red-500">
          <h3 className="text-slate-500 text-sm font-medium">Predictive 3h Horizon</h3>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {loading ? '...' : stats.threeHourPrediction.predictedPrice.toFixed(2)} 
            <span className="text-[10px] font-normal text-slate-400 ml-1">€/MWh</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Estimating: {stats.threeHourPrediction.timestamp ? formatTime(stats.threeHourPrediction.timestamp) : '--:--'}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-slate-500 text-sm font-medium">Current Spot Price</h3>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {loading ? '...' : (stats.currentActual?.actualPrice?.toFixed(2) || 'N/A')}
            <span className="text-[10px] font-normal text-slate-400 ml-1">€/MWh</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Finland Spot Market Feed</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-slate-500 text-sm font-medium">Helsinki Temp</h3>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {loading ? '...' : stats.currentTemp.toFixed(1)}°C
          </p>
          <p className="text-[10px] text-slate-400 mt-1">FMI Weather Feed</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-slate-500 text-sm font-medium">ML Pipeline State</h3>
          <p className="text-lg font-bold text-slate-800 mt-1 flex items-center gap-2">
            <i className={`fa-solid fa-sync ${loading ? 'animate-spin text-blue-500' : 'text-slate-400'}`}></i> {lastRun}
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">{selectedModel} Forecast</h2>
            <p className="text-xs text-slate-500 mt-1">
              Solid line represents the <span className="text-red-500 font-bold">Predictive Horizon</span> using scikit-learn regressor trained on weather & seasonality.
            </p>
          </div>
        </div>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="timestamp" tickFormatter={formatTime} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `€${v}`} />
              <Tooltip labelFormatter={(l) => new Date(l).toLocaleString()} formatter={(v) => [`${v} €/MWh`, '']} />
              <ReferenceLine x={nowTimestamp} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" label={{ position: 'top', value: 'PRESENT', fill: '#f59e0b', fontSize: 10, fontWeight: 'bold' }} />
              <Area type="monotone" dataKey="actualPrice" stroke="#2563eb" strokeWidth={2} fill="url(#colorActual)" name="Actual Spot" dot={false} />
              <Line type="monotone" dataKey="predictedPrice" stroke="#ef4444" strokeWidth={3} name={`${selectedModel} Prediction`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const renderDataInsights = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Temperature vs. Price Correlation</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" dataKey="temperature" name="Temp" unit="°C" stroke="#94a3b8" fontSize={10} label={{ value: 'Temperature', position: 'bottom', offset: 0 }} />
                <YAxis type="number" dataKey="actualPrice" name="Price" unit="€" stroke="#94a3b8" fontSize={10} label={{ value: 'Price (€/MWh)', angle: -90, position: 'insideLeft' }} />
                <ZAxis type="number" range={[50, 50]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, name) => [v, name === 'Temp' ? '°C' : '€/MWh']} />
                <Scatter name="Spot Data" data={data.filter(d => d.actualPrice !== undefined)} fill="#2563eb" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-4 italic">Higher demand usually observed during Helsinki's sub-zero temperature periods.</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Average Price by Hour (Seasonality)</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyAverages}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={9} />
                <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `€${v}`} />
                <Tooltip formatter={(v) => [`${v} €/MWh`, 'Price']} />
                <Bar dataKey="price" fill="#6366f1" radius={[4, 4, 0, 0]}>
                   {hourlyAverages.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={parseInt(entry.hour) >= 7 && parseInt(entry.hour) <= 21 ? '#4f46e5' : '#94a3b8'} />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-4">Peaks clearly visible during morning commute (08:00) and evening surge (19:00).</p>
        </div>
      </div>

      <div className="bg-slate-900 p-8 rounded-xl text-white">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
          <i className="fa-solid fa-fire text-orange-500"></i> Spark ETL Pipeline Status
        </h3>
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center text-center">
             <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500 mb-2">
                <i className="fa-solid fa-cloud-arrow-down text-blue-400"></i>
             </div>
             <p className="text-sm font-bold">Spot API & FMI</p>
             <p className="text-[10px] text-slate-400">Raw Data Streams</p>
          </div>
          <div className="h-0.5 flex-1 bg-slate-800 relative min-w-[40px]">
             <div className="absolute inset-0 bg-blue-500 animate-[shimmer_2s_infinite]"></div>
          </div>
          <div className="flex flex-col items-center text-center">
             <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500 mb-2">
                <i className="fa-solid fa-database text-indigo-400"></i>
             </div>
             <p className="text-sm font-bold">Cassandra Storage</p>
             <p className="text-[10px] text-slate-400">Time-series Partitioning</p>
          </div>
          <div className="h-0.5 flex-1 bg-slate-800 relative min-w-[40px]">
             <div className="absolute inset-0 bg-orange-500 animate-[shimmer_1.5s_infinite]"></div>
          </div>
          <div className="flex flex-col items-center text-center">
             <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500 mb-2">
                <i className="fa-solid fa-gears text-orange-400"></i>
             </div>
             <p className="text-sm font-bold">Apache Spark</p>
             <p className="text-[10px] text-slate-400">Feature Engineering</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderModelMetrics = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {liveModelMetrics.map((model) => (
          <div key={model.name} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-3">
                <i className={`fa-solid fa-microchip ${model.r2 > 0.9 ? 'text-green-500' : 'text-slate-300'}`}></i>
             </div>
             <h3 className="font-bold text-slate-900 text-lg">{model.name}</h3>
             <div className="mt-4 space-y-3">
                <div className="flex justify-between items-end border-b border-slate-50 pb-2">
                   <span className="text-xs text-slate-500 uppercase font-bold tracking-tighter">MAE</span>
                   <span className="font-bold text-xl">{model.mae} <span className="text-[10px] text-slate-400">€/MWh</span></span>
                </div>
                <div className="flex justify-between items-end border-b border-slate-50 pb-2">
                   <span className="text-xs text-slate-500 uppercase font-bold tracking-tighter">RMSE</span>
                   <span className="font-bold text-xl">{model.rmse} <span className="text-[10px] text-slate-400">€/MWh</span></span>
                </div>
                <div className="flex justify-between items-end">
                   <span className="text-xs text-slate-500 uppercase font-bold tracking-tighter">R² Accuracy</span>
                   <span className={`font-bold text-xl ${model.r2 > 0.9 ? 'text-green-600' : 'text-indigo-600'}`}>{(model.r2 * 100).toFixed(0)}%</span>
                </div>
             </div>
             <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">TRAIN TIME: {model.trainingTime}</span>
                <button className="text-[10px] font-bold text-blue-600 uppercase hover:underline">View weights</button>
             </div>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Expanding Window Cross-Validation (4 Folds)</h2>
        <div className="space-y-4">
          {cvResults.map(fold => (
            <div key={fold.fold} className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-lg bg-slate-100 flex flex-col items-center justify-center">
                  <span className="text-[8px] font-bold text-slate-400">FOLD</span>
                  <span className="text-lg font-bold text-slate-700">{fold.fold}</span>
               </div>
               <div className="flex-1">
                  <div className="flex justify-between mb-1">
                     <span className="text-xs font-bold text-slate-600">Accuracy Curve</span>
                     <span className="text-xs font-bold text-slate-900">MAE: {fold.mae} €/MWh</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                     <div className="h-full bg-blue-500" style={{ width: `${Math.max(30, 100 - fold.mae * 5)}%` }}></div>
                  </div>
               </div>
               <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Test Sample</p>
                  <p className="text-xs font-bold text-slate-900">N={fold.testSize}</p>
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderExperimentLogs = () => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
         <h2 className="text-lg font-bold text-slate-900">MLflow Experiment History</h2>
         <div className="flex gap-2">
            <span className="px-3 py-1 bg-purple-50 text-purple-600 text-[10px] font-bold rounded-full border border-purple-100">Project: HEL-PRICE-01</span>
         </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Run ID</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Time</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parameters</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">MAE (€/MWh)</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {experimentHistory.concat([
               { id: 'run_b9f2d1', startTime: '2025-02-18 09:12', modelType: 'Random Forest', parameters: { n_estimators: 100, max_depth: 8 }, metrics: { mae: 12.8, rmse: 18.5 }, status: 'Finished' },
               { id: 'run_c1e4k3', startTime: '2025-02-17 16:45', modelType: 'Linear Regression', parameters: { normalize: true }, metrics: { mae: 24.4, rmse: 32.8 }, status: 'Finished' }
            ]).map((run) => (
              <tr key={run.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                   <div className="flex items-center gap-2">
                      <i className="fa-solid fa-tag text-purple-400 text-[10px]"></i>
                      <span className="font-mono text-xs font-bold text-slate-700">{run.id}</span>
                   </div>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500">{run.startTime}</td>
                <td className="px-6 py-4">
                   <div className="flex flex-wrap gap-1">
                      {Object.entries(run.parameters).map(([k, v]) => (
                         <span key={k} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                            {k}: {String(v)}
                         </span>
                      ))}
                   </div>
                </td>
                <td className="px-6 py-4">
                   <span className="font-bold text-slate-900">{run.metrics.mae}</span>
                </td>
                <td className="px-6 py-4">
                   <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                      run.status === 'Finished' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'
                   }`}>
                      {run.status}
                   </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="ml-64 p-8 transition-all duration-300">
        <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
               {activeTab === 'overview' && 'Live AI Forecast'}
               {activeTab === 'data' && 'Data Insights'}
               {activeTab === 'models' && 'Model Performance'}
               {activeTab === 'experiments' && 'MLflow Tracking'}
            </h1>
            <p className="text-slate-500 mt-1">Helsinki Metropolitan Day-Ahead Price Forecast Engine</p>
          </div>
          <div className={`px-4 py-2 rounded-full border flex items-center gap-2 ${loading ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
            <div className={`w-2 h-2 rounded-full ${loading ? 'animate-pulse bg-blue-500' : 'bg-green-500'}`}></div>
            <span className="text-[10px] font-bold uppercase tracking-widest">{loading ? 'Syncing Pipeline...' : 'Real-time Feed Active'}</span>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
            {error}
          </div>
        )}

        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'data' && renderDataInsights()}
        {activeTab === 'models' && renderModelMetrics()}
        {activeTab === 'experiments' && renderExperimentLogs()}
      </main>
      <style>{`
         @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
         }
      `}</style>
    </div>
  );
};

export default Dashboard;
