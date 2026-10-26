<template>
    <BaseTab tab-name="calibrate">
        <div class="cal-screen">
            <div class="cal-top">
                <h1>Accelerometer calibration</h1>
                <p class="cal-sub">Set the drone on a flat, level surface and keep it still.</p>
            </div>
            <div class="cal-bottom">
                <p class="cal-copy">
                    Filler text. Lorem ipsum dolor sit amet, consectetur adipiscing elit. The flight controller
                    measures gravity while the drone rests on the table, and uses it as the zero reference for
                    roll and pitch.
                </p>
                <button type="button" class="cal-btn" :disabled="state === 'working'" @click="calibrate">
                    {{ label }}
                </button>
                <div class="cal-status" :class="{ 'cal-status--done': state === 'done' }">{{ status }}</div>
            </div>
        </div>
    </BaseTab>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";

const state = ref<"idle" | "working" | "done">("idle");
let timer: ReturnType<typeof setTimeout> | null = null;

const label = computed(() =>
    state.value === "working" ? "Calibrating..." : state.value === "done" ? "Calibrate again" : "Calibrate",
);
const status = computed(() =>
    state.value === "working"
        ? "Keep the drone still"
        : state.value === "done"
          ? "Calibration complete"
          : "Press Calibrate when the drone is level",
);

function calibrate() {
    state.value = "working";
    MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, () => {
        timer = setTimeout(() => {
            state.value = "done";
        }, 2200);
    });
}

onBeforeUnmount(() => {
    if (timer) {
        clearTimeout(timer);
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
    max-width: 34rem;
}
.tab-calibrate .cal-copy {
    margin: 0;
    line-height: 1.55;
    color: var(--wz-muted);
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
    opacity: 0.6;
    cursor: default;
}
.tab-calibrate .cal-status {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--wz-muted);
}
.tab-calibrate .cal-status--done {
    color: #4f93ee;
}
</style>
