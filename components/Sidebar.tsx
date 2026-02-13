
import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'overview', label: 'Overview', icon: 'fa-chart-pie' },
    { id: 'data', label: 'Data Insights', icon: 'fa-database' },
    { id: 'models', label: 'Model Metrics', icon: 'fa-microchip' },
    { id: 'experiments', label: 'MLflow Logs', icon: 'fa-vials' },
  ];

  return (
    <div className="w-64 bg-slate-900 h-screen fixed left-0 top-0 flex flex-col">
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
          <i className="fa-solid fa-bolt-lightning text-white"></i>
        </div>
        <h1 className="text-white font-bold text-lg tracking-tight">Helsinki Energy</h1>
      </div>
      
      <nav className="flex-1 p-4 space-y-2 mt-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              activeTab === item.id 
                ? 'bg-blue-600 text-white' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <i className={`fa-solid ${item.icon} w-5`}></i>
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-6 border-t border-slate-800">
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase font-bold mb-2">Project Stack</p>
          <div className="flex flex-wrap gap-2">
            <span title="Cassandra" className="w-6 h-6 bg-indigo-500/20 rounded flex items-center justify-center text-indigo-400 text-xs font-bold">C</span>
            <span title="Spark" className="w-6 h-6 bg-orange-500/20 rounded flex items-center justify-center text-orange-400 text-xs font-bold">S</span>
            <span title="Scikit-Learn" className="w-6 h-6 bg-green-500/20 rounded flex items-center justify-center text-green-400 text-xs font-bold">SL</span>
            <span title="MLflow" className="w-6 h-6 bg-purple-500/20 rounded flex items-center justify-center text-purple-400 text-xs font-bold">M</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
