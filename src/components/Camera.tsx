"use client";
import { useEffect, useRef, useState } from "react";
import { CameraGate } from "@/lib/scanning";
import Icon from "./Icon";

export default function Camera({
  onScan,
  onClose,
}: {
  onScan: (sku: string) => boolean;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    scan = useRef(onScan);
  scan.current = onScan;
  const [message, setMessage] = useState("Starting camera…");
  const [error, setError] = useState("");
  useEffect(() => {
    let canceled = false,
      controls: { stop: () => void } | undefined;
    const gate = new CameraGate();
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("Camera access needs HTTPS and a supported browser.");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (canceled || !video.current) return;
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 150,
          delayBetweenScanSuccess: 150,
        });
        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
            },
          },
          video.current,
          (result) => {
            if (canceled) return;
            const code = result?.getText() ?? null;
            if (gate.accept(code, performance.now()) && code) {
              setMessage(
                scan.current(code)
                  ? "Tag captured. Move it out of view before the next tag."
                  : "Tag not captured. Check the error above before scanning again.",
              );
            }
          },
        );
        if (canceled) controls.stop();
        else setMessage("Point the camera at one SKU barcode.");
      } catch (error) {
        if (!canceled)
          setError(
            (error as Error).message ||
              "Camera could not start. Check browser permission.",
          );
      }
    })();
    return () => {
      canceled = true;
      controls?.stop();
    };
  }, []);
  return (
    <section className="camera-panel" aria-label="Camera scanner">
      <div>
        <strong>
          <Icon name="camera" size={18} /> Camera scanner
        </strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Close camera"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <video ref={video} muted playsInline />
      <p role={error ? "alert" : "status"}>{error || message}</p>
    </section>
  );
}
