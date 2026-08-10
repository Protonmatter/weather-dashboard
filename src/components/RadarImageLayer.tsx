import { useEffect, useState, type CSSProperties } from "react";

export interface RadarImageSpec {
  key: string;
  src: string;
  className: string;
  style?: CSSProperties;
  draggable?: boolean;
  testId?: string;
}

interface LoadedLayer {
  contextKey: string;
  requestKey: string;
  token: string;
  images: RadarImageSpec[];
}

interface LoadProgress {
  token: string;
  keys: Set<string>;
}

interface RadarImageLayerProps {
  active: boolean;
  contextKey: string;
  requestKey: string;
  retryGeneration: number;
  images: RadarImageSpec[];
  onLayerError: () => void;
  onLayerLoad: () => void;
}

/** Swaps a complete radar layer atomically and retains the prior successful layer on failure. */
export function RadarImageLayer({
  active,
  contextKey,
  requestKey,
  retryGeneration,
  images,
  onLayerError,
  onLayerLoad,
}: RadarImageLayerProps) {
  const [loadedLayer, setLoadedLayer] = useState<LoadedLayer | null>(null);
  const [progress, setProgress] = useState<LoadProgress>({ token: "", keys: new Set() });
  const token = `${contextKey}:${requestKey}:${retryGeneration}`;
  const visibleLayer = loadedLayer?.contextKey === contextKey ? loadedLayer : null;
  const candidateLoaded = visibleLayer?.token === token;
  const candidateComplete = active && progress.token === token && progress.keys.size === images.length;

  useEffect(() => {
    if (!candidateComplete || loadedLayer?.token === token) return;
    setLoadedLayer({ contextKey, requestKey, token, images });
    onLayerLoad();
  }, [candidateComplete, contextKey, images, loadedLayer?.token, onLayerLoad, requestKey, token]);

  const recordLoad = (key: string): void => {
    setProgress((current) => {
      const keys = current.token === token ? new Set(current.keys) : new Set<string>();
      keys.add(key);
      return { token, keys };
    });
  };

  const renderImage = (image: RadarImageSpec, layer: "loaded" | "request", layerToken: string) => (
    <img
      key={`${layerToken}:${image.key}`}
      src={image.src}
      alt=""
      aria-hidden="true"
      draggable={image.draggable}
      className={image.className}
      style={{ ...image.style, ...(layer === "request" ? { opacity: 0 } : {}) }}
      data-testid={image.testId}
      data-radar-layer={layer}
      onLoad={layer === "request" ? () => recordLoad(image.key) : undefined}
      onError={layer === "request" ? onLayerError : undefined}
    />
  );

  return (
    <>
      {(!active || !candidateLoaded) && visibleLayer?.images.map((image) => renderImage(image, "loaded", visibleLayer.token))}
      {active && images.map((image) => renderImage(image, candidateLoaded ? "loaded" : "request", token))}
    </>
  );
}
