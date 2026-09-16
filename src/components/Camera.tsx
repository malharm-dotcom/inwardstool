"use client";
import { useEffect, useRef, useState } from "react";
import { CameraGate } from "@/lib/scanning";
import Icon from "./Icon";

export default function Camera({
  onScan,
  onClose,
}: {
  onScan: (code: string) => boolean;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const panel = useRef<HTMLElement>(null);
  const scan = useRef(onScan);
  scan.current = onScan;
  const stream = useRef<MediaStream | null>(null);
  const controls = useRef<{ stop: () => void } | null>(null);
  const mounted = useRef(false);
  const starting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    "Tap Enable camera, then allow camera access.",
  );
  function stop() {
    controls.current?.stop();
    controls.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    panel.current?.scrollIntoView({ block: "center" });
    return () => {
      mounted.current = false;
      stop();
    };
  }, []);
  async function start() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setError("");
    stop();
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Open this site directly over HTTPS in Safari or Chrome to enable the camera.",
        );
      // Request permission directly from the tap, before loading the decoder.
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (!mounted.current || !video.current) {
        stop();
        return;
      }
      const gate = new CameraGate();
      const reader = new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 150,
        delayBetweenScanSuccess: 150,
      });
      const decoder = await reader.decodeFromStream(
        media,
        video.current,
        (result) => {
          if (!mounted.current) return;
          const code = result?.getText() ?? null;
          if (gate.accept(code, performance.now()) && code)
            setMessage(
              scan.current(code)
                ? "Tag captured. Move it out of view before the next tag."
                : "Tag not captured. Check the receipt error before continuing.",
            );
        },
      );
      if (!mounted.current) {
        decoder.stop();
        stop();
        return;
      }
      controls.current = decoder;
      setRunning(true);
      setMessage("Point the camera at one EAN or SKU barcode.");
    } catch (cause) {
      stop();
      if (mounted.current) {
        setRunning(false);
        const error = cause as Error;
        setError(
          error.name === "NotAllowedError" || error.name === "SecurityError"
            ? "Camera permission is blocked. Allow Camera in this site’s browser settings and your phone’s app permissions, then tap Retry camera. Open the link directly in Safari or Chrome, not inside another app."
            : error.name === "NotReadableError"
              ? "The camera is busy. Close other apps using it, then retry."
              : error.name === "NotFoundError"
                ? "No camera was found on this device."
                : error.message ||
                  "Camera could not start. Check browser permission and retry.",
        );
      }
    } finally {
      starting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section ref={panel} className="camera-panel" aria-label="Camera scanner">
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
      <video ref={video} muted playsInline autoPlay />
      <p role={error ? "alert" : "status"}>{error || message}</p>
      {!running && (
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() => void start()}
        >
          {busy
            ? "Waiting for camera permission…"
            : error
              ? "Retry camera"
              : "Enable camera"}
        </button>
      )}
    </section>
  );
}
