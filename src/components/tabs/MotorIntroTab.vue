<template>
    <BaseTab tab-name="motorintro">
        <div class="mi-screen">
            <MotorLessonCanvas :stage="stage" :dirs="dirs" :flying="flying" />

            <Transition name="dlg" mode="out-in">
                <div :key="stage" class="dialogue mi-dialogue">
                    <div class="dialogue__eyebrow">{{ copy.eyebrow }}</div>
                    <h2>{{ copy.title }}</h2>
                    <p>{{ copy.text }}</p>

                    <template v-if="stage === 3">
                        <div class="mi-grid">
                            <div v-for="m in MOTORS" :key="m.key" class="mi-motor">
                                <span class="mi-motor__label">{{ m.label }}</span>
                                <div class="mi-motor__pills">
                                    <button
                                        type="button"
                                        class="mi-pill"
                                        :class="{ 'mi-pill--on': dirs[m.key] === 'cw' }"
                                        :disabled="flying"
                                        @click="setDir(m.key, 'cw')"
                                    >
                                        CW
                                    </button>
                                    <button
                                        type="button"
                                        class="mi-pill"
                                        :class="{ 'mi-pill--on': dirs[m.key] === 'ccw' }"
                                        :disabled="flying"
                                        @click="setDir(m.key, 'ccw')"
                                    >
                                        CCW
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="mi-presets">
                            <button type="button" class="mi-link" :disabled="flying" @click="preset('standard')">
                                Standard
                            </button>
                            <button type="button" class="mi-link" :disabled="flying" @click="preset('allccw')">
                                All CCW
                            </button>
                            <button type="button" class="mi-link" :disabled="flying" @click="preset('split')">
                                Left / right split
                            </button>
                        </div>
                        <div class="mi-status" :class="`mi-status--${outcome.kind}`">{{ outcome.text }}</div>
                        <button type="button" class="dialogue__btn" @click="flying = !flying">
                            {{ flying ? "Land" : "Take off" }}
                        </button>
                    </template>
                    <button v-else type="button" class="dialogue__btn" @click="advance">Next</button>
                </div>
            </Transition>
        </div>
    </BaseTab>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import MotorLessonCanvas from "../wizard/MotorLessonCanvas.vue";
import { evaluate, MOTORS, STANDARD, type Dir, type Dirs, type Motor } from "../wizard/motorLogic";

const stage = ref<1 | 2 | 3>(1);
const flying = ref(false);
const dirs = reactive<Dirs>({ ...STANDARD });
const outcome = computed(() => evaluate(dirs));

const copy = computed(() => {
    if (stage.value === 1) {
        return {
            eyebrow: "Motor direction",
            title: "Which way do they spin?",
            text: "Every motor spins a set way. Get one wrong and your drone flips on takeoff. Let us see why.",
        };
    }
    if (stage.value === 2) {
        return {
            eyebrow: "The motor and its ESC",
            title: "Meet the ESC",
            text: "Each motor has an ESC, a tiny controller that turns flight controller signals into motor power. It also decides which way the motor spins.",
        };
    }
    return {
        eyebrow: "Try it",
        title: "Set the directions",
        text: "Pick a direction for each motor, take off, land, change it, and try again.",
    };
});

function advance() {
    if (stage.value === 1) {
        stage.value = 2;
    } else if (stage.value === 2) {
        stage.value = 3;
        window.dispatchEvent(new CustomEvent("wizard-motorintro-ready"));
    }
}

function setDir(motor: Motor, dir: Dir) {
    if (!flying.value) {
        dirs[motor] = dir;
    }
}

function preset(name: "standard" | "allccw" | "split") {
    if (flying.value) {
        return;
    }
    if (name === "standard") {
        Object.assign(dirs, STANDARD);
    } else if (name === "allccw") {
        Object.assign(dirs, { fl: "ccw", fr: "ccw", rl: "ccw", rr: "ccw" });
    } else {
        Object.assign(dirs, { fl: "cw", rl: "cw", fr: "ccw", rr: "ccw" });
    }
}
</script>

<style>
.tab-motorintro {
    position: relative;
    min-height: calc(100vh - 9rem);
}
.tab-motorintro .mi-screen {
    position: relative;
    width: 100%;
    min-height: calc(100vh - 9rem);
    overflow: hidden;
}
.tab-motorintro .dialogue {
    position: absolute;
}
.tab-motorintro .mi-dialogue {
    width: min(30rem, 40vw);
}
.tab-motorintro .mi-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.9rem 1.2rem;
    margin-bottom: 0.9rem;
}
.tab-motorintro .mi-motor__label {
    display: block;
    margin-bottom: 0.35rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #8dbaf7;
}
.tab-motorintro .mi-motor__pills {
    display: flex;
    gap: 0.4rem;
}
.tab-motorintro .mi-pill {
    flex: 1;
    padding: 0.4rem 0.6rem;
    border-radius: 9999px;
    border: 2px solid #ffffff;
    background: transparent;
    color: #ffffff;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, opacity 0.2s ease;
}
.tab-motorintro .mi-pill--on {
    background: #ffffff;
    color: #0e5fc9;
}
.tab-motorintro .mi-pill:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
.tab-motorintro .mi-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1rem;
}
.tab-motorintro .mi-link {
    border: 0;
    background: transparent;
    color: #cfe1fb;
    text-decoration: underline;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0;
}
.tab-motorintro .mi-link:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.tab-motorintro .mi-status {
    min-height: 3.2rem;
    margin-bottom: 1rem;
    font-size: 0.95rem;
    line-height: 1.45;
    color: #cfe1fb;
}
.tab-motorintro .mi-status--stable {
    color: #8ef0b4;
}
.tab-motorintro .mi-status--spin {
    color: #ffd166;
}
.tab-motorintro .mi-status--unstable {
    color: #ff9b9b;
}
</style>
