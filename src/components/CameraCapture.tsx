import { useEffect, useRef, useState } from 'react';
import type { Meter } from '../types';
import { METER_COLOR, METER_ICON } from '../lib/format';

// Photo capture with an on-screen guide frame (PRD 7.1). Works with the device
// camera; on machines without one it offers a file upload or a generated sample
// frame so the proof-photo + extraction flow stays demonstrable.

export function CameraCapture({
  meter,
  onCapture,
}: {
  meter: Meter;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [noCamera, setNoCamera] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setNoCamera(true);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(canvas.toDataURL('image/jpeg', 0.7));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCapture(String(reader.result));
    reader.readAsDataURL(file);
  }

  if (noCamera) {
    return (
      <div className="stack">
        <div className="viewport">
          <div className="center-col" style={{ position: 'absolute', inset: 0 }}>
            <div style={{ fontSize: 40 }}>📷🚫</div>
            <div className="small muted">No camera — upload a photo or use a sample frame.</div>
          </div>
        </div>
        <label className="btn">
          📁 Upload meter photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
            style={{ display: 'none' }}
          />
        </label>
        <button className="btn primary" onClick={() => onCapture(sampleFrame(meter))}>
          🖼️ Use sample meter frame
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="viewport">
        <video ref={videoRef} playsInline muted />
        <div className="guide-frame" />
        <div className="hint">Align the digits inside the frame</div>
      </div>
      <button className="btn primary" disabled={!ready} onClick={snap}>
        {ready ? '📸 Capture' : 'Starting camera…'}
      </button>
    </div>
  );
}

/** Generates a believable meter-face image so the proof photo isn't blank. */
function sampleFrame(meter: Meter): string {
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 960;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, c.width, c.height);
  // body
  ctx.fillStyle = METER_COLOR[meter.meter_type];
  ctx.globalAlpha = 0.15;
  ctx.fillRect(60, 220, 600, 520);
  ctx.globalAlpha = 1;
  ctx.font = '120px serif';
  ctx.textAlign = 'center';
  ctx.fillText(METER_ICON[meter.meter_type], 360, 200);
  // LCD digits
  const digits = '0'.repeat(meter.register_config.integer_digits);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(120, 400, 480, 130);
  ctx.fillStyle = '#39ff14';
  ctx.font = 'bold 96px "Courier New", monospace';
  ctx.fillText(digits, 360, 495);
  ctx.fillStyle = '#e6edf7';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(meter.meter_label, 360, 620);
  ctx.font = '30px sans-serif';
  ctx.fillText(`${meter.units} • ${meter.meter_type}`, 360, 670);
  return c.toDataURL('image/jpeg', 0.7);
}
