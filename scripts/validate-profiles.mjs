import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const artifacts = join(process.cwd(), 'artifacts');
for (const [mode, viewport, screenshotSize] of [
  ['desktop', { width: 1440, height: 900 }, { width: 1440, height: 900 }],
  ['mobile-emulation', { width: 390, height: 844 }, { width: 1170, height: 2532 }],
]) {
  const profile = JSON.parse(await readFile(join(artifacts, `${mode}-profile.json`), 'utf8'));
  assert.equal(profile.mode, mode);
  assert.deepEqual(profile.viewport, viewport);
  assert.ok(profile.profileDurationSeconds >= 300, `${mode}: profile duration is under five minutes`);
  assert.equal(profile.frameSampling.firstBoundaryIntervalDiscarded, true);
  assert.equal(profile.frameSampling.screenshotExcluded, true);

  const intervals = profile.frameIntervalsMs;
  assert.ok(Array.isArray(intervals) && intervals.length > 0, `${mode}: raw intervals missing`);
  assert.ok(intervals.every((value) => Number.isFinite(value) && value > 0), `${mode}: invalid interval`);
  assert.equal(profile.frames.count, intervals.length);
  const intervalSum = intervals.reduce((sum, value) => sum + value, 0);
  const slowest = [...intervals].sort((a, b) => b - a);
  const slowestCount = Math.max(1, Math.ceil(intervals.length * 0.01));
  const slowestMeanMs = slowest.slice(0, slowestCount)
    .reduce((sum, value) => sum + value, 0) / slowestCount;
  const near = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) < 1e-8, `${mode}: ${label} differs from raw intervals`);
  near(profile.frames.averageFps, intervals.length / (intervalSum / 1000), 'average FPS');
  near(profile.frames.onePercentLowFps, 1000 / slowestMeanMs, '1% low FPS');
  near(profile.frames.slowestMeanMs, slowestMeanMs, 'slowest mean');
  near(profile.frames.maxFrameMs, slowest[0], 'maximum frame interval');
  near(profile.frameSampling.intervalSpanSeconds, intervalSum / 1000, 'interval span');
  near(profile.profileDurationSeconds,
    (profile.frameSampling.endedAtPerformanceMs - profile.frameSampling.startedAtPerformanceMs) / 1000,
    'profile duration');
  assert.ok(profile.frameSampling.intervalSpanSeconds <= profile.profileDurationSeconds,
    `${mode}: intervals exceed sampler duration`);

  const png = await readFile(join(artifacts, `${mode}-1440-or-390.png`));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${mode}: invalid PNG`);
  assert.equal(png.readUInt32BE(16), screenshotSize.width, `${mode}: screenshot width`);
  assert.equal(png.readUInt32BE(20), screenshotSize.height, `${mode}: screenshot height`);
  console.log(`${mode}: ${profile.profileDurationSeconds.toFixed(1)}s, ${intervals.length} intervals, `
    + `${profile.frames.averageFps.toFixed(2)} FPS average, `
    + `${profile.frames.onePercentLowFps.toFixed(2)} FPS 1% low; raw intervals and PNG verified`);
}
