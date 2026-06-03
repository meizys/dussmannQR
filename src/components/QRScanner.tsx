import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';

// Client-side QR decode (PRD principle #1, offline-capable). Falls back to a
// manual picker when no camera is available (e.g. desktop demo / denied perms).

export function QRScanner({
  onResult,
  onNoCamera,
}: {
  onResult: (payload: string) => void;
  onNoCamera: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    const reader = new BrowserQRCodeReader();
    (async () => {
      try {
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result) => {
            if (result && !firedRef.current) {
              firedRef.current = true;
              navigator.vibrate?.(60);
              onResult(result.getText());
            }
          }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Camera unavailable';
        setError(msg);
        onNoCamera();
      }
    })();
    return () => controls?.stop();
  }, [onResult, onNoCamera]);

  if (error) {
    return (
      <div className="viewport">
        <div className="center-col" style={{ position: 'absolute', inset: 0 }}>
          <div style={{ fontSize: 40 }}>📷🚫</div>
          <div className="small muted">No camera available — use the picker below.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="viewport">
      <video ref={videoRef} playsInline muted />
      <div className="guide-frame scan" />
      <div className="hint">Point at the meter's QR sticker</div>
    </div>
  );
}
