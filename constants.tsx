
import React from 'react';

export const TECH_STACK = [
  { name: 'FI Spot API', category: 'Data Source', icon: 'fa-bolt', color: 'text-yellow-500' },
  { name: 'FMI API', category: 'Data Source', icon: 'fa-cloud-sun', color: 'text-blue-500' },
  { name: 'Apache Cassandra', category: 'Storage', icon: 'fa-database', color: 'text-indigo-600' },
  { name: 'Apache Spark', category: 'ETL', icon: 'fa-fire', color: 'text-orange-500' },
  { name: 'Scikit-learn', category: 'ML', icon: 'fa-brain', color: 'text-green-600' },
  { name: 'MLflow', category: 'Tracking', icon: 'fa-vial', color: 'text-purple-600' },
];

export const PIPELINE_STEPS = [
  { id: 'ingestion', label: 'Ingestion', description: 'Spot Market & FMI API Fetching' },
  { id: 'storage', label: 'Storage', description: 'Cassandra Raw Tables' },
  { id: 'etl', label: 'ETL', description: 'Spark Hourly Alignment' },
  { id: 'ml', label: 'ML Training', description: 'Gradient Boosting Regression' },
  { id: 'tracking', label: 'MLflow', description: 'Experiment Logging' },
];
