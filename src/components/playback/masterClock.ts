/**
 * 再生エディタの「マスタークロック」。再生開始 (elapsedMs=0) からの累積 ms を返す
 * 単一の時刻ソース。音楽キャレット位置・パネルフレーム・wave 列進行はすべて
 * これから派生させ、独立したタイマーが並走しないようにする。
 */
export interface MasterClock {
  /** 現在の累積 ms。pause 中は凍結値、reset 後は 0、再生中は単調増加。 */
  now(): number;
  /** 一時停止状態から再生開始する (再生中の重複呼び出しは無害)。 */
  start(): void;
  /** now() を現在値で凍結する (再生中でなければ無害)。 */
  pause(): void;
  /** 0 に戻して停止する。 */
  reset(): void;
  /** 任意の elapsedMs にジャンプする。音楽プレイヤー側のシークは呼び出し元の責務。 */
  seek(elapsedMs: number): void;
  isRunning(): boolean;
}

/**
 * 再生中は次の優先順位で時刻を返す:
 *   1. `getAudioTimeMs()` が有効値を返せばそれをそのまま採用 (音楽が時刻の真実)。
 *   2. 音楽が未ロード or 戻り値 null の場合は `performance.now()` ベースで進める。
 *
 * 音楽が物理的に再生されている間、波形キャレットとパネルが同じ値を見るので
 * **構造的にズレない**。音楽が途中で利用可能になっても snapshot を音楽値に
 * 引き寄せるだけで、ドリフトは累積しない。
 */
export function createMasterClock(opts: {
  getAudioTimeMs: () => number | null;
}): MasterClock {
  let isRunningFlag = false;
  /** pause / reset 直後の凍結値、または fallback 計算の基準値 */
  let snapshotMs = 0;
  /** 音楽が無い間の perf.now() 基準点。ある時は null。 */
  let perfStartedAt: number | null = null;

  function live(): number {
    const t = opts.getAudioTimeMs();
    if (t !== null) {
      // 音楽あり: 音楽 currentTime をそのまま採用。fallback はリセット。
      if (perfStartedAt !== null) {
        perfStartedAt = null;
        snapshotMs = Math.max(0, t);
      }
      return Math.max(0, t);
    }
    // 音楽なし: perf.now() ベースで snapshot から継続計算。
    if (perfStartedAt === null) {
      perfStartedAt = performance.now() - snapshotMs;
    }
    return performance.now() - perfStartedAt;
  }

  return {
    now() {
      return isRunningFlag ? live() : snapshotMs;
    },
    start() {
      isRunningFlag = true;
      // 次の live() 呼び出しで perf 基準点を再計算させる。
      perfStartedAt = null;
    },
    pause() {
      if (isRunningFlag) {
        snapshotMs = live();
      }
      isRunningFlag = false;
      perfStartedAt = null;
    },
    reset() {
      isRunningFlag = false;
      snapshotMs = 0;
      perfStartedAt = null;
    },
    seek(elapsedMs) {
      snapshotMs = Math.max(0, elapsedMs);
      perfStartedAt = null;
    },
    isRunning() {
      return isRunningFlag;
    },
  };
}
