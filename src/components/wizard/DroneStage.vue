<template>
    <div class="drone-stage" :class="[`drone-stage--${mode}`, { 'drone-stage--shifted': shifted }]">
        <div class="drone-stage__table"></div>
        <div class="drone-stage__shadow"></div>
        <div ref="wrapper" class="drone-stage__model">
            <canvas ref="canvas"></canvas>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import Model from "../../js/model";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { useSetupData } from "../../composables/setup/useSetupData";
import { useFlightControllerStore } from "../../stores/fc";

const props = defineProps<{
    mode: "calibrate" | "gyro" | "hidden";
    shifted: boolean;
    gyroOffset: number;
}>();

const wrapper = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const fcStore = useFlightControllerStore();
const { requestAttitude } = useSetupData();

const RAD = Math.PI / 180;
const REST_Y = -6;

let model: InstanceType<typeof Model> | null = null;
let disposed = false;
let rafId = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let busy = false;
let busySince = 0;

const attitude = { x: 0, y: 0, z: 0 };
const cur = { x: 0, y: 0, z: 0, offset: 0, rest: REST_Y };

function angleDiff(target: number, current: number): number {
    let d = (target - current) % (Math.PI * 2);
    if (d > Math.PI) {
        d -= Math.PI * 2;
    }
    if (d < -Math.PI) {
        d += Math.PI * 2;
    }
    return d;
}

function poll() {
    if (!model || props.mode !== "gyro" || (busy && performance.now() - busySince < 250)) {
        return;
    }
    busy = true;
    busySince = performance.now();
    requestAttitude(() => {
        busy = false;
        const k = fcStore.sensorData.kinematics;
        attitude.x = k[1] * -1 * RAD;
        attitude.y = k[2] * -1 * RAD;
        attitude.z = k[0] * -1 * RAD;
    });
}

function frame() {
    rafId = requestAnimationFrame(frame);
    if (!model || !model.model || props.mode === "hidden") {
        return;
    }
    const live = props.mode === "gyro";
    const tx = live ? attitude.x : 0;
    const ty = live ? attitude.y : 0;
    const tz = live ? attitude.z : 0;
    cur.x += (tx - cur.x) * 0.2;
    cur.z += (tz - cur.z) * 0.2;
    cur.y += angleDiff(ty, cur.y) * 0.2;
    cur.offset += (props.gyroOffset * RAD - cur.offset) * 0.1;
    cur.rest += ((live ? 0 : REST_Y) - cur.rest) * 0.08;

    // The offset rotates what the gyro reads: pitch and roll are mixed by the offset angle.
    const c = Math.cos(cur.offset);
    const s = Math.sin(cur.offset);
    const rx = cur.x * c - cur.z * s;
    const rz = cur.x * s + cur.z * c;

    model.modelWrapper.position.y = cur.rest;
    model.rotateTo(rx, cur.y, rz);
}

function onResize() {
    model?.resize();
}

onMounted(async () => {
    // The mixer decides which mesh loads; without it the generic labelled cube is used.
    try {
        await MSP.promise(MSPCodes.MSP_MIXER_CONFIG, false);
        await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG, false);
    } catch (e) {
        console.warn("DroneStage: could not load mixer config", e);
    }
    if (disposed || !wrapper.value || !canvas.value) {
        return;
    }
    model = new Model(wrapper.value, canvas.value);
    window.addEventListener("resize", onResize);
    pollTimer = setInterval(poll, 60);
    rafId = requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
    disposed = true;
    cancelAnimationFrame(rafId);
    if (pollTimer) {
        clearInterval(pollTimer);
    }
    window.removeEventListener("resize", onResize);
    model?.dispose();
    model = null;
});
</script>

<style>
.drone-stage {
    position: fixed;
    left: 50%;
    top: 50%;
    width: min(720px, 72vw);
    height: min(480px, 56vh);
    z-index: 1450;
    pointer-events: none;
    opacity: 0;
    transform: translate(-50%, -50%);
    transition:
        transform 1.4s cubic-bezier(0.65, 0, 0.35, 1),
        opacity 0.9s ease;
}
.drone-stage--calibrate {
    opacity: 1;
    transform: translate(-50%, -52%) scale(0.85);
}
.drone-stage--gyro {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
}
.drone-stage--gyro.drone-stage--shifted {
    transform: translate(calc(-50% + 24vw), -50%) scale(0.92);
}
.drone-stage__model {
    position: absolute;
    inset: 0;
}
.drone-stage__model canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: transparent;
}
.drone-stage__table {
    position: absolute;
    left: 50%;
    top: 58%;
    width: 96%;
    height: 30%;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(ellipse at 50% 35%, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.1) 55%, transparent 74%);
    border: 1px solid rgba(255, 255, 255, 0.18);
    opacity: 0;
    transition: opacity 0.9s ease;
}
.drone-stage--calibrate .drone-stage__table {
    opacity: 1;
}
.drone-stage__shadow {
    position: absolute;
    left: 50%;
    top: 64%;
    width: 46%;
    height: 9%;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(ellipse, rgba(0, 0, 0, 0.55), transparent 70%);
    opacity: 0;
    transition: opacity 0.9s ease;
}
.drone-stage--calibrate .drone-stage__shadow {
    opacity: 0.7;
}
</style>
