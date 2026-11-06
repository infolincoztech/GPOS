"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, X, Zap, Keyboard, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { triggerHaptic } from "@/lib/mobile-bridge";

interface CameraBarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function CameraBarcodeScanner({ open, onClose, onScan }: CameraBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const stopCamera = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      setTorchOn(false);
      return;
    }

    let active = true;
    setCameraError(null);

    async function startScanner() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError("Camera access is not supported in this browser. Enter barcode below.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Check flashlight / torch capability
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === "function") {
          const caps: any = track.getCapabilities();
          if (caps && caps.torch) {
            setHasTorch(true);
          }
        }

        // Hardware BarcodeDetector API loop (Chrome Android / WebView / Edge / Safari 17+)
        const BarcodeDetectorClass = (window as any).BarcodeDetector;
        if (BarcodeDetectorClass) {
          const detector = new BarcodeDetectorClass({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
          });

          const scanLoop = async () => {
            if (!active || !videoRef.current) return;
            try {
              if (videoRef.current.readyState >= 2) {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  const code = String(barcodes[0].rawValue).trim();
                  if (code) {
                    triggerHaptic("success");
                    stopCamera();
                    onScan(code);
                    onClose();
                    return;
                  }
                }
              }
            } catch {
              // Ignore frame detection error
            }
            if (active) {
              rafRef.current = requestAnimationFrame(scanLoop);
            }
          };

          rafRef.current = requestAnimationFrame(scanLoop);
        }
      } catch (err: any) {
        setCameraError("Could not access phone camera. Check camera permissions or enter barcode manually.");
      }
    }

    startScanner();

    return () => {
      active = false;
      stopCamera();
    };
  }, [open, onClose, onScan]);

  const toggleTorch = async () => {
    try {
      const track: any = streamRef.current?.getVideoTracks()?.[0];
      if (!track) return;
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // Ignore if unsupported
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    triggerHaptic("success");
    onScan(trimmed);
    setManualCode("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden rounded-3xl border-none bg-slate-950 text-white shadow-2xl">
        <DialogHeader className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-row items-center justify-between">
          <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" /> Mobile Barcode Scanner
          </DialogTitle>
          <div className="flex items-center gap-1.5">
            {hasTorch && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={toggleTorch}
                className={`h-8 w-8 rounded-full ${torchOn ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
              >
                <Zap className="w-4 h-4" />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8 rounded-full text-slate-300 hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="relative bg-black aspect-[4/3] w-full flex items-center justify-center overflow-hidden">
          {!cameraError ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />
              {/* Viewfinder Target Box */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                <div className="w-64 h-36 rounded-2xl border-2 border-blue-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] relative overflow-hidden">
                  <div className="absolute inset-x-2 top-1/2 h-0.5 bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse" />
                </div>
                <span className="mt-3 text-[11px] font-bold text-white/90 bg-slate-900/80 px-3 py-1 rounded-full">
                  Align barcode inside frame
                </span>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-slate-300 text-xs font-medium max-w-xs">
              {cameraError}
            </div>
          )}
        </div>

        <form onSubmit={handleManualSubmit} className="p-4 bg-slate-900 space-y-2.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Keyboard className="w-3.5 h-3.5 text-blue-400" /> Or Enter Barcode / SKU Manually
          </label>
          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="e.g. 896100100101 or DRY-001"
              className="h-10 rounded-xl bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm font-bold"
            />
            <Button type="submit" className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">
              <Check className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

