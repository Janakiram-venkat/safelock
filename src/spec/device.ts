import type { Dim, Unit } from "./dimensions";

/**
 * Device behaviour used by the firmware simulator and the mobile app:
 * setpoints, thresholds and timings. Same rules as dimensions.ts: every value
 * has a source, and everything is a placeholder until measured on the
 * prototype or taken from a confirmed datasheet.
 */
const ph = (value: number, unit: Unit, note?: string): Dim => ({ value, unit, source: "placeholder", note });

export const deviceSpec = {
  climate: {
    ambient: ph(24, "degC", "room temperature the simulator assumes"),
    ambientSwing: ph(1.5, "degC", "slow day/night drift amplitude"),
    ambientHumidity: ph(50, "%", "room relative humidity"),
    coldTarget: ph(8, "degC", "Cold mode setpoint (TEC1-12706-class units reach ~ambient − 20 °C)"),
    warmTarget: ph(32, "degC", "Warm mode setpoint"),
    coolTau: ph(240, "s", "chamber time constant while the Peltier runs"),
    passiveTau: ph(900, "s", "chamber time constant with the Peltier off, door closed"),
    doorOpenTau: ph(60, "s", "time constant toward ambient while the door is open"),
    maxHumidity: ph(95, "%"),
    sensorNoiseT: ph(0.05, "degC", "DHT22-class resolution/noise"),
    sensorNoiseRH: ph(0.4, "%"),
  },
  security: {
    vibrationAlert: ph(0.35, "g", "RMS vibration that raises an alert while locked"),
    vibrationIdle: ph(0.01, "g", "background vibration"),
    tiltAlert: ph(8, "deg", "tilt from level that raises an alert (vault being moved)"),
    pinAttempts: ph(5, "count", "wrong PINs before remote unlock is blocked"),
    lockoutTime: ph(300, "s", "remote unlock block after too many wrong PINs"),
    relockDelay: ph(15, "s", "auto-relock after an unlock if the door is not opened"),
    motionHold: ph(5, "s", "PIR output hold time (HC-SR501-class, adjustable)"),
  },
  power: {
    batteryDrainPerHour: ph(12, "%", "backup battery drain on battery power"),
    batteryChargePerHour: ph(25, "%"),
    lowBattery: ph(20, "%", "warning threshold"),
  },
  link: {
    publishInterval: ph(500, "ms", "state broadcast period"),
    rssi: ph(-58, "dBm", "nominal Wi-Fi signal"),
    historySeconds: ph(600, "s", "temperature history kept for the app chart"),
    historyStep: ph(5, "s", "history sample period"),
    eventLog: ph(40, "count", "events kept in the activity log"),
  },
} as const;

export type DeviceSpec = typeof deviceSpec;
