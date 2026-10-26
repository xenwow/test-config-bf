<template>
    <div ref="wrapper" class="model-stage">
        <canvas ref="canvas"></canvas>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import Model from "../../js/model";
import { useSetupData } from "../../composables/setup/useSetupData";
import { useFlightControllerStore } from "../../stores/fc";

const wrapper = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const fcStore = useFlightControllerStore();
const { requestAttitude } = useSetupData();

let model: InstanceType<typeof Model> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;
let busySince = 0;
const RAD = Math.PI / 180;

function onResize() {
    model?.resize();
}

function poll() {
    if (!model || (busy && performance.now() - busySince < 250)) {
        return;
    }
    busy = true;
    busySince = performance.now();
    requestAttitude(() => {
        busy = false;
        const k = fcStore.sensorData.kinematics;
        model?.rotateTo(k[1] * -1 * RAD, k[2] * -1 * RAD, k[0] * -1 * RAD);
    });
}

onMounted(() => {
    if (!wrapper.value || !canvas.value) {
        return;
    }
    model = new Model(wrapper.value, canvas.value);
    window.addEventListener("resize", onResize);
    timer = setInterval(poll, 60);
});

onBeforeUnmount(() => {
    if (timer) {
        clearInterval(timer);
    }
    window.removeEventListener("resize", onResize);
    model?.dispose();
    model = null;
});
</script>

<style>
.motor-stage-host {
    width: 100%;
    margin-bottom: 0.75rem;
}
.model-stage {
    position: relative;
    width: 100%;
    height: 320px;
    overflow: hidden;
    border-radius: 1.25rem;
    background:
        radial-gradient(70% 90% at 50% 0%, rgba(79, 147, 238, 0.35), transparent 70%),
        linear-gradient(160deg, #04204a 0%, #0a3f86 60%, #0e5fc9 120%);
    box-shadow: 0 14px 40px rgba(14, 95, 201, 0.28);
}
.model-stage canvas {
    display: block;
    width: 100%;
    height: 100%;
}
</style>
