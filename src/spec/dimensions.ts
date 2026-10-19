/**
 * Single source of truth for every dimension, position and clearance of the
 * Safe Lock vault. Millimetres / degrees / milliseconds here; geometry converts
 * once with mm(). Coordinates: Y up, origin at the centre of the footprint on
 * the floor, +Z = front (door side), +X = vault's right when facing the door.
 *
 * Positions are absolute world coordinates with the door CLOSED and the lock
 * bolt EXTENDED (locked). Door-mounted parts are re-parented to the hinge pivot
 * at build time.
 *
 * Every value is a "placeholder" until the user supplies a measurement or a
 * confirmed datasheet. Never upgrade a placeholder to "measured" by hand.
 */

export type Source = "measured" | "datasheet" | "placeholder";
export type Unit = "mm" | "deg" | "ms" | "count" | "degC" | "%" | "g" | "s" | "dBm";

export interface Dim {
  value: number;
  unit: Unit;
  source: Source;
  note?: string;
}

export interface Dim3 {
  value: readonly [number, number, number];
  unit: "mm" | "deg";
  source: Source;
  note?: string;
}

export interface DimList {
  value: readonly number[];
  unit: Unit;
  source: Source;
  note?: string;
}

const ph = (value: number, unit: Unit = "mm", note?: string): Dim => ({ value, unit, source: "placeholder", note });
const ph3 = (x: number, y: number, z: number, note?: string, unit: "mm" | "deg" = "mm"): Dim3 => ({
  value: [x, y, z],
  unit,
  source: "placeholder",
  note,
});
const phList = (value: number[], unit: Unit = "mm", note?: string): DimList => ({ value, unit, source: "placeholder", note });

export const spec = {
  body: {
    width: ph(450),
    height: ph(500),
    depth: ph(400),
    wallThickness: ph(3, "mm", "steel sheet"),
    edgeRadius: ph(6),
    edgeBevel: ph(1, "mm", "front/rear edge break of the shell"),
    rearPanelSeam: ph(0.5, "mm", "visible joint between wrap-around shell and rear panel"),
  },

  feet: {
    height: ph(12),
    diameter: ph(30),
    inset: ph(35, "mm", "foot centre from the outer body edges"),
  },

  rearScrews: {
    headDiameter: ph(7, "mm", "M4 pan head"),
    headHeight: ph(2.8),
    inset: ph(15, "mm", "screw centre from the rear panel edge"),
    countAcross: ph(4, "count"),
    countUp: ph(4, "count"),
  },

  door: {
    frameSide: ph(25, "mm", "vertical stiles"),
    frameTop: ph(40, "mm", "top rail, houses the PIR"),
    frameBottom: ph(40, "mm", "bottom rail, houses the control strip"),
    depth: ph(30, "mm", "frame profile depth, door is inset flush with the body front"),
    frontLipDepth: ph(4, "mm", "frame lip in front of the glass"),
    glassThickness: ph(8, "mm", "laminated PDLC"),
    glassRebate: ph(6, "mm", "glass edge captured inside the frame on each side"),
    gap: ph(2, "mm", "clearance to body"),
    hingeSide: "left" as "left" | "right",
    maxOpenAngle: ph(110, "deg"),
    pivotInsetX: ph(12, "mm", "hinge axis distance in from the door's hinge-side edge"),
    pivotInsetZ: ph(5, "mm", "hinge axis distance behind the door front face"),
    frameEdgeRadius: ph(2),
    glassEdgeRadius: ph(1),
  },

  hinges: {
    type: "concealed top/bottom pivot pins" as const,
    pinDiameter: ph(6),
    pinEmbedDoor: ph(12, "mm", "pin length inside the door rail"),
    bushingDiameter: ph(10, "mm", "flush bushing in the top/bottom wall"),
  },

  handle: {
    note: "Implied by the materials table (brushed metal frame and handle). Shape and position need approval.",
    center: ph3(207.5, 262, 200, "on the latch-side stile, at lock height; z = door front face"),
    length: ph(160),
    barDiameter: ph(12),
    postDiameter: ph(8),
    standoff: ph(28, "mm", "bar axis distance in front of the door face"),
  },

  lock: {
    housingSize: ph3(20, 28, 30, "solenoid housing on the inner latch-side wall"),
    housingCenter: ph3(212, 262, 150),
    boltDiameter: ph(8),
    boltLength: ph(20),
    boltThrow: ph(12, "mm", "bolt travels -X when locking"),
    catchSize: ph3(4, 30, 28, "strike plate on the door's inner face"),
    catchCenter: ph3(197, 262, 156),
    catchSlot: ph3(0, 12, 12, "slot the bolt passes through (y, z used)"),
    catchSlotOffsetZ: ph(-6, "mm", "slot centre relative to the catch centre, aligned with the bolt axis"),
    catchFlangeWidth: ph(14, "mm", "fixing flange against the door back"),
    catchFlangeThickness: ph(3),
  },

  controlStrip: {
    center: ph3(0, 37, 200, "on the bottom rail; z = door front face"),
    width: ph(160),
    height: ph(18),
    panelDepth: ph(1.5, "mm", "dark glass panel proud of the frame, incl. LED relief"),
    featureRelief: ph(0.3, "mm", "LEDs and access pad stand proud of the glass panel"),
    ledDiameter: ph(3),
    ledPitch: ph(10),
    ledCount: ph(3, "count", "status, storage mode, network"),
    ledStartX: ph(-65, "mm", "first LED centre relative to strip centre"),
    padDiameter: ph(14, "mm", "access pad (touch / fingerprint, to be confirmed)"),
    padOffsetX: ph(55, "mm", "access pad centre relative to strip centre"),
  },

  pir: {
    center: ph3(0, 487, 200, "on the top rail; z = door front face"),
    domeDiameter: ph(23, "mm", "HC-SR501-class Fresnel dome (part not confirmed)"),
    domeHeight: ph(11.5),
    bezelDiameter: ph(30),
    bezelHeight: ph(1.5),
    boardSize: ph3(32, 24, 1.6),
    detectionAngle: ph(110, "deg", "full cone angle"),
    range: ph(3000, "mm", "HC-SR501 class is adjustable ~3-7 m"),
  },

  camera: {
    center: ph3(0, 486, 110, "housing centre, ceiling-mounted near the front, looking back/down"),
    housingSize: ph3(46, 30, 18, "ESP32-CAM-class board ~40 x 27 mm inside (part not confirmed)"),
    lensDiameter: ph(10),
    lensLength: ph(6),
    tilt: ph(-30, "deg", "rotation about X; negative pitches the lens down"),
    ledDiameter: ph(5, "mm", "illumination LED"),
    ledOffsetX: ph(14, "mm", "LED centre from lens centre"),
    fov: ph(66, "deg", "OV2640-class diagonal FOV"),
    mountPlateSize: ph3(50, 3, 30),
    postDiameter: ph(8),
  },

  doorSensor: {
    magnetSize: ph3(14, 20, 6),
    magnetCenter: ph3(205, 335, 167, "on the door back face"),
    reedSize: ph3(20, 20, 10),
    reedCenter: ph3(212, 335, 157, "bracket on the inner latch-side wall"),
    maxSwitchGap: ph(5, "mm", "reed must be within this distance of the magnet when closed"),
  },

  vibration: {
    size: ph3(10, 14, 32, "SW-420-class module ~32 x 14 mm (part not confirmed)"),
    center: ph3(-217, 432, -140, "inner hinge-side wall, upper rear"),
  },

  tempHumidity: {
    size: ph3(8, 25, 15, "DHT22-class ~25 x 15 x 8 mm (part not confirmed)"),
    center: ph3(218, 432, -140, "inner latch-side wall, upper rear"),
  },

  electronicsBay: {
    height: ph(70, "mm", "clear height above the body floor"),
    coverThickness: ph(3),
    frontPanelZ: ph(160, "mm", "front face of the bay front panel"),
    frontPanelThickness: ph(3),
  },

  controller: {
    boardSize: ph3(70, 1.6, 50, "Wi-Fi/BLE MCU carrier board, ESP32-class"),
    boardCenter: ph3(-60, 21.8, 0),
    standoffHeight: ph(6),
    standoffDiameter: ph(5),
    standoffInset: ph(3.5),
    mcuSize: ph3(18, 3.1, 25.5, "ESP32-WROOM-class module footprint"),
    mcuCenterXZ: ph3(-75, 0, -5, "y unused; module sits on the board"),
  },

  imu: {
    size: ph3(21, 7.4, 16, "GY-521-class ~21 x 16 mm incl. headers (part not confirmed)"),
    center: ph3(-40, 26.3, 10, "on pin headers above the controller board"),
  },

  battery: {
    size: ph3(77, 21, 41, "2 x 18650 holder (chemistry/part not confirmed)"),
    center: ph3(80, 25.5, -30),
  },

  tamper: {
    size: ph3(20, 10, 6, "miniature microswitch on the bay cover underside"),
    center: ph3(160, 80, 100),
  },

  buzzer: {
    diameter: ph(12),
    length: ph(9.5),
    center: ph3(217.25, 50, 100, "faces +X behind the latch-side grille"),
    grilleHoleDiameter: ph(1.6),
    grillePitch: ph(3),
    grilleRings: ph(2, "count"),
  },

  powerInlet: {
    centerXY: ph3(150, 50, 0, "rear panel, z unused"),
    flangeDiameter: ph(14),
    flangeThickness: ph(2),
    bodyDiameter: ph(11),
    bodyLength: ph(20),
  },

  peltier: {
    tecSize: ph3(40, 40, 3.8, "TEC1-12706-class 40 x 40 x 3.8 mm (part not confirmed)"),
    center: ph3(0, 440, -198.5, "TEC centre, seated in a rear-wall cutout"),
    innerSinkSize: ph3(60, 60, 20),
    innerFanSize: ph3(40, 40, 10),
    outerSinkSize: ph3(80, 80, 25),
    outerFanSize: ph3(80, 80, 25),
    shroudSize: ph3(100, 100, 56, "vented cover over the hot side, rear exterior"),
    shroudSheet: ph(1.5),
    sinkBaseThickness: ph(5),
    innerFinCount: ph(8, "count"),
    outerFinCount: ph(12, "count"),
    finThickness: ph(1.2),
    shroudSlotWidth: ph(3),
    shroudSlotLength: ph(30),
    shroudSlotPitch: ph(7),
  },

  rearVents: {
    slotWidth: ph(3),
    slotHeight: ph(30),
    pitch: ph(8),
    count: ph(12, "count"),
    firstX: ph(-200),
    centerY: ph(50),
    recess: ph(1, "mm", "visual depth of the slot"),
  },

  shelves: {
    topY: phList([290], "mm", "top surface of each removable shelf"),
    plateThickness: ph(1.5),
    lipDepth: ph(20, "mm", "folded edge depth"),
    sideClearance: ph(3),
    rearZ: ph(-192),
    frontZ: ph(120),
    pinDiameter: ph(5),
    pinLength: ph(10),
    pinZ: phList([-160, 90]),
  },

  chamber: {
    doorInnerClearance: ph(75, "mm", "keep-out depth behind the door (door + lock zone)"),
  },

  timing: {
    smartGlassTransition: ph(300, "ms", "PDLC switching visual transition"),
    boltTravel: ph(220, "ms"),
    doorOpen: ph(1400, "ms"),
    doorClose: ph(1200, "ms"),
    alertPulsePeriod: ph(500, "ms"),
  },

  optics: {
    focalLength: ph(50, "mm", "presentation camera, full-frame equivalent"),
    sensorHeight: ph(24, "mm", "full-frame sensor height"),
  },

  render: {
    radialSegments: ph(48, "count"),
    patentMargin: ph(0.08, "count", "fraction of the largest bounding-box side"),
    patentSize: ph(3000, "count", "px"),
    heroSize: ph(3000, "count", "px"),
  },

  explode: {
    distance: ph(1, "count", "global multiplier for the per-part offsets below"),
    door: ph3(0, 0, 420),
    glass: ph3(0, 0, 110),
    handle: ph3(0, 0, 70),
    controlStrip: ph3(0, -20, 60),
    pir: ph3(0, 50, 60),
    lockCatch: ph3(60, 0, -40),
    magnet: ph3(40, 0, -60),
    hingeTop: ph3(0, 90, 0),
    hingeBottom: ph3(0, -60, 0),
    lock: ph3(150, 0, 0),
    reed: ph3(120, 0, 0),
    shelves: ph3(0, 0, 200),
    camera: ph3(0, 140, 0),
    vibration: ph3(-130, 0, 0),
    tempHumidity: ph3(130, 0, 0),
    rearPanel: ph3(0, 0, -340),
    bayCover: ph3(0, 50, 0),
    bayInternals: ph3(0, 0, 330),
    buzzer: ph3(120, 0, 0),
    peltierInner: ph3(0, 0, 90),
    peltierOuter: ph3(0, 0, -440),
    feet: ph3(0, -40, 0),
  },
} as const;

export type Spec = typeof spec;

/** Millimetres to metres (1 Three.js unit = 1 m). The only unit conversion. */
export const mm = (x: number): number => x / 1000;
export const deg = (x: number): number => (x * Math.PI) / 180;
