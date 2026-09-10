/**
 * Short alert tone (Web Audio API — no asset). Fails silently if autoplay blocks.
 */
export async function playJobAlertSound(): Promise<void> {
  if (typeof window === "undefined") return;
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  try {
    await ctx.resume();
  } catch {
    /* ignore */
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.value = 0.06;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const start = ctx.currentTime;
  osc.start(start);
  osc.stop(start + 0.12);

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      void ctx.close().catch(() => {});
      resolve();
    };
    osc.onended = finish;
    window.setTimeout(finish, 400);
  });
}
