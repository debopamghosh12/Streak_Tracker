/** Focus watch: shared types. Only numbers ever leave the camera pipeline — never images or landmarks. */

export type FocusState = 'focused' | 'lookingAway' | 'away' | 'phone';

/** What one detection pass reports (no image data). */
export interface FocusSample {
  /** Present when a face was found. */
  face?: {
    /** Head yaw / pitch in degrees, from the facial transformation matrix. */
    yaw: number;
    pitch: number;
    /** Nose-tip height relative to the eye line, normalised by eye distance (bigger = head tilted down). */
    noseRel: number;
  };
  /** Highest "cell phone" score from the object detector (0 when none). */
  phoneScore: number;
}

/** Neutral head pose recorded during the 3-second calibration. */
export interface Calibration {
  yaw: number;
  pitch: number;
  noseRel: number;
}

export interface FocusSettings {
  enabled: boolean;
  /** The first-run explainer was accepted. */
  explained: boolean;
  /** "I only study on screen": head-down counts as looking away. */
  screenOnly: boolean;
  /** Phone in view this long → "Phone down." (10–120 s). */
  phoneSec: number;
  /** Looking away / away this long → "Still studying?" (1–15 min). */
  awayMin: number;
  /** Pause the stopwatch after 5 minutes away (off by default). */
  autoPause: boolean;
  /** Small self-view (off by default). */
  preview: boolean;
  /** Live camera (mirrored) as the pop-out's background instead of plain black (on by default). */
  pipCamera: boolean;
  calibration: Calibration | null;
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  enabled: false,
  explained: false,
  screenOnly: false,
  phoneSec: 20,
  awayMin: 2,
  autoPause: false,
  preview: false,
  pipCamera: true,
  calibration: null,
};

/** Seconds per category plus the number of separate phone episodes. Stored per timer session. */
export interface FocusStats {
  focused: number;
  distracted: number;
  away: number;
  pickups: number;
}

export const emptyStats = (): FocusStats => ({ focused: 0, distracted: 0, away: 0, pickups: 0 });

export const LIMITS = {
  /** Head turned beyond these (degrees from neutral) = looking away. */
  yawDeg: 25,
  pitchDeg: 20,
  phoneScore: 0.5,
  /** A state only changes after this many consecutive agreeing samples. */
  smoothing: 3,
  sampleMs: 2000,
  /** Focused this long clears a warning. */
  clearMs: 6000,
  /** Repeat a warning every 2 minutes while still distracted, at most 5 warnings. */
  repeatMs: 2 * 60_000,
  maxWarnings: 5,
  /** Optional auto-pause after this long away. */
  autoPauseMs: 5 * 60_000,
  /** No usable frame for this long = "Focus watch paused". */
  stallMs: 6000,
} as const;
