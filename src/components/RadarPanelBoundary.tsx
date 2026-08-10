import { Component, type ErrorInfo, type ReactNode } from "react";

interface RadarPanelBoundaryProps {
  active: boolean;
  children: ReactNode;
  onReturnToForecast: () => void;
}

interface RadarPanelBoundaryState {
  failed: boolean;
}

/** Contains delivery/runtime failures from the optional radar chunk inside radar mode. */
export class RadarPanelBoundary extends Component<
  RadarPanelBoundaryProps,
  RadarPanelBoundaryState
> {
  override state: RadarPanelBoundaryState = { failed: false };

  static getDerivedStateFromError(): RadarPanelBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Radar panel module failed", error, info);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (!this.props.active) return null;

    return (
      <div
        id="radar-map-mode-panel"
        role="tabpanel"
        aria-labelledby="radar-map-tab"
        className="mt-3"
        data-testid="radar-panel-error"
      >
        <div role="alert" className="text-xs text-white/75">
          <p>Radar controls could not be loaded. Forecast fields remain available.</p>
          <button
            type="button"
            className="mt-3 min-h-11 rounded-xl border border-white/25 bg-white/10 px-3 underline"
            onClick={this.props.onReturnToForecast}
          >
            Return to forecast
          </button>
        </div>
      </div>
    );
  }
}
