import type { PainPoint } from '@/types/prospect';
import { XCircle, AlertTriangle, Info, Target } from 'lucide-react';

export function PainPointsPanel({ painPoints, scanDone }: { painPoints: PainPoint[]; scanDone?: boolean }) {
  if (!scanDone) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <Target size={24} className="mx-auto mb-3 text-gray-600" />
        <p className="text-gray-500 text-sm">Run a scan to generate pain points.</p>
      </div>
    );
  }
  if (!painPoints || painPoints.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">No pain points detected. This prospect looks fairly healthy!</p>
      </div>
    );
  }

  const high = painPoints.filter(p => p.priority === 'HIGH');
  const medium = painPoints.filter(p => p.priority === 'MEDIUM');
  const low = painPoints.filter(p => p.priority === 'LOW');

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <Stat label="High Priority" count={high.length} color="text-red-400" />
        <Stat label="Medium Priority" count={medium.length} color="text-yellow-400" />
        <Stat label="Low Priority" count={low.length} color="text-green-400" />
      </div>

      {[...high, ...medium, ...low].map((pp, i) => (
        <div key={i} className="glass rounded-xl p-5 border-l-2 fade-up" style={{
          borderLeftColor: pp.priority === 'HIGH' ? '#ef4444' : pp.priority === 'MEDIUM' ? '#f59e0b' : '#10b981',
          animationDelay: `${i * 0.05}s`
        }}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {pp.priority === 'HIGH' ? <XCircle size={16} className="text-red-400" /> :
               pp.priority === 'MEDIUM' ? <AlertTriangle size={16} className="text-yellow-400" /> :
               <Info size={16} className="text-blue-400" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-semibold text-white">{pp.finding}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  pp.priority === 'HIGH' ? 'badge-high' :
                  pp.priority === 'MEDIUM' ? 'badge-medium' : 'badge-low'
                }`}>{pp.priority}</span>
                <span className="text-xs text-gray-600 capitalize">{pp.category}</span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{pp.evidence}</p>
              <div className="bg-white/3 rounded-lg p-3 border border-white/5">
                <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Business Impact</div>
                <p className="text-xs text-gray-300 leading-relaxed">{pp.business_impact}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="glass rounded-lg px-4 py-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{count}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
