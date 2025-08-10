import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// --- Звук двигателя V10 (через .wav) ---
let audioCtx, engineBuffer, engineSource, engineGain;
let engineLoaded = false;

function loadEngineSound() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  fetch("sfx/engine_v10.mp3") // поместите файл engine_v10.wav в public или рядом с index.html
    .then((response) => response.arrayBuffer())
    .then((arrayBuffer) => audioCtx.decodeAudioData(arrayBuffer))
    .then((buffer) => {
      engineBuffer = buffer;
      engineLoaded = true;
    });
}
loadEngineSound();

function startEngineSound(loop = true) {
  if (!audioCtx || !engineLoaded) return;
  if (engineSource) return; // уже играет
  engineSource = audioCtx.createBufferSource();
  engineSource.buffer = engineBuffer;
  engineSource.loop = loop;
  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0.12;
  engineSource.connect(engineGain).connect(audioCtx.destination);
  engineSource.playbackRate.value = 1.0;
  engineSource.start(0);
}

function stopEngineSound() {
  if (engineSource) {
    // Если звук уже не loop — просто ждем окончания
    if (!engineSource.loop) return;
    // Отключаем loop, чтобы доиграл до конца
    engineSource.loop = false;
    // После окончания — отключаем и чистим
    engineSource.onended = () => {
      engineSource.disconnect();
      engineSource = null;
      if (engineGain) {
        engineGain.disconnect();
        engineGain = null;
      }
    };
  }
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 5, 13);
camera.rotation.x = 6;

// --- Смещение камеры по акселерометру (моб. устройства) ---
let camGyroOffset = { x: 0, y: 0 };
if (window.DeviceOrientationEvent) {
  window.addEventListener("deviceorientation", (event) => {
    // gamma: влево/вправо, beta: вперёд/назад
    // Ограничим диапазон [-30, 30] градусов
    let gamma = Math.max(-30, Math.min(30, event.gamma || 0));
    let beta = Math.max(-30, Math.min(30, event.beta || 0));
    // Преобразуем в смещение камеры (делаем плавно)
    camGyroOffset.x = (gamma / 30) * 1.2; // влево/вправо (ось X)
    camGyroOffset.y = (beta / 30) * 0.7; // вверх/вниз (ось Y)
  });
}
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// === Bloom postprocessing ===
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5, // strength
  1, // radius
  0.15 // threshold
);
composer.addPass(bloomPass);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Create a light
const ambientLight = new THREE.AmbientLight("white", 1);
scene.add(ambientLight);

// Тёплый солнечный свет в стиле Miami (розово-оранжевый)
const directionalLight = new THREE.DirectionalLight(0xffb36b, 2); // мягкий персиковый/оранжевый
directionalLight.position.set(5, 0, 5);
directionalLight.castShadow = true; // Enable shadows
scene.add(directionalLight);

// Miami Ocean Drive sky shader
const skyVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFragmentShader = `
varying vec2 vUv;
void main() {
  // Miami gradient: голубой -> фиолетовый -> розовый
  vec3 top = vec3(0.38, 0.82, 1.0);      // голубой
  vec3 mid = vec3(0.67, 0.36, 0.93);     // фиолетовый
  vec3 bot = vec3(1.0, 0.45, 0.75);      // розовый
  float y = vUv.y;
  vec3 color = mix(bot, mid, smoothstep(0.0, 0.6, y));
  color = mix(color, top, smoothstep(0.5, 1.0, y));
  // Сделаем небо темнее для уменьшения bloom
  color *= 0.35;
  gl_FragColor = vec4(color, 1.0);
}`;

// Асфальтовый шейдер
const asphaltVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const asphaltFragmentShader = `
varying vec2 vUv;
// Простой псевдошум
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}
void main() {
    // Ещё более тёмный базовый цвет асфальта
    float base = 0.045 + 0.03 * random(vUv * 100.0);
    // Темные "камушки"
    float stones = smoothstep(0.10, 0.13, random(vUv * 300.0));
    // Дорожные полосы (оставим желтыми)
    vec3 color = mix(vec3(base), vec3(0.10,0.10,0.10), stones * 0.4);
    color *= 0.1;
    gl_FragColor = vec4(color, 1.0);
}`;

// Miami sky background (большой plane сзади сцены)
const sky = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 60),
  new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  })
);
sky.position.set(0, 20, -40);
scene.add(sky);

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 20),
  new THREE.ShaderMaterial({
    vertexShader: asphaltVertexShader,
    fragmentShader: asphaltFragmentShader,
  })
);
road.rotation.x = -Math.PI / 2; // Rotate the plane to be horizontal
scene.add(road);

// Car
let car;

// Load GLTF Model
const gltfLoader = new GLTFLoader();
gltfLoader.load(
  "./models/ferrari_f40/scene.gltf",
  (gltf) => {
    car = gltf.scene;
    car.scale.set(1, 1, 1);
    // Установим начальное положение на окружности радиусом 5
    car.position.x = 5 * Math.cos(angle);
    car.position.y = 0;
    car.position.z = 5 * Math.sin(angle);
    car.rotation.y = -angle;
    scene.add(car);

    // === Задние фонари и шлейф ===
    // Координаты задних фонарей относительно центра машины (примерно)
    const TAILLIGHTS = [
      new THREE.Vector3(-0.54, 0.66, -2.05), // левый
      new THREE.Vector3(0.54, 0.66, -2.05), // правый
    ];
    TAILLIGHTS.forEach((pos, i) => {
      // Светящийся круглый фонарь с прозрачностью и блюром (soft glow)
      const lampMaterial = new THREE.MeshBasicMaterial({
        color: 0xff2a2a,
        transparent: true,
        opacity: 0.25, // прозрачность
        emissive: 0xff2a2a,
        emissiveIntensity: 2.2, // чуть ярче
        depthWrite: false,
        blending: THREE.AdditiveBlending, // мягкое свечение
      });
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 24, 24),
        lampMaterial
      );
      lamp.position.copy(pos);
      car.add(lamp);
    });
  },
  (xhr) => {
    console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
  },
  (error) => {
    console.error("An error occurred while loading the model:", error);
  }
);

window.addEventListener("DOMContentLoaded", () => {
  const moveButton = document.getElementById("move-button");
  if (moveButton) {
    moveButton.addEventListener("mousedown", moveForward);
    moveButton.addEventListener("mouseup", stopCar);
    // Для мобильных устройств
    moveButton.addEventListener("touchstart", (e) => {
      e.preventDefault();
      moveForward();
    });
    moveButton.addEventListener("touchend", (e) => {
      e.preventDefault();
      stopCar();
    });
  }
});

let moveDirection = 0; // 1 — вперед, -1 — назад, 0 — стоим

function moveForward() {
  moveDirection = 1;
  isMoving = true;
}

function stopCar() {
  isMoving = 0;
}

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp") {
    moveForward();
  } else if (event.key === "ArrowDown") {
    isMoving = true;
    moveDirection = -1;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowUp" && moveDirection === 1) {
    stopCar();
  } else if (event.key === "ArrowDown" && moveDirection === -1) {
    stopCar();
  }
});

let isMoving = false;
let angle = 130 * (Math.PI / 180); // Начальный угол в радианах
let speed = 0;
const maxSpeed = 0.02;
const acceleration = 0.0002;
const deceleration = 0.0002;

function moveCar(now) {
  if (!car) return;
  if (moveDirection !== 0 && isMoving) {
    speed += acceleration;
    if (speed > maxSpeed) speed = maxSpeed;
    startEngineSound(true); // loop=true
  } else {
    speed -= deceleration;
    if (speed < 0) speed = 0;
    if (speed === 0) stopEngineSound();
  }
  if (speed > 0) {
    angle += speed * moveDirection;
    car.position.x = 5 * Math.cos(angle);
    car.position.z = 5 * Math.sin(angle);
    car.rotation.y = -angle;
  }
}

// Points

// infoPoints с материалами для анимации цвета
const infoPoints = [
  {
    position: new THREE.Vector3(5, 0, 0),
    message: "Hi, I'm a Daniil Demchenko",
    color: new THREE.Color("red"),
    targetColor: new THREE.Color("red"),
    mesh: null,
  },
  {
    position: new THREE.Vector3(-5, 0, 0),
    message: "Email me at <a href='mailto:dan9m@ya.ru'>dan9m@ya.ru</a>",
    color: new THREE.Color("red"),
    targetColor: new THREE.Color("red"),
    mesh: null,
  },
  {
    position: new THREE.Vector3(0, 0, 5),
    message: "It's my test three.js project",
    color: new THREE.Color("red"),
    targetColor: new THREE.Color("red"),
    mesh: null,
  },
];

infoPoints.forEach((point) => {
  const sphereGeometry = new THREE.SphereGeometry(0.2, 32, 32);
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color: point.color.clone(),
  });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.copy(point.position);
  point.mesh = sphere;
  point.material = sphereMaterial;
  scene.add(sphere);
});

function checkInfoPoints() {
  if (!car) return;
  infoPoints.forEach((point) => {
    const distance = car.position.distanceTo(point.position);
    // Если близко — зелёный, иначе красный
    if (distance < 3) {
      showInfo(point.message);
      point.targetColor.set("green");
    } else {
      point.targetColor.set("red");
    }
  });
}

// Плавное затухание цвета сфер infoPoints
function updateInfoPointColors() {
  infoPoints.forEach((point) => {
    if (!point.mesh) return;
    // Линейная интерполяция цвета
    point.color.lerp(point.targetColor, 0.04);
    point.material.color.copy(point.color);
  });
}

function showInfo(message) {
  const infoBox = document.getElementById("info-block");
  if (infoBox) {
    infoBox.innerHTML = message;
    infoBox.style.display = "block";
  }
}

let startTime = null;
function animate(now) {
  if (!startTime) startTime = now;
  requestAnimationFrame(animate);
  checkInfoPoints();
  updateInfoPointColors();
  moveCar(now); // Update car position, передаём now для updateEngineSound

  // --- Смещение камеры по акселерометру (только моб. устройства) ---
  // Плавная интерполяция к целевому положению
  if (camGyroOffset) {
    // Базовая позиция камеры
    const baseX = 0,
      baseY = 5,
      baseZ = 13;
    // Плавно интерполируем
    camera.position.x += (baseX + camGyroOffset.x - camera.position.x) * 0.08;
    camera.position.y += (baseY + camGyroOffset.y - camera.position.y) * 0.08;
    // Z не меняем
  }

  renderer.setClearColor(0x000000, 0); // прозрачный, чтобы был виден plane-небо
  composer.render();
}
animate();
