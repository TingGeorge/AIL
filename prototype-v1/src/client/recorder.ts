// Thin MediaRecorder wrapper: start() resolves when recording, stop() resolves with the clip.
export const MAX_SECONDS = 30;

export const recordingSupported = () =>
  typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.rec = new MediaRecorder(stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = this.rec;
      if (!rec) return resolve(new Blob());
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: rec.mimeType }));
        this.rec = null;
      };
      rec.state === "inactive" ? rec.onstop(new Event("stop")) : rec.stop();
    });
  }
}
