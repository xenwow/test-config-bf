<template>
    <BaseTab tab-name="calibrate">
        <div class="cal-screen">
            <div class="cal-top">
                <h1>Calibrate</h1>
                <p class="cal-sub">Place the drone flat and keep it still.</p>
            </div>
            <div class="cal-bottom">
                <div class="cal-meter" aria-hidden="true">
                    <div class="cal-meter__fill" :style="{ width: fillPct + '%' }"></div>
                </div>
                <div class="cal-status" :class="{ 'cal-status--done': state === 'done' }">{{ status }}</div>
                <button type="button" class="cal-btn" :disabled="!canCalibrate" @click="calibrate">{{ label }}</button>
            </div>
        </div>

        <Teleport to="body">
            <Transition name="cal-warn">
                <div v-if="problem" class="cal-warning" role="alert">
                    <div class="cal-warning__top">
                        <div class="cal-warning__signs">
                            <span v-for="n in 5" :key="n">&#9888;</span>
                        </div>
                        <div class="cal-warning__title">Place the drone flat</div>
                        <div class="cal-warning__sub">
                            {{ problem === "moving" ? "It is moving. Set it on a table and let go." : "It is tilted. Lay it level." }}
                        </div>
                    </div>
                    <div class="cal-warning__signs cal-warning__signs--bottom">
                        <span v-for="n in 5" :key="n">&#9888;</span>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </BaseTab>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { useSetupData } from "../../composables/setup/useSetupData";
import { useFlightControllerStore } from "../../stores/fc";

const REQUIRED_MS = 3000;
const MOVE_DEG = 0.8;
const FLAT_DEG = 10;

const fcStore = useFlightControllerStore();
const { requestAttitude } = useSetupData();

const state = ref<"idle" | "working" | "done" | "moved">("idle");
const problem = ref<null | "moving" | "tilted">(null);
const stillMs = ref(0);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let calTimer: ReturnType<typeof setTimeout> | null = null;
let stillSince: number | null = null;
let holdUntil = 0;
let movedDuring = false;
let busy = false;
let busySince = 0;
let last: { r: number; p: number; y: number } | null = null;

function angDiff(a: number, b: number): number {
    let d = (a - b) % 360;
    if (d > 180) {
        d -= 360;
    }
    if (d < -180) {
        d += 360;
    }
    return d;
}

function sample() {
    const k = fcStore.sensorData.kinematics;
    const r = k[0];
    const p = k[1];
    const y = k[2];
    const now = performance.now();

    let moving = false;
    if (last) {
        const d = Math.max(Math.abs(r - last.r), Math.abs(p - last.p), Math.abs(angDiff(y, last.y)));
        moving = d > MOVE_DEG;
    }
    last = { r, p, y };
    const tilted = Math.abs(r) > FLAT_DEG || Math.abs(p) > FLAT_DEG;

    if (moving || tilted) {
        stillSince = null;
        holdUntil = now + 700;
        problem.value = moving ? "moving" : "tilted";
        if (state.value === "working") {
            movedDuring = true;
        }
    } else if (now > holdUntil) {
        problem.value = null;
        stillSince ??= now;
    } else {
        stillSince = null;
    }
    stillMs.value = stillSince === null ? 0 : Math.min(REQUIRED_MS, now - stillSince);
}

function poll() {
    if (busy && performance.now() - busySince < 300) {
        return;
    }
    busy = true;
    busySince = performance.now();
    requestAttitude(() => {
        busy = false;
        sample();
    });
}

const fillPct = computed(() => Math.round((stillMs.value / REQUIRED_MS) * 100));
const canCalibrate = computed(
    () => state.value !== "working" && !problem.value && stillMs.value >= REQUIRED_MS,
);
const label = computed(() => {
    if (state.value === "working") {
        return "Calibrating...";
    }
    if (state.value === "done") {
        return "Calibrated";
    }
    return "Calibrate";
});
const status = computed(() => {
    if (state.value === "working") {
        return "Keep it still";
    }
    if (state.value === "done") {
        return "Calibrated - continuing";
    }
    if (state.value === "moved" && stillMs.value < REQUIRED_MS) {
        return "It moved - hold still and try again";
    }
    if (problem.value) {
        return "Not ready";
    }
    if (stillMs.value < REQUIRED_MS) {
        const left = Math.ceil((REQUIRED_MS - stillMs.value) / 1000);
        return `Hold still... ${left}s`;
    }
    return "Ready";
});

function calibrate() {
    if (!canCalibrate.value) {
        return;
    }
    state.value = "working";
    movedDuring = false;
    MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, () => {
        calTimer = setTimeout(() => {
            if (movedDuring) {
                state.value = "moved";
                stillSince = null;
                stillMs.value = 0;
                return;
            }
            state.value = "done";
            window.dispatchEvent(new CustomEvent("wizard-calibrated"));
        }, 2200);
    });
}

onMounted(() => {
    pollTimer = setInterval(poll, 100);
});

onBeforeUnmount(() => {
    if (pollTimer) {
        clearInterval(pollTimer);
    }
    if (calTimer) {
        clearTimeout(calTimer);
    }
});
</script>

<style>
.tab-calibrate {
    min-height: 100%;
    display: flex;
}
.tab-calibrate .cal-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    text-align: center;
    padding: 4.5rem 2rem 7rem;
    color: var(--wz-fg);
}
.tab-calibrate h1 {
    margin: 0 0 0.5rem;
    font-size: 2.4rem;
    font-weight: 700;
    letter-spacing: -0.02em;
}
.tab-calibrate .cal-sub {
    margin: 0;
    color: var(--wz-muted);
}
.tab-calibrate .cal-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: min(22rem, 80vw);
}
.tab-calibrate .cal-meter {
    width: 100%;
    height: 0.5rem;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.2);
    overflow: hidden;
}
.tab-calibrate .cal-meter__fill {
    height: 100%;
    border-radius: 9999px;
    background: linear-gradient(90deg, #4f93ee, #ffffff);
    transition: width 0.15s linear;
}
.tab-calibrate .cal-btn {
    padding: 0.8rem 2.2rem;
    border-radius: 9999px;
    border: 2px solid #ffffff;
    background: linear-gradient(135deg, #1478f0 0%, #0e5fc9 55%, #0a3f8a 100%);
    color: #ffffff;
    font-size: 1.05rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(14, 95, 201, 0.45);
    transition: transform 0.25s ease, opacity 0.25s ease;
}
.tab-calibrate .cal-btn:hover:not(:disabled) {
    transform: translateY(-1px);
}
.tab-calibrate .cal-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.tab-calibrate .cal-status {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--wz-muted);
}
.tab-calibrate .cal-status--done {
    color: #ffffff;
}

/* Red warning over the background while the drone moves or is not flat. */
.cal-warning {
    position: fixed;
    inset: 0;
    z-index: 1300;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 4rem 2rem 6rem;
    color: #ffffff;
    text-align: center;
    background:
        radial-gradient(60rem 36rem at 50% 50%, rgba(255, 60, 70, 0.35), transparent 70%),
        rgba(200, 10, 30, 0.45);
    animation: cal-pulse 0.9s ease-in-out infinite alternate;
}
@keyframes cal-pulse {
    from {
        background-color: rgba(200, 10, 30, 0.35);
    }
    to {
        background-color: rgba(230, 20, 40, 0.6);
    }
}
.cal-warning__signs {
    display: flex;
    gap: 2.5rem;
    justify-content: center;
    font-size: 3rem;
    line-height: 1;
    margin-bottom: 1rem;
}
.cal-warning__signs--bottom {
    margin-bottom: 0;
}
.cal-warning__title {
    font-size: clamp(2rem, 4.5vw, 3.6rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    text-transform: uppercase;
}
.cal-warning__sub {
    margin-top: 0.4rem;
    font-size: 1.15rem;
}
.cal-warn-enter-active,
.cal-warn-leave-active {
    transition: opacity 0.3s ease;
}
.cal-warn-enter-from,
.cal-warn-leave-to {
    opacity: 0;
}
</style>
