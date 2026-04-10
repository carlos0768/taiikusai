"use client";

interface RouteSelectorProps {
  routes: string[][];
  nodeNames: Map<string, string>;
  onSelect: (routeIndex: number) => void;
  onBack: () => void;
}

export default function RouteSelector({
  routes,
  nodeNames,
  onSelect,
  onBack,
}: RouteSelectorProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
        <button
          onClick={onBack}
          className="text-muted hover:text-foreground transition-colors text-lg px-2"
        >
          ←
        </button>
        <h2 className="font-medium">再生ルートを選択</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {routes.map((route, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(idx)}
            className="w-full text-left p-4 bg-card border border-card-border rounded-lg hover:border-accent/50 transition-colors"
          >
            <p className="text-sm font-medium mb-2">ルート {idx + 1}</p>
            <div className="flex items-center gap-1 flex-wrap">
              {route.map((nodeId, i) => (
                <span key={nodeId} className="flex items-center gap-1">
                  <span className="text-xs bg-background px-2 py-0.5 rounded">
                    {nodeNames.get(nodeId) ?? "Untitled"}
                  </span>
                  {i < route.length - 1 && (
                    <span className="text-accent text-xs">→</span>
                  )}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
