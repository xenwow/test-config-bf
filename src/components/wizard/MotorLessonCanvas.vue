<template>
    <canvas ref="canvas" class="lesson-canvas"></canvas>
</template>

<script setup lang="ts">
import * as THREE from "three";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { evaluate, type Dirs, type Motor } from "./motorLogic";

const props = defineProps<{
    stage: 1 | 2 | 3;
    dirs: Dirs;
    flying: boolean;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);

const D = 32;
const KEYS: Motor[] = ["fl", "fr", "rl", "rr"];
const POS: Record<Motor, [number, number]> = {
    fl: [-D, -D],
    fr: [D, -D],
    rl: [-D, D],
    rr: [D, D],
};

interface Rig {
    spin: THREE.Group;
    bladeMat: THREE.MeshStandardMaterial;
    discMat: THREE.MeshBasicMaterial;
    arrow: THREE.Group;
    arrowMat: THREE.MeshBasicMaterial;
    escMat: THREE.MeshStandardMaterial;
}

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let drone: THREE.Group;
let shadow: THREE.Mesh;
let rafId = 0;
let lastTime = 0;
let width = 0;
let height = 0;
const rigs = {} as Record<Motor, Rig>;

const camNow = new THREE.Vector3(0, 70, 135);
const lookNow = new THREE.Vector3(0, 0, 0);

const sim = { h: 0, yaw: 0, roll: 0, pitch: 0, t: 0, crashed: false, omega: 1.2, base: 0, time: 0 };

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

function build() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 1, 1000);
    scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(60, 120, 80);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8dbaf7, 1.1);
    fill.position.set(-80, 40, -60);
    scene.add(fill);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0e5fc9, metalness: 0.3, roughness: 0.45 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x4f93ee, metalness: 0.2, roughness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b1b36, metalness: 0.5, roughness: 0.4 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.4 });

    drone = new THREE.Group();
    scene.add(drone);

    const body = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 30), bodyMat);
    drone.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 24), topMat);
    top.position.y = 4;
    drone.add(top);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(4, 8, 4), noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 1, -19);
    drone.add(nose);

    const armLen = D * 2 * Math.SQRT2;
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(armLen, 2.5, 4), darkMat);
    arm1.rotation.y = -Math.PI / 4;
    drone.add(arm1);
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(armLen, 2.5, 4), darkMat);
    arm2.rotation.y = Math.PI / 4;
    drone.add(arm2);

    for (const k of KEYS) {
        const [x, z] = POS[k];
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 6, 24), darkMat);
        motor.position.set(x, 3, z);
        drone.add(motor);
        const ring = new THREE.Mesh(
            new THREE.CylinderGeometry(5.7, 5.7, 1.2, 24),
            new THREE.MeshStandardMaterial({ color: 0x4f93ee, metalness: 0.6, roughness: 0.3 }),
        );
        ring.position.set(x, 5.6, z);
        drone.add(ring);

        const spin = new THREE.Group();
        spin.position.set(x, 7.5, z);
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.5 });
        const blade = new THREE.Mesh(new THREE.BoxGeometry(34, 0.8, 4.2), bladeMat);
        spin.add(blade);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.6, 12), darkMat);
        spin.add(hub);
        drone.add(spin);

        const discMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const disc = new THREE.Mesh(new THREE.CircleGeometry(17, 36), discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(x, 8.2, z);
        drone.add(disc);

        // Direction arrow: an arc with an arrowhead, mirrored for the other direction.
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
        const inner = new THREE.Group();
        inner.add(new THREE.Mesh(new THREE.TorusGeometry(13, 0.7, 8, 40, Math.PI * 1.5), arrowMat));
        const head = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.5, 12), arrowMat);
        head.position.set(0, -13, 0);
        head.rotation.z = -Math.PI / 2;
        inner.add(head);
        inner.rotation.x = -Math.PI / 2;
        const arrow = new THREE.Group();
        arrow.add(inner);
        arrow.position.set(x, 12, z);
        drone.add(arrow);

        // ESC sits on the arm between the body and the motor.
        const escMat = new THREE.MeshStandardMaterial({
            color: 0x1de9b6,
            emissive: 0x1de9b6,
            emissiveIntensity: 0.1,
            metalness: 0.3,
            roughness: 0.4,
        });
        const esc = new THREE.Mesh(new THREE.BoxGeometry(9, 2.4, 6), escMat);
        esc.position.set(x * 0.45, 2.8, z * 0.45);
        esc.rotation.y = x * z > 0 ? -Math.PI / 4 : Math.PI / 4;
        drone.add(esc);

        rigs[k] = { spin, bladeMat, discMat, arrow, arrowMat, escMat };
    }

    const table = new THREE.Mesh(
        new THREE.CylinderGeometry(78, 78, 1.5, 56),
        new THREE.MeshStandardMaterial({ color: 0x0a3f8a, transparent: true, opacity: 0.55, roughness: 0.8 }),
    );
    table.position.y = -3.75;
    scene.add(table);

    shadow = new THREE.Mesh(
        new THREE.CircleGeometry(26, 32),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -2.95;
    scene.add(shadow);
}

function fit() {
    const el = canvas.value;
    if (!el || !renderer) {
        return;
    }
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w && h && (w !== width || h !== height)) {
        width = w;
        height = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
}

function cameraTargets(stage: number): { pos: THREE.Vector3; look: THREE.Vector3 } {
    if (stage === 2) {
        return { pos: new THREE.Vector3(62, 34, 14), look: new THREE.Vector3(22, 3, -22) };
    }
    if (stage === 3) {
        return { pos: new THREE.Vector3(0, 105, 105), look: new THREE.Vector3(0, 0, 0) };
    }
    return { pos: new THREE.Vector3(0, 70, 135), look: new THREE.Vector3(0, 0, 0) };
}

function frame(now: number) {
    rafId = requestAnimationFrame(frame);
    if (!renderer) {
        return;
    }
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    sim.time += dt;
    fit();

    // Camera glides between the three views.
    const target = cameraTargets(props.stage);
    camNow.lerp(target.pos, 0.05);
    lookNow.lerp(target.look, 0.05);
    camera.position.copy(camNow);
    camera.lookAt(lookNow);

    // Turntable in the intro, then face front.
    if (props.stage === 1) {
        sim.base += 0.25 * dt;
    } else {
        sim.base += angleDiff(0, sim.base) * 0.06;
    }

    const out = evaluate(props.dirs);
    let targetH = 0;
    if (props.flying) {
        sim.t += dt;
        if (out.kind === "stable") {
            targetH = 22 + Math.sin(sim.time * 1.7) * 1.2;
            sim.roll += (Math.sin(sim.time * 1.3) * 0.03 - sim.roll) * 0.1;
            sim.pitch += (Math.sin(sim.time * 1.1) * 0.03 - sim.pitch) * 0.1;
            sim.yaw += angleDiff(0, sim.yaw) * 0.05;
        } else if (out.kind === "spin") {
            targetH = 18;
            sim.yaw += Math.max(-4, Math.min(4, out.spin)) * 0.8 * dt;
            sim.roll += (Math.sin(sim.time * 2) * 0.05 - sim.roll) * 0.1;
        } else if (!sim.crashed) {
            targetH = 16;
            const g = Math.min(1, sim.t / 2.2);
            sim.yaw = Math.sin(sim.t * 9) * 0.5 * g;
            sim.roll = Math.sin(sim.t * 7) * 0.4 * g + g * g * 1.1;
            if (sim.t > 2.3) {
                sim.crashed = true;
            }
        } else {
            targetH = 0;
            sim.roll += (1.5 - sim.roll) * 0.1;
        }
    } else {
        sim.t = 0;
        sim.roll += (0 - sim.roll) * 0.08;
        sim.pitch += (0 - sim.pitch) * 0.08;
        sim.yaw += angleDiff(0, sim.yaw) * 0.06;
        if (sim.h < 1) {
            sim.crashed = false;
        }
    }
    sim.h += (targetH - sim.h) * (1 - Math.exp(-dt * 2.2));

    const omegaTarget = props.flying && !sim.crashed ? 28 : 1.2;
    sim.omega += (omegaTarget - sim.omega) * (1 - Math.exp(-dt * 4));

    for (const k of KEYS) {
        const rig = rigs[k];
        const ccw = props.dirs[k] === "ccw";
        rig.spin.rotation.y += (ccw ? 1 : -1) * sim.omega * dt;
        rig.bladeMat.color.setHex(ccw ? 0xffffff : 0x8dbaf7);
        rig.discMat.color.setHex(ccw ? 0xffffff : 0x8dbaf7);
        rig.discMat.opacity = Math.max(0, Math.min(1, (sim.omega - 6) / 20)) * 0.28;
        rig.arrow.scale.x = ccw ? 1 : -1;
        const arrowTarget = props.stage === 3 ? 0.95 : 0;
        rig.arrowMat.opacity += (arrowTarget - rig.arrowMat.opacity) * 0.1;
        rig.arrow.visible = rig.arrowMat.opacity > 0.02;
        const highlight = props.stage === 2 && k === "fr" ? 0.7 + 0.3 * Math.sin(sim.time * 5) : 0.1;
        rig.escMat.emissiveIntensity += (highlight - rig.escMat.emissiveIntensity) * 0.2;
    }

    drone.position.y = sim.h;
    drone.rotation.set(sim.pitch, sim.base + sim.yaw, sim.roll, "YXZ");
    const s = Math.max(0.5, 1 - sim.h / 70);
    shadow.scale.set(s, s, s);

    renderer.render(scene, camera);
}

onMounted(() => {
    if (!canvas.value) {
        return;
    }
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    build();
    camera.position.copy(camNow);
    rafId = requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
    cancelAnimationFrame(rafId);
    scene?.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
        } else {
            mat?.dispose();
        }
    });
    renderer?.dispose();
    renderer = null;
});
</script>

<style>
.lesson-canvas {
    position: absolute;
    right: 0;
    top: 0;
    width: 64%;
    height: 100%;
    background: transparent;
    pointer-events: none;
}
</style>
