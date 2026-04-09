'use client';

/**
 * SignatureCanvas — touch-safe signature pad for mobile and desktop.
 *
 * Key mobile fixes:
 *  1. Touch event listeners are attached via `addEventListener` with
 *     `{ passive: false }` so `e.preventDefault()` actually prevents
 *     page scroll while the user is drawing. React's synthetic onTouch*
 *     handlers are passive by default (React 17+) and silently ignore
 *     preventDefault().
 *  2. The canvas is initialized ONCE on mount. The old version
 *     re-created the entire canvas on every `value` change (which
 *     happened after every stroke), destroying and reloading the
 *     image each time.
 *  3. Drawing state (`isDrawing`, `context`) is stored in refs
 *     instead of useState to avoid re-renders mid-stroke.
 *
 * Enhanced security: Captures full e-signature metadata (timestamp, IP,
 * browser/device, session ID, geolocation) on first signing for legal
 * defensibility under the E-SIGN Act.
 *
 * 2026-02-27: Thicker/darker strokes (#000000, 5px). Crop canvas to
 * drawn bounds before exporting base64 so signature renders properly in
 * small field overlays without shifting or shrinking. Exported PNG uses
 * transparent background (no white fill) so it doesn't mask the PDF
 * underline. Anti-aliased pixels are pushed to pure black for a bold look.
 */

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Shield } from 'lucide-react';
import {
  captureSignatureMetadata,
  formatSignatureTimestamp,
  SignatureSecurityMetadata,
} from '@/lib/esignature-security';

interface SignatureCanvasProps {
  value: string | null;
  onChange: (base64: string | null) => void;
  onSecurityMetadata?: (metadata: SignatureSecurityMetadata) => void;
  readOnly?: boolean;
}

/**
 * Crop a canvas to the bounding box of non-white pixels.
 * Returns a base64 PNG of just the drawn strokes with a small padding.
 */
function cropCanvasToDrawnBounds(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Classify pixels: only keep dark signature strokes.
  // White/near-white (#f0f0f0+) → transparent (background)
  // Light gray (#d1d5db placeholder text) → transparent
  // Everything else (dark strokes) → keep as-is
  const isSignaturePixel = (r: number, g: number, b: number) => {
    // Skip white / near-white (background + anti-alias fringe)
    if (r >= 200 && g >= 200 && b >= 200) return false;
    return true;
  };

  // Find bounding box of signature-stroke pixels only
  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (isSignaturePixel(r, g, b)) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasContent) return canvas.toDataURL('image/png');

  // Add padding around the drawn content
  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // Build a new ImageData with TRANSPARENT background.
  // Only signature-stroke pixels are kept; everything else is alpha=0.
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return canvas.toDataURL('image/png');

  const cropImageData = cropCtx.createImageData(cropW, cropH);
  const out = cropImageData.data; // starts as all zeros (fully transparent)

  for (let cy = 0; cy < cropH; cy++) {
    for (let cx = 0; cx < cropW; cx++) {
      const srcX = minX + cx;
      const srcY = minY + cy;
      const srcIdx = (srcY * w + srcX) * 4;
      const r = data[srcIdx], g = data[srcIdx + 1], b = data[srcIdx + 2];

      if (isSignaturePixel(r, g, b)) {
        const dstIdx = (cy * cropW + cx) * 4;
        // Force all signature pixels to pure black, fully opaque.
        // This makes the signature bold and crisp on the PDF.
        out[dstIdx] = 0;
        out[dstIdx + 1] = 0;
        out[dstIdx + 2] = 0;
        out[dstIdx + 3] = 255;
      }
      // else: leave as transparent (alpha=0)
    }
  }

  cropCtx.putImageData(cropImageData, 0, 0);
  return cropCanvas.toDataURL('image/png');
}

export default function SignatureCanvas({
  value,
  onChange,
  onSecurityMetadata,
  readOnly = false,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawingRef = useRef(false);
  const initializedRef = useRef(false);
  const lastValueRef = useRef<string | null>(value);
  const hasCompletedFirstStrokeRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(!!value);
  const [securityMetadata, setSecurityMetadata] = useState<SignatureSecurityMetadata | null>(null);

  // Keep callbacks in refs so native listeners always use latest props
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const onSecurityMetadataRef = useRef(onSecurityMetadata);
  onChangeRef.current = onChange;
  readOnlyRef.current = readOnly;
  onSecurityMetadataRef.current = onSecurityMetadata;

  // Capture security metadata after first stroke completion
  const captureSecurityOnFirstStroke = async () => {
    if (hasCompletedFirstStrokeRef.current) return; // Only capture once per signing session
    hasCompletedFirstStrokeRef.current = true;

    try {
      const metadata = await captureSignatureMetadata();
      setSecurityMetadata(metadata);
      if (onSecurityMetadataRef.current) {
        onSecurityMetadataRef.current(metadata);
      }
    } catch (err) {
      console.error('Error capturing signature metadata:', err);
    }
  };

  // Export signature as cropped base64 PNG
  const exportSignature = (canvas: HTMLCanvasElement) => {
    const base64 = cropCanvasToDrawnBounds(canvas);
    lastValueRef.current = base64;
    return base64;
  };

  // ---------- Canvas initialization (runs ONCE) ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let retryCount = 0;
    const maxRetries = 30;

    const initCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        retryCount++;
        if (retryCount < maxRetries) {
          setTimeout(() => requestAnimationFrame(initCanvas), 50);
        }
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#000000';

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Placeholder text
      ctx.fillStyle = '#d1d5db';
      ctx.font = '14px sans-serif';
      ctx.fillText('Sign here', 10, 25);

      contextRef.current = ctx;
      initializedRef.current = true;

      // Load any existing signature
      if (lastValueRef.current) {
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, rect.width, rect.height);
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = lastValueRef.current;
      }
    };

    initCanvas();

    // --- Non-passive touch handlers (the mobile fix) ---
    const handleTouchStart = (e: TouchEvent) => {
      if (readOnlyRef.current || !contextRef.current) return;
      e.preventDefault();

      const touch = e.touches[0];
      const r = canvas.getBoundingClientRect();
      const x = touch.clientX - r.left;
      const y = touch.clientY - r.top;

      contextRef.current.beginPath();
      contextRef.current.moveTo(x, y);
      isDrawingRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDrawingRef.current || !contextRef.current || readOnlyRef.current) return;
      e.preventDefault();

      const touch = e.touches[0];
      const r = canvas.getBoundingClientRect();
      const x = touch.clientX - r.left;
      const y = touch.clientY - r.top;

      contextRef.current.lineTo(x, y);
      contextRef.current.stroke();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!contextRef.current || !isDrawingRef.current) return;
      e.preventDefault();

      contextRef.current.closePath();
      isDrawingRef.current = false;

      // Save cropped signature to base64
      const base64 = exportSignature(canvas);
      onChangeRef.current(base64);
      setHasSignature(true);

      // Capture security metadata on first stroke completion
      captureSecurityOnFirstStroke();
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Handle external value changes ----------
  useEffect(() => {
    if (!initializedRef.current || !contextRef.current || !canvasRef.current) return;
    if (value === lastValueRef.current) return;
    lastValueRef.current = value;

    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    const rect = canvas.getBoundingClientRect();

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasSignature(true);
      };
      img.src = value;
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#d1d5db';
      ctx.font = '14px sans-serif';
      ctx.fillText('Sign here', 10, 25);
      setHasSignature(false);
    }
  }, [value]);

  // ---------- Mouse handlers (desktop) ----------
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (readOnly || !contextRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
    isDrawingRef.current = true;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !contextRef.current || readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    contextRef.current.lineTo(x, y);
    contextRef.current.stroke();
  };

  const stopDrawing = () => {
    if (!contextRef.current || !isDrawingRef.current) return;
    contextRef.current.closePath();
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (canvas) {
      // Save cropped signature to base64
      const base64 = exportSignature(canvas);
      onChange(base64);
      setHasSignature(true);

      // Capture security metadata on first stroke completion
      captureSecurityOnFirstStroke();
    }
  };

  const clear = () => {
    if (!contextRef.current || readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    contextRef.current.fillStyle = '#ffffff';
    contextRef.current.fillRect(0, 0, rect.width, rect.height);

    // Redraw placeholder
    contextRef.current.fillStyle = '#d1d5db';
    contextRef.current.font = '14px sans-serif';
    contextRef.current.fillText('Sign here', 10, 25);

    lastValueRef.current = null;
    onChange(null);
    setHasSignature(false);

    // Reset security metadata for new signing session
    hasCompletedFirstStrokeRef.current = false;
    setSecurityMetadata(null);
  };

  return (
    <div className="space-y-2">
      <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className={`w-full h-40 sm:h-32 block ${!readOnly && 'cursor-crosshair'}`}
          style={{ touchAction: 'none' }}
        />
      </div>

      {/* E-Signature Security Metadata */}
      <div className="text-xs text-gray-500 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3 h-3 text-teal-600 flex-shrink-0" />
          <span className="font-medium text-teal-700">E-SIGN Act Compliant</span>
        </div>
        {securityMetadata ? (
          <>
            <p>Signed: {formatSignatureTimestamp(securityMetadata)}</p>
            <p>Session: {securityMetadata.signing_session_id.slice(0, 12)}...</p>
            <p>Device: {securityMetadata.is_touch_device ? 'Touch' : 'Desktop'} • {securityMetadata.platform}</p>
            {securityMetadata.geolocation && (
              <p>Location verified ({securityMetadata.geolocation.accuracy.toFixed(0)}m accuracy)</p>
            )}
          </>
        ) : (
          <p>Timestamp: {new Date().toLocaleString()}</p>
        )}
      </div>

      {/* Clear Button */}
      {!readOnly && (
        <button
          onClick={clear}
          className="w-full px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Clear Signature
        </button>
      )}
    </div>
  );
}
