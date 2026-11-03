import type shaka from "shaka-player"

/**
 * How much media the player keeps buffered ahead of the playhead, in
 * seconds.
 *
 * A deep buffer absorbs short network hiccups and bitrate switches without
 * the playback stalling. The player only downloads what it needs to reach
 * this goal, so the bytes stay under the control of Shaka.
 *
 * Five minutes of media is roughly 75 MB at the bitrate of the One Pace
 * streams, so the buffer is kept on the device and not in memory forever.
 */
export const BUFFERING_GOAL_SECONDS = 300

/**
 * How much media the player buffers after a stall, in seconds.
 *
 * A rebuffering goal below the buffering goal keeps the player from
 * throwing away the deep buffer it already has when playback stalls.
 */
export const REBUFFERING_GOAL_SECONDS = 5

type ConfigSection = Record<string, unknown>

/**
 * The parts of the Shaka configuration the app sets for every stream.
 *
 * The app owns the buffering behaviour, an asset or a resolved source can
 * still override it through its own configuration.
 */
export interface PlayerConfigOverrides extends ConfigSection {
  streaming: Pick<
    shaka.extern.StreamingConfiguration,
    "bufferingGoal" | "rebufferingGoal"
  >
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfigOverrides = {
  streaming: {
    bufferingGoal: BUFFERING_GOAL_SECONDS,
    rebufferingGoal: REBUFFERING_GOAL_SECONDS,
  },
}

function isConfigSection(value: unknown): value is ConfigSection {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Merges a configuration section into another one.
 *
 * The sections of a Shaka configuration are nested, so a plain spread would
 * drop every setting of a section the override does not mention.
 */
export function mergePlayerConfig<T extends ConfigSection>(
  base: T,
  override?: ConfigSection
): T {
  if (!override) return base

  const target = base as unknown as ConfigSection

  for (const [key, value] of Object.entries(override)) {
    if (!isConfigSection(value)) {
      target[key] = value
      continue
    }

    const current = target[key]

    target[key] = mergePlayerConfig(
      isConfigSection(current) ? current : {},
      value
    )
  }

  return base
}
