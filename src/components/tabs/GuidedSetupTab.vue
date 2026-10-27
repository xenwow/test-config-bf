<template>
    <SetupTab v-if="!lesson" ref="setup" />
    <div v-else class="guided-motor-lesson">
        <MotorIntroTab />
        <button type="button" class="lesson-continue" :disabled="!ready" @click="continueToMotors">
            {{ ready ? 'Continue to motor testing' : 'Complete the introduction above' }}
        </button>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import SetupTab from "./SetupTab.vue";
import MotorIntroTab from "./MotorIntroTab.vue";
import { switchTab } from "../../js/tab_switch";

const lesson = ref(false);
const ready = ref(false);
const setup = ref<{ cleanup?: (callback?: () => void) => void } | null>(null);

function openLesson() {
    const show = () => {
        lesson.value = true;
        document.body.classList.add("motor-lesson-active");
    };
    if (setup.value?.cleanup) {
        setup.value.cleanup(show);
    } else {
        show();
    }
}
function lessonReady() {
    ready.value = true;
}
function continueToMotors() {
    if (ready.value) {
        switchTab("motors", { mode: "connected" });
    }
}
function cleanup(callback?: () => void) {
    if (!lesson.value && setup.value?.cleanup) {
        setup.value.cleanup(callback);
    } else {
        callback?.();
    }
}
onMounted(() => {
    window.addEventListener("test-edit-open-motor-lesson", openLesson);
    window.addEventListener("wizard-motorintro-ready", lessonReady);
});
onBeforeUnmount(() => {
    document.body.classList.remove("motor-lesson-active");
    window.removeEventListener("test-edit-open-motor-lesson", openLesson);
    window.removeEventListener("wizard-motorintro-ready", lessonReady);
});
defineExpose({ cleanup });
</script>

<style>
body.motor-lesson-active .drone-stage,
body.motor-lesson-active .rotate-controls,
body.motor-lesson-active .info-fab,
body.motor-lesson-active .dialogue:not(.mi-dialogue),
body.motor-lesson-active .wizard-bar {
    display: none !important;
}
.guided-motor-lesson {
    min-height: calc(100vh - 3rem);
}
.lesson-continue {
    position: fixed;
    right: 1.5rem;
    bottom: 3.75rem;
    z-index: 2100;
    padding: 0.7rem 1.6rem;
    border: 2px solid white;
    border-radius: 9999px;
    background: #0e5fc9;
    color: white;
    font-weight: 600;
    cursor: pointer;
}
.lesson-continue:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
</style>
