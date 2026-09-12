import { useCallback, useEffect, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

export type VoiceRecorderStatus = "idle" | "requesting" | "recording" | "stopping" | "error";

async function uriToBase64(uri: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const mimeType = blob.type || "audio/m4a";
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { base64: globalThis.btoa(binary), mimeType };
}

async function enableRecordingMode() {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: "mixWithOthers",
    interruptionModeAndroid: "duckOthers",
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });
}

export function useVoiceRecorder() {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 120);
  const [status, setStatus] = useState<VoiceRecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void enableRecordingMode();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("requesting");
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setStatus("error");
        setError("permission");
        return false;
      }
      await enableRecordingMode();
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStatus("recording");
      return true;
    } catch {
      setStatus("error");
      setError("start");
      return false;
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (status !== "recording" && !recorderState.isRecording) {
      return null;
    }
    setStatus("stopping");
    try {
      await recorder.stop();
      const uri = recorder.uri;
      setStatus("idle");
      if (!uri) return null;
      return await uriToBase64(uri);
    } catch {
      setStatus("error");
      setError("stop");
      return null;
    }
  }, [recorder, recorderState.isRecording, status]);

  return {
    status,
    error,
    isRecording: status === "recording" || recorderState.isRecording,
    metering: recorderState.metering ?? -160,
    durationMillis: recorderState.durationMillis ?? 0,
    start,
    stop,
  };
}
