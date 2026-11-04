import type React from "react"

/**
 * Theme tokens for the television frame.
 *
 * Every visual value of the room, the chassis and the overlay is expressed as
 * a CSS custom property. The Tailwind utilities in the components only ever
 * reference `var(--tv-*)`, so a new theme is a new token set and nothing else.
 */
export interface TVThemeTokens {
  /** Wall paint, mid tone. */
  wallBase: string
  /** Wall paint, lit from above. */
  wallTop: string
  /** Wall paint, falling into shadow near the floor. */
  wallBottom: string
  /** Radial light pooling behind the television. */
  wallGlow: string
  /** Soft light wash on the left of the wall. */
  wallLightLeft: string
  /** Soft light wash on the right of the wall. */
  wallLightRight: string
  /** Edge darkening of the room. */
  wallVignette: string
  /** Vertical architectural panel seam. */
  wallPanel: string
  /** Leaf gradient, lit side. */
  plantLeaf: string
  /** Leaf gradient, shadow side. */
  plantLeafDark: string
  /** Metallic chassis gradient. */
  chassis: string
  /** Chassis edge and bezel colour. */
  chassisEdge: string
  /** Screen black, used behind the video. */
  screen: string
  /** Backlight halo, brightest stop. */
  halo: string
  /** Backlight halo, outer stop. */
  haloOuter: string
  /** Broad diffused cast shadow. */
  castShadow: string
  /** Dark contact shadow where the chassis meets the wall. */
  contactShadow: string
  /** Soundbar body gradient. */
  soundbar: string
  /** Soundbar grille sheen. */
  soundbarEdge: string
  /** Media console top surface. */
  consoleTop: string
  /** Media console front face. */
  consoleFront: string
  /** Gold accent used by the channel bug. */
  accent: string
  /** Red used by the live badge. */
  live: string
}

export const TV_THEME_NAMES = ["reference", "cinema", "warm"] as const

export type TVThemeName = (typeof TV_THEME_NAMES)[number]

const REFERENCE_TOKENS: TVThemeTokens = {
  wallBase: "#89949a",
  wallTop: "#a0aab0",
  wallBottom: "#6f7b82",
  wallGlow: "rgba(228,237,240,0.25)",
  wallLightLeft: "rgba(221,232,237,0.18)",
  wallLightRight: "rgba(195,211,220,0.14)",
  wallVignette: "rgba(18,26,30,0.18)",
  wallPanel: "rgba(30,40,46,0.16)",
  plantLeaf: "#435f50",
  plantLeafDark: "#172f29",
  chassis:
    "linear-gradient(145deg,#292d30 0%,#080a0c 26%,#171a1d 70%,#050607 100%)",
  chassisEdge: "rgba(12,15,17,0.9)",
  screen: "#050708",
  halo: "rgba(221,234,240,0.42)",
  haloOuter: "rgba(203,220,230,0.19)",
  castShadow: "rgba(13,20,24,0.53)",
  contactShadow: "rgba(0,0,0,0.34)",
  soundbar: "linear-gradient(180deg,#282c30,#15191c 58%,#0c0e10)",
  soundbarEdge: "rgba(255,255,255,0.07)",
  consoleTop: "linear-gradient(180deg,#e4e8e9,#cbd1d4)",
  consoleFront: "linear-gradient(100deg,#d8dde0,#cfd5d8)",
  accent: "#d9b633",
  live: "#e34e59",
}

const CINEMA_TOKENS: TVThemeTokens = {
  ...REFERENCE_TOKENS,
  wallBase: "#30383d",
  wallTop: "#424c52",
  wallBottom: "#20272b",
  wallGlow: "rgba(190,214,226,0.18)",
  wallLightLeft: "rgba(190,214,226,0.12)",
  wallLightRight: "rgba(150,180,196,0.09)",
  wallVignette: "rgba(6,10,12,0.42)",
  wallPanel: "rgba(255,255,255,0.05)",
  plantLeaf: "#2f4a3f",
  plantLeafDark: "#101f1b",
  halo: "rgba(188,216,232,0.3)",
  haloOuter: "rgba(150,184,204,0.12)",
  castShadow: "rgba(0,0,0,0.6)",
}

const WARM_TOKENS: TVThemeTokens = {
  ...REFERENCE_TOKENS,
  wallBase: "#938b81",
  wallTop: "#aaa195",
  wallBottom: "#70675e",
  wallGlow: "rgba(240,226,206,0.26)",
  wallLightLeft: "rgba(236,220,196,0.2)",
  wallLightRight: "rgba(206,190,170,0.15)",
  wallVignette: "rgba(32,24,16,0.2)",
  wallPanel: "rgba(46,36,26,0.16)",
  plantLeaf: "#4c5c3f",
  plantLeafDark: "#22301c",
  halo: "rgba(244,226,198,0.38)",
  haloOuter: "rgba(224,200,168,0.16)",
  castShadow: "rgba(28,20,12,0.5)",
}

export const TV_THEMES: Record<TVThemeName, TVThemeTokens> = {
  reference: REFERENCE_TOKENS,
  cinema: CINEMA_TOKENS,
  warm: WARM_TOKENS,
}

const VARIABLE_NAMES: Record<keyof TVThemeTokens, string> = {
  wallBase: "--tv-wall-base",
  wallTop: "--tv-wall-top",
  wallBottom: "--tv-wall-bottom",
  wallGlow: "--tv-wall-glow",
  wallLightLeft: "--tv-wall-light-left",
  wallLightRight: "--tv-wall-light-right",
  wallVignette: "--tv-wall-vignette",
  wallPanel: "--tv-wall-panel",
  plantLeaf: "--tv-plant-leaf",
  plantLeafDark: "--tv-plant-leaf-dark",
  chassis: "--tv-chassis",
  chassisEdge: "--tv-chassis-edge",
  screen: "--tv-screen",
  halo: "--tv-halo",
  haloOuter: "--tv-halo-outer",
  castShadow: "--tv-cast-shadow",
  contactShadow: "--tv-contact-shadow",
  soundbar: "--tv-soundbar",
  soundbarEdge: "--tv-soundbar-edge",
  consoleTop: "--tv-console-top",
  consoleFront: "--tv-console-front",
  accent: "--tv-accent",
  live: "--tv-live",
}

/**
 * Resolves a theme into the CSS custom properties consumed by the frame.
 *
 * The result is meant to be spread into the `style` prop of the frame root.
 */
export function tvThemeVariables(theme: TVThemeName): Record<string, string> {
  const tokens = TV_THEMES[theme] ?? TV_THEMES.reference
  const variables: Record<string, string> = {}

  for (const key of Object.keys(VARIABLE_NAMES) as (keyof TVThemeTokens)[]) {
    variables[VARIABLE_NAMES[key]] = tokens[key]
  }

  return variables
}

/**
 * Builds the `style` prop for the frame root.
 *
 * React does not know about custom properties, so the object is cast to
 * `CSSProperties` the same way the player root does it.
 */
export function tvThemeStyle(theme: TVThemeName): React.CSSProperties {
  return tvThemeVariables(theme) as React.CSSProperties
}
