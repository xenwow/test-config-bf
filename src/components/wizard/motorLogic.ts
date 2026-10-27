export type Motor = "fl" | "fr" | "rl" | "rr";
export type Dir = "cw" | "ccw";
export type Dirs = Record<Motor, Dir>;

export interface Outcome {
    kind: "stable" | "spin" | "unstable";
    /** Net prop direction: positive spins the body counter-clockwise (seen from above), negative clockwise. */
    spin: number;
    text: string;
}

export const MOTORS: { key: Motor; label: string }[] = [
    { key: "fl", label: "Front left" },
    { key: "fr", label: "Front right" },
    { key: "rl", label: "Rear left" },
    { key: "rr", label: "Rear right" },
];

/** The layout a quad-X flight controller expects: diagonal motors share a direction. */
export const STANDARD: Dirs = { fl: "ccw", fr: "cw", rl: "cw", rr: "ccw" };

const sign = (d: Dir) => (d === "cw" ? 1 : -1);

export function evaluate(dirs: Dirs): Outcome {
    const net = MOTORS.reduce((sum, m) => sum + sign(dirs[m.key]), 0);
    const isStandard = MOTORS.every((m) => dirs[m.key] === STANDARD[m.key]);

    if (isStandard) {
        return {
            kind: "stable",
            spin: 0,
            text: "Stable. Diagonal motors share a direction, so their twisting forces cancel.",
        };
    }
    if (net !== 0) {
        // Newton's third law: the body twists against the net prop direction.
        const bodyDir = net > 0 ? "counter-clockwise" : "clockwise";
        return {
            kind: "spin",
            spin: net,
            text: `Spins! The twisting forces do not cancel, so the body turns ${bodyDir}.`,
        };
    }
    return {
        kind: "unstable",
        spin: 0,
        text: "Wobbles, then flips. The forces balance, but the flight controller expects diagonal pairs, so its yaw fixes work backwards.",
    };
}
