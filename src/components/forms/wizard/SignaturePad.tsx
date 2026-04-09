'use client';

import { useState, useRef, useEffect } from 'react';
import { PenLine, Lock } from 'lucide-react';

interface SignaturePadProps {
  value: string;
  onChange: (dataUrl: string) => void;
  brandColor: string;
  readOnly?: boolean;
}

export function SignaturePad({
  value,
  onChange,
  brandColor,
  readOnly = false,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up canvas
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Restore existing signature
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
      };
      img.src = value;
      setHasDrawn(true);
    }
  }, []);

  function getPos(e: React.TouchEvent | React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    if (readOnly) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    if (readOnly || !isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  }

  function endDraw() {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      onChange(canvas.toDataURL('image/png'));
    }
  }

  function clearSignature() {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange('');
  }

  // Read-only: show existing signature image or a locked placeholder
  if (readOnly) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-xl p-3 bg-gray-50/50">
        {value ? (
          <img
            src={value}
            alt="Signature"
            className="w-full rounded-lg"
            style={{ height: '140px', objectFit: 'contain' }}
          />
        ) : (
          <div
            className="w-full rounded-lg flex items-center justify-center text-gray-400"
            style={{ height: '140px' }}
          >
            <div className="text-center">
              <Lock className="w-5 h-5 mx-auto mb-1 text-gray-300" />
              <p className="text-xs">Staff signature required</p>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <PenLine className="w-3 h-3" /> Sign above
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-3 bg-white">
      <canvas
        ref={canvasRef}
        className="w-full touch-none cursor-crosshair rounded-lg"
        style={{ height: '140px' }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <PenLine className="w-3 h-3" /> Sign above
        </span>
        {hasDrawn && (
          <button
            type="button"
            onClick={clearSignature}
            className="text-xs text-red-500 hover:text-red-700 font-medium"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
