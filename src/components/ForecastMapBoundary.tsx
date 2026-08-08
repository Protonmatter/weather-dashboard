import { Component, type ErrorInfo, type ReactNode } from "react";
import { Card } from "./Card";

interface ForecastMapBoundaryProps {
  children: ReactNode;
}

interface ForecastMapBoundaryState {
  failed: boolean;
}

/** Contains failures from the optional lazy-loaded map without unmounting the dashboard. */
export class ForecastMapBoundary extends Component<
  ForecastMapBoundaryProps,
  ForecastMapBoundaryState
> {
  override state: ForecastMapBoundaryState = { failed: false };

  static getDerivedStateFromError(): ForecastMapBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Forecast map module failed", error, info);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <Card title="48-hour forecast map" className="mt-4 min-h-72" data-testid="forecast-map-error">
        <div role="alert" className="text-xs text-white/75">
          <p>The forecast map could not be loaded. The rest of the dashboard is still available.</p>
          <button
            type="button"
            className="mt-3 min-h-11 rounded-xl border border-white/25 bg-white/10 px-3 underline"
            onClick={() => window.location.reload()}
          >
            Reload dashboard
          </button>
        </div>
      </Card>
    );
  }
}
